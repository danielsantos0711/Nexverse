import { getPerson, getThread, people, threads, type LanguageCode } from "@/lib/data"
// Types only: this module is also imported by server components (sample events and collections), and the store
// pulls in React hooks, so the few store operations needed here are written out below.
import type { Answer, Member, NewQuestion, Question, ThreadRef } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * The community layer: thread tags, edits and mentions, reactions, polls, events, collections and reputation.
 * With a database connected everything reads and writes Supabase (see supabase/migrations/…_community.sql);
 * without one it keeps everything in this browser, so every feature still works as a local preview.
 */

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

/** Database messages raised by our own triggers are already written for people; constraint names are not. */
function friendly(message: string) {
  if (/violates check constraint "questions_tags_check"/.test(message)) return "Tags are lowercase letters, numbers and hyphens, up to 24 characters, and at most 5."
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
  if (/duplicate key/.test(message)) return "That is already there."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  // The table or function is not in the database yet (the community migration has not been applied).
  if (/schema cache|does not exist/.test(message)) return "this part of the community is still being switched on"
  return message
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** The signed-in member's id, or null (signed out, or no database). */
async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await me()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: string) => UUID.test(s)

/** Someone shown next to a post, event or collection: a sample person (handle) or a member (memberId). */
export type Who = { name: string; handle?: string; memberId?: string }

const personWho = (handle: string): Who => ({ handle, name: getPerson(handle)?.name ?? handle })
const memberWho = (m: Member | null | undefined, fallback = "A member"): Who => (m ? { name: m.name, memberId: m.id } : { name: fallback })

/** "Today" for sample content, matching the fixed date the rest of the preview uses (lib/data.ts `ago`). */
export const PREVIEW_TODAY = Date.parse("2026-10-18T12:00:00Z")

// ─── Thread tags, edits, mentions and solved state ──────────────────────────────────────────────────────────

export const MAX_TAGS = 5
export const TAG = /^[a-z0-9][a-z0-9-]{0,23}$/

/** Lowercases, turns spaces into hyphens and drops anything else; "" when nothing usable is left. */
export function normalizeTag(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
}

/** Tags people already use on the forum, most used first, for suggestions. */
export const KNOWN_TAGS: string[] = (() => {
  const n = new Map<string, number>()
  for (const t of threads) for (const tag of t.tags) n.set(tag, (n.get(tag) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
})()

export type ThreadExtras = { tags: string[]; editedAt: string | null; acceptedAnswerId: string | null }

// Browser-only extras for threads saved in this browser: tags, the accepted reply, when it was last edited.
const META_KEY = "nexverse-thread-meta"
type LocalMeta = { tags?: string[]; accepted?: string | null; edited?: string | null }
const readMeta = () => readLocal<Record<string, LocalMeta>>(META_KEY, {})
function patchMeta(id: string, patch: LocalMeta) {
  const all = readMeta()
  all[id] = { ...all[id], ...patch }
  writeLocal(META_KEY, all)
}

// The store keeps browser threads under this key ({ id, title, body, orbit, lang, date }); edits rewrite it in place.
const QUESTIONS_KEY = "nexverse-questions"
type LocalQuestion = { id: string; title: string; body: string; orbit: string; lang: LanguageCode; date: string }

export async function getThreadExtras(q: Question): Promise<ThreadExtras> {
  const client = db()
  if (!client || q.local) {
    const m = readMeta()[q.id] ?? {}
    return { tags: m.tags ?? [], editedAt: m.edited ?? null, acceptedAnswerId: m.accepted ?? q.acceptedAnswerId }
  }
  const { data, error } = await client.from("questions").select("tags, edited_at, accepted_answer_id").eq("id", q.id).maybeSingle()
  fail(error)
  const row = data as { tags: string[] | null; edited_at: string | null; accepted_answer_id: string | null } | null
  return { tags: row?.tags ?? [], editedAt: row?.edited_at ?? null, acceptedAnswerId: row?.accepted_answer_id ?? null }
}

/** Tags and solved state for many threads at once, for the topic lists. */
export async function listThreadExtras(): Promise<Record<string, { tags: string[]; accepted: boolean }>> {
  const out: Record<string, { tags: string[]; accepted: boolean }> = {}
  for (const [id, m] of Object.entries(readMeta())) out[id] = { tags: m.tags ?? [], accepted: Boolean(m.accepted) }
  const client = db()
  if (!client) return out
  const { data, error } = await client.from("questions").select("id, tags").neq("tags", "{}").order("created_at", { ascending: false }).limit(300)
  fail(error)
  for (const r of data as { id: string; tags: string[] }[]) out[r.id] = { tags: r.tags ?? [], accepted: out[r.id]?.accepted ?? false }
  return out
}

export type NewThread = NewQuestion & { tags: string[]; mentions: string[] }

export function validateThread(input: { title: string; body: string; tags: string[] }): string | null {
  const title = input.title.trim()
  if (title.length < 10) return "Give the thread a title of at least 10 characters, so people know what it is about."
  if (title.length > 300) return "Keep the title under 300 characters."
  if (input.body.length > 20000) return "The details are too long. Keep them under 20,000 characters."
  if (input.tags.length > MAX_TAGS) return `Use at most ${MAX_TAGS} tags.`
  if (input.tags.some((t) => !TAG.test(t))) return "Tags are lowercase letters, numbers and hyphens."
  return null
}

/** Starts a thread with its tags, mentions and (optionally) a poll. Returns the new thread. */
export async function createThread(input: NewThread, poll?: NewPoll | null): Promise<Question> {
  const client = db()
  const { tags, mentions, ...question } = input
  if (poll) {
    const problem = validatePoll(poll)
    if (problem) throw new Error(problem)
  }
  if (!client) {
    // Same record the store writes for a browser-only thread.
    const local: LocalQuestion = { id: crypto.randomUUID(), ...question, date: new Date().toISOString() }
    writeLocal(QUESTIONS_KEY, [local, ...readLocal<LocalQuestion[]>(QUESTIONS_KEY, [])])
    patchMeta(local.id, { tags })
    if (poll) saveLocalPoll(local.id, poll)
    return { id: local.id, title: local.title, body: local.body, orbit: local.orbit, lang: local.lang, createdAt: local.date, author: null, acceptedAnswerId: null, answerCount: 0, local: true }
  }
  const { data, error } = await client
    .from("questions")
    .insert({ ...question, tags, mentions: mentions.slice(0, 10) })
    .select("id, title, body, orbit, lang, created_at, author:profiles(id, name)")
    .single()
  fail(error)
  const row = data as unknown as { id: string; title: string; body: string; orbit: string; lang: LanguageCode; created_at: string; author: Member | null }
  const id = row.id
  if (poll) {
    const { error: pollError } = await client.from("polls").insert({ question_id: id, prompt: poll.prompt.trim(), options: poll.options.map((o) => o.trim()), multi: poll.multi })
    // The thread is already posted; a poll that failed is reported, but the thread stays.
    if (pollError) throw Object.assign(new Error(`Your thread is up, but the poll could not be added: ${friendly(pollError.message)}`), { threadId: id })
  }
  return { id, title: row.title, body: row.body, orbit: row.orbit, lang: row.lang, createdAt: row.created_at, author: row.author, acceptedAnswerId: null, answerCount: 0, local: false }
}

export type ThreadEdit = { title: string; body: string; tags: string[]; mentions: string[] }

/** Saves a new title, text and tags for your own thread. Returns when it was edited. */
export async function editThread(q: Question, edit: ThreadEdit): Promise<string> {
  const problem = validateThread(edit)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client || q.local) {
    const now = new Date().toISOString()
    const all = readLocal<LocalQuestion[]>(QUESTIONS_KEY, [])
    writeLocal(
      QUESTIONS_KEY,
      all.map((x) => (x.id === q.id ? { ...x, title: edit.title.trim(), body: edit.body.trim() } : x))
    )
    patchMeta(q.id, { tags: edit.tags, edited: now })
    return now
  }
  const { data, error } = await client
    .from("questions")
    .update({ title: edit.title.trim(), body: edit.body.trim(), tags: edit.tags, mentions: edit.mentions.slice(0, 10) })
    .eq("id", q.id)
    .select("edited_at")
    .single()
  fail(error)
  return (data as { edited_at: string | null }).edited_at ?? new Date().toISOString()
}

/** Marks the reply that solved the thread, or clears it with null. Works for browser-only threads too. */
export async function markSolved(q: Question, answerId: string | null) {
  if (!db() || q.local) {
    patchMeta(q.id, { accepted: answerId })
    return
  }
  const { error } = await db()!.from("questions").update({ accepted_answer_id: answerId }).eq("id", q.id)
  fail(error)
}

// ─── Replies (with edits and mentions) ──────────────────────────────────────────────────────────────────────

export type Reply = Answer & { editedAt: string | null }

type LocalAnswer = { id: string; body: string; date: string; edited?: string }
// The store keeps browser replies under this key; the same records are read and edited here.
const answersKey = (threadId: string) => `nexverse-replies:${threadId}`
const REPLY_COLUMNS = "id, body, created_at, edited_at, author:profiles(id, name)"
type ReplyRow = { id: string; body: string; created_at: string; edited_at: string | null; author: Member | null }
const fromReplyRow = (a: ReplyRow): Reply => ({ id: a.id, body: a.body, createdAt: a.created_at, editedAt: a.edited_at, author: a.author, local: false })
const fromLocalReply = (a: LocalAnswer): Reply => ({ id: a.id, body: a.body, createdAt: a.date, editedAt: a.edited ?? null, author: null, local: true })

export async function listReplies(thread: ThreadRef): Promise<Reply[]> {
  const client = db()
  if (!client) return readLocal<LocalAnswer[]>(answersKey(thread.id), []).map(fromLocalReply)
  const { data, error } = await client
    .from("answers")
    .select(REPLY_COLUMNS)
    .eq(thread.kind === "sample" ? "sample_thread" : "question_id", thread.id)
    .order("created_at")
  fail(error)
  return (data as unknown as ReplyRow[]).map(fromReplyRow)
}

export function validateReply(body: string): string | null {
  if (!body.trim()) return "Write something first."
  if (body.length > 20000) return "That reply is too long. Keep it under 20,000 characters."
  return null
}

export async function createReply(thread: ThreadRef, body: string, mentions: string[]): Promise<Reply> {
  const problem = validateReply(body)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client) {
    const a: LocalAnswer = { id: crypto.randomUUID(), body: body.trim(), date: new Date().toISOString() }
    writeLocal(answersKey(thread.id), [...readLocal<LocalAnswer[]>(answersKey(thread.id), []), a])
    return fromLocalReply(a)
  }
  const target = thread.kind === "sample" ? { sample_thread: thread.id } : { question_id: thread.id }
  const { data, error } = await client
    .from("answers")
    .insert({ ...target, body: body.trim(), mentions: mentions.slice(0, 10) })
    .select(REPLY_COLUMNS)
    .single()
  fail(error)
  return fromReplyRow(data as unknown as ReplyRow)
}

