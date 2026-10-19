import { getPerson, getResource } from "@/lib/data"
import type { Who } from "@/lib/community"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * Community benchmarks: members submit evaluation results for a model on one of the curated benchmarks, with
 * the settings they used and a link to their logs, and other members say whether they could reproduce them.
 * With a database everything lives in Supabase (supabase/migrations/…_arena_benchmarks.sql); without one it
 * stays in this browser. The sample results below are invented, for invented models from lib/data.ts, to show
 * the pages at full density; they are labelled as samples wherever they appear.
 */

// ─── Plumbing (same shape as lib/community.ts) ──────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
  if (/logs_url_check/.test(message)) return "The logs link must start with https://."
  if (/duplicate key/.test(message)) return "You already reported on this result."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/schema cache|does not exist/.test(message)) return "benchmarks are still being switched on"
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

// ─── The curated benchmarks ─────────────────────────────────────────────────────────────────────────────────

export type BenchmarkArea = "Knowledge" | "Reasoning" | "Code" | "Instructions" | "Languages" | "Speech" | "Language modelling"

export type Benchmark = {
  slug: string
  name: string
  area: BenchmarkArea
  description: string
  /** What the score is, in a few words ("accuracy", "pass@1"). */
  metric: string
  /** "%" for percentages; "" for plain numbers such as perplexity. */
  unit: "%" | ""
  higherIsBetter: boolean
  /** Lowest and highest possible score, for validation and the chart's scale. */
  min: number
  max: number
  /** How far a reproduction may land from the reported score and still count (same as public.benchmark_tolerance). */
  tolerance: number
  /** The paper that introduced it, opened on Nexverse's paper page. */
  arxiv: string
  /** The usual number of examples in the prompt, as a hint in the form. */
  usualShots?: number
}

export const BENCHMARKS: Benchmark[] = [
  {
    slug: "mmlu",
    name: "MMLU",
    area: "Knowledge",
    description: "Multiple-choice questions across 57 subjects, from law and medicine to maths and history.",
    metric: "accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1,
    arxiv: "2009.03300",
    usualShots: 5,
  },
  {
    slug: "gsm8k",
    name: "GSM8K",
    area: "Reasoning",
    description: "Grade-school maths word problems that take two to eight steps to solve.",
    metric: "exact match",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1.5,
    arxiv: "2110.14168",
    usualShots: 8,
  },
  {
    slug: "humaneval",
    name: "HumanEval",
    area: "Code",
    description: "164 Python functions written from a docstring and checked against unit tests.",
    metric: "pass@1",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 2,
    arxiv: "2107.03374",
    usualShots: 0,
  },
  {
    slug: "mbpp",
    name: "MBPP",
    area: "Code",
    description: "About 1,000 short Python programming tasks for entry-level programmers, with tests.",
    metric: "pass@1",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 2,
    arxiv: "2108.07732",
    usualShots: 3,
  },
  {
    slug: "arc-challenge",
    name: "ARC-Challenge",
    area: "Reasoning",
    description: "Grade-school science questions that simple retrieval and word matching get wrong.",
    metric: "normalised accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1,
    arxiv: "1803.05457",
    usualShots: 25,
  },
  {
    slug: "hellaswag",
    name: "HellaSwag",
    area: "Reasoning",
    description: "Pick the most sensible ending for an everyday situation. Easy for people, hard for weak models.",
    metric: "normalised accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 0.5,
    arxiv: "1905.07830",
    usualShots: 10,
  },
  {
    slug: "truthfulqa",
    name: "TruthfulQA",
    area: "Knowledge",
    description: "Questions where popular misconceptions make a wrong answer tempting. Scored on the MC2 variant.",
    metric: "MC2 accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1,
    arxiv: "2109.07958",
    usualShots: 0,
  },
  {
    slug: "ifeval",
    name: "IFEval",
    area: "Instructions",
    description: "Prompts with checkable instructions (“answer in under 100 words”, “no commas”). Strict prompt-level score.",
    metric: "strict prompt accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1.5,
    arxiv: "2311.07911",
    usualShots: 0,
  },
  {
    slug: "belebele",
    name: "Belebele",
    area: "Languages",
    description: "Reading comprehension in 122 language variants. Say which language you ran in the notes.",
    metric: "accuracy",
    unit: "%",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 1,
    arxiv: "2308.16884",
    usualShots: 0,
  },
  {
    slug: "flores-200",
    name: "FLORES-200",
    area: "Languages",
    description: "Translation between 200 languages on the same sentences. Say which direction you ran in the notes.",
    metric: "chrF++",
    unit: "",
    higherIsBetter: true,
    min: 0,
    max: 100,
    tolerance: 0.5,
    arxiv: "2207.04672",
    usualShots: 0,
  },
  {
    slug: "fleurs-wer",
    name: "FLEURS (ASR)",
    area: "Speech",
    description: "Speech recognition on read sentences in 102 languages. Say which language in the notes.",
    metric: "word error rate",
    unit: "%",
    higherIsBetter: false,
    min: 0,
    max: 100,
    tolerance: 0.5,
    arxiv: "2205.12446",
  },
  {
    slug: "wikitext-ppl",
    name: "WikiText-2",
    area: "Language modelling",
    description: "How surprised a model is by Wikipedia articles it has not seen. A quick check that quantisation did not hurt.",
    metric: "perplexity",
    unit: "",
    higherIsBetter: false,
    min: 1,
    max: 10000,
    tolerance: 0.1,
    arxiv: "1609.07843",
  },
]

