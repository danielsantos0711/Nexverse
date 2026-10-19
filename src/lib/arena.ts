import { getPerson, getResource, LANGUAGES, resources, type LanguageCode } from "@/lib/data"
import { isUuid, PREVIEW_TODAY, type Who } from "@/lib/community"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * The arena: a member posts a prompt with two outputs from two different models, everyone else votes blind,
 * and every vote feeds an Elo rating per model. With a database the duels, votes and ratings live in Supabase
 * (supabase/migrations/…_arena_benchmarks.sql): model names stay hidden until you vote, ballots are secret and
 * ratings are computed in SQL. Without one, duels and votes stay in this browser.
 *
 * The sample duels below are community samples for the preview: the models are the invented ones from
 * lib/data.ts and the vote counts are made up to show the page at full density. Votes on a sample duel
 * always stay in this browser and never count toward members' ratings.
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

/** A small seeded generator, so sample timelines render the same everywhere. */
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export type DuelTask = "code" | "writing" | "reasoning" | "translation" | "other"

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
  sample: boolean
  local: boolean
}

export type Tally = { a: number; b: number; tie: number; bad: number }

/** What you see once you voted (or if you posted the duel): the model names and the full tally. */
export type Reveal = { a: DuelModel; b: DuelModel; tally: Tally; total: number; mine: Choice | null }

const total = (t: Tally) => t.a + t.b + t.tie + t.bad

// ─── Sample duels ───────────────────────────────────────────────────────────────────────────────────────────

type SampleDuel = Omit<Duel, "author" | "authorId" | "votes" | "sample" | "local"> & {
  by: string
  a: string
  b: string
  seed: Tally
}