export async function editReply(thread: ThreadRef, id: string, body: string, mentions: string[]): Promise<{ body: string; editedAt: string }> {
  const problem = validateReply(body)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client) {
    const now = new Date().toISOString()
    writeLocal(
      answersKey(thread.id),
      readLocal<LocalAnswer[]>(answersKey(thread.id), []).map((a) => (a.id === id ? { ...a, body: body.trim(), edited: now } : a))
    )
    return { body: body.trim(), editedAt: now }
  }
  const { data, error } = await client.from("answers").update({ body: body.trim(), mentions: mentions.slice(0, 10) }).eq("id", id).select("body, edited_at").single()
  fail(error)
  const row = data as { body: string; edited_at: string | null }
  return { body: row.body, editedAt: row.edited_at ?? new Date().toISOString() }
}

// ─── Mentions ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Someone you can @mention. Sample people are written "@handle"; members have no handle, so they are written
 * "@Their Name" and their id travels with the post (the database only notifies ids whose name is in the text).
 */
export type MentionCandidate = { key: string; name: string; insert: string; handle?: string; memberId?: string; hint: string }

const personCandidate = (p: (typeof people)[number]): MentionCandidate => ({
  key: `person:${p.handle}`,
  name: p.name,
  handle: p.handle,
  insert: `@${p.handle}`,
  hint: `@${p.handle}${p.org ? " · organisation" : ""}`,
})