export const getBenchmark = (slug: string) => BENCHMARKS.find((b) => b.slug === slug)

/** "66.1%", "52.7", "6.41". */
export function formatScore(b: Pick<Benchmark, "unit" | "slug">, score: number) {
  const digits = b.slug === "wikitext-ppl" ? 2 : 1
  return `${score.toFixed(digits)}${b.unit}`
}

/** True when a beats b on this benchmark. */
export const better = (bench: Pick<Benchmark, "higherIsBetter">, a: number, b: number) => (bench.higherIsBetter ? a > b : a < b)

// ─── Results and reproductions ──────────────────────────────────────────────────────────────────────────────

export type ReproOutcome = "reproduced" | "failed"
export type Repro = {
  who: Who
  userId: string | null
  outcome: ReproOutcome
  measured: number | null
  note: string
  at: string
  /** Your own verdict kept in this browser. */
  mine?: boolean
}

export type BenchmarkResult = {
  id: string
  benchmark: string
  model: string
  modelSlug: string | null
  score: number
  shots: number | null
  quantisation: string
  hardware: string
  harness: string
  /** Always set for members' results; samples have none. */
  logsUrl: string | null
  notes: string
  author: Who
  authorId: string | null
  createdAt: string
  repros: Repro[]
  sample: boolean
  local: boolean
}

/** Verified: at least one member reproduced it, and more reproduced it than could not. */
export function reproSummary(r: Pick<BenchmarkResult, "repros">, myId?: string | null) {
  const reproduced = r.repros.filter((x) => x.outcome === "reproduced").length
  const failed = r.repros.length - reproduced
  const mine = r.repros.find((x) => x.mine || (myId && x.userId === myId))
  return { reproduced, failed, verified: reproduced >= 1 && reproduced > failed, disputed: failed > 0 && failed >= reproduced, mine: mine ?? null }
}

// ─── Sample results ─────────────────────────────────────────────────────────────────────────────────────────

type SampleRepro = [handle: string, outcome: ReproOutcome, measured: number | null, note?: string]
type SampleResult = Omit<BenchmarkResult, "author" | "authorId" | "repros" | "sample" | "local" | "logsUrl" | "model" | "notes"> & {
  by: string
  notes?: string
  checks?: SampleRepro[]
}

const LMEH = "lm-evaluation-harness 0.4.5"

