import { useEffect, useSyncExternalStore } from "react"
import { announceLocalVote, getMessages, isMissing, localMember, sendMessage, type ChatMessage, type SendOptions } from "@/lib/chat"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * The parts of chat that sit beside the messages: polls and their votes, saved messages, a member search for
 * @mentions, and each member's own chat and messages settings (social_prefs). Everything follows the same rule
 * as lib/chat: Supabase when it is connected (…_social.sql), this browser otherwise, and a database that does not
 * have these tables yet reads as "nothing here" instead of an error.
 */

type DbError = { message: string; code?: string } | null

function fail(error: DbError): asserts error is null {
  if (!error) return
  if (isMissing(error)) throw new Error("This is not switched on in the database yet (migration …_social.sql).")
  if (error.code === "42501" || /row-level security/.test(error.message)) throw new Error("Your account cannot do that here.")
  throw new Error(error.message)
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

async function myId(): Promise<string | null> {
  const client = db()
  if (!client) return localMember().id
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

// ─── Polls ──────────────────────────────────────────────────────────────────────────────────────────────────

export const POLL_LIMITS = { question: 300, option: 80, minOptions: 2, maxOptions: 10 } as const

export type Vote = { userId: string; choice: number }
export type Poll = {
  messageId: string
  question: string
  options: string[]
  multi: boolean
  closesAt: string | null
  createdBy: string
  votes: Vote[]
}
export type PollInput = { question: string; options: string[]; multi: boolean; /** Hours until it closes; 0 keeps it open. */ hours: number }

const POLLS_KEY = "nexverse-chat-polls"
type LocalPolls = Record<string, Omit<Poll, "votes"> & { votes: Vote[] }>

export function validatePoll(p: PollInput): string | null {
  const q = p.question.trim()
  if (!q) return "Ask a question first."
  if (q.length > POLL_LIMITS.question) return `Keep the question to ${POLL_LIMITS.question} characters.`
  const opts = p.options.map((o) => o.trim()).filter(Boolean)
  if (opts.length < POLL_LIMITS.minOptions) return "Give at least two options."
  if (opts.length > POLL_LIMITS.maxOptions) return `Up to ${POLL_LIMITS.maxOptions} options.`
  if (opts.some((o) => o.length > POLL_LIMITS.option)) return `Each option is up to ${POLL_LIMITS.option} characters.`
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return "Two options say the same thing."
  return null
}

/** The polls on these messages, with every vote, keyed by message id. */
export async function getPolls(messageIds: string[]): Promise<Record<string, Poll>> {
  const ids = [...new Set(messageIds)]
  if (!ids.length) return {}
  const client = db()
  if (!client) {
    const all = readJSON<LocalPolls>(POLLS_KEY, {})
    return Object.fromEntries(ids.filter((id) => all[id]).map((id) => [id, all[id]]))
  }
  const [polls, votes] = await Promise.all([
    client.from("chat_polls").select("message_id, question, options, multi, closes_at, created_by").in("message_id", ids),
    client.from("chat_poll_votes").select("message_id, user_id, choice").in("message_id", ids).limit(5000),
  ])
  if (isMissing(polls.error)) return {}
  fail(polls.error)
  fail(votes.error)
  const out: Record<string, Poll> = {}
  for (const r of polls.data as { message_id: string; question: string; options: string[]; multi: boolean; closes_at: string | null; created_by: string }[]) {
    out[r.message_id] = { messageId: r.message_id, question: r.question, options: r.options, multi: r.multi, closesAt: r.closes_at, createdBy: r.created_by, votes: [] }
  }
  for (const v of votes.data as { message_id: string; user_id: string; choice: number }[]) out[v.message_id]?.votes.push({ userId: v.user_id, choice: v.choice })
  return out
}

/** Posts a poll: a "poll" message carrying the question, and the poll itself. */
export async function createPoll(room: string, input: PollInput, opts: SendOptions = {}): Promise<{ message: ChatMessage; poll: Poll }> {
  const problem = validatePoll(input)
  if (problem) throw new Error(problem)
  const question = input.question.trim()
  const options = input.options.map((o) => o.trim()).filter(Boolean)
  const closesAt = input.hours > 0 ? new Date(Date.now() + input.hours * 3600_000).toISOString() : null
  const message = await sendMessage(room, question, { ...opts, kind: "poll" })
  const client = db()
  const poll: Poll = { messageId: message.id, question, options, multi: input.multi, closesAt, createdBy: message.author?.id ?? "", votes: [] }
  if (!client) {
    writeJSON(POLLS_KEY, { ...readJSON<LocalPolls>(POLLS_KEY, {}), [message.id]: poll })
    return { message, poll }
  }
  const { error } = await client.from("chat_polls").insert({ message_id: message.id, question, options, multi: input.multi, closes_at: closesAt })
  fail(error)
  return { message, poll }
}

/** Casts or takes back a vote. A single-answer poll swaps your earlier answer for this one. */
export async function vote(poll: Poll, room: string, choice: number, on: boolean): Promise<Vote[]> {
  const me = await myId()
  if (!me) throw new Error("Sign in to vote.")
  const mine = poll.votes.filter((v) => v.userId === me)
  const client = db()
  if (!client) {
    const all = readJSON<LocalPolls>(POLLS_KEY, {})
    const p = all[poll.messageId]
    if (!p) throw new Error("This poll is gone.")
    let votes = p.votes.filter((v) => !(v.userId === me && (v.choice === choice || (!p.multi && on))))
    if (on) votes = [...votes, { userId: me, choice }]
    all[poll.messageId] = { ...p, votes }
    writeJSON(POLLS_KEY, all)
    for (const v of mine) if (!votes.some((x) => x.userId === me && x.choice === v.choice)) announceLocalVote(room, { messageId: poll.messageId, userId: me, choice: v.choice, on: false })
    if (on) announceLocalVote(room, { messageId: poll.messageId, userId: me, choice, on: true })
    return votes
  }
  if (!on || !poll.multi) {
    // Take back this answer (or, for a single-answer poll, the earlier one) first.
    const drop = on ? mine.map((v) => v.choice) : [choice]
    if (drop.length) {
      const { error } = await client.from("chat_poll_votes").delete().eq("message_id", poll.messageId).eq("user_id", me).in("choice", drop)
      fail(error)
    }
  }
  if (on) {
    const { error } = await client.from("chat_poll_votes").insert({ message_id: poll.messageId, choice })
    if (error?.code !== "23505") fail(error)
  }
  const rest = poll.votes.filter((v) => v.userId !== me || (poll.multi && v.choice !== choice))
  return on ? [...rest, { userId: me, choice }] : rest
}

/** The poll's author closes it now, or opens it again. */
export async function setPollClosed(poll: Poll, closed: boolean): Promise<string | null> {
  const closesAt = closed ? new Date().toISOString() : null
  const client = db()
  if (!client) {
    const all = readJSON<LocalPolls>(POLLS_KEY, {})
    if (all[poll.messageId]) all[poll.messageId] = { ...all[poll.messageId], closesAt }
    writeJSON(POLLS_KEY, all)
    return closesAt
  }
  const { error } = await client.from("chat_polls").update({ closes_at: closesAt }).eq("message_id", poll.messageId)
  fail(error)
  return closesAt
}

export const pollClosed = (p: Pick<Poll, "closesAt">, now = Date.now()) => Boolean(p.closesAt && Date.parse(p.closesAt) <= now)

// ─── Saved messages ─────────────────────────────────────────────────────────────────────────────────────────

const SAVED_KEY = "nexverse-chat-saved"
let savedIds: Set<string> | null = null
const savedListeners = new Set<() => void>()
const emitSaved = () => savedListeners.forEach((l) => l())

async function loadSavedIds(): Promise<Set<string>> {
  if (savedIds) return savedIds
  const client = db()
  if (!client) return (savedIds = new Set(readJSON<{ id: string; message: ChatMessage }[]>(SAVED_KEY, []).map((x) => x.id)))
  const me = await myId()
  if (!me) return (savedIds = new Set())
  const { data, error } = await client.from("chat_saved").select("message_id").order("created_at", { ascending: false }).limit(500)
  savedIds = new Set(error ? [] : (data as { message_id: string }[]).map((r) => r.message_id))
  return savedIds
}

/** The ids of the messages you saved, for the bookmark mark on each message. Loads once a page. */
export function useSavedIds(): Set<string> {
  const { ready, user } = useSession()
  useEffect(() => {
    if (live && (!ready || !user)) return
    loadSavedIds().then(emitSaved, () => {})
  }, [ready, user])
  return useSyncExternalStore(
    (l) => {
      savedListeners.add(l)
      return () => savedListeners.delete(l)
    },
    () => savedIds ?? EMPTY,
    () => EMPTY
  )
}
const EMPTY = new Set<string>()

/** Saves a message for later, or forgets it. */
export async function setSaved(m: ChatMessage, saved: boolean) {
  const ids = new Set(await loadSavedIds())
  const client = db()
  if (!client) {
    const list = readJSON<{ id: string; message: ChatMessage }[]>(SAVED_KEY, []).filter((x) => x.id !== m.id)
    writeJSON(SAVED_KEY, saved ? [{ id: m.id, message: m }, ...list].slice(0, 300) : list)
  } else {
    const { error } = saved
      ? await client.from("chat_saved").upsert({ message_id: m.id }, { onConflict: "user_id,message_id", ignoreDuplicates: true })
      : await client.from("chat_saved").delete().eq("message_id", m.id)
    fail(error)
  }
  if (saved) ids.add(m.id)
  else ids.delete(m.id)
  savedIds = ids
  emitSaved()
}

/** Your saved messages, newest saved first, across every room you can still open. */
export async function listSaved(): Promise<ChatMessage[]> {
  const client = db()
  if (!client) return readJSON<{ id: string; message: ChatMessage }[]>(SAVED_KEY, []).map((x) => x.message)
  const ids = [...(await loadSavedIds())]
  const found = await getMessages(ids)
  const order = new Map(ids.map((id, i) => [id, i]))
  return found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

// ─── Finding people to mention ──────────────────────────────────────────────────────────────────────────────

export type Mentionable = { id: string; name: string; handle: string | null }

/** Members whose name or handle starts with (or contains) what was typed after @. */
export async function findMembers(query: string, limit = 6): Promise<Mentionable[]> {
  const client = db()
  const q = query.trim().replace(/^@/, "")
  if (!client || !q) return []
  const pattern = `%${q.replace(/[\\%_,()]/g, "")}%`
  const { data, error } = await client.from("profiles").select("id, name, handle").or(`name.ilike.${pattern},handle.ilike.${pattern}`).limit(limit)
  if (error) return []
  return (data as Mentionable[]).filter((m) => m.name)
}

// ─── Your settings for chat and messages ────────────────────────────────────────────────────────────────────

export type ChatPrefs = {
  /** Cozy shows avatars and room to breathe; compact fits more messages on screen. */
  density: "cozy" | "compact"
  /** Rooms pinned to the top of the list. */
  starred: string[]
  /** Rooms whose unread counts stay quiet. */
  muted: string[]
  /** The starfield behind the messages. */
  stars: boolean
  /** Rules banners you have read and closed, by room. */
  readRules: string[]
  /** The language "Translate" turns messages into. */
  translateTo: string
}

export type DmPrefs = {
  /** The colour of your own bubbles. */
  bubble: "ion" | "violet" | "teal" | "rose" | "amber" | "gold"
  /** Show your conversations as a compact list. */
  compact: boolean
}

export const DEFAULT_CHAT: ChatPrefs = { density: "cozy", starred: [], muted: [], stars: true, readRules: [], translateTo: "en" }
export const DEFAULT_DM: DmPrefs = { bubble: "ion", compact: false }

type Prefs = { chat: ChatPrefs; dm: DmPrefs }
const PREFS_KEY = "nexverse-social-prefs"
let prefs: Prefs = { chat: DEFAULT_CHAT, dm: DEFAULT_DM }
let prefsFor: string | null | undefined
const prefsListeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined
let prefsTable = true

const strings = (v: unknown, max = 100) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : [])

function clean(raw: { chat?: Partial<ChatPrefs>; dm?: Partial<DmPrefs> } | null | undefined): Prefs {
  const c = raw?.chat ?? {}
  const d = raw?.dm ?? {}
  return {
    chat: {
      density: c.density === "compact" ? "compact" : "cozy",
      starred: strings(c.starred, 40),
      muted: strings(c.muted, 100),
      stars: c.stars !== false,
      readRules: strings(c.readRules, 100),
      translateTo: typeof c.translateTo === "string" && /^[a-z]{2}$/.test(c.translateTo) ? c.translateTo : "en",
    },
    dm: {
      bubble: (["ion", "violet", "teal", "rose", "amber", "gold"] as const).includes(d.bubble as DmPrefs["bubble"]) ? (d.bubble as DmPrefs["bubble"]) : "ion",
      compact: d.compact === true,
    },
  }
}

async function loadPrefs(userId: string | null) {
  if (prefsFor === userId) return
  prefsFor = userId
  prefs = clean(readJSON(PREFS_KEY, null))
  prefsListeners.forEach((l) => l())
  const client = db()
  if (!client || !userId || !prefsTable) return
  const { data, error } = await client.from("social_prefs").select("chat, dm").eq("user_id", userId).maybeSingle()
  if (error) {
    if (isMissing(error)) prefsTable = false
    return
  }
  if (data && prefsFor === userId) {
    prefs = clean(data as Prefs)
    writeJSON(PREFS_KEY, prefs)
    prefsListeners.forEach((l) => l())
  }
}

/**
 * Your chat and messages settings: saved to your account when the database has social_prefs, and in this
 * browser too, so they apply at once on the next visit.
 */
export function useSocialPrefs() {
  const { ready, user } = useSession()
  const userId = live ? (user?.id ?? null) : "local"
  useEffect(() => {
    if (live && !ready) return
    void loadPrefs(userId)
  }, [ready, userId])
  const current = useSyncExternalStore(
    (l) => {
      prefsListeners.add(l)
      return () => prefsListeners.delete(l)
    },
    () => prefs,
    () => DEFAULT_PREFS
  )
  return { chat: current.chat, dm: current.dm, setChat: (patch: Partial<ChatPrefs>) => savePrefs({ chat: { ...prefs.chat, ...patch } }), setDm: (patch: Partial<DmPrefs>) => savePrefs({ dm: { ...prefs.dm, ...patch } }) }
}
const DEFAULT_PREFS: Prefs = { chat: DEFAULT_CHAT, dm: DEFAULT_DM }

function savePrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch }
  writeJSON(PREFS_KEY, prefs)
  prefsListeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const client = db()
    if (!client || !prefsTable) return
    const { data } = await client.auth.getSession()
    if (!data.session) return
    const { error } = await client.from("social_prefs").upsert({ user_id: data.session.user.id, chat: prefs.chat, dm: prefs.dm, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    if (isMissing(error)) prefsTable = false
  }, 800)
}
