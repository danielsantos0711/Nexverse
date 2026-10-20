import { LANGUAGES, type LanguageCode } from "@/lib/data"
import { isUuid, type Who } from "@/lib/community"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * The arena: a member posts a prompt with two outputs from two different models, everyone else votes blind,
 * and every vote feeds an Elo rating per model. With a database the duels, votes and ratings live in Supabase
 * (supabase/migrations/…_arena_benchmarks.sql): model names stay hidden until you vote, ballots are secret and
 * ratings are computed in SQL. Without one, duels and votes stay in this browser. There are no sample duels:
 * every duel, vote and rating shown comes from members.
 */

// ─── Plumbing (same shape as lib/community.ts) ──────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
  if (/duel_votes_pkey|duplicate key/.test(message)) return "You already voted on this duel."
  if (/duels_check1/.test(message)) return "The two outputs are identical. Paste two different answers."
  if (/duels_check/.test(message)) return "The two models need different names."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/schema cache|does not exist/.test(message)) return "the arena is still being switched on"
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

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export type DuelTask = "code" | "writing" | "reasoning" | "translation" | "other"

/**
 * The five tasks the database accepts (duels.task). Admins rename them, reorder them and choose which ones new
 * duels can use in /admin/lists; useDuelTasks() in lib/lists/hooks.ts returns that live version.
 */
export const DUEL_TASKS: Record<DuelTask, { label: string; blurb: string }> = {
  code: { label: "Code", blurb: "Write, fix or explain code." },
  writing: { label: "Writing", blurb: "Emails, stories, summaries, tone." },
  reasoning: { label: "Reasoning", blurb: "Maths, logic, multi-step problems." },
  translation: { label: "Translation", blurb: "From one language into another." },
  other: { label: "Other", blurb: "Facts, chat, anything else." },
}
export const isDuelTask = (s: string): s is DuelTask => s in DUEL_TASKS

/** A, B, a tie, or both bad. "a" and "b" always name the stored outputs, not the side the voter saw. */
export type Choice = "a" | "b" | "tie" | "bad"

export type DuelModel = { name: string; slug: string | null }

export type Duel = {
  id: string
  prompt: string
  outputA: string
  outputB: string
  task: DuelTask
  langs: LanguageCode[]
  author: Who
  /** The poster's member id, so the page knows you cannot vote on your own duel. */
  authorId: string | null
  createdAt: string
  /** Total votes, when known (the split stays hidden until you vote). */
  votes: number
  local: boolean
}

export type Tally = { a: number; b: number; tie: number; bad: number }

/** What you see once you voted (or if you posted the duel): the model names and the full tally. */
export type Reveal = { a: DuelModel; b: DuelModel; tally: Tally; total: number; mine: Choice | null }

const total = (t: Tally) => t.a + t.b + t.tie + t.bad

// ─── Local storage ──────────────────────────────────────────────────────────────────────────────────────────

// Without a database: duels posted in this browser, with their model names, and every vote cast in it.
const DUELS_KEY = "nexverse-duels"
const VOTES_KEY = "nexverse-duel-votes"

type LocalDuel = Omit<Duel, "author" | "authorId" | "votes" | "local"> & { a: DuelModel; b: DuelModel }
type LocalVote = { choice: Choice; at: string }

const readLocalDuels = () => readLocal<LocalDuel[]>(DUELS_KEY, [])
const readLocalVotes = () => readLocal<Record<string, LocalVote>>(VOTES_KEY, {})

const fromLocalDuel = ({ id, prompt, outputA, outputB, task, langs, createdAt }: LocalDuel): Duel => ({
  id,
  prompt,
  outputA,
  outputB,
  task,
  langs,
  createdAt,
  author: { name: "You" },
  authorId: null,
  votes: 0,
  local: true,
})

// ─── Reading duels ──────────────────────────────────────────────────────────────────────────────────────────

const DUEL_COLUMNS = "id, prompt, output_a, output_b, task, langs, created_at, author_id, author:profiles!duels_author_id_fkey(id, name)"
type DuelRow = {
  id: string
  prompt: string
  output_a: string
  output_b: string
  task: DuelTask
  langs: LanguageCode[]
  created_at: string
  author_id: string
  author: Member | null
}

const fromDuelRow = (r: DuelRow, votes = 0): Duel => ({
  id: r.id,
  prompt: r.prompt,
  outputA: r.output_a,
  outputB: r.output_b,
  task: r.task,
  langs: r.langs,
  author: r.author ? { name: r.author.name, memberId: r.author.id } : { name: "A member" },
  authorId: r.author_id,
  createdAt: r.created_at,
  votes,
  local: false,
})