const SAMPLE_DUEL_DATA: SampleDuel[] = [
  {
    id: "csv-dedupe-by-email",
    by: "sofia",
    task: "code",
    langs: ["en"],
    createdAt: "2026-09-22T09:14:00Z",
    a: "orbit-8b",
    b: "hindi-coder-3b",
    seed: { a: 41, b: 23, tie: 9, bad: 2 },
    prompt:
      "Write a Python function that removes duplicate rows from a CSV file by the email column, keeping the first occurrence. Emails should match case-insensitively and ignore surrounding spaces.",
    outputA: `\`\`\`python
import csv

def dedupe_by_email(src: str, dst: str) -> int:
    """Copy src to dst without repeated emails. Returns how many rows were dropped."""
    seen: set[str] = set()
    dropped = 0
    with open(src, newline="", encoding="utf-8") as fin, open(dst, "w", newline="", encoding="utf-8") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            key = (row.get("email") or "").strip().lower()
            if key in seen:
                dropped += 1
                continue
            seen.add(key)
            writer.writerow(row)
    return dropped
\`\`\`

It streams the file, so memory only grows with the number of distinct emails, not the file size. Rows with an empty email are treated as one value; skip the \`seen\` check for them if you want to keep all of those.`,
    outputB: `\`\`\`python
import pandas as pd

def dedupe(path, out):
    df = pd.read_csv(path)
    df["_key"] = df["email"].str.strip().str.lower()
    df = df.drop_duplicates(subset="_key", keep="first").drop(columns="_key")
    df.to_csv(out, index=False)
\`\`\`

\`drop_duplicates\` with \`keep="first"\` keeps the first row of each email.`,
  },
  {
    id: "remarcar-reuniao-pt-pt",
    by: "ines",
    task: "writing",
    langs: ["pt"],
    createdAt: "2026-09-25T15:40:00Z",
    a: "tagus-3b-pt",
    b: "orbit-8b",
    seed: { a: 52, b: 14, tie: 6, bad: 1 },
    prompt: "Escreve um email curto e educado a remarcar a reunião de quinta-feira para sexta-feira às 10h. Português de Portugal, tom profissional.",
    outputA: `Assunto: Reunião de quinta-feira – nova data

Bom dia, Marta,

Por motivos de agenda, não vou conseguir estar presente na reunião de quinta-feira. Seria possível passarmos para sexta-feira, às 10h, no mesmo local?

Peço desculpa pelo incómodo e fico a aguardar a sua confirmação.

Com os melhores cumprimentos,
Rui`,
    outputB: `Assunto: Remarcação da reunião

Olá Marta, tudo bem?

Estou escrevendo para avisar que não vou conseguir participar da reunião de quinta. Você poderia remarcar para sexta às 10h?

Desculpe pelo transtorno!

Abraços,
Rui`,
  },
  {
    id: "two-trains-same-track",
    by: "mei",
    task: "reasoning",
    langs: ["en"],
    createdAt: "2026-09-27T08:05:00Z",
    a: "orbit-1b-mobile",
    b: "orbit-8b",
    seed: { a: 6, b: 47, tie: 2, bad: 5 },
    prompt:
      "A train leaves a station at 9:00 travelling at 80 km/h. A second train leaves the same station at 10:00 on a parallel track in the same direction at 120 km/h. At what time does the second train catch up, and how far from the station?",
    outputA: `The first train has a one-hour head start, so it is 80 km ahead at 10:00.

The second train covers 120 km in one hour, which is more than 80 km, so it catches up at **11:00**, about 120 km from the station.`,
    outputB: `At 10:00 the first train is 80 km ahead (1 h × 80 km/h).

The second train closes the gap at 120 − 80 = 40 km/h, so it needs 80 ÷ 40 = 2 hours.

It catches up at **12:00**, 2 h × 120 km/h = **240 km** from the station. (Check: the first train has then run 3 h × 80 km/h = 240 km.)`,
  },
  {
    id: "darija-arabizi-shopping",
    by: "layla",
    task: "translation",
    langs: ["ar", "en"],
    createdAt: "2026-09-29T19:22:00Z",
    a: "darija-mt",
    b: "orbit-8b",
    seed: { a: 29, b: 8, tie: 3, bad: 4 },
    prompt: "Translate this Moroccan Darija (written in Arabizi) into English: \"Salam, wach nta mzyan? Bghit nchri chi khobz o l7lib mn l7anout 9bel ma ysed.\"",
    outputA: `"Hi, are you doing well? I want to buy some bread and milk from the corner shop before it closes."`,
    outputB: `"Hello, are you fine? I want to buy bread and something from Hanout before he leaves."

Note: Arabizi uses numbers for Arabic sounds (7 = ḥ, 9 = q), so some words may be uncertain.`,
  },
  {
    id: "kansai-hot-day-reply",
    by: "mei",
    task: "other",
    langs: ["ja"],
    createdAt: "2026-10-01T03:10:00Z",
    a: "orbit-8b",
    b: "kansai-7b",
    seed: { a: 7, b: 38, tie: 4, bad: 1 },
    prompt: "友達からのメッセージに関西弁で自然に返信してください：「今日めっちゃ暑いな、どないしよ？」",
    outputA: `本当に暑いですね。こまめに水分を取って、できるだけ涼しい場所で過ごしてください。熱中症には十分気をつけましょう。`,
    outputB: `ほんまやなあ、外出たら溶けてまうわ。駅前の喫茶店でかき氷でも食べに行かへん？クーラー効いてるし、ちょっと涼んでこ。`,
  },
  {
    id: "sql-top-customers-2025",
    by: "noah",
    task: "code",
    langs: ["en"],
    createdAt: "2026-10-03T11:48:00Z",
    a: "hindi-coder-3b",
    b: "orbit-8b",
    seed: { a: 18, b: 21, tie: 15, bad: 1 },
    prompt: "PostgreSQL: from orders(customer_id, amount, created_at), list the top 3 customers by total order value in 2025, with their totals.",
    outputA: `\`\`\`sql
select customer_id, sum(amount) as total
from orders
where extract(year from created_at) = 2025
group by customer_id
order by total desc
limit 3;
\`\`\``,
    outputB: `\`\`\`sql
select customer_id, sum(amount) as total
from orders
where created_at >= '2025-01-01' and created_at < '2026-01-01'
group by customer_id
order by total desc
limit 3;
\`\`\`

The date range (instead of \`extract(year …)\`) lets PostgreSQL use an index on \`created_at\`. If two customers tie for third place, add \`fetch first 3 rows with ties\` instead of \`limit 3\`.`,
  },
  {
    id: "overfitting-in-hindi",
    by: "priya",
    task: "writing",
    langs: ["hi"],
    createdAt: "2026-10-05T06:30:00Z",
    a: "orbit-8b",
    b: "hindi-coder-3b",
    seed: { a: 11, b: 26, tie: 7, bad: 0 },
    prompt: "Explain overfitting to a beginner, in Hindi, in three sentences.",
    outputA: `Overfitting का मतलब है कि model training data को याद कर लेता है। इसलिए test data पर उसकी accuracy कम हो जाती है। Dropout और early stopping से इसमें मदद मिलती है।`,
    outputB: `ओवरफिटिंग तब होती है जब मॉडल डेटा से सीखने के बजाय उसे रट लेता है। ऐसे में वह पुराने उदाहरणों पर बहुत अच्छा करता है, लेकिन नए डेटा पर गलतियाँ करता है। इसे रोकने के लिए ज़्यादा डेटा, रेगुलराइज़ेशन या अलग वैलिडेशन सेट का इस्तेमाल किया जाता है।`,
  },
  {
    id: "bat-and-ball",
    by: "rafa",
    task: "reasoning",
    langs: ["en"],
    createdAt: "2026-10-07T17:02:00Z",
    a: "tagus-3b-pt",
    b: "orbit-1b-mobile",
    seed: { a: 33, b: 5, tie: 1, bad: 2 },
    prompt: "A bat and a ball cost €1.10 together. The bat costs €1.00 more than the ball. How much does the ball cost?",
    outputA: `Let the ball cost x. Then the bat costs x + 1.00, and x + (x + 1.00) = 1.10, so 2x = 0.10 and **x = €0.05**.

The ball costs 5 cents and the bat €1.05, which is exactly €1.00 more.`,
    outputB: `The ball costs **€0.10**, because €1.10 − €1.00 = €0.10.`,
  },
  {
    id: "bus-ten-minutes-pt-pt",
    by: "ines",
    task: "translation",
    langs: ["en", "pt"],
    createdAt: "2026-10-09T13:15:00Z",
    a: "orbit-1b-mobile",
    b: "tagus-3b-pt",
    seed: { a: 4, b: 31, tie: 5, bad: 0 },
    prompt: "Translate into European Portuguese (Portugal): \"I'm on the bus, I'll be there in ten minutes. Can you order me a coffee?\"",
    outputA: `"Estou no ônibus, chego em dez minutos. Você pode pedir um café pra mim?"`,
    outputB: `"Estou no autocarro, chego daqui a dez minutos. Podes pedir-me um café?"`,
  },
  {
    id: "regex-iso-date",
    by: "kai",
    task: "code",
    langs: ["en"],
    createdAt: "2026-10-11T10:40:00Z",
    a: "orbit-8b",
    b: "orbit-1b-mobile",
    seed: { a: 27, b: 9, tie: 6, bad: 3 },
    prompt: "Give me a JavaScript regex that matches ISO dates (YYYY-MM-DD) with a month from 01 to 12 and a day from 01 to 31. Nothing else on the line.",
    outputA: `\`\`\`js
const isoDate = /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/

isoDate.test("2026-10-18") // true
isoDate.test("2026-13-01") // false
\`\`\`

A regex can't know that 2026-02-31 doesn't exist. If that matters, parse it and compare: \`new Date(s).toISOString().startsWith(s)\`.`,
    outputB: `\`\`\`js
/\\d{4}-\\d{2}-\\d{2}/
\`\`\`

This matches dates like 2026-10-18.`,
  },
  {
    id: "commit-message-rename",
    by: "jonas",
    task: "writing",
    langs: ["en"],
    createdAt: "2026-10-13T08:55:00Z",
    a: "hindi-coder-3b",
    b: "orbit-1b-mobile",
    seed: { a: 19, b: 12, tie: 10, bad: 2 },
    prompt: "Write a git commit message for this change: renamed getUser to fetchUser across 14 files, and fixed a missing null check in session.ts that crashed sign-out.",
    outputA: `Rename getUser to fetchUser; fix sign-out crash

- Rename getUser() to fetchUser() in 14 files; behaviour unchanged.
- session.ts: check for a null session before reading its user, which
  crashed sign-out when the session had already expired.`,
    outputB: `Updated code

Renamed function and fixed bug in session.ts.`,
  },
  {
    id: "world-cup-2030-winner",
    by: "rafa",
    task: "other",
    langs: ["en"],
    createdAt: "2026-10-15T20:30:00Z",
    a: "orbit-8b",
    b: "orbit-1b-mobile",
    seed: { a: 3, b: 1, tie: 2, bad: 37 },
    prompt: "Who won the 2030 FIFA World Cup final, and what was the score?",
    outputA: `Spain won the 2030 World Cup, beating Brazil 2–1 in the final in Madrid after extra time.`,
    outputB: `Argentina won the 2030 World Cup final against Portugal on penalties after a 1–1 draw.`,
  },
]

