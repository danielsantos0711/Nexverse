import { credentials } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"
import { isObject, parseJsonLoose } from "./json"
import { CACHE_TTL, estimateCost, jobById, type AiJob, type Effort, type ModelInfo } from "./models"
import { callModel, ProviderFailure, schemaInstruction, type ChatTurn, type FailureKind, type JsonSchema, type ProviderAnswer, type Source } from "./providers"
import { chainFor, resolveModel, type AiSettings } from "./settings"
import { cacheGet, cacheKey, cachePut, loadAiSettings, loadCatalogIds, noteFailure, notePremiumSpend, premiumSpent, recordCall, reserve } from "./store"

/*
 * The one door to a language model. Every caller names the job it needs done; the router builds that job's
 * chain (the admin's premium model first when one is set, has a key and the month's budget is not spent, then
 * the free models in the admin's order, else DEFAULT_CHAINS), skips models the live catalogue no longer lists
 * and models that keep failing right now, and tries them in turn. A model that runs out of tokens gets one
 * retry with a bigger budget; JSON that does not parse gets one repair pass; anything else moves on to the
 * next model, so one provider being busy or capped never stops a job. Answers are cached per job (never for
 * the playground or drafts). Every call is recorded for /admin/ai (latency, success, tokens, cost). Every
 * failure reaches the caller as an AiError with member-friendly copy; upstream bodies and keys never leave
 * this module.
 */

export type { AiJob } from "./models"
export type { ChatTurn, JsonSchema, Source } from "./providers"

export type LlmOptions = {
  job: AiJob
  system: string
  /** The user turn. Untrusted content inside it must already be wrapped with `fence()`. */
  prompt: string
  /** Tokens for the answer itself. Thinking models get extra room on top automatically. */
  maxTokens: number
  /** Playground and admin tests: one model id ("provider:model"). Only that model is tried. */
  model?: string
  /** 0 to 1.5. Leave unset to use each model's recommended default. */
  temperature?: number
  /** Set false to skip the response cache for this call (always skipped for "regenerate"). */
  cache?: boolean
  /** Total time budget across fallbacks, in ms. Defaults by job: 120 s for research and writing, 60 s for long jobs, 35 s otherwise. */
  timeoutMs?: number

  // Round 11 additions. All optional; existing callers behave as before, only smarter.

  /** How hard the model thinks. Defaults to the job's setting (high for research, factcheck, editor). */
  effort?: Effort
  /** Reorder the chain: "best" tries the strongest models first, "fast" the quickest. Default: the chain's own order. */
  quality?: "best" | "balanced" | "fast"
  /** Earlier turns, for multi-step work (draft, critique, revise) or a conversation. */
  history?: ChatTurn[]
  /** https image links or data: URLs. Only models that read images are tried. */
  images?: string[]
  /** Let the model search the web live while answering (models with search go first). Sources come back in `sources`. */
  search?: boolean
  /** Streaming: called with each new piece of text as it arrives. */
  onText?: (delta: string) => void
  /** Streaming: called when a model failed mid-answer and the next one starts over, so the caller can clear what it showed. */
  onReset?: () => void
  /** Set false to never use the admin's premium (paid) slot for this call. Default: use it when configured. */
  premium?: boolean
  signal?: AbortSignal
}

export type LlmResult = {
  /** The provider's model id, e.g. "gemini-3.8-flash". */
  model: string
  provider: string
  /** The catalogue id, "provider:model". */
  modelId: string
  label: string
  ms: number
  cached: boolean
  tokensIn: number
  tokensOut: number
  /** What this answer cost in US dollars (0 on free models). */
  costUsd: number
  /** Paid model from the premium slot. */
  premium: boolean
  /** Web pages the model grounded its answer in, when `search` was on and the provider returned them. */
  sources: Source[]
  /** The answer reached the token limit (only kept for streamed text; otherwise it is retried). */
  truncated: boolean
}

export { listModels } from "./catalog"

type Attempt = { kind: FailureKind | "capped" | "budget" }

const SLOW_JOBS: AiJob[] = ["research", "factcheck", "editor"]
const LONG_JOBS: AiJob[] = ["news", "summary", "code", "explain", "draft", "vision"]