const SAMPLE_RESULT_DATA: SampleResult[] = [
  // MMLU
  { id: "s-mmlu-orbit8b-bf16", benchmark: "mmlu", modelSlug: "orbit-8b", score: 66.1, shots: 5, quantisation: "bf16", hardware: "1× A100 80 GB", harness: LMEH, by: "sofia", createdAt: "2026-09-18T10:00:00Z", checks: [["noah", "reproduced", 65.8], ["mei", "reproduced", 66.3]] },
  { id: "s-mmlu-orbit8b-q4", benchmark: "mmlu", modelSlug: "orbit-8b", score: 65.2, shots: 5, quantisation: "Q4_K_M", hardware: "M3 Max 64 GB", harness: "llama.cpp b4100 + " + LMEH, by: "priya", createdAt: "2026-09-26T16:20:00Z", notes: "GGUF from the official repo. Most of the drop is in the STEM subjects.", checks: [["kai", "reproduced", 64.9]] },
  { id: "s-mmlu-kansai7b", benchmark: "mmlu", modelSlug: "kansai-7b", score: 58.7, shots: 5, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "mei", createdAt: "2026-10-02T09:30:00Z", checks: [["noah", "failed", 56.9, "Got 56.9 with the default chat template off. Might be the template."]] },
  { id: "s-mmlu-tagus3b", benchmark: "mmlu", modelSlug: "tagus-3b-pt", score: 52.3, shots: 5, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "ines", createdAt: "2026-10-06T14:00:00Z" },
  { id: "s-mmlu-hindicoder", benchmark: "mmlu", modelSlug: "hindi-coder-3b", score: 48.9, shots: 5, quantisation: "Q8_0", hardware: "Laptop, 8 GB RAM", harness: "llama.cpp b4100 + " + LMEH, by: "priya", createdAt: "2026-10-12T07:45:00Z" },
  { id: "s-mmlu-orbit1b", benchmark: "mmlu", modelSlug: "orbit-1b-mobile", score: 38.2, shots: 5, quantisation: "bf16", hardware: "1× T4 16 GB", harness: LMEH, by: "kai", createdAt: "2026-10-10T18:10:00Z", checks: [["sofia", "reproduced", 38.5]] },

  // GSM8K
  { id: "s-gsm8k-orbit8b", benchmark: "gsm8k", modelSlug: "orbit-8b", score: 71.4, shots: 8, quantisation: "bf16", hardware: "1× A100 80 GB", harness: LMEH, by: "noah", createdAt: "2026-09-20T12:00:00Z", notes: "Chain-of-thought prompts, greedy decoding, strict answer extraction.", checks: [["rafa", "reproduced", 70.6]] },
  { id: "s-gsm8k-hindicoder", benchmark: "gsm8k", modelSlug: "hindi-coder-3b", score: 51.2, shots: 8, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "priya", createdAt: "2026-10-12T08:30:00Z" },
  { id: "s-gsm8k-kansai7b", benchmark: "gsm8k", modelSlug: "kansai-7b", score: 49.6, shots: 8, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "mei", createdAt: "2026-10-02T10:10:00Z" },
  { id: "s-gsm8k-tagus3b", benchmark: "gsm8k", modelSlug: "tagus-3b-pt", score: 44.8, shots: 8, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "ines", createdAt: "2026-10-06T15:00:00Z", checks: [["rafa", "reproduced", 45.9]] },
  { id: "s-gsm8k-orbit1b", benchmark: "gsm8k", modelSlug: "orbit-1b-mobile", score: 27.9, shots: 8, quantisation: "4-bit (MLC)", hardware: "Pixel 8 (WebGPU)", harness: "Custom script, prompts from " + LMEH, by: "kai", createdAt: "2026-10-11T20:00:00Z", notes: "Ran on the phone itself. 1,319 problems took about four hours." },

  // HumanEval
  { id: "s-humaneval-orbit8b", benchmark: "humaneval", modelSlug: "orbit-8b", score: 54.9, shots: 0, quantisation: "bf16", hardware: "1× A100 80 GB", harness: "bigcode-evaluation-harness", by: "rafa", createdAt: "2026-09-24T11:00:00Z", checks: [["sofia", "reproduced", 53.7]] },
  { id: "s-humaneval-hindicoder", benchmark: "humaneval", modelSlug: "hindi-coder-3b", score: 46.3, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: "bigcode-evaluation-harness", by: "priya", createdAt: "2026-10-12T09:00:00Z", checks: [["kai", "reproduced", 45.7], ["noah", "reproduced", 47.0]] },
  { id: "s-humaneval-orbit1b", benchmark: "humaneval", modelSlug: "orbit-1b-mobile", score: 21.3, shots: 0, quantisation: "bf16", hardware: "1× T4 16 GB", harness: "bigcode-evaluation-harness", by: "kai", createdAt: "2026-10-10T19:00:00Z" },
  { id: "s-humaneval-tagus3b", benchmark: "humaneval", modelSlug: "tagus-3b-pt", score: 18.9, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: "bigcode-evaluation-harness", by: "ines", createdAt: "2026-10-07T09:00:00Z" },

  // IFEval
  { id: "s-ifeval-orbit8b", benchmark: "ifeval", modelSlug: "orbit-8b", score: 72.5, shots: 0, quantisation: "bf16", hardware: "1× A100 80 GB", harness: LMEH, by: "noah", createdAt: "2026-09-21T13:00:00Z", checks: [["mei", "reproduced", 71.8]] },
  { id: "s-ifeval-tagus3b", benchmark: "ifeval", modelSlug: "tagus-3b-pt", score: 58.3, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "ines", createdAt: "2026-10-06T16:00:00Z" },
  { id: "s-ifeval-orbit1b", benchmark: "ifeval", modelSlug: "orbit-1b-mobile", score: 51.0, shots: 0, quantisation: "bf16", hardware: "1× T4 16 GB", harness: LMEH, by: "kai", createdAt: "2026-10-10T21:00:00Z" },

  // Belebele
  { id: "s-belebele-orbit8b-por", benchmark: "belebele", modelSlug: "orbit-8b", score: 81.2, shots: 0, quantisation: "bf16", hardware: "1× A100 80 GB", harness: LMEH, by: "ines", createdAt: "2026-10-04T10:00:00Z", notes: "por_Latn (Portuguese)." },
  { id: "s-belebele-tagus3b-por", benchmark: "belebele", modelSlug: "tagus-3b-pt", score: 78.4, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "ines", createdAt: "2026-10-06T17:00:00Z", notes: "por_Latn (Portuguese). Within three points of an 8B model at 3B.", checks: [["jonas", "reproduced", 78.0]] },
  { id: "s-belebele-kansai7b-jpn", benchmark: "belebele", modelSlug: "kansai-7b", score: 74.0, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: LMEH, by: "mei", createdAt: "2026-10-03T08:00:00Z", notes: "jpn_Jpan (Japanese)." },

  // FLORES-200
  { id: "s-flores-darija-ary-eng", benchmark: "flores-200", modelSlug: "darija-mt", score: 52.7, shots: 0, quantisation: "fp16", hardware: "1× RTX 3090", harness: "sacrebleu 2.4 (chrF++)", by: "layla", createdAt: "2026-10-01T12:00:00Z", notes: "ary_Arab → eng_Latn, devtest.", checks: [["amara", "reproduced", 52.5]] },
  { id: "s-flores-orbit8b-ary-eng", benchmark: "flores-200", modelSlug: "orbit-8b", score: 41.3, shots: 0, quantisation: "bf16", hardware: "1× A100 80 GB", harness: "sacrebleu 2.4 (chrF++)", by: "layla", createdAt: "2026-10-01T13:00:00Z", notes: "ary_Arab → eng_Latn, devtest, same prompt as darija-mt." },
  { id: "s-flores-tagus3b-eng-por", benchmark: "flores-200", modelSlug: "tagus-3b-pt", score: 61.8, shots: 0, quantisation: "bf16", hardware: "1× RTX 4090", harness: "sacrebleu 2.4 (chrF++)", by: "ines", createdAt: "2026-10-08T10:00:00Z", notes: "eng_Latn → por_Latn, devtest." },

  // FLEURS (word error rate, lower is better)
  { id: "s-fleurs-yoruba-asr", benchmark: "fleurs-wer", modelSlug: "yoruba-asr-small", score: 17.2, shots: null, quantisation: "fp32", hardware: "1× RTX 3090", harness: "jiwer 3.0, tone marks kept", by: "tunde", createdAt: "2026-10-02T15:00:00Z", notes: "yo_ng test split. Tone marks are kept when scoring, which most reports strip.", checks: [["amara", "reproduced", 17.5], ["leo", "reproduced", 17.0]] },
  { id: "s-fleurs-yoruba-asr-int8", benchmark: "fleurs-wer", modelSlug: "yoruba-asr-small", score: 17.9, shots: null, quantisation: "int8 (CTranslate2)", hardware: "Laptop CPU, 4 cores", harness: "jiwer 3.0, tone marks kept", by: "priya", createdAt: "2026-10-09T09:00:00Z", notes: "yo_ng test split, on CPU in real time." },

  // WikiText-2 (perplexity, lower is better)
  { id: "s-wikitext-orbit8b-bf16", benchmark: "wikitext-ppl", modelSlug: "orbit-8b", score: 6.41, shots: null, quantisation: "bf16", hardware: "1× A100 80 GB", harness: "llama.cpp perplexity, ctx 2048", by: "sofia", createdAt: "2026-09-19T09:00:00Z" },
  { id: "s-wikitext-orbit8b-q4", benchmark: "wikitext-ppl", modelSlug: "orbit-8b", score: 6.73, shots: null, quantisation: "Q4_K_M", hardware: "M3 Max 64 GB", harness: "llama.cpp perplexity, ctx 2048", by: "priya", createdAt: "2026-09-26T17:00:00Z", checks: [["sofia", "reproduced", 6.71]] },
  { id: "s-wikitext-orbit1b-bf16", benchmark: "wikitext-ppl", modelSlug: "orbit-1b-mobile", score: 11.86, shots: null, quantisation: "bf16", hardware: "1× T4 16 GB", harness: "llama.cpp perplexity, ctx 2048", by: "kai", createdAt: "2026-10-10T22:00:00Z" },
  { id: "s-wikitext-orbit1b-q4", benchmark: "wikitext-ppl", modelSlug: "orbit-1b-mobile", score: 12.94, shots: null, quantisation: "Q4_0", hardware: "Pixel 8 (CPU)", harness: "llama.cpp perplexity, ctx 2048", by: "kai", createdAt: "2026-10-11T08:00:00Z", checks: [["priya", "failed", 13.4, "13.4 on the same phone with Q4_0. Maybe a different llama.cpp build?"]] },
]

