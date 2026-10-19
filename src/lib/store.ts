import type { Provider, User, UserIdentity } from "@supabase/supabase-js"
import { useSyncExternalStore } from "react"
import { authErrorMessage } from "@/lib/auth-providers"
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

// ─── Signing in ─────────────────────────────────────────────────────────────────────────────────────────────

/** A sign-in failure: `message` is already a plain sentence for the form, `code` is Supabase's error code. */
export class AuthFailure extends Error {
  code: string | undefined
  constructor(error: unknown) {
    super(authErrorMessage(error))
    this.code = (error as { code?: string } | null)?.code
  }
}

function authClient() {
  const client = db()
  if (!client) throw new Error("Sign-in is not switched on for this copy of Nexverse.")
  return client
}

function authFail(error: unknown) {
  if (error) throw new AuthFailure(error)
}

/** Where an email link or a social sign-in comes back to: the callback page, which then follows `next`. */
function callbackUrl(next: string) {
  const redirect = new URL("/auth/callback", window.location.origin)
  redirect.searchParams.set("next", next)
  return redirect.toString()
}

/** Sends a sign-in link. With `createAccount` false (the admins closed joining), only existing members get one. */
export async function signInWithEmail(email: string, next: string, createAccount = true) {
  const { error } = await authClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: createAccount } })
  if (error && !createAccount && (error.code === "otp_disabled" || error.code === "signup_disabled" || /signups? not allowed|not found/i.test(error.message))) {
    throw new Error("Joining is closed for now, and there is no account with that address.")
  }
  authFail(error)
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password })
  authFail(error)
  return data.user
}

/**
 * Creates an account with a password. Returns "confirm" when Supabase wants the address confirmed first
 * (the usual case), "signed-in" when the account is ready at once.
 */
export async function signUpWithPassword(input: { email: string; password: string; name: string; next: string }): Promise<"confirm" | "signed-in"> {
  const { data, error } = await authClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: callbackUrl(input.next), data: { name: input.name } },
  })
  authFail(error)
  // With confirmation on, Supabase answers an address that already has an account with a user that has no
  // identities (so strangers cannot probe which emails exist). Say so plainly to the person who typed it.
  if (data.user && (data.user.identities ?? []).length === 0) throw new AuthFailure({ code: "user_already_exists" })
  return data.session ? "signed-in" : "confirm"
}

/** Sends the confirmation email for a new account again. */
export async function resendConfirmation(email: string, next: string) {
  const { error } = await authClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl(next) } })
  authFail(error)
}

/** Sends a link that opens /reset-password with a short-lived session for choosing a new password. */
export async function sendPasswordReset(email: string) {
  const { error } = await authClient().auth.resetPasswordForEmail(email, { redirectTo: new URL("/reset-password", window.location.origin).toString() })
  authFail(error)
}

/** Opens the provider's own sign-in page; it comes back to /auth/callback. */
export async function signInWithProvider(provider: Provider, next: string) {
  const { error } = await authClient().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(next) } })
  authFail(error)
}

/** Sets a new password. `nonce` is the code from the reauthentication email, when Supabase asked for one. */
export async function updatePassword(password: string, nonce?: string) {
  const { error } = await authClient().auth.updateUser(nonce ? { password, nonce } : { password })
  authFail(error)
}

/** Emails a one-time code that proves it is you, for a password change Supabase wants confirmed. */
export async function sendReauthentication() {
  const { error } = await authClient().auth.reauthenticate()
  authFail(error)
}

/** Starts an email change. Supabase emails a confirmation link (to both addresses when secure change is on). */
export async function updateEmail(email: string) {
  const { error } = await authClient().auth.updateUser({ email }, { emailRedirectTo: callbackUrl("/settings#security") })
  authFail(error)
}

/** The ways you can sign in: email and any linked social accounts. */
export async function listIdentities(): Promise<UserIdentity[]> {
  const { data, error } = await authClient().auth.getUserIdentities()
  authFail(error)
  return data?.identities ?? []
}

/** Links another sign-in to your account. Leaves the page for the provider and comes back to settings. */
export async function linkProvider(provider: Provider) {
  const { error } = await authClient().auth.linkIdentity({ provider, options: { redirectTo: callbackUrl("/settings#security") } })
  authFail(error)
}

