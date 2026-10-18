import type { User } from "@supabase/supabase-js"
import { useSyncExternalStore } from "react"
import type { LanguageCode } from "@/lib/data"
import { db, live } from "@/lib/supabase"

/**
 * What members write: questions, answers and their names. With a database connected this reads and writes
 * Supabase; without one it keeps everything in this browser, so the app still works as a local preview.
 */

export type Member = { id: string; name: string }

export type Question = {
  id: string
  title: string
  body: string
  orbit: string
  lang: LanguageCode
  createdAt: string
  author: Member | null
  acceptedAnswerId: string | null
  answerCount: number
  local: boolean
}

export type Answer = { id: string; body: string; createdAt: string; author: Member | null; local: boolean }

export type NewQuestion = { title: string; body: string; orbit: string; lang: LanguageCode }

/** A thread is either one of the sample threads shipped with the app or a member's question. */
export type ThreadRef = { kind: "sample" | "question"; id: string }

// Browser-only storage. The keys match the first version of the app, so earlier drafts are still found.
type LocalQuestion = { id: string; title: string; body: string; orbit: string; lang: LanguageCode; date: string }
type LocalAnswer = { id: string; body: string; date: string }
const QUESTIONS_KEY = "nexverse-questions"
const answersKey = (threadId: string) => `nexverse-replies:${threadId}`