const modelOf = (slug: string): DuelModel => ({ name: getResource(slug)?.name ?? slug, slug })
const sampleAuthor = (handle: string): Who => ({ handle, name: getPerson(handle)?.name ?? handle })

export const SAMPLE_DUELS: Duel[] = SAMPLE_DUEL_DATA.map(({ by, seed, id, prompt, outputA, outputB, task, langs, createdAt }) => ({
  id,
  prompt,
  outputA,
  outputB,
  task,
  langs,
  createdAt,
  author: sampleAuthor(by),
  authorId: null,
  votes: total(seed),
  sample: true,
  local: false,
}))

const SAMPLE_BY_ID = new Map(SAMPLE_DUEL_DATA.map((d) => [d.id, d]))
export const getSampleDuel = (id: string) => SAMPLE_DUELS.find((d) => d.id === id)

// ─── Local storage ──────────────────────────────────────────────────────────────────────────────────────────

// Duels posted in this browser (no database), with their model names, and every vote cast in this browser
// (on sample duels always; on any duel without a database).
const DUELS_KEY = "nexverse-duels"
const VOTES_KEY = "nexverse-duel-votes"

type LocalDuel = Omit<Duel, "author" | "authorId" | "votes" | "sample" | "local"> & { a: DuelModel; b: DuelModel }
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
  sample: false,
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
  sample: false,
  local: false,
})