function finalError(attempts: Attempt[]): AiError {
  const kinds = new Set(attempts.map((a) => a.kind))
  const only = (...k: string[]) => [...kinds].every((x) => k.includes(x))
  if (attempts.length === 0) return new AiError(503, "not_configured", NOT_CONFIGURED)
  if (only("capped", "budget")) return new AiError(503, "rate_limited", "Today's free AI allowance for this site is used up. It resets at midnight UTC.")
  if (kinds.has("declined") && only("declined", "capped", "budget", "bad_output")) return new AiError(422, "declined", "The AI declined to help with this text.")
  if (only("rate", "capped", "budget")) return new AiError(503, "rate_limited", "The free AI services are busy right now. Try again in a minute.")
  if (only("timeout", "capped", "budget")) return new AiError(504, "timeout", "The AI took too long to answer. Try again.")
  if (kinds.has("too_large") && only("too_large", "bad_request", "capped", "budget")) return new AiError(413, "too_large", "That is too much text for the AI to read at once.")
  if (only("bad_output", "truncated", "capped", "budget")) return new AiError(502, "bad_output", "The AI sent back something unreadable. Try again.")
  if (only("auth", "capped", "budget")) return new AiError(503, "not_configured", "AI is set up with keys that do not work. An admin needs to check them.")
  return new AiError(503, "upstream", "The AI services are having trouble. Try again in a moment.")
}

// Health: a model that failed three times in a row in the last ten minutes goes to the back of every chain.

const health = new Map<string, { fails: number; at: number }>()
const sick = (id: string) => {
  const h = health.get(id)
  return Boolean(h && h.fails >= 3 && Date.now() - h.at < 600_000)
}
function noteHealth(id: string, ok: boolean, kind?: FailureKind) {
  if (ok) return void health.delete(id)
  // Our own request problems say nothing about the model's health.
  if (kind === "declined" || kind === "too_large") return
  const h = health.get(id)
  health.set(id, { fails: (h && Date.now() - h.at < 600_000 ? h.fails : 0) + 1, at: Date.now() })
}

/** The models to try for this call, best first. */
async function buildChain(o: LlmOptions, settings: AiSettings): Promise<{ chain: ModelInfo[]; premiumBlocked: boolean }> {
  if (o.model) {
    const m = resolveModel(o.model, settings)
    if (!m) throw new AiError(400, "bad_request", "That model is not available.")
    return { chain: [m], premiumBlocked: false }
  }
  let chain = chainFor(o.job, settings)
    .map((id) => resolveModel(id, settings))
    .filter((m): m is ModelInfo => Boolean(m && !m.premium))

  // Skip free models the live catalogue says are gone (OpenRouter's free list changes weekly).
  const catalog = await loadCatalogIds()
  // Only OpenRouter's free list is volatile enough for this; other providers retire models with notice.
  chain = chain.filter((m) => {
    const ids = m.provider === "openrouter" ? catalog.get(m.provider) : undefined
    return !ids || ids.has(m.model)
  })

  if (o.images?.length) chain = chain.filter((m) => m.vision)
  const rank = (m: ModelInfo) => (o.search && m.search ? 0 : 1) + (sick(m.id) ? 10 : 0)
  const tierRank = (m: ModelInfo) => (o.quality === "best" ? m.tier : o.quality === "fast" ? 4 - m.tier : 0)
  chain = chain
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m) - rank(b.m) || tierRank(a.m) - tierRank(b.m) || a.i - b.i)
    .map((x) => x.m)

  // The premium slot goes first when it is set, has a key, and the month's budget has room.
  let premiumBlocked = false
  const pid = o.premium === false ? undefined : settings.premium[o.job]
  const pm = pid ? resolveModel(pid, settings) : undefined
  if (pm?.premium && credentials(pm.provider) && (!o.images?.length || pm.vision)) {
    if (settings.premiumBudgetUsd > 0 && (await premiumSpent()) < settings.premiumBudgetUsd) chain = [pm, ...chain]
    else premiumBlocked = true
  }
  return { chain, premiumBlocked }
}

async function attempt(m: ModelInfo, o: LlmOptions, schema: JsonSchema | undefined, timeoutMs: number, effort: Effort, maxTokens: number): Promise<ProviderAnswer> {
  return callModel(m, credentials(m.provider)!, {
    system: o.system,
    prompt: o.prompt,
    history: o.history,
    images: o.images,
    maxTokens,
    temperature: o.temperature,
    schema,
    timeoutMs,
    effort,
    search: o.search,
    onText: o.onText,
    signal: o.signal,
  })
}