function readLocal<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[]
  } catch {
    return []
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function fromLocal(q: LocalQuestion): Question {
  return {
    id: q.id,
    title: q.title,
    body: q.body,
    orbit: q.orbit,
    lang: q.lang,
    createdAt: q.date,
    author: null,
    acceptedAnswerId: null,
    answerCount: readLocal(answersKey(q.id)).length,
    local: true,
  }
}

// The question table has two links to answers (its answers, and the accepted one), so the embed names its key.
const QUESTION_COLUMNS =
  "id, title, body, orbit, lang, created_at, accepted_answer_id, author:profiles(id, name), answers!answers_question_id_fkey(count)"

type QuestionRow = {
  id: string
  title: string
  body: string
  orbit: string
  lang: string
  created_at: string
  accepted_answer_id: string | null
  author: Member | null
  answers: { count: number }[]
}

function fromRow(r: QuestionRow): Question {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    orbit: r.orbit,
    lang: r.lang as LanguageCode,
    createdAt: r.created_at,
    author: r.author,
    acceptedAnswerId: r.accepted_answer_id,
    answerCount: r.answers?.[0]?.count ?? 0,
    local: false,
  }
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

export async function listQuestions({ orbit, author, limit = 30 }: { orbit?: string; author?: string; limit?: number } = {}) {
  const client = db()
  if (!client) {
    if (author) return []
    return readLocal<LocalQuestion>(QUESTIONS_KEY)
      .filter((q) => !orbit || q.orbit === orbit)
      .slice(0, limit)
      .map(fromLocal)
  }
  let query = client.from("questions").select(QUESTION_COLUMNS).order("created_at", { ascending: false }).limit(limit)
  if (orbit) query = query.eq("orbit", orbit)
  if (author) query = query.eq("author_id", author)
  const { data, error } = await query
  fail(error)
  return (data as unknown as QuestionRow[]).map(fromRow)
}

export async function getQuestion(id: string): Promise<Question | null> {
  const client = db()
  if (!client) {
    const q = readLocal<LocalQuestion>(QUESTIONS_KEY).find((x) => x.id === id)
    return q ? fromLocal(q) : null
  }
  const { data, error } = await client.from("questions").select(QUESTION_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromRow(data as unknown as QuestionRow) : null
}

export async function createQuestion(input: NewQuestion): Promise<Question> {
  const client = db()
  if (!client) {
    const q: LocalQuestion = { id: crypto.randomUUID(), ...input, date: new Date().toISOString() }
    writeLocal(QUESTIONS_KEY, [q, ...readLocal<LocalQuestion>(QUESTIONS_KEY)])
    return fromLocal(q)
  }
  const { data, error } = await client.from("questions").insert(input).select(QUESTION_COLUMNS).single()
  fail(error)
  return fromRow(data as unknown as QuestionRow)
}

export async function deleteQuestion(id: string) {
  const client = db()
  if (!client) {
    writeLocal(QUESTIONS_KEY, readLocal<LocalQuestion>(QUESTIONS_KEY).filter((q) => q.id !== id))
    try {
      localStorage.removeItem(answersKey(id))
    } catch {}
    return
  }
  const { error } = await client.from("questions").delete().eq("id", id)
  fail(error)
}

export async function listAnswers(thread: ThreadRef): Promise<Answer[]> {
  const client = db()
  if (!client) {
    return readLocal<LocalAnswer>(answersKey(thread.id)).map((a) => ({
      id: a.id,
      body: a.body,
      createdAt: a.date,
      author: null,
      local: true,
    }))
  }
  const { data, error } = await client
    .from("answers")
    .select("id, body, created_at, author:profiles(id, name)")
    .eq(thread.kind === "sample" ? "sample_thread" : "question_id", thread.id)
    .order("created_at")
  fail(error)
  return (data as unknown as { id: string; body: string; created_at: string; author: Member | null }[]).map((a) => ({
    id: a.id,
    body: a.body,
    createdAt: a.created_at,
    author: a.author,
    local: false,
  }))
}

export async function createAnswer(thread: ThreadRef, body: string): Promise<Answer> {
  const client = db()
  if (!client) {
    const a: LocalAnswer = { id: crypto.randomUUID(), body, date: new Date().toISOString() }
    writeLocal(answersKey(thread.id), [...readLocal<LocalAnswer>(answersKey(thread.id)), a])
    return { id: a.id, body, createdAt: a.date, author: null, local: true }
  }
  const { data, error } = await client
    .from("answers")
    .insert(thread.kind === "sample" ? { sample_thread: thread.id, body } : { question_id: thread.id, body })
    .select("id, body, created_at, author:profiles(id, name)")
    .single()
  fail(error)
  const a = data as unknown as { id: string; body: string; created_at: string; author: Member | null }
  return { id: a.id, body: a.body, createdAt: a.created_at, author: a.author, local: false }
}

export async function deleteAnswer(thread: ThreadRef, id: string) {
  const client = db()
  if (!client) {
    writeLocal(answersKey(thread.id), readLocal<LocalAnswer>(answersKey(thread.id)).filter((a) => a.id !== id))
    return
  }
  const { error } = await client.from("answers").delete().eq("id", id)
  fail(error)
}

/** Marks the answer that worked for the asker, or clears it with null. */
export async function acceptAnswer(questionId: string, answerId: string | null) {
  const client = db()
  if (!client) return
  const { error } = await client.from("questions").update({ accepted_answer_id: answerId }).eq("id", questionId)
  fail(error)
}

export async function renameMember(id: string, name: string) {
  const client = db()
  if (!client) return
  const { error } = await client.from("profiles").update({ name }).eq("id", id)
  fail(error)
  session = { ...session, member: session.member ? { ...session.member, name } : null }
  emit()
}

// The signed-in member, shared by every component that asks for it.

type Session = { ready: boolean; user: User | null; member: Member | null }

const SERVER: Session = { ready: false, user: null, member: null }
let session: Session = live ? SERVER : { ready: true, user: null, member: null }
const listeners = new Set<() => void>()
let started = false

function emit() {
  for (const l of listeners) l()
}

async function loadMember(user: User | null) {
  let member: Member | null = null
  if (user) {
    const { data } = await db()!.from("profiles").select("id, name").eq("id", user.id).maybeSingle()
    member = (data as Member | null) ?? { id: user.id, name: user.email?.split("@")[0] ?? "Member" }
  }
  session = { ready: true, user, member }
  emit()
}

function start() {
  const client = db()
  if (started || !client) return
  started = true
  client.auth.onAuthStateChange((event, s) => {
    if (event === "TOKEN_REFRESHED") return
    // Supabase asks that no other request runs inside this callback, so the profile loads just after it.
    setTimeout(() => loadMember(s?.user ?? null), 0)
  })
}

function subscribe(listener: () => void) {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession() {
  return useSyncExternalStore(
    subscribe,
    () => session,
    () => SERVER
  )
}

export async function signInWithEmail(email: string, next: string) {
  const client = db()
  if (!client) throw new Error("Sign-in is not switched on for this copy of Nexverse.")
  const redirect = new URL("/auth/callback", window.location.origin)
  redirect.searchParams.set("next", next)
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.toString() } })
  fail(error)
}

export async function signOut() {
  const client = db()
  if (!client) return
  const { error } = await client.auth.signOut()
  fail(error)
}