const sampleWho = (handle: string): Who => ({ handle, name: getPerson(handle)?.name ?? handle })

export const SAMPLE_RESULTS: BenchmarkResult[] = SAMPLE_RESULT_DATA.map(({ by, checks = [], notes = "", ...r }) => ({
  ...r,
  model: getResource(r.modelSlug ?? "")?.name ?? r.modelSlug ?? "",
  notes,
  logsUrl: null,
  author: sampleWho(by),
  authorId: null,
  repros: checks.map(([h, outcome, measured, note = ""], i) => ({
    who: sampleWho(h),
    userId: null,
    outcome,
    measured,
    note,
    at: new Date(Date.parse(r.createdAt) + (i + 1) * 86400e3).toISOString(),
  })),
  sample: true,
  local: false,
}))

// ─── Local storage ──────────────────────────────────────────────────────────────────────────────────────────

// Results submitted in this browser, and your reproduction verdicts on any result (samples always stay here).
const RESULTS_KEY = "nexverse-bench-results"
const REPROS_KEY = "nexverse-bench-repros"

type LocalResult = Omit<BenchmarkResult, "author" | "authorId" | "repros" | "sample" | "local">
type LocalRepro = { outcome: ReproOutcome; measured: number | null; note: string; at: string }

const readLocalResults = () => readLocal<LocalResult[]>(RESULTS_KEY, [])
const readLocalRepros = () => readLocal<Record<string, LocalRepro>>(REPROS_KEY, {})