/** Ask a model to turn its own broken output into valid JSON. Cheap: low effort, small budget. */
async function repairJson(m: ModelInfo, broken: string, schema: JsonSchema, timeoutMs: number): Promise<{ json: unknown; answer: ProviderAnswer } | null> {
  try {
    const answer = await callModel(m, credentials(m.provider)!, {
      system: `You fix malformed JSON. Keep every value the input meant to give; do not add facts. ${schemaInstruction(schema)}`,
      prompt: `Turn this into one valid JSON object that matches the schema:\n\n${broken.slice(0, 20_000)}`,
      maxTokens: Math.min(8_000, Math.max(1_000, Math.ceil(broken.length / 2))),
      schema,
      timeoutMs,
      effort: "low",
    })
    const json = parseJsonLoose(answer.text)
    return isObject(json) ? { json, answer } : null
  } catch {
    return null
  }
}

async function run(o: LlmOptions, schema?: JsonSchema): Promise<LlmResult & { text: string; json?: unknown }> {
  const settings = await loadAiSettings()
  if (!settings.enabled) throw new AiError(503, "not_configured", "AI is switched off on this site right now.")
  const job = jobById(o.job)
  const effort: Effort = o.effort ?? job?.effort ?? "low"

  const { chain, premiumBlocked } = await buildChain(o, settings)
  const ready = chain.filter((m) => credentials(m.provider))
  if (!ready.length) {
    if (o.model) throw new AiError(400, "bad_request", "That model is not switched on here.")
    if (o.images?.length) throw new AiError(503, "not_configured", "No model that reads images is switched on for this site yet.")
    throw new AiError(503, "not_configured", NOT_CONFIGURED)
  }

  const started = Date.now()
  const ttl = o.cache === false || o.model ? 0 : CACHE_TTL[o.job]
  const key = ttl > 0 ? cacheKey(["v2", o.job, ready.map((m) => m.id), o.system, o.prompt, o.history ?? null, o.images ?? null, Boolean(o.search), effort, schema ?? null, o.maxTokens]) : ""
  if (key) {
    const hit = await cacheGet(key)
    if (hit && (schema ? hit.json !== undefined : typeof hit.text === "string")) {
      const m = resolveModel(`${hit.provider}:${hit.model}`, settings)
      if (!schema && hit.text) o.onText?.(hit.text)
      return {
        text: hit.text ?? "",
        json: hit.json,
        model: hit.model,
        provider: hit.provider,
        modelId: `${hit.provider}:${hit.model}`,
        label: m?.label ?? hit.model,
        ms: Date.now() - started,
        cached: true,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        premium: false,
        sources: hit.sources ?? [],
        truncated: false,
      }
    }
  }

  const slow = SLOW_JOBS.includes(o.job)
  const long = LONG_JOBS.includes(o.job)
  const budget = o.timeoutMs ?? (slow ? 120_000 : long ? 60_000 : 35_000)
  const perAttempt = slow ? 90_000 : long ? 45_000 : 20_000
  const deadline = started + budget
  const attempts: Attempt[] = premiumBlocked ? [{ kind: "budget" }] : []
  let emitted = false
  const onText = o.onText
  const tracked: LlmOptions = onText
    ? {
        ...o,
        onText: (d) => {
          emitted = true
          onText(d)
        },
      }
    : o

  for (const m of ready) {
    if (o.signal?.aborted) throw new AiError(499 as number, "timeout", "Stopped.")
    const left = deadline - Date.now()
    if (left < 2_000) {
      attempts.push({ kind: "timeout" })
      break
    }
    const r = await reserve(m.provider, m.model, o.job, settings)
    if (r === "off") throw new AiError(503, "not_configured", "AI is switched off on this site right now.")
    if (r === "no_budget") throw new AiError(429, "rate_limited", "You have used today's AI requests. The count resets at midnight UTC.")
    if (r === "capped") {
      attempts.push({ kind: "capped" })
      continue
    }
    if (emitted) {
      o.onReset?.()
      emitted = false
    }
    const t0 = Date.now()
    let tokens = o.maxTokens
    let tokensIn = 0
    let tokensOut = 0
    try {
      let answer = await attempt(m, tracked, schema, Math.min(perAttempt, left), effort, tokens)
      tokensIn += answer.tokensIn
      tokensOut += answer.tokensOut
      // Out of room before the end: one more go with twice the budget, unless the text was already shown.
      if (answer.truncated && !emitted && deadline - Date.now() > 5_000) {
        tokens = Math.min(32_000, tokens * 2)
        const again = await attempt(m, tracked, schema, Math.min(perAttempt, deadline - Date.now()), effort, tokens).catch(() => null)
        if (again) {
          tokensIn += again.tokensIn
          tokensOut += again.tokensOut
          answer = again
        }
      }
      if (answer.truncated && (schema || !emitted)) throw new ProviderFailure("truncated")

      let json: unknown
      if (schema) {
        json = parseJsonLoose(answer.text)
        if (!isObject(json) && deadline - Date.now() > 4_000) {
          const fixed = await repairJson(m, answer.text, schema, Math.min(20_000, deadline - Date.now()))
          if (fixed) {
            json = fixed.json
            tokensIn += fixed.answer.tokensIn
            tokensOut += fixed.answer.tokensOut
          }
        }
        if (!isObject(json)) throw new ProviderFailure("bad_output")
      }
      const costUsd = estimateCost(m, tokensIn, tokensOut)
      if (m.premium) notePremiumSpend(costUsd)
      noteHealth(m.id, true)
      const result = {
        text: answer.text,
        json,
        model: m.model,
        provider: m.provider,
        modelId: m.id,
        label: m.label,
        ms: Date.now() - t0,
        cached: false,
        tokensIn,
        tokensOut,
        costUsd,
        premium: Boolean(m.premium),
        sources: answer.sources,
        truncated: answer.truncated,
      }
      await Promise.all([
        recordCall({ provider: m.provider, model: m.model, job: o.job, ok: true, ms: result.ms, tokensIn, tokensOut, costUsd }),
        key && !answer.truncated ? cachePut(key, o.job, { text: schema ? undefined : answer.text, json, model: m.model, provider: m.provider, sources: answer.sources }, ttl) : null,
      ])
      return result
    } catch (err) {
      if (o.signal?.aborted) throw new AiError(499 as number, "timeout", "Stopped.")
      const kind: FailureKind = err instanceof ProviderFailure ? err.kind : "network"
      const status = err instanceof ProviderFailure ? err.status : 0
      // Never the upstream body or the key: the kind and status are enough to see what happened.
      console.warn(`[ai] ${o.job}: ${m.id} failed (${kind}${status ? ` ${status}` : ""}), trying the next model`)
      attempts.push({ kind })
      noteHealth(m.id, false, kind)
      const costUsd = estimateCost(m, tokensIn, tokensOut)
      if (m.premium) notePremiumSpend(costUsd)
      await Promise.all([
        noteFailure(m.provider, m.model, o.job),
        recordCall({ provider: m.provider, model: m.model, job: o.job, ok: false, ms: Date.now() - t0, tokensIn, tokensOut, costUsd, error: `${kind}${status ? ` ${status}` : ""}` }),
      ])
    }
  }
  throw finalError(attempts)
}

/** Ask for one JSON object that matches `schema`. Throws AiError on any failure. */
export async function askJson(o: LlmOptions & { schema: JsonSchema }): Promise<LlmResult & { json: unknown }> {
  const { text: _text, ...rest } = await run(o, o.schema)
  void _text
  return rest as LlmResult & { json: unknown }
}

/** Ask for plain text (Markdown). Pass `onText` to stream it. Throws AiError on any failure. */
export async function askText(o: LlmOptions): Promise<LlmResult & { text: string }> {
  const { json: _json, ...rest } = await run(o)
  void _json
  return rest
}

/** Which models a job would try right now, best first, without calling any. For admin views and tests. */
export async function previewChain(job: AiJob, extra: Partial<LlmOptions> = {}): Promise<{ id: string; label: string; ready: boolean; premium: boolean }[]> {
  const settings = await loadAiSettings()
  const { chain } = await buildChain({ job, system: "", prompt: "", maxTokens: 1, ...extra }, settings)
  return chain.map((m) => ({ id: m.id, label: m.label, ready: Boolean(credentials(m.provider)), premium: Boolean(m.premium) }))
}
