/*
 * Inference cost and speed.
 *
 *   cost per request = (input tokens × input price + output tokens × output price) / 1,000,000
 *                      with cached input billed at the cached price when one is given
 *   latency          = time to first token + output tokens / output speed
 *   concurrency      = requests per second × latency  (Little's law; peak = average × peak factor)
 */

export type PriceRow = {
  id: string
  name: string
  /** USD per million input tokens. */
  inPrice: number
  /** USD per million output tokens. */
  outPrice: number
  /** USD per million cached input tokens; 0 = no cache discount. */
  cachedPrice: number
  /** Output tokens per second for one request. */
  tps: number
  /** Seconds to first token. */
  ttft: number
  /** Where the price came from, when it was checked. */
  source?: { url: string; checked: string }
}

export type Workload = {
  inTokens: number
  outTokens: number
  /** Share of input tokens served from the prompt cache, 0..1. */
  cachedShare: number
  perDay: number
  days: number
  /** Peak hour traffic as a multiple of the daily average. */
  peak: number
}

export const DEFAULT_WORKLOAD: Workload = { inTokens: 1500, outTokens: 400, cachedShare: 0, perDay: 2000, days: 30, peak: 3 }

export type RowResult = { perReq: number; perDay: number; perMonth: number; latency: number; concurrency: number; peakConcurrency: number; monthlyTokens: number }

export function computeRow(r: PriceRow, w: Workload): RowResult {
  const cached = r.cachedPrice > 0 ? w.inTokens * clamp01(w.cachedShare) : 0
  const fresh = w.inTokens - cached
  const perReq = (fresh * r.inPrice + cached * r.cachedPrice + w.outTokens * r.outPrice) / 1e6
  const latency = Math.max(0, r.ttft) + (r.tps > 0 ? w.outTokens / r.tps : Infinity)
  const rps = w.perDay / 86400
  const concurrency = rps * latency
  return {
    perReq,
    perDay: perReq * w.perDay,
    perMonth: perReq * w.perDay * w.days,
    latency,
    concurrency,
    peakConcurrency: concurrency * Math.max(1, w.peak),
    monthlyTokens: (w.inTokens + w.outTokens) * w.perDay * w.days,
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n || 0))

/*
 * List prices read from the vendors' own pricing pages on the date given. They change often: every value is
 * editable, and the link goes to the page to check. Speeds are not published as list values, so they start
 * at a neutral value for the reader to set from their own measurements.
 */
const CHECKED = "2026-10-19"
const ANTHROPIC = "https://claude.com/pricing"
const GOOGLE = "https://ai.google.dev/gemini-api/docs/pricing"
const OPENAI = "https://developers.openai.com/api/docs/pricing"

export const PRICE_PRESETS: Omit<PriceRow, "id">[] = [
  { name: "Claude Opus 5.5", inPrice: 4, outPrice: 20, cachedPrice: 0, tps: 50, ttft: 1, source: { url: ANTHROPIC, checked: CHECKED } },
  { name: "Claude Sonnet 5.5", inPrice: 2, outPrice: 10, cachedPrice: 0, tps: 50, ttft: 1, source: { url: ANTHROPIC, checked: CHECKED } },
  { name: "Claude Haiku 5.5 (prompts up to 100K)", inPrice: 0.1, outPrice: 0.5, cachedPrice: 0, tps: 50, ttft: 1, source: { url: ANTHROPIC, checked: CHECKED } },
  { name: "GPT-6.1 Sol (up to 272K)", inPrice: 2, outPrice: 10, cachedPrice: 0, tps: 50, ttft: 1, source: { url: OPENAI, checked: CHECKED } },
  { name: "GPT-6 Luna (up to 272K)", inPrice: 0.1, outPrice: 0.5, cachedPrice: 0, tps: 50, ttft: 1, source: { url: OPENAI, checked: CHECKED } },
  { name: "Gemini 2.5 Pro (prompts up to 200K)", inPrice: 1.25, outPrice: 10, cachedPrice: 0, tps: 50, ttft: 1, source: { url: GOOGLE, checked: CHECKED } },
  { name: "Gemini 2.5 Flash", inPrice: 0.3, outPrice: 2.5, cachedPrice: 0, tps: 50, ttft: 1, source: { url: GOOGLE, checked: CHECKED } },
  { name: "Gemini 2.5 Flash-Lite", inPrice: 0.1, outPrice: 0.4, cachedPrice: 0, tps: 50, ttft: 1, source: { url: GOOGLE, checked: CHECKED } },
]

export function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "$∞"
  const digits = n === 0 ? 2 : n < 0.01 ? 5 : n < 1 ? 4 : n < 1000 ? 2 : 0
  return `$${n.toLocaleString("en", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })}`
}

export function fmtSeconds(s: number) {
  if (!Number.isFinite(s)) return "∞"
  if (s < 1) return `${Math.round(s * 1000)} ms`
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}