const you: Who = { name: "You" }

function withLocalRepro(r: BenchmarkResult, repros: Record<string, LocalRepro>): BenchmarkResult {
  const mine = repros[r.id]
  return mine ? { ...r, repros: [...r.repros, { who: you, userId: null, mine: true, ...mine }] } : r
}

const fromLocalResult = (r: LocalResult): BenchmarkResult => ({ ...r, author: you, authorId: null, repros: [], sample: false, local: true })

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

const RESULT_COLUMNS =
  "id, benchmark, model, model_slug, score, shots, quantisation, hardware, harness, logs_url, notes, created_at, author_id, author:profiles!benchmark_results_author_id_fkey(id, name), repros:benchmark_repros(user_id, outcome, measured, note, created_at, who:profiles!benchmark_repros_user_id_fkey(id, name))"

type ResultRow = {
  id: string
  benchmark: string
  model: string
  model_slug: string | null
  score: number | string
  shots: number | null
  quantisation: string
  hardware: string
  harness: string
  logs_url: string
  notes: string
  created_at: string
  author_id: string
  author: Member | null
  repros: { user_id: string; outcome: ReproOutcome; measured: number | string | null; note: string; created_at: string; who: Member | null }[]
}

const fromResultRow = (r: ResultRow): BenchmarkResult => ({
  id: r.id,
  benchmark: r.benchmark,
  model: r.model,
  modelSlug: r.model_slug,
  score: Number(r.score),
  shots: r.shots,
  quantisation: r.quantisation,
  hardware: r.hardware,
  harness: r.harness,
  logsUrl: r.logs_url,
  notes: r.notes,
  author: r.author ? { name: r.author.name, memberId: r.author.id } : { name: "A member" },
  authorId: r.author_id,
  createdAt: r.created_at,
  repros: fromReproRows(r.repros ?? []),
  sample: false,
  local: false,
})