async function totalsFor(ids: string[]): Promise<Record<string, number>> {
  const client = db()
  if (!client || !ids.length) return {}
  const { data, error } = await client.rpc("duel_totals", { ids })
  fail(error)
  return Object.fromEntries((data as { duel_id: string; votes: number }[]).map((r) => [r.duel_id, Number(r.votes)]))
}

/** Members' duels (newest first) followed by the sample duels. Sample totals include your own local vote. */
export async function listDuels(): Promise<Duel[]> {
  const votes = readLocalVotes()
  const samples = SAMPLE_DUELS.map((d) => (votes[d.id] ? { ...d, votes: d.votes + 1 } : d))
  const client = db()
  if (!client) return [...readLocalDuels().map(fromLocalDuel), ...samples]
  const { data, error } = await client.from("duels").select(DUEL_COLUMNS).order("created_at", { ascending: false }).limit(300)
  fail(error)
  const rows = data as unknown as DuelRow[]
  const totals = await totalsFor(rows.map((r) => r.id))
  return [...rows.map((r) => fromDuelRow(r, totals[r.id] ?? 0)), ...samples]
}

export async function getDuel(id: string): Promise<Duel | null> {
  const sample = getSampleDuel(id)
  if (sample) return readLocalVotes()[id] ? { ...sample, votes: sample.votes + 1 } : sample
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

/** Every duel you voted on, with your choice: from the database for members' duels, from this browser for the rest. */
export async function myVotes(): Promise<Record<string, Choice>> {
  const out: Record<string, Choice> = {}
  for (const [id, v] of Object.entries(readLocalVotes())) out[id] = v.choice
  const client = db()
  if (!client || !(await me())) return out
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
  if (d.sample) {
    const s = SAMPLE_BY_ID.get(d.id)!
    const mine = readLocalVotes()[d.id]?.choice ?? null
    if (!mine) return null
    const tally = { ...s.seed, [mine]: s.seed[mine] + 1 }
    return { a: modelOf(s.a), b: modelOf(s.b), tally, total: total(tally), mine }
  }
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
  if (d.sample || !db()) {
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

/** Hub models people can link a duel to. */
export const HUB_MODELS: { slug: string; name: string }[] = resources
  .filter((r) => r.kind === "model")
  .map((r) => ({ slug: r.slug, name: r.name }))
  .sort((a, b) => a.name.localeCompare(b.name))

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
  else if (d.langs.some((l) => !(l in LANGUAGES))) e.langs = "Pick languages from the list."
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

/** Where the ratings came from: members' votes in the database, or the sample duels (plus your local votes). */
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

/** Every sample vote as a timed game (spread between the duel's date and "today"), plus your local sample votes. */
function sampleGames(filter: RatingFilter): Game[] {
  const local = readLocalVotes()
  const games: Game[] = []
  for (const d of SAMPLE_DUEL_DATA) {
    if (filter.task && d.task !== filter.task) continue
    if (filter.lang && !d.langs.includes(filter.lang)) continue
    const rand = seeded(d.id)
    const from = Date.parse(d.createdAt)
    const span = Math.max(3600e3, PREVIEW_TODAY - from)
    const a = modelOf(d.a)
    const b = modelOf(d.b)
    for (const choice of ["a", "b", "tie", "bad"] as const) {
      for (let i = 0; i < d.seed[choice]; i++) {
        // Most votes arrive in the first days after a duel is posted.
        const t = from + span * rand() ** 2.2
        games.push({ a, b, choice, at: new Date(t).toISOString() })
      }
    }
    const mine = local[d.id]
    if (mine) games.push({ a, b, choice: mine.choice, at: mine.at })
  }
  return games
}

export function sampleRatings(filter: RatingFilter): Rating[] {
  return computeRatings(sampleGames(filter))
}

type RatingRow = { model: string; slug: string | null; rating: number; votes: number; wins: number; losses: number; ties: number; history: number[] | null; last_vote: string | null }

/** Ratings for a task and/or language. Members' ratings when anyone has voted; the sample ratings otherwise. */
export async function getRatings(filter: RatingFilter): Promise<{ rows: Rating[]; source: RatingSource; anyMemberVotes: boolean }> {
  const client = db()
  if (!client) return { rows: sampleRatings(filter), source: "samples", anyMemberVotes: false }
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
  return { rows: anyMemberVotes ? [] : sampleRatings(filter), source: anyMemberVotes ? "members" : "samples", anyMemberVotes }
}

/** A model's rating across all duels, matched by hub slug (or by its hub name). */
export async function getModelRating(slug: string): Promise<{ rating: Rating | null; rank: number; of: number; source: RatingSource }> {
  const { rows, source } = await getRatings({ task: null, lang: null })
  const name = getResource(slug)?.name.toLowerCase()
  const i = rows.findIndex((r) => r.slug === slug || (name && r.model.toLowerCase() === name))
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