export const memberCandidate = (m: Member): MentionCandidate => ({ key: `member:${m.id}`, name: m.name, memberId: m.id, insert: `@${m.name}`, hint: "Member" })

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Sample people whose handle or name starts with (or contains) the query. */
export function matchPeople(query: string, limit = 6): MentionCandidate[] {
  const q = fold(query)
  const scored = people
    .map((p) => {
      const h = p.handle
      const n = fold(p.name)
      const score = !q ? 1 : h.startsWith(q) || n.startsWith(q) ? 3 : n.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : h.includes(q) || n.includes(q) ? 1 : 0
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
  return scored.slice(0, limit).map((x) => personCandidate(x.p))
}

/** Members whose name contains the query. Empty without a database. */
export async function searchMembers(query: string, limit = 5): Promise<MentionCandidate[]> {
  const client = db()
  const q = query.trim()
  if (!client || q.length < 1) return []
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { data, error } = await client.from("profiles").select("id, name").ilike("name", pattern).limit(limit)
  fail(error)
  return (data as Member[]).map(memberCandidate)
}

/** The members whose "@Name" is still in the text, out of everyone picked while writing it. */
export function mentionedMemberIds(body: string, picked: MentionCandidate[]): string[] {
  const text = body.toLowerCase()
  const ids = picked.filter((c) => c.memberId && text.includes(c.insert.toLowerCase())).map((c) => c.memberId!)
  return [...new Set(ids)].slice(0, 10)
}

/** Every mention a post could contain, so they can be highlighted: sample handles plus picked member names. */
export function mentionTokens(extra: string[] = []): string[] {
  return [...people.map((p) => `@${p.handle}`), ...extra].sort((a, b) => b.length - a.length)
}

// ─── Reactions on posts ─────────────────────────────────────────────────────────────────────────────────────

export const REACTIONS = ["👍", "❤️", "🎉", "🚀", "👀", "🤔"] as const
export type ReactionEmoji = (typeof REACTIONS)[number]
export const REACTION_NAMES: Record<ReactionEmoji, string> = {
  "👍": "thumbs up",
  "❤️": "heart",
  "🎉": "party",
  "🚀": "rocket",
  "👀": "eyes",
  "🤔": "thinking",
}

const POST_TARGET = /^(thread|answer|reply):[a-z0-9-]{1,80}$/

/** The reaction key of a reply in a sample thread, or null when it would be too long to store. */
export function sampleReplyTarget(threadId: string, replyId: string): string | null {
  const t = `reply:${threadId}-${replyId}`.toLowerCase()
  return POST_TARGET.test(t) ? t : null
}

export type Reactions = Record<ReactionEmoji, { count: number; mine: boolean }>

const emptyReactions = (): Reactions => Object.fromEntries(REACTIONS.map((e) => [e, { count: 0, mine: false }])) as Reactions

const REACTIONS_KEY = "nexverse-post-reactions"

// Every Reactions component on a page asks for its own post; requests made in the same tick share one query.
let batch: { targets: Set<string>; waiters: ((rows: Map<string, Reactions>) => void)[]; failers: ((e: Error) => void)[] } | null = null

async function runBatch(targets: string[]): Promise<Map<string, Reactions>> {
  const out = new Map(targets.map((t) => [t, emptyReactions()]))
  const client = db()
  if (!client) {
    for (const key of readLocal<string[]>(REACTIONS_KEY, [])) {
      const [target, emoji] = key.split("|") as [string, ReactionEmoji]
      const r = out.get(target)?.[emoji]
      if (r) {
        r.count += 1
        r.mine = true
      }
    }
    return out
  }
  const [userId, res] = await Promise.all([me(), client.from("post_reactions").select("target, emoji, user_id").in("target", targets).limit(5000)])
  fail(res.error)
  for (const row of res.data as { target: string; emoji: ReactionEmoji; user_id: string }[]) {
    const r = out.get(row.target)?.[row.emoji]
    if (!r) continue
    r.count += 1
    if (row.user_id === userId) r.mine = true
  }
  return out
}

export function getReactions(target: string): Promise<Reactions> {
  if (!POST_TARGET.test(target)) return Promise.resolve(emptyReactions())
  return new Promise((resolve, reject) => {
    if (!batch) {
      const current = { targets: new Set<string>(), waiters: [] as ((rows: Map<string, Reactions>) => void)[], failers: [] as ((e: Error) => void)[] }
      batch = current
      queueMicrotask(() => {
        batch = null
        runBatch([...current.targets])
          .then((rows) => current.waiters.forEach((w) => w(rows)))
          .catch((e: Error) => current.failers.forEach((f) => f(e)))
      })
    }
    batch.targets.add(target)
    batch.waiters.push((rows) => resolve(rows.get(target) ?? emptyReactions()))
    batch.failers.push(reject)
  })
}

export async function setReaction(target: string, emoji: ReactionEmoji, on: boolean) {
  if (!POST_TARGET.test(target) || !REACTIONS.includes(emoji)) throw new Error("You cannot react to that.")
  const client = db()
  if (!client) {
    const key = `${target}|${emoji}`
    const rest = readLocal<string[]>(REACTIONS_KEY, []).filter((k) => k !== key)
    writeLocal(REACTIONS_KEY, on ? [...rest, key] : rest)
    return
  }
  const userId = await requireMe()
  const { error } = on
    ? await client.from("post_reactions").upsert({ target, emoji }, { onConflict: "target,user_id,emoji", ignoreDuplicates: true })
    : await client.from("post_reactions").delete().eq("target", target).eq("emoji", emoji).eq("user_id", userId)
  fail(error)
}

// ─── Polls ──────────────────────────────────────────────────────────────────────────────────────────────────

export type NewPoll = { prompt: string; options: string[]; multi: boolean }

export type Poll = {
  id: string
  questionId: string
  prompt: string
  options: string[]
  multi: boolean
  closesAt: string | null
  counts: number[]
  voters: number
  mine: number[]
  local: boolean
}

export const POLL_MIN = 2
export const POLL_MAX = 8

export function validatePoll(p: NewPoll): string | null {
  const prompt = p.prompt.trim()
  if (prompt.length < 3) return "Give the poll a question of at least 3 characters."
  if (prompt.length > 200) return "Keep the poll question under 200 characters."
  const options = p.options.map((o) => o.trim())
  if (options.some((o) => !o)) return "Fill in every option, or remove the empty ones."
  if (options.length < POLL_MIN) return `A poll needs at least ${POLL_MIN} options.`
  if (options.length > POLL_MAX) return `A poll can have up to ${POLL_MAX} options.`
  if (options.some((o) => o.length > 80)) return "Keep each option under 80 characters."
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return "Two options are the same. Make each one different."
  return null
}

const POLLS_KEY = "nexverse-polls"
type LocalPoll = NewPoll & { mine: number[]; date: string }

function saveLocalPoll(questionId: string, poll: NewPoll) {
  const all = readLocal<Record<string, LocalPoll>>(POLLS_KEY, {})
  all[questionId] = { prompt: poll.prompt.trim(), options: poll.options.map((o) => o.trim()), multi: poll.multi, mine: [], date: new Date().toISOString() }
  writeLocal(POLLS_KEY, all)
}

function fromLocalPoll(questionId: string, p: LocalPoll): Poll {
  return {
    id: `local-${questionId}`,
    questionId,
    prompt: p.prompt,
    options: p.options,
    multi: p.multi,
    closesAt: null,
    counts: p.options.map((_, i) => (p.mine.includes(i) ? 1 : 0)),
    voters: p.mine.length ? 1 : 0,
    mine: p.mine,
    local: true,
  }
}

export async function getPoll(q: Pick<Question, "id" | "local">): Promise<Poll | null> {
  const client = db()
  if (!client || q.local) {
    const p = readLocal<Record<string, LocalPoll>>(POLLS_KEY, {})[q.id]
    return p ? fromLocalPoll(q.id, p) : null
  }
  const { data, error } = await client.from("polls").select("id, question_id, prompt, options, multi, closes_at").eq("question_id", q.id).maybeSingle()
  fail(error)
  if (!data) return null
  const row = data as { id: string; question_id: string; prompt: string; options: string[]; multi: boolean; closes_at: string | null }
  return refreshPoll({ id: row.id, questionId: row.question_id, prompt: row.prompt, options: row.options, multi: row.multi, closesAt: row.closes_at, counts: [], voters: 0, mine: [], local: false })
}

async function refreshPoll(p: Poll): Promise<Poll> {
  const client = db()!
  const userId = await me()
  const [counts, mine] = await Promise.all([
    client.rpc("poll_counts", { poll: p.id }),
    userId ? client.from("poll_votes").select("option").eq("poll_id", p.id).eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ])
  fail(counts.error)
  fail(mine.error)
  const rows = (counts.data ?? []) as { option: number; votes: number; voters: number }[]
  return {
    ...p,
    counts: p.options.map((_, i) => Number(rows.find((r) => r.option === i)?.votes ?? 0)),
    voters: Number(rows[0]?.voters ?? 0),
    mine: ((mine.data ?? []) as { option: number }[]).map((r) => r.option),
  }
}

/** Replaces your vote with `options` (empty to take it back). Returns the poll with fresh totals. */
export async function votePoll(p: Poll, options: number[]): Promise<Poll> {
  const picked = [...new Set(options)].filter((i) => i >= 0 && i < p.options.length)
  if (!p.multi && picked.length > 1) throw new Error("Pick one option.")
  if (p.closesAt && Date.parse(p.closesAt) <= Date.now()) throw new Error("This poll has closed.")
  const client = db()
  if (!client || p.local) {
    const all = readLocal<Record<string, LocalPoll>>(POLLS_KEY, {})
    const local = all[p.questionId]
    if (!local) throw new Error("This poll is gone.")
    all[p.questionId] = { ...local, mine: picked }
    writeLocal(POLLS_KEY, all)
    return fromLocalPoll(p.questionId, all[p.questionId])
  }
  const userId = await requireMe()
  const { error: clearError } = await client.from("poll_votes").delete().eq("poll_id", p.id).eq("user_id", userId)
  fail(clearError)
  if (picked.length) {
    const { error } = await client.from("poll_votes").insert(picked.map((option) => ({ poll_id: p.id, option })))
    fail(error)
  }
  return refreshPoll(p)
}

// ─── Events ─────────────────────────────────────────────────────────────────────────────────────────────────

export type EventKind = "paper-club" | "meetup" | "office-hours" | "ama"
export type EventMode = "online" | "in-person"

export const EVENT_KINDS: Record<EventKind, { label: string; plural: string; blurb: string }> = {
  "paper-club": { label: "Paper club", plural: "Paper clubs", blurb: "Read one paper, then talk it through together." },
  meetup: { label: "Meetup", plural: "Meetups", blurb: "Meet builders in your city." },
  "office-hours": { label: "Office hours", plural: "Office hours", blurb: "Bring your problem; someone who has solved it helps." },
  ama: { label: "AMA", plural: "AMAs", blurb: "Ask a maintainer or researcher anything." },
}

export const isEventKind = (s: string): s is EventKind => s in EVENT_KINDS

export type CommunityEvent = {
  id: string
  title: string
  description: string
  kind: EventKind
  mode: EventMode
  /** A https link for online events, a place for in-person ones. */
  location: string
  startsAt: string
  endsAt: string
  /** The host's time zone, shown next to the viewer's own. */
  timezone: string
  capacity: number | null
  host: Who
  /** A forum thread to read first, for paper clubs. */
  thread?: string
  /** Sample people already going and interested (sample events only). */
  seedGoing: string[]
  seedInterested: string[]
  sample: boolean
  local: boolean
}

type SampleEvent = Omit<CommunityEvent, "host" | "sample" | "local" | "seedGoing" | "seedInterested" | "capacity"> & {
  host: string
  going: string[]
  interested: string[]
  capacity?: number
}

const SAMPLE_EVENT_DATA: SampleEvent[] = [
  {
    id: "paper-club-tokenizer-free",
    kind: "paper-club",
    mode: "online",
    title: "Paper club: do we still need tokenizers?",
    description:
      "This week we read the byte-level, tokenizer-free paper everyone keeps linking. Read at least the introduction and section 4 before you come.\n\n**Plan**\n\n1. Ten-minute summary from Noah\n2. Where byte-level models win, and where they lose (hint: fertility in Yoruba and Hindi)\n3. Would we use it for our own small models?\n\nCameras optional. Notes go in the forum thread afterwards.",
    location: "https://meet.nexverse.example/paper-club",
    startsAt: "2026-10-22T17:00:00Z",
    endsAt: "2026-10-22T18:30:00Z",
    timezone: "America/Toronto",
    host: "noah",
    thread: "paper-club-tokenizer-free",
    going: ["noah", "mei", "tunde", "layla", "priya", "ines"],
    interested: ["kai", "jonas"],
  },
  {
    id: "office-hours-quantising-phones",
    kind: "office-hours",
    mode: "online",
    title: "Office hours: getting a model under 2 GB",
    description:
      "Bring a model you want on a phone and the numbers you have so far. We will look at quantisation settings, context length and what to measure on the device itself.\n\nPriya has done this for Orbit 1B Mobile and Pocket Run. Questions in any language are welcome.",
    location: "https://meet.nexverse.example/office-hours",
    startsAt: "2026-10-24T09:00:00Z",
    endsAt: "2026-10-24T10:00:00Z",
    timezone: "Asia/Kolkata",
    host: "priya",
    going: ["priya", "kai", "sofia"],
    interested: ["leo", "rafa", "amara"],
  },
  {
    id: "ama-orbit-8b-training",
    kind: "ama",
    mode: "online",
    title: "AMA: how Orbit 8B was trained, logs included",
    description:
      "The Orbital AI collective answers questions about the Orbit 8B run: data mix, the loss spikes, what they would change, and how volunteers can help with the next one.\n\nPost questions in advance in the forum's Announcements category and we will start with the most upvoted.",
    location: "https://meet.nexverse.example/ama",
    startsAt: "2026-10-29T16:00:00Z",
    endsAt: "2026-10-29T17:30:00Z",
    timezone: "UTC",
    host: "orbitalai",
    going: ["noah", "mei", "sofia", "rafa", "kai", "priya", "jonas", "layla"],
    interested: ["ines", "leo", "amara", "tunde"],
  },
  {
    id: "lisbon-small-models-meetup",
    kind: "meetup",
    mode: "in-person",
    title: "Lisbon small-models meetup",
    description:
      "An evening of short talks on small models for Iberian languages, then drinks.\n\n- Inês: what changed between tagus-3b-pt v1 and v2\n- Open mic: five minutes on anything you built\n\nThe venue has step-free access. Talks are in Portuguese and English.",
    location: "LX Factory, Rua Rodrigues de Faria 103, Lisbon",
    startsAt: "2026-11-05T18:30:00Z",
    endsAt: "2026-11-05T21:00:00Z",
    timezone: "Europe/Lisbon",
    host: "ines",
    capacity: 60,
    going: ["ines", "tagus-lab", "jonas", "sofia"],
    interested: ["leo", "rafa"],
  },
  {
    id: "nairobi-speech-data-sprint",
    kind: "meetup",
    mode: "in-person",
    title: "Speech data sprint, Nairobi",
    description:
      "A day of recording and reviewing Swahili and Sheng speech with consent forms done properly. Bring a laptop and headphones; lunch is provided.\n\nNo experience needed: Amara will walk everyone through the datasheet first.",
    location: "iHub, Senteu Plaza, Nairobi",
    startsAt: "2026-11-14T07:00:00Z",
    endsAt: "2026-11-14T13:00:00Z",
    timezone: "Africa/Nairobi",
    host: "amara",
    capacity: 40,
    going: ["amara", "savanna", "tunde"],
    interested: ["layla"],
  },
  {
    id: "paper-club-rag-long-context",
    kind: "paper-club",
    mode: "online",
    title: "Paper club: long context or retrieval?",
    description: "We compared three recent papers on long-context models against plain retrieval. Notes and the recording link are in the forum thread.",
    location: "https://meet.nexverse.example/paper-club",
    startsAt: "2026-10-08T17:00:00Z",
    endsAt: "2026-10-08T18:30:00Z",
    timezone: "America/Toronto",
    host: "noah",
    thread: "rag-long-context-vs-retrieval",
    going: ["noah", "mei", "rafa", "sofia", "kai"],
    interested: ["ines"],
  },
  {
    id: "office-hours-agent-loops",
    kind: "office-hours",
    mode: "online",
    title: "Office hours: agents that stop",
    description: "Rafael looked at traces from agents stuck in loops and showed how loop-guard decides when to step in.",
    location: "https://meet.nexverse.example/office-hours",
    startsAt: "2026-10-10T15:00:00Z",
    endsAt: "2026-10-10T16:00:00Z",
    timezone: "America/Bogota",
    host: "rafa",
    going: ["rafa", "noah", "kai", "priya"],
    interested: [],
  },
  {
    id: "berlin-serving-meetup",
    kind: "meetup",
    mode: "in-person",
    title: "Berlin: serving small models cheaply",
    description: "Sofia walked through serve-small and the caching tricks that keep a 3B model fast on one GPU.",
    location: "Factory Görlitzer Park, Berlin",
    startsAt: "2026-09-24T16:30:00Z",
    endsAt: "2026-09-24T19:00:00Z",
    timezone: "Europe/Berlin",
    host: "sofia",
    capacity: 80,
    going: ["sofia", "jonas", "leo"],
    interested: [],
  },
]

export const SAMPLE_EVENTS: CommunityEvent[] = SAMPLE_EVENT_DATA.map(({ host, going, interested, capacity, ...e }) => ({
  ...e,
  host: personWho(host),
  capacity: capacity ?? null,
  seedGoing: going,
  seedInterested: interested,
  sample: true,
  local: false,
}))

export const getSampleEvent = (id: string) => SAMPLE_EVENTS.find((e) => e.id === id)

const EVENTS_KEY = "nexverse-events"
type LocalEvent = Omit<CommunityEvent, "host" | "sample" | "local" | "seedGoing" | "seedInterested">

const fromLocalEvent = (e: LocalEvent): CommunityEvent => ({ ...e, host: { name: "You" }, seedGoing: [], seedInterested: [], sample: false, local: true })

const EVENT_COLUMNS = "id, title, description, kind, mode, location, starts_at, ends_at, timezone, capacity, host:profiles(id, name)"
type EventRow = {
  id: string
  title: string
  description: string
  kind: EventKind
  mode: EventMode
  location: string
  starts_at: string
  ends_at: string
  timezone: string
  capacity: number | null
  host: Member | null
}

const fromEventRow = (r: EventRow): CommunityEvent => ({
  id: r.id,
  title: r.title,
  description: r.description,
  kind: r.kind,
  mode: r.mode,
  location: r.location,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  timezone: r.timezone,
  capacity: r.capacity,
  host: memberWho(r.host),
  seedGoing: [],
  seedInterested: [],
  sample: false,
  local: false,
})

/** Sample events plus members' events (from the database, or from this browser). */
export async function listEvents(): Promise<CommunityEvent[]> {
  const client = db()
  if (!client) return [...readLocal<LocalEvent[]>(EVENTS_KEY, []).map(fromLocalEvent), ...SAMPLE_EVENTS]
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString()
  const { data, error } = await client.from("events").select(EVENT_COLUMNS).gte("ends_at", since).order("starts_at").limit(200)
  fail(error)
  return [...(data as unknown as EventRow[]).map(fromEventRow), ...SAMPLE_EVENTS]
}

export async function getEvent(id: string): Promise<CommunityEvent | null> {
  const sample = getSampleEvent(id)
  if (sample) return sample
  const client = db()
  if (!client) {
    const e = readLocal<LocalEvent[]>(EVENTS_KEY, []).find((x) => x.id === id)
    return e ? fromLocalEvent(e) : null
  }
  if (!isUuid(id)) return null
  const { data, error } = await client.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromEventRow(data as unknown as EventRow) : null
}

export type NewEvent = {
  title: string
  description: string
  kind: EventKind
  mode: EventMode
  location: string
  startsAt: string
  endsAt: string
  timezone: string
  capacity: number | null
}

export function validateEvent(e: NewEvent, now = Date.now()): Partial<Record<keyof NewEvent | "form", string>> {
  const errors: Partial<Record<keyof NewEvent | "form", string>> = {}
  const title = e.title.trim()
  if (title.length < 5) errors.title = "Give the event a title of at least 5 characters."
  else if (title.length > 120) errors.title = "Keep the title under 120 characters."
  if (e.description.length > 4000) errors.description = "Keep the description under 4,000 characters."
  const loc = e.location.trim()
  if (e.mode === "online") {
    let ok = false
    try {
      ok = new URL(loc).protocol === "https:" && loc.length <= 200
    } catch {}
    if (!ok) errors.location = "Paste the https:// link people use to join."
  } else if (loc.length < 2 || loc.length > 200) errors.location = "Say where it happens: a venue and a city."
  const start = Date.parse(e.startsAt)
  const end = Date.parse(e.endsAt)
  if (!Number.isFinite(start)) errors.startsAt = "Pick a date and a start time."
  else if (start < now) errors.startsAt = "Pick a time in the future."
  if (Number.isFinite(start) && (!Number.isFinite(end) || end <= start)) errors.endsAt = "The event has to end after it starts."
  else if (end - start > 3 * 24 * 3600 * 1000) errors.endsAt = "Events can last up to 3 days."
  if (e.capacity !== null && (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > 10000)) errors.capacity = "Capacity is a whole number from 1 to 10,000, or leave it empty."
  return errors
}

export async function createEvent(input: NewEvent): Promise<CommunityEvent> {
  const errors = validateEvent(input)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const row = { ...input, title: input.title.trim(), location: input.location.trim(), description: input.description.trim() }
  const client = db()
  if (!client) {
    const e: LocalEvent = { ...row, id: crypto.randomUUID() }
    writeLocal(EVENTS_KEY, [e, ...readLocal<LocalEvent[]>(EVENTS_KEY, [])])
    return fromLocalEvent(e)
  }
  await requireMe()
  const { data, error } = await client
    .from("events")
    .insert({
      title: row.title,
      description: row.description,
      kind: row.kind,
      mode: row.mode,
      location: row.location,
      starts_at: row.startsAt,
      ends_at: row.endsAt,
      timezone: row.timezone,
      capacity: row.capacity,
    })
    .select(EVENT_COLUMNS)
    .single()
  fail(error)
  return fromEventRow(data as unknown as EventRow)
}

export async function deleteEvent(id: string) {
  const client = db()
  if (!client) {
    writeLocal(EVENTS_KEY, readLocal<LocalEvent[]>(EVENTS_KEY, []).filter((e) => e.id !== id))
    const r = readLocal<Record<string, RsvpStatus>>(RSVPS_KEY, {})
    delete r[id]
    writeLocal(RSVPS_KEY, r)
    return
  }
  const { error } = await client.from("events").delete().eq("id", id)
  fail(error)
}

export type RsvpStatus = "going" | "interested"
export type Attendees = { going: Who[]; interested: Who[]; mine: RsvpStatus | null }

const RSVPS_KEY = "nexverse-rsvps"

export async function getAttendees(e: CommunityEvent): Promise<Attendees> {
  const seeded: Attendees = { going: e.seedGoing.map(personWho), interested: e.seedInterested.map(personWho), mine: null }
  const client = db()
  if (!client) {
    const mine = readLocal<Record<string, RsvpStatus>>(RSVPS_KEY, {})[e.id] ?? null
    const you: Who = { name: "You" }
    return {
      going: mine === "going" ? [you, ...seeded.going] : seeded.going,
      interested: mine === "interested" ? [you, ...seeded.interested] : seeded.interested,
      mine,
    }
  }
  const [userId, res] = await Promise.all([me(), client.from("event_rsvps").select("status, user_id, member:profiles(id, name)").eq("event", e.id).order("created_at").limit(500)])
  fail(res.error)
  const rows = res.data as unknown as { status: RsvpStatus; user_id: string; member: Member | null }[]
  return {
    going: [...rows.filter((r) => r.status === "going").map((r) => memberWho(r.member)), ...seeded.going],
    interested: [...rows.filter((r) => r.status === "interested").map((r) => memberWho(r.member)), ...seeded.interested],
    mine: rows.find((r) => r.user_id === userId)?.status ?? null,
  }
}

/** Attendees of many events in one query, for lists. Members come first, then the sample people. */
export async function getAttendeesMany(events: CommunityEvent[]): Promise<Record<string, Attendees>> {
  const client = db()
  const members: Record<string, Attendees> = Object.fromEntries(events.map((e) => [e.id, { going: [], interested: [], mine: null }]))
  if (!client) {
    const you: Who = { name: "You" }
    for (const [id, status] of Object.entries(readLocal<Record<string, RsvpStatus>>(RSVPS_KEY, {}))) {
      const a = members[id]
      if (!a) continue
      a[status].push(you)
      a.mine = status
    }
  } else if (events.length) {
    const [userId, res] = await Promise.all([
      me(),
      client
        .from("event_rsvps")
        .select("event, status, user_id, member:profiles(id, name)")
        .in("event", events.map((e) => e.id).slice(0, 200))
        .order("created_at")
        .limit(2000),
    ])
    fail(res.error)
    for (const r of res.data as unknown as { event: string; status: RsvpStatus; user_id: string; member: Member | null }[]) {
      const a = members[r.event]
      if (!a) continue
      a[r.status].push(memberWho(r.member))
      if (r.user_id === userId) a.mine = r.status
    }
  }
  return Object.fromEntries(
    events.map((e) => {
      const a = members[e.id]
      return [e.id, { going: [...a.going, ...e.seedGoing.map(personWho)], interested: [...a.interested, ...e.seedInterested.map(personWho)], mine: a.mine }]
    })
  )
}

/** Sets your RSVP ("going", "interested") or withdraws it (null). */
export async function setRsvp(eventId: string, status: RsvpStatus | null) {
  const client = db()
  if (!client) {
    const all = readLocal<Record<string, RsvpStatus>>(RSVPS_KEY, {})
    if (status) all[eventId] = status
    else delete all[eventId]
    writeLocal(RSVPS_KEY, all)
    return
  }
  const userId = await requireMe()
  const { error } = status
    ? await client.from("event_rsvps").upsert({ event: eventId, status }, { onConflict: "event,user_id" })
    : await client.from("event_rsvps").delete().eq("event", eventId).eq("user_id", userId)
  fail(error)
}

/** Events you said you are going to or interested in (ids), for the "Yours" view. */
export async function myRsvps(): Promise<Record<string, RsvpStatus>> {
  const client = db()
  if (!client) return readLocal<Record<string, RsvpStatus>>(RSVPS_KEY, {})
  const userId = await me()
  if (!userId) return {}
  const { data, error } = await client.from("event_rsvps").select("event, status").eq("user_id", userId).limit(500)
  fail(error)
  return Object.fromEntries((data as { event: string; status: RsvpStatus }[]).map((r) => [r.event, r.status]))
}

// Time zones and calendar files.

/** The offset of a time zone from UTC at an instant, in milliseconds (positive east of Greenwich). */
function zoneOffset(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(at / 1000) * 1000
}

/** "2026-11-05" + "18:30" in "Europe/Lisbon" as a UTC instant. Null when the input is not a real date or zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  try {
    const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
    // Twice, so a guess on the other side of a daylight-saving change settles on the right offset.
    const first = guess - zoneOffset(guess, timeZone)
    const result = guess - zoneOffset(first, timeZone)
    return Number.isFinite(result) ? new Date(result) : null
  } catch {
    return null
  }
}

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** Escapes text for an iCalendar value (RFC 5545 §3.3.11). */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1")

/** Folds a content line at 75 octets, continuing with a space (RFC 5545 §3.1). */
function fold75(line: string) {
  const bytes = new TextEncoder()
  const out: string[] = []
  let cur = ""
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ch
    } else cur += ch
  }
  out.push(cur)
  return out.join("\r\n ")
}