const fromReproRows = (rows: ResultRow["repros"]): Repro[] =>
  rows.map((p) => ({
    who: p.who ? { name: p.who.name, memberId: p.who.id } : { name: "A member" },
    userId: p.user_id,
    outcome: p.outcome,
    measured: p.measured === null ? null : Number(p.measured),
    note: p.note,
    at: p.created_at,
  }))

/** Results for one benchmark, for one model (by hub slug), or all of them: members' first, then the samples. */
export async function listResults(filter: { benchmark?: string; modelSlug?: string } = {}): Promise<BenchmarkResult[]> {
  const repros = readLocalRepros()
  const keep = (r: { benchmark: string; modelSlug: string | null }) =>
    (!filter.benchmark || r.benchmark === filter.benchmark) && (!filter.modelSlug || r.modelSlug === filter.modelSlug)
  const samples = SAMPLE_RESULTS.filter(keep).map((r) => withLocalRepro(r, repros))
  const client = db()
  if (!client) return [...readLocalResults().filter(keep).map(fromLocalResult), ...samples]
  let q = client.from("benchmark_results").select(RESULT_COLUMNS)
  if (filter.benchmark) q = q.eq("benchmark", filter.benchmark)
  if (filter.modelSlug) q = q.eq("model_slug", filter.modelSlug)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(500)
  fail(error)
  return [...(data as unknown as ResultRow[]).map(fromResultRow), ...samples]
}

// ─── Submitting ─────────────────────────────────────────────────────────────────────────────────────────────

export type NewResult = {
  benchmark: string
  model: string
  modelSlug: string | null
  score: string
  shots: string
  quantisation: string
  hardware: string
  harness: string
  logsUrl: string
  notes: string
}

export type ResultErrors = Partial<Record<keyof NewResult | "form", string>>