export async function unlinkIdentity(identity: UserIdentity) {
  const { error } = await authClient().auth.unlinkIdentity(identity)
  authFail(error)
}

/** Signs out here ("local"), on every other device ("others") or everywhere ("global"). */
export async function signOut(scope: "local" | "others" | "global" = "local") {
  const client = db()
  if (!client) return
  const { error } = await client.auth.signOut({ scope })
  authFail(error)
}

// What members share: links to models, datasets, tools, repos and news, and the likes they give.

export type SubmissionKind = "model" | "dataset" | "tool" | "repo" | "news"

export type Submission = {
  id: string
  kind: SubmissionKind
  title: string
  url: string
  summary: string
  tags: string[]
  createdAt: string
  author: Member | null
  local: boolean
}

export type NewSubmission = Pick<Submission, "kind" | "title" | "url" | "summary" | "tags">

const SUBMISSIONS_KEY = "nexverse-submissions"
const LIKES_KEY = "nexverse-likes"
const SUBMISSION_COLUMNS = "id, kind, title, url, summary, tags, created_at, author:profiles(id, name)"

type SubmissionRow = Omit<Submission, "createdAt" | "local"> & { created_at: string }
type LocalSubmission = NewSubmission & { id: string; date: string }

const fromSubmissionRow = (r: SubmissionRow): Submission => ({ ...r, tags: r.tags ?? [], createdAt: r.created_at, local: false })
const fromLocalSubmission = (s: LocalSubmission): Submission => ({ ...s, createdAt: s.date, author: null, local: true })

export async function listSubmissions({ kind, author, limit = 30 }: { kind?: SubmissionKind; author?: string; limit?: number } = {}) {
  const client = db()
  if (!client) {
    if (author) return []
    return readLocal<LocalSubmission>(SUBMISSIONS_KEY)
      .filter((s) => !kind || s.kind === kind)
      .slice(0, limit)
      .map(fromLocalSubmission)
  }
  let query = client.from("submissions").select(SUBMISSION_COLUMNS).order("created_at", { ascending: false }).limit(limit)
  if (kind) query = query.eq("kind", kind)
  if (author) query = query.eq("author_id", author)
  const { data, error } = await query
  fail(error)
  return (data as unknown as SubmissionRow[]).map(fromSubmissionRow)
}

export async function createSubmission(input: NewSubmission): Promise<Submission> {
  const client = db()
  if (!client) {
    const s: LocalSubmission = { ...input, id: crypto.randomUUID(), date: new Date().toISOString() }
    writeLocal(SUBMISSIONS_KEY, [s, ...readLocal<LocalSubmission>(SUBMISSIONS_KEY)])
    return fromLocalSubmission(s)
  }
  const { data, error } = await client.from("submissions").insert(input).select(SUBMISSION_COLUMNS).single()
  fail(error)
  return fromSubmissionRow(data as unknown as SubmissionRow)
}

export async function deleteSubmission(id: string) {
  const client = db()
  if (!client) {
    writeLocal(SUBMISSIONS_KEY, readLocal<LocalSubmission>(SUBMISSIONS_KEY).filter((s) => s.id !== id))
    return
  }
  const { error } = await client.from("submissions").delete().eq("id", id)
  fail(error)
}

/** How many members liked a target ("model:orbit-8b", "thread:…", "news:…") and whether you did. */
export async function getLikes(target: string, userId?: string): Promise<{ count: number; mine: boolean }> {
  const client = db()
  if (!client) {
    const mine = readLocal<string>(LIKES_KEY).includes(target)
    return { count: mine ? 1 : 0, mine }
  }
  const [{ count, error }, mineRes] = await Promise.all([
    client.from("likes").select("target", { count: "exact", head: true }).eq("target", target),
    userId ? client.from("likes").select("target").eq("target", target).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  fail(error)
  return { count: count ?? 0, mine: Boolean(mineRes.data) }
}

export async function setLike(target: string, on: boolean) {
  const client = db()
  if (!client) {
    const all = readLocal<string>(LIKES_KEY).filter((t) => t !== target)
    writeLocal(LIKES_KEY, on ? [...all, target] : all)
    return
  }
  const { error } = on
    ? await client.from("likes").insert({ target })
    : await client.from("likes").delete().eq("target", target).eq("user_id", session.user?.id ?? "")
  fail(error)
}
