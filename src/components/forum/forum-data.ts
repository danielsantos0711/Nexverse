import type { PostgrestError } from "@supabase/supabase-js"
import type { Topic } from "@/components/forum/topics"
import { getThreadExtras, listReplies, listThreadExtras, type Reply } from "@/lib/community"
import { categoryOf, type LanguageCode } from "@/lib/data"
import { getQuestion, listQuestions, type Member, type Question, type ThreadRef } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * The forum's reads: threads (the questions table, one category per `orbit`) with their reply count and newest
 * reply, one thread with its tags and edit stamp, and a thread's replies. Columns from newer migrations
 * (hidden, pinned, locked) are read when the database has them; until then the same queries run without them.
 * Without a database everything comes from this browser (lib/store and lib/community keep those records).
 */

// ─── Columns newer migrations add ───────────────────────────────────────────────────────────────────────────

// hidden_at comes with moderation (…_roles_admin.sql), pinned_at and locked_at with …_forum_threads.sql. A column
// the database does not have yet is remembered here and left out of later selects.
const missing = new Set<string>()

type Result<T> = { data: T | null; error: PostgrestError | null }

/** Runs a select with the optional columns that exist, dropping any the database reports missing and trying again. */
async function withOptional<T>(table: string, cols: string[], run: (extra: string) => PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<Result<T>> {
  for (let tries = 0; tries <= cols.length; tries++) {
    const have = cols.filter((c) => !missing.has(`${table}.${c}`))
    const res = (await run(have.map((c) => `, ${c}`).join(""))) as Result<T>
    if (res.error?.code !== "42703") return res
    const gone = have.find((c) => res.error!.message.includes(c))
    if (!gone) return res
    missing.add(`${table}.${gone}`)
  }
  return { data: null, error: { code: "42703", message: "A column is missing", details: "", hint: "", name: "PostgrestError" } as PostgrestError }
}

const THREAD_EXTRAS = ["hidden_at", "pinned_at", "locked_at"]

function fail(error: PostgrestError | null): asserts error is null {
  if (!error) return
  if (/schema cache|does not exist/.test(error.message)) throw new Error("The forum is still being switched on. Try again in a moment.")
  throw new Error(error.message)
}

const nameOf = (m: Member | null | undefined, local = false) => (local ? "You" : (m?.name ?? "A member"))

// ─── Thread lists ───────────────────────────────────────────────────────────────────────────────────────────

const LIST_COLUMNS =
  "id, title, orbit, lang, created_at, tags, accepted_answer_id, author_id, author:profiles(id, name), replies:answers!answers_question_id_fkey(count), last:answers!answers_question_id_fkey(created_at, author:profiles(id, name))"

type ListRow = {
  id: string
  title: string
  orbit: string
  lang: string
  created_at: string
  tags: string[] | null
  accepted_answer_id: string | null
  author_id: string
  author: Member | null
  replies: { count: number }[]
  last: { created_at: string; author: Member | null }[]
  hidden_at?: string | null
  pinned_at?: string | null
  locked_at?: string | null
}

function fromListRow(r: ListRow): Topic {
  const author = { name: nameOf(r.author) }
  const last = r.last?.[0]
  return {
    id: r.id,
    href: `/forum/${r.id}`,
    title: r.title,
    lang: r.lang as LanguageCode,
    category: categoryOf(r.orbit),
    author,
    authorId: r.author_id,
    created: r.created_at,
    activity: last?.created_at ?? r.created_at,
    lastPoster: last ? { name: nameOf(last.author) } : author,
    replies: r.replies?.[0]?.count ?? 0,
    solved: Boolean(r.accepted_answer_id),
    local: false,
    tags: r.tags ?? [],
    hidden: Boolean(r.hidden_at),
    pinned: Boolean(r.pinned_at),
    locked: Boolean(r.locked_at),
  }
}

function fromLocal(q: Question, extras: Record<string, { tags: string[]; accepted: boolean }>): Topic {
  const author = { name: "You" }
  return {
    id: q.id,
    href: `/forum/${q.id}`,
    title: q.title,
    lang: q.lang,
    category: categoryOf(q.orbit),
    author,
    authorId: null,
    created: q.createdAt,
    activity: q.createdAt,
    lastPoster: author,
    replies: q.answerCount,
    solved: Boolean(extras[q.id]?.accepted),
    local: true,
    tags: extras[q.id]?.tags ?? [],
    hidden: false,
    pinned: false,
    locked: false,
  }
}

/** The most this page asks for at once. Lists sort and page in the browser, so this caps one category's list. */
export const THREAD_LIMIT = 500

/** Threads, newest first: all of them, or one category's. */
export async function listForumThreads({ category, limit = THREAD_LIMIT }: { category?: string; limit?: number } = {}): Promise<Topic[]> {
  const client = db()
  if (!client) {
    const [qs, extras] = await Promise.all([listQuestions({ orbit: category, limit }), listThreadExtras().catch(() => ({}))])
    return qs.map((q) => fromLocal(q, extras))
  }
  const { data, error } = await withOptional<ListRow[]>("questions", THREAD_EXTRAS, (extra) => {
    let q = client
      .from("questions")
      .select(LIST_COLUMNS + extra)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "last", ascending: false })
      .limit(1, { referencedTable: "last" })
      .limit(limit)
    if (category) q = q.eq("orbit", category)
    return q
  })
  fail(error)
  return (data ?? []).map(fromListRow)
}