async function totalsFor(ids: string[]): Promise<Record<string, number>> {
  const client = db()
  if (!client || !ids.length) return {}
  const { data, error } = await client.rpc("duel_totals", { ids })
  fail(error)
  return Object.fromEntries((data as { duel_id: string; votes: number }[]).map((r) => [r.duel_id, Number(r.votes)]))
}

/** Members' duels, newest first. */
export async function listDuels(): Promise<Duel[]> {
  const client = db()
  if (!client) return readLocalDuels().map(fromLocalDuel)
  const { data, error } = await client.from("duels").select(DUEL_COLUMNS).order("created_at", { ascending: false }).limit(300)
  fail(error)
  const rows = data as unknown as DuelRow[]
  const totals = await totalsFor(rows.map((r) => r.id))
  return rows.map((r) => fromDuelRow(r, totals[r.id] ?? 0))
}

export async function getDuel(id: string): Promise<Duel | null> {
  const client = db()
  if (!client) {
    const d = readLocalDuels().find((x) => x.id === id)
    return d ? fromLocalDuel(d) : null
  }
  if (!isUuid(id)) return null
  const { data, error } = await client.from("duels").select(DUEL_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  if (!data) return null
  const totals = await totalsFor([id])
  return fromDuelRow(data as unknown as DuelRow, totals[id] ?? 0)
}

/** Every duel you voted on, with your choice: from the database, or from this browser without one. */
export async function myVotes(): Promise<Record<string, Choice>> {
  const out: Record<string, Choice> = {}
  const client = db()
  if (!client) {
    for (const [id, v] of Object.entries(readLocalVotes())) out[id] = v.choice
    return out
  }
  if (!(await me())) return out
  const { data, error } = await client.from("duel_votes").select("duel_id, choice").order("created_at", { ascending: false }).limit(2000)
  fail(error)
  for (const r of data as { duel_id: string; choice: Choice }[]) out[r.duel_id] = r.choice
  return out
}

/** True when the duel is yours, so you cannot vote on it. */
export function isMine(d: Duel, memberId: string | null | undefined) {
  if (d.local) return true
  return Boolean(memberId && d.authorId === memberId)
}

/** The model names and tally for a duel you voted on or posted; null while the vote is still blind. */
export async function getReveal(d: Duel): Promise<Reveal | null> {
  if (d.local) {
    const l = readLocalDuels().find((x) => x.id === d.id)
    if (!l) return null
    return { a: l.a, b: l.b, tally: { a: 0, b: 0, tie: 0, bad: 0 }, total: 0, mine: null }
  }
  const client = db()
  if (!client) return null
  const { data, error } = await client.rpc("duel_reveal", { ids: [d.id] })
  fail(error)
  const r = (data as RevealRow[])[0]
  return r ? fromRevealRow(r) : null
}

type RevealRow = {
  duel_id: string
  model_a: string
  model_b: string
  model_a_slug: string | null
  model_b_slug: string | null
  a: number
  b: number
  tie: number
  bad: number
  mine: Choice | null
}

function fromRevealRow(r: RevealRow): Reveal {
  const tally = { a: Number(r.a), b: Number(r.b), tie: Number(r.tie), bad: Number(r.bad) }
  return { a: { name: r.model_a, slug: r.model_a_slug }, b: { name: r.model_b, slug: r.model_b_slug }, tally, total: total(tally), mine: r.mine }
}

// ─── Voting ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Casts your vote (final) and returns what it reveals. */
export async function vote(d: Duel, choice: Choice): Promise<Reveal> {
  if (d.local) throw new Error("You posted this duel, so you already know which model is which.")
  if (!db()) {
    const votes = readLocalVotes()
    if (votes[d.id]) throw new Error("You already voted on this duel.")
    votes[d.id] = { choice, at: new Date().toISOString() }
    writeLocal(VOTES_KEY, votes)
    const r = await getReveal(d)
    if (!r) throw new Error("This duel is not available any more.")
    return r
  }
  const client = db()!
  await requireMe()
  const { error } = await client.from("duel_votes").insert({ duel_id: d.id, choice })
  fail(error)
  const r = await getReveal(d)
  if (!r) throw new Error("Your vote is in, but the result could not be loaded. Reload the page.")
  return r
}

// ─── Posting ────────────────────────────────────────────────────────────────────────────────────────────────

export type NewDuel = {
  prompt: string
  outputA: string
  outputB: string
  modelA: DuelModel
  modelB: DuelModel
  task: DuelTask
  langs: LanguageCode[]
}

export const DUEL_LIMITS = { prompt: 4000, output: 12000, model: 80, langs: 4 } as const

export function validateDuel(d: NewDuel): Partial<Record<"prompt" | "outputA" | "outputB" | "modelA" | "modelB" | "langs", string>> {
  const e: Partial<Record<"prompt" | "outputA" | "outputB" | "modelA" | "modelB" | "langs", string>> = {}
  const prompt = d.prompt.trim()
  if (prompt.length < 10) e.prompt = "Paste the prompt both models answered (at least 10 characters)."
  else if (prompt.length > DUEL_LIMITS.prompt) e.prompt = `Keep the prompt under ${DUEL_LIMITS.prompt.toLocaleString("en")} characters.`
  if (!d.outputA.trim()) e.outputA = "Paste the first model’s answer."
  else if (d.outputA.length > DUEL_LIMITS.output) e.outputA = `Keep each answer under ${DUEL_LIMITS.output.toLocaleString("en")} characters.`
  if (!d.outputB.trim()) e.outputB = "Paste the second model’s answer."
  else if (d.outputB.length > DUEL_LIMITS.output) e.outputB = `Keep each answer under ${DUEL_LIMITS.output.toLocaleString("en")} characters.`
  else if (d.outputA.trim() && d.outputA === d.outputB) e.outputB = "The two answers are identical. Paste two different ones."
  const na = d.modelA.name.trim()
  const nb = d.modelB.name.trim()
  if (!na) e.modelA = "Name the first model."
  else if (na.length > DUEL_LIMITS.model) e.modelA = "Keep the model name under 80 characters."
  if (!nb) e.modelB = "Name the second model."
  else if (nb.length > DUEL_LIMITS.model) e.modelB = "Keep the model name under 80 characters."
  else if (na && na.toLowerCase() === nb.toLowerCase()) e.modelB = "A duel needs two different models."
  if (!d.langs.length) e.langs = "Pick at least one language."
  else if (d.langs.length > DUEL_LIMITS.langs) e.langs = `Pick up to ${DUEL_LIMITS.langs} languages.`
  // Any two-letter code the database accepts: admins can add languages beyond the built-in ones.
  else if (d.langs.some((l) => !(l in LANGUAGES) && !/^[a-z]{2}$/.test(l))) e.langs = "Pick languages from the list."
  return e
}

/** Posts a duel. Returns it (without model names: you see them because you posted it). */
export async function createDuel(input: NewDuel): Promise<Duel> {
  const errors = validateDuel(input)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const clean = (m: DuelModel): DuelModel => ({ name: m.name.trim(), slug: m.slug && /^[a-z0-9-]{1,80}$/.test(m.slug) ? m.slug : null })
  const a = clean(input.modelA)
  const b = clean(input.modelB)
  const client = db()
  if (!client) {
    const local: LocalDuel = {
      id: crypto.randomUUID(),
      prompt: input.prompt.trim(),
      outputA: input.outputA.trim(),
      outputB: input.outputB.trim(),
      task: input.task,
      langs: input.langs,
      createdAt: new Date().toISOString(),
      a,
      b,
    }
    writeLocal(DUELS_KEY, [local, ...readLocalDuels()])
    return fromLocalDuel(local)
  }
  await requireMe()
  const { data, error } = await client
    .from("duels")
    .insert({
      prompt: input.prompt.trim(),
      output_a: input.outputA.trim(),
      output_b: input.outputB.trim(),
      model_a: a.name,
      model_b: b.name,
      model_a_slug: a.slug,
      model_b_slug: b.slug,
      task: input.task,
      langs: input.langs,
    })
    .select(DUEL_COLUMNS)
    .single()
  fail(error)
  return fromDuelRow(data as unknown as DuelRow)
}

export async function deleteDuel(d: Duel) {
  if (d.local) {
    writeLocal(
      DUELS_KEY,
      readLocalDuels().filter((x) => x.id !== d.id)
    )
    return
  }
  const client = db()
  if (!client) return
  await requireMe()
  const { error } = await client.from("duels").delete().eq("id", d.id)
  fail(error)
}

// ─── Ratings ────────────────────────────────────────────────────────────────────────────────────────────────

export type Rating = {
  model: string
  slug: string | null
  rating: number
  votes: number
  wins: number
  losses: number
  ties: number
  /** Rating after each of the model's last games, oldest first. */
  history: number[]
  lastVote: string | null
}

export type RatingFilter = { task: DuelTask | null; lang: LanguageCode | null }

/** Where the ratings came from. Always members' votes now; "samples" stays in the type for older callers. */
export type RatingSource = "members" | "samples"

/** The same Elo as public.arena_ratings: start 1000, K 32, a tie or "both bad" is a draw, oldest vote first. */
export const ELO = { start: 1000, k: 32, history: 40 } as const

type Game = { a: DuelModel; b: DuelModel; choice: Choice; at: string }

export function computeRatings(games: Game[]): Rating[] {
  const sorted = [...games].sort((x, y) => x.at.localeCompare(y.at))
  const st = new Map<string, Rating & { r: number }>()
  const get = (m: DuelModel) => {
    const key = m.name.trim().toLowerCase()
    let s = st.get(key)
    if (!s) {
      s = { model: m.name.trim(), slug: m.slug, rating: ELO.start, r: ELO.start, votes: 0, wins: 0, losses: 0, ties: 0, history: [], lastVote: null }
      st.set(key, s)
    }
    s.slug ??= m.slug
    return s
  }
  for (const g of sorted) {
    const A = get(g.a)
    const B = get(g.b)
    const ea = 1 / (1 + 10 ** ((B.r - A.r) / 400))
    const sa = g.choice === "a" ? 1 : g.choice === "b" ? 0 : 0.5
    A.r += ELO.k * (sa - ea)
    B.r += ELO.k * (1 - sa - (1 - ea))
    for (const [s, won, lost] of [
      [A, g.choice === "a", g.choice === "b"],
      [B, g.choice === "b", g.choice === "a"],
    ] as const) {
      s.votes++
      if (won) s.wins++
      else if (lost) s.losses++
      else s.ties++
      s.history.push(Math.round(s.r))
      if (s.history.length > ELO.history) s.history.shift()
      s.lastVote = g.at
    }
  }
  return [...st.values()]
    .map(({ r, ...s }) => ({ ...s, rating: Math.round(r) }))
    .sort((x, y) => y.rating - x.rating || y.votes - x.votes)
}

type RatingRow = { model: string; slug: string | null; rating: number; votes: number; wins: number; losses: number; ties: number; history: number[] | null; last_vote: string | null }

/** Ratings for a task and/or language, from members' votes. Empty until someone votes. */
export async function getRatings(filter: RatingFilter): Promise<{ rows: Rating[]; source: RatingSource; anyMemberVotes: boolean }> {
  const client = db()
  if (!client) return { rows: [], source: "members", anyMemberVotes: false }
  const { data, error } = await client.rpc("arena_ratings", { task_filter: filter.task, lang_filter: filter.lang })
  fail(error)
  const rows = (data as RatingRow[]).map((r) => ({
    model: r.model,
    slug: r.slug,
    rating: r.rating,
    votes: r.votes,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    history: r.history ?? [],
    lastVote: r.last_vote,
  }))
  if (rows.length) return { rows, source: "members", anyMemberVotes: true }
  // Nothing for this filter. Tell the page whether members have voted at all, so it can say which is true.
  let anyMemberVotes = false
  if (filter.task || filter.lang) {
    const all = await client.rpc("arena_ratings", { task_filter: null, lang_filter: null })
    anyMemberVotes = Array.isArray(all.data) && all.data.length > 0
  }
  return { rows: [], source: "members", anyMemberVotes }
}

/** A model's rating across all duels, matched by the slug its duels linked to (or by name). */
export async function getModelRating(slug: string): Promise<{ rating: Rating | null; rank: number; of: number; source: RatingSource }> {
  const { rows, source } = await getRatings({ task: null, lang: null })
  const i = rows.findIndex((r) => r.slug === slug || r.model.toLowerCase() === slug.toLowerCase())
  return { rating: i >= 0 ? rows[i] : null, rank: i + 1, of: rows.length, source }
}

/** How sure a rating is, by how many votes it rests on. */
export function confidence(votes: number): { label: "Low" | "Medium" | "High"; level: 1 | 2 | 3 } {
  if (votes >= 60) return { label: "High", level: 3 }
  if (votes >= 20) return { label: "Medium", level: 2 }
  return { label: "Low", level: 1 }
}

// ─── Display order ──────────────────────────────────────────────────────────────────────────────────────────

/** True when the stored B output is shown on the left, as "A". Random per browser session and duel. */
export function flipped(duelId: string, salt: string) {
  let h = 2166136261
  for (const c of salt + duelId) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return ((h >>> 0) & 1) === 1
}

/** The stored choice for a button the voter pressed, given the order they saw. */
export function storedChoice(shown: "left" | "right" | "tie" | "bad", flip: boolean): Choice {
  if (shown === "tie" || shown === "bad") return shown
  return (shown === "left") !== flip ? "a" : "b"
}