/** An .ics file for one event, which every calendar app can import. */
export function eventIcs(e: CommunityEvent, pageUrl: string, now = new Date()) {
  const description = [e.description.replace(/[*_`#>]/g, "").trim(), `Details and RSVPs: ${pageUrl}`].filter(Boolean).join("\n\n")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nexverse//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@nexverse`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    `LOCATION:${icsText(e.location)}`,
    `URL:${pageUrl}`,
    `ORGANIZER;CN=${icsText(e.host.name).replace(/[:"]/g, "")}:mailto:events@nexverse.invalid`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold75).join("\r\n") + "\r\n"
}

/** A Google Calendar "add event" link, for people who do not use .ics files. */
export function googleCalendarHref(e: CommunityEvent, pageUrl: string) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.startsAt)}/${icsDate(e.endsAt)}`,
    details: `${e.description.slice(0, 800)}\n\n${pageUrl}`,
    location: e.location,
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

// ─── Collections ────────────────────────────────────────────────────────────────────────────────────────────

export type CollectionItem = { target: string; note: string; position: number; addedAt: string }

export type Collection = {
  id: string
  title: string
  description: string
  isPublic: boolean
  owner: Who
  createdAt: string
  updatedAt: string
  items: CollectionItem[]
  /** Sample followers added to members' follows. */
  baseFollowers: number
  sample: boolean
  local: boolean
}

export const COLLECTION_ITEM_TARGET = /^[a-z]{2,16}:[a-z0-9-]{1,80}$/

type SampleCollection = { id: string; title: string; description: string; owner: string; date: string; followers: number; items: [string, string][] }

const SAMPLE_COLLECTION_DATA: SampleCollection[] = [
  {
    id: "starter-european-portuguese",
    title: "Starter kit: European Portuguese",
    description: "Everything I point people to when they want a model that writes like someone from Lisbon, not São Paulo.",
    owner: "ines",
    date: "2026-10-14",
    followers: 214,
    items: [
      ["model:tagus-3b-pt", "Start here. Small enough to fine-tune on one GPU."],
      ["dataset:pt-pt-instruct", "The 40k examples behind it, with a datasheet."],
      ["thread:fine-tune-3b-european-portuguese", "Why rank 16 was not enough, and what fixed it."],
      ["model:babel-embed", "For retrieval in Portuguese, this beats the usual English-first embedders."],
      ["repo:tiny-rag", "Pair it with babel-embed for a quick search demo."],
    ],
  },
  {
    id: "agents-that-stop",
    title: "Agents that know when to stop",
    description: "Loops, traces and the guard rails that keep tool-calling agents from burning money.",
    owner: "rafa",
    date: "2026-10-11",
    followers: 388,
    items: [
      ["repo:loop-guard", "My library. Detects repeated tool calls without killing legitimate retries."],
      ["thread:agent-repeats-same-tool", "The forum thread that started it."],
      ["dataset:agent-traces", "Real traces, labelled: stuck, recovered, finished."],
      ["tool:tracewatch", "To look at traces without writing a dashboard."],
      ["paper:2210-d03629", "ReAct, for the reasoning-and-acting loop most agents still use."],
      ["thread:agent-memory", "What to remember between steps, and what to forget."],
    ],
  },
  {
    id: "phone-sized-models",
    title: "Models that fit in a phone",
    description: "What I actually run on a mid-range Android, and how to measure battery honestly.",
    owner: "priya",
    date: "2026-10-09",
    followers: 502,
    items: [
      ["model:orbit-1b-mobile", "The best quality per megabyte I have found."],
      ["tool:pocket-run", "Run it offline with one tap."],
      ["repo:quant-cookbook", "Recipes for 4-bit and 3-bit quantisation, with the evals to check them."],
      ["thread:orbit-1b-pixel-battery", "Battery numbers from real phones."],
      ["ghrepo:ggml-org--llama-dcpp", "The runtime underneath most of this."],
    ],
  },
  {
    id: "speech-african-languages",
    title: "Speech for African languages",
    description: "Recognition, synthesis and the data behind them, built with the people who speak these languages.",
    owner: "tunde",
    date: "2026-10-05",
    followers: 167,
    items: [
      ["model:yoruba-asr-small", "Keeps tone marks, which most ASR quietly drops."],
      ["dataset:yoruba-voices", "Consent-first recordings from 300 speakers."],
      ["repo:tone-tokenizer", "Tokenises with diacritics intact."],
      ["model:kiswahili-tts", "Natural-sounding Swahili synthesis from Savanna Speech."],
      ["dataset:kiswahili-commons", "A Swahili corpus with a datasheet worth copying."],
      ["thread:yoruba-tone-marks-asr", "Why tone marks matter for meaning."],
    ],
  },
]

export const SAMPLE_COLLECTIONS: Collection[] = SAMPLE_COLLECTION_DATA.map((c) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  isPublic: true,
  owner: personWho(c.owner),
  createdAt: c.date,
  updatedAt: c.date,
  items: c.items.map(([target, note], i) => ({ target, note, position: i, addedAt: c.date })),
  baseFollowers: c.followers,
  sample: true,
  local: false,
}))

export const getSampleCollection = (id: string) => SAMPLE_COLLECTIONS.find((c) => c.id === id)

const COLLECTIONS_KEY = "nexverse-collections"
type LocalCollection = Omit<Collection, "owner" | "sample" | "local" | "baseFollowers">
const fromLocalCollection = (c: LocalCollection): Collection => ({ ...c, items: [...c.items].sort((a, b) => a.position - b.position), owner: { name: "You" }, baseFollowers: 0, sample: false, local: true })
const readLocalCollections = () => readLocal<LocalCollection[]>(COLLECTIONS_KEY, [])
function writeLocalCollection(id: string, change: (c: LocalCollection) => LocalCollection) {
  const all = readLocalCollections()
  const i = all.findIndex((c) => c.id === id)
  if (i < 0) throw new Error("This collection is gone.")
  all[i] = { ...change(all[i]), updatedAt: new Date().toISOString() }
  writeLocal(COLLECTIONS_KEY, all)
  return fromLocalCollection(all[i])
}

const COLLECTION_COLUMNS =
  "id, title, description, is_public, created_at, updated_at, owner:profiles(id, name), items:collection_items(target, note, position, added_at)"
type CollectionRow = {
  id: string
  title: string
  description: string
  is_public: boolean
  created_at: string
  updated_at: string
  owner: Member | null
  items: { target: string; note: string; position: number; added_at: string }[]
}
const fromCollectionRow = (r: CollectionRow): Collection => ({
  id: r.id,
  title: r.title,
  description: r.description,
  isPublic: r.is_public,
  owner: memberWho(r.owner),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items: (r.items ?? []).map((i) => ({ target: i.target, note: i.note, position: i.position, addedAt: i.added_at })).sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt)),
  baseFollowers: 0,
  sample: false,
  local: false,
})

/** Public collections: members' newest first, then the samples. */
export async function listPublicCollections(): Promise<Collection[]> {
  const client = db()
  if (!client) return [...readLocalCollections().filter((c) => c.isPublic).map(fromLocalCollection), ...SAMPLE_COLLECTIONS]
  const { data, error } = await client.from("collections").select(COLLECTION_COLUMNS).eq("is_public", true).order("updated_at", { ascending: false }).limit(60)
  fail(error)
  return [...(data as unknown as CollectionRow[]).map(fromCollectionRow), ...SAMPLE_COLLECTIONS]
}

/** Your own collections, public and private. Empty when signed out with a database. */
export async function listMyCollections(): Promise<Collection[]> {
  const client = db()
  if (!client) return readLocalCollections().map(fromLocalCollection)
  const userId = await me()
  if (!userId) return []
  const { data, error } = await client.from("collections").select(COLLECTION_COLUMNS).eq("owner_id", userId).order("updated_at", { ascending: false }).limit(50)
  fail(error)
  return (data as unknown as CollectionRow[]).map(fromCollectionRow)
}

export async function getCollection(id: string): Promise<Collection | null> {
  const sample = getSampleCollection(id)
  if (sample) return sample
  const client = db()
  if (!client) {
    const c = readLocalCollections().find((x) => x.id === id)
    return c ? fromLocalCollection(c) : null
  }
  if (!isUuid(id)) return null
  const { data, error } = await client.from("collections").select(COLLECTION_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromCollectionRow(data as unknown as CollectionRow) : null
}

export type CollectionInput = { title: string; description: string; isPublic: boolean }

export function validateCollection(c: CollectionInput): Partial<Record<"title" | "description", string>> {
  const errors: Partial<Record<"title" | "description", string>> = {}
  const title = c.title.trim()
  if (title.length < 3) errors.title = "Give the collection a title of at least 3 characters."
  else if (title.length > 80) errors.title = "Keep the title under 80 characters."
  if (c.description.length > 500) errors.description = "Keep the description under 500 characters."
  return errors
}

export async function createCollection(input: CollectionInput, firstItem?: string): Promise<Collection> {
  const first = Object.values(validateCollection(input))[0]
  if (first) throw new Error(first)
  const now = new Date().toISOString()
  const client = db()
  if (!client) {
    const c: LocalCollection = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      description: input.description.trim(),
      isPublic: input.isPublic,
      createdAt: now,
      updatedAt: now,
      items: firstItem ? [{ target: firstItem, note: "", position: 0, addedAt: now }] : [],
    }
    writeLocal(COLLECTIONS_KEY, [c, ...readLocalCollections()])
    return fromLocalCollection(c)
  }
  await requireMe()
  const { data, error } = await client
    .from("collections")
    .insert({ title: input.title.trim(), description: input.description.trim(), is_public: input.isPublic })
    .select("id")
    .single()
  fail(error)
  const id = (data as { id: string }).id
  if (firstItem) await addToCollection(id, firstItem)
  const c = await getCollection(id)
  if (!c) throw new Error("The collection was created but could not be read back.")
  return c
}

export async function updateCollection(id: string, input: CollectionInput): Promise<void> {
  const first = Object.values(validateCollection(input))[0]
  if (first) throw new Error(first)
  const client = db()
  if (!client) {
    writeLocalCollection(id, (c) => ({ ...c, title: input.title.trim(), description: input.description.trim(), isPublic: input.isPublic }))
    return
  }
  const { error } = await client.from("collections").update({ title: input.title.trim(), description: input.description.trim(), is_public: input.isPublic }).eq("id", id)
  fail(error)
}

export async function deleteCollection(id: string) {
  const client = db()
  if (!client) {
    writeLocal(COLLECTIONS_KEY, readLocalCollections().filter((c) => c.id !== id))
    return
  }
  const { error } = await client.from("collections").delete().eq("id", id)
  fail(error)
}

export async function addToCollection(id: string, target: string, note = "") {
  if (!COLLECTION_ITEM_TARGET.test(target)) throw new Error("That cannot go in a collection.")
  if (note.length > 500) throw new Error("Keep the note under 500 characters.")
  const client = db()
  if (!client) {
    writeLocalCollection(id, (c) => {
      if (c.items.some((i) => i.target === target)) return c
      if (c.items.length >= 200) throw new Error("A collection holds up to 200 items.")
      const position = c.items.reduce((m, i) => Math.max(m, i.position), -1) + 1
      return { ...c, items: [...c.items, { target, note, position, addedAt: new Date().toISOString() }] }
    })
    return
  }
  const { data: last } = await client.from("collection_items").select("position").eq("collection_id", id).order("position", { ascending: false }).limit(1).maybeSingle()
  const position = ((last as { position: number } | null)?.position ?? -1) + 1
  const { error } = await client.from("collection_items").upsert({ collection_id: id, target, note, position }, { onConflict: "collection_id,target", ignoreDuplicates: true })
  fail(error)
}

export async function removeFromCollection(id: string, target: string) {
  const client = db()
  if (!client) {
    writeLocalCollection(id, (c) => ({ ...c, items: c.items.filter((i) => i.target !== target) }))
    return
  }
  const { error } = await client.from("collection_items").delete().eq("collection_id", id).eq("target", target)
  fail(error)
}

export async function setItemNote(id: string, target: string, note: string) {
  if (note.length > 500) throw new Error("Keep the note under 500 characters.")
  const client = db()
  if (!client) {
    writeLocalCollection(id, (c) => ({ ...c, items: c.items.map((i) => (i.target === target ? { ...i, note } : i)) }))
    return
  }
  const { error } = await client.from("collection_items").update({ note }).eq("collection_id", id).eq("target", target)
  fail(error)
}

/** Saves a new order for a collection's items (targets, first to last). */
export async function reorderCollection(id: string, targets: string[]) {
  const client = db()
  if (!client) {
    writeLocalCollection(id, (c) => ({ ...c, items: c.items.map((i) => ({ ...i, position: Math.max(0, targets.indexOf(i.target)) })) }))
    return
  }
  const { error } = await client.rpc("reorder_collection", { collection: id, targets })
  fail(error)
}

const COLLECTION_FOLLOWS_KEY = "nexverse-collection-follows"

export async function getCollectionFollow(id: string): Promise<{ followers: number; mine: boolean }> {
  const client = db()
  if (!client) {
    const mine = readLocal<string[]>(COLLECTION_FOLLOWS_KEY, []).includes(id)
    return { followers: mine ? 1 : 0, mine }
  }
  const userId = await me()
  const [count, mine] = await Promise.all([
    client.from("collection_follows").select("collection", { count: "exact", head: true }).eq("collection", id),
    userId ? client.from("collection_follows").select("collection").eq("collection", id).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  fail(count.error)
  return { followers: count.count ?? 0, mine: Boolean(mine.data) }
}

export async function setCollectionFollow(id: string, on: boolean) {
  const client = db()
  if (!client) {
    const rest = readLocal<string[]>(COLLECTION_FOLLOWS_KEY, []).filter((x) => x !== id)
    writeLocal(COLLECTION_FOLLOWS_KEY, on ? [id, ...rest] : rest)
    return
  }
  const userId = await requireMe()
  const { error } = on
    ? await client.from("collection_follows").upsert({ collection: id }, { onConflict: "collection,user_id", ignoreDuplicates: true })
    : await client.from("collection_follows").delete().eq("collection", id).eq("user_id", userId)
  fail(error)
}

/** Collections you follow (ids, newest first). */
export async function listFollowedCollectionIds(): Promise<string[]> {
  const client = db()
  if (!client) return readLocal<string[]>(COLLECTION_FOLLOWS_KEY, [])
  const userId = await me()
  if (!userId) return []
  const { data, error } = await client.from("collection_follows").select("collection").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
  fail(error)
  return (data as { collection: string }[]).map((r) => r.collection)
}

// ─── Reputation ─────────────────────────────────────────────────────────────────────────────────────────────

/** Points per thing, the same as the database's reputation_ledger(). */
export const POINTS = { thread: 5, answer: 2, accepted: 15, like: 2, reaction: 1 } as const

export type Level = { name: string; min: number; blurb: string }

export const LEVELS: Level[] = [
  { name: "Stardust", min: 0, blurb: "Everyone starts here." },
  { name: "Comet", min: 25, blurb: "Leaving a trail: a few threads and replies." },
  { name: "Planet", min: 100, blurb: "A steady presence people orbit around." },
  { name: "Star", min: 300, blurb: "Others find their way by your answers." },
  { name: "Nebula", min: 1000, blurb: "Where new members are formed." },
  { name: "Galaxy", min: 3000, blurb: "A whole community in one person." },
]

export type LevelInfo = { level: Level; index: number; next: Level | null; progress: number; toNext: number }

export function levelFor(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points))
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i].min) index = i
  const level = LEVELS[index]
  const next = LEVELS[index + 1] ?? null
  const progress = next ? (p - level.min) / (next.min - level.min) : 1
  return { level, index, next, progress: Math.min(1, Math.max(0, progress)), toNext: next ? next.min - p : 0 }
}

export type RepStats = {
  points: number
  threads: number
  answers: number
  accepted: number
  likes: number
  reactions: number
  eventsHosted: number
  collections: number
}

export const EMPTY_STATS: RepStats = { points: 0, threads: 0, answers: 0, accepted: 0, likes: 0, reactions: 0, eventsHosted: 0, collections: 0 }

export type Badge = { id: string; name: string; description: string; earned: (s: RepStats) => boolean }

export const BADGES: Badge[] = [
  { id: "first-light", name: "First light", description: "Started a first thread.", earned: (s) => s.threads >= 1 },
  { id: "helping-hand", name: "Helping hand", description: "Replied 10 times.", earned: (s) => s.answers >= 10 },
  { id: "problem-solver", name: "Problem solver", description: "Had a reply marked as the solution.", earned: (s) => s.accepted >= 1 },
  { id: "guiding-star", name: "Guiding star", description: "Had 10 replies marked as solutions.", earned: (s) => s.accepted >= 10 },
  { id: "well-liked", name: "Well liked", description: "Received 50 likes and reactions.", earned: (s) => s.likes + s.reactions >= 50 },
  { id: "host", name: "Host", description: "Hosted an event.", earned: (s) => s.eventsHosted >= 1 },
  { id: "curator", name: "Curator", description: "Keeps a public collection.", earned: (s) => s.collections >= 1 },
]

export type Period = "week" | "month" | "all"
export const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
]

export type LeaderRow = RepStats & { who: Who; you?: boolean }

const pointsOf = (s: Omit<RepStats, "points">) => s.threads * POINTS.thread + s.answers * POINTS.answer + s.accepted * POINTS.accepted + s.likes * POINTS.like + s.reactions * POINTS.reaction

const sinceOf = (period: Period, now: number) => (period === "week" ? now - 7 * 864e5 : period === "month" ? now - 30 * 864e5 : -Infinity)

/**
 * Reputation from the sample content: threads and replies count as posted, accepted replies as accepted, and
 * upvotes on someone's threads and replies as likes received. Dated against the preview's fixed today.
 */
export function sampleStats(handle: string, period: Period = "all"): RepStats {
  const since = sinceOf(period, PREVIEW_TODAY)
  const inRange = (d: string) => Date.parse(d) >= since
  const s = { ...EMPTY_STATS }
  for (const t of threads) {
    if (t.author === handle && inRange(t.date)) {
      s.threads += 1
      s.likes += t.votes
    }
    for (const r of t.replies) {
      if (r.author !== handle || !inRange(r.date)) continue
      s.answers += 1
      s.likes += r.votes
      if (r.accepted && t.author !== handle) s.accepted += 1
    }
  }
  if (period === "all") {
    s.eventsHosted = SAMPLE_EVENTS.filter((e) => e.host.handle === handle).length
    s.collections = SAMPLE_COLLECTIONS.filter((c) => c.owner.handle === handle).length
  }
  return { ...s, points: pointsOf(s) }
}

/** What you did in this browser (no database): threads, replies, events and collections saved here. */
function localStats(period: Period): RepStats {
  const since = sinceOf(period, Date.now())
  const inRange = (d: string) => Date.parse(d) >= since
  const s = { ...EMPTY_STATS }
  const questions = readLocal<LocalQuestion[]>(QUESTIONS_KEY, [])
  s.threads = questions.filter((q) => inRange(q.date)).length
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith("nexverse-replies:")) continue
      const replies = readLocal<LocalAnswer[]>(key, []).filter((a) => inRange(a.date))
      // Accepting a reply on your own thread earns nothing, as in the database, so only replies count here.
      s.answers += replies.length
    }
  } catch {}
  if (period === "all") {
    s.eventsHosted = readLocal<LocalEvent[]>(EVENTS_KEY, []).length
    s.collections = readLocalCollections().filter((c) => c.isPublic).length
  }
  return { ...s, points: pointsOf(s) }
}

type LeaderDbRow = { member_id: string; name: string; points: number; threads: number; answers: number; accepted: number; likes: number; reactions: number }

/** The leaderboard for a period. With a database: members ranked by the leaderboard() function. Without: sample people. */
export async function getLeaderboard(period: Period, limit = 50): Promise<LeaderRow[]> {
  const client = db()
  if (!client) {
    const rows: LeaderRow[] = people.map((p) => ({ ...sampleStats(p.handle, period), who: personWho(p.handle) }))
    const you = localStats(period)
    if (you.points > 0) rows.push({ ...you, who: { name: "You" }, you: true })
    return rows
      .filter((r) => r.points > 0)
      .sort((a, b) => b.points - a.points || a.who.name.localeCompare(b.who.name))
      .slice(0, limit)
  }
  const [userId, res] = await Promise.all([me(), client.rpc("leaderboard", { period, max_rows: limit })])
  fail(res.error)
  return ((res.data ?? []) as LeaderDbRow[]).map((r) => ({
    who: { name: r.name, memberId: r.member_id },
    you: r.member_id === userId,
    points: Number(r.points),
    threads: Number(r.threads),
    answers: Number(r.answers),
    accepted: Number(r.accepted),
    likes: Number(r.likes),
    reactions: Number(r.reactions),
    eventsHosted: 0,
    collections: 0,
  }))
}

/** A member's all-time reputation. Without a database, "you" means what this browser holds. */
export async function getMemberReputation(memberId: string | null): Promise<RepStats> {
  const client = db()
  if (!client) return localStats("all")
  if (!memberId) return EMPTY_STATS
  const { data, error } = await client.rpc("member_reputation", { member: memberId })
  fail(error)
  type Row = Record<"points" | "threads" | "answers" | "accepted" | "likes" | "reactions" | "events_hosted" | "collections", number>
  const r = ((data ?? []) as Row[])[0]
  if (!r) return EMPTY_STATS
  return {
    points: Number(r.points),
    threads: Number(r.threads),
    answers: Number(r.answers),
    accepted: Number(r.accepted),
    likes: Number(r.likes),
    reactions: Number(r.reactions),
    eventsHosted: Number(r.events_hosted),
    collections: Number(r.collections),
  }
}

/** The title of a sample thread (in English when translated), or null. */
export const sampleThreadTitle = (id: string) => {
  const t = getThread(id)
  return t ? (t.en?.title ?? t.title) : null
}