export function parseScore(raw: string): number | null {
  const s = raw.trim().replace(",", ".").replace(/%$/, "")
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

export function isHttpsUrl(raw: string) {
  try {
    const u = new URL(raw.trim())
    return u.protocol === "https:" && Boolean(u.hostname) && u.hostname.includes(".")
  } catch {
    return false
  }
}

export function validateResult(r: NewResult): ResultErrors {
  const e: ResultErrors = {}
  const bench = getBenchmark(r.benchmark)
  if (!bench) e.benchmark = "Pick a benchmark from the list."
  if (!r.model.trim()) e.model = "Name the model you evaluated."
  else if (r.model.trim().length > 80) e.model = "Keep the model name under 80 characters."
  const score = parseScore(r.score)
  if (score === null) e.score = "Enter the score as a number, like 64.2."
  else if (bench && (score < bench.min || score > bench.max)) e.score = `${bench.name} scores run from ${bench.min} to ${bench.max.toLocaleString("en")}.`
  if (r.shots.trim() && !/^\d{1,2}$/.test(r.shots.trim())) e.shots = "Shots is a whole number from 0 to 64."
  else if (r.shots.trim() && Number(r.shots) > 64) e.shots = "Shots is a whole number from 0 to 64."
  if (r.quantisation.length > 40) e.quantisation = "Keep it under 40 characters."
  if (r.hardware.length > 80) e.hardware = "Keep it under 80 characters."
  if (r.harness.length > 80) e.harness = "Keep it under 80 characters."
  if (!r.logsUrl.trim()) e.logsUrl = "Link to your logs or outputs, so others can check them."
  else if (!isHttpsUrl(r.logsUrl) || r.logsUrl.trim().length > 500) e.logsUrl = "Use a full https:// link to the logs."
  if (r.notes.length > 1000) e.notes = "Keep notes under 1,000 characters."
  return e
}

export async function submitResult(input: NewResult): Promise<BenchmarkResult> {
  const errors = validateResult(input)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const row = {
    benchmark: input.benchmark,
    model: input.model.trim(),
    model_slug: input.modelSlug && /^[a-z0-9-]{1,80}$/.test(input.modelSlug) ? input.modelSlug : null,
    score: parseScore(input.score)!,
    shots: input.shots.trim() ? Number(input.shots) : null,
    quantisation: input.quantisation.trim(),
    hardware: input.hardware.trim(),
    harness: input.harness.trim(),
    logs_url: input.logsUrl.trim(),
    notes: input.notes.trim(),
  }
  const client = db()
  if (!client) {
    const local: LocalResult = {
      id: crypto.randomUUID(),
      benchmark: row.benchmark,
      model: row.model,
      modelSlug: row.model_slug,
      score: row.score,
      shots: row.shots,
      quantisation: row.quantisation,
      hardware: row.hardware,
      harness: row.harness,
      logsUrl: row.logs_url,
      notes: row.notes,
      createdAt: new Date().toISOString(),
    }
    writeLocal(RESULTS_KEY, [local, ...readLocalResults()])
    return fromLocalResult(local)
  }
  await requireMe()
  const { data, error } = await client.from("benchmark_results").insert(row).select(RESULT_COLUMNS).single()
  fail(error)
  return fromResultRow(data as unknown as ResultRow)
}

export async function deleteResult(r: BenchmarkResult) {
  if (r.local) {
    writeLocal(
      RESULTS_KEY,
      readLocalResults().filter((x) => x.id !== r.id)
    )
    return
  }
  const client = db()
  if (!client) return
  await requireMe()
  const { error } = await client.from("benchmark_results").delete().eq("id", r.id)
  fail(error)
}

// ─── Reproductions ──────────────────────────────────────────────────────────────────────────────────────────

/** Sample results take reproductions only in this browser, as a preview: there are no real logs to check. */
export const reproStaysLocal = (r: BenchmarkResult) => r.sample || r.local || !db()

export function validateRepro(r: BenchmarkResult, outcome: ReproOutcome, measuredRaw: string): string | null {
  const bench = getBenchmark(r.benchmark)
  const measured = measuredRaw.trim() ? parseScore(measuredRaw) : null
  if (measuredRaw.trim() && measured === null) return "Enter the score you measured as a number."
  if (outcome === "reproduced") {
    if (measured === null) return "Enter the score you measured."
    if (bench && Math.abs(measured - r.score) > bench.tolerance + 1e-9)
      return `${measured} is more than ±${bench.tolerance} away from ${r.score}. Mark it as could not reproduce instead.`
  }
  return null
}

/** Records (or changes) your verdict on a result; null takes it back. Returns the result's new reproductions. */
export async function setRepro(r: BenchmarkResult, verdict: { outcome: ReproOutcome; measured: string; note: string } | null): Promise<Repro[]> {
  if (verdict) {
    const problem = validateRepro(r, verdict.outcome, verdict.measured)
    if (problem) throw new Error(problem)
    if (verdict.note.length > 500) throw new Error("Keep the note under 500 characters.")
  }
  if (r.local) throw new Error("Someone else has to reproduce your result.")
  const measured = verdict?.measured.trim() ? parseScore(verdict.measured) : null
  if (reproStaysLocal(r)) {
    const all = readLocalRepros()
    if (verdict) all[r.id] = { outcome: verdict.outcome, measured, note: verdict.note.trim(), at: new Date().toISOString() }
    else delete all[r.id]
    writeLocal(REPROS_KEY, all)
    const others = r.repros.filter((x) => !x.mine)
    return verdict ? [...others, { who: you, userId: null, mine: true, ...all[r.id] }] : others
  }
  const client = db()!
  const uid = await requireMe()
  if (verdict) {
    // Members may update only the verdict columns, so an existing verdict is updated rather than upserted.
    const fields = { outcome: verdict.outcome, measured, note: verdict.note.trim() }
    const had = r.repros.some((x) => x.userId === uid)
    const { error } = had
      ? await client.from("benchmark_repros").update(fields).eq("result_id", r.id).eq("user_id", uid)
      : await client.from("benchmark_repros").insert({ result_id: r.id, ...fields })
    fail(error)
  } else {
    const { error } = await client.from("benchmark_repros").delete().eq("result_id", r.id).eq("user_id", uid)
    fail(error)
  }
  const { data, error } = await client
    .from("benchmark_repros")
    .select("user_id, outcome, measured, note, created_at, who:profiles!benchmark_repros_user_id_fkey(id, name)")
    .eq("result_id", r.id)
    .order("created_at")
  fail(error)
  return fromReproRows(data as unknown as ResultRow["repros"])
}