// ─── One thread ─────────────────────────────────────────────────────────────────────────────────────────────

export type ForumThread = Question & { authorId: string | null; tags: string[]; editedAt: string | null; hidden: boolean; pinned: boolean; locked: boolean }

const THREAD_COLUMNS =
  "id, title, body, orbit, lang, created_at, tags, edited_at, accepted_answer_id, author:profiles(id, name), answers!answers_question_id_fkey(count)"

type ThreadRow = {
  id: string
  title: string
  body: string
  orbit: string
  lang: string
  created_at: string
  tags: string[] | null
  edited_at: string | null
  accepted_answer_id: string | null
  author: Member | null
  answers: { count: number }[]
  hidden_at?: string | null
  pinned_at?: string | null
  locked_at?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isThreadId = (id: string) => UUID.test(id)

/** A thread with its tags and edit stamp, or null when there is no such thread (or you may not see it). */
export async function getForumThread(id: string): Promise<ForumThread | null> {
  if (!isThreadId(id)) return null
  const client = db()
  if (!client) {
    const q = await getQuestion(id)
    if (!q) return null
    const x = await getThreadExtras(q)
    return { ...q, authorId: null, acceptedAnswerId: x.acceptedAnswerId, tags: x.tags, editedAt: x.editedAt, hidden: false, pinned: false, locked: false }
  }
  const { data, error } = await withOptional<ThreadRow>("questions", THREAD_EXTRAS, (extra) =>
    client
      .from("questions")
      .select(THREAD_COLUMNS + extra)
      .eq("id", id)
      .maybeSingle()
  )
  fail(error)
  if (!data) return null
  return {
    id: data.id,
    title: data.title,
    body: data.body,
    orbit: data.orbit,
    lang: data.lang as LanguageCode,
    createdAt: data.created_at,
    author: data.author,
    acceptedAnswerId: data.accepted_answer_id,
    answerCount: data.answers?.[0]?.count ?? 0,
    local: false,
    tags: data.tags ?? [],
    authorId: data.author?.id ?? null,
    editedAt: data.edited_at,
    hidden: Boolean(data.hidden_at),
    pinned: Boolean(data.pinned_at),
    locked: Boolean(data.locked_at),
  }
}

// ─── Replies ────────────────────────────────────────────────────────────────────────────────────────────────

export type ForumReply = Reply & { hidden: boolean }

const REPLY_COLUMNS = "id, body, created_at, edited_at, author:profiles(id, name)"
type ReplyRow = { id: string; body: string; created_at: string; edited_at: string | null; author: Member | null; hidden_at?: string | null }

/** A thread's replies, oldest first, each marked when moderators hid it. */
export async function listForumReplies(thread: ThreadRef): Promise<ForumReply[]> {
  const client = db()
  if (!client) return (await listReplies(thread)).map((r) => ({ ...r, hidden: false }))
  const { data, error } = await withOptional<ReplyRow[]>("answers", ["hidden_at"], (extra) =>
    client
      .from("answers")
      .select(REPLY_COLUMNS + extra)
      .eq(thread.kind === "sample" ? "sample_thread" : "question_id", thread.id)
      .order("created_at")
  )
  fail(error)
  return (data ?? []).map((a) => ({
    id: a.id,
    body: a.body,
    createdAt: a.created_at,
    editedAt: a.edited_at,
    author: a.author,
    local: false,
    hidden: Boolean(a.hidden_at),
  }))
}

// ─── Staff tools ────────────────────────────────────────────────────────────────────────────────────────────

/** Pins or locks a thread (staff only; the database checks). Says so plainly when the forum migration is missing. */
export async function setThreadFlag(id: string, flag: "pin" | "lock", on: boolean) {
  const client = db()
  if (!client) throw new Error("Pinning and locking need the database.")
  const { error } = await client.rpc("set_thread_flag", { target: id, flag, turn_on: on })
  if (error && /set_thread_flag|schema cache|does not exist/.test(error.message)) throw new Error("Pinning and locking are not switched on in the database yet.")
  fail(error)
}
