import { credentials } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"
import { isObject, parseJsonLoose } from "./json"
import { CACHE_TTL, modelById, type AiJob, type ModelInfo } from "./models"
import { callModel, ProviderFailure, type FailureKind, type JsonSchema } from "./providers"
import { chainFor } from "./settings"
import { cacheGet, cacheKey, cachePut, loadAiSettings, noteFailure, reserve } from "./store"

/*
 * The one door to a language model. Every caller names the job it needs done; the router picks the best free
 * model configured for that job (the admin's order in /admin/ai, else DEFAULT_CHAINS) and moves on to the
 * next one when a provider is missing, at its daily cap, rate limited, down, slow, or answers with something
 * unusable. Answers are cached per job (never for the playground). Every failure reaches the caller as an
 * AiError with member-friendly copy; upstream bodies and keys never leave this module.
 */

export type { AiJob } from "./models"
export type { JsonSchema } from "./providers"

export type LlmOptions = {
  job: AiJob
  system: string
  /** The user turn. Untrusted content inside it must already be wrapped with `fence()`. */
  prompt: string
  maxTokens: number
  /** Playground and admin tests: one model id from `listModels()` ("provider:model"). Only that model is tried. */
  model?: string
  /** 0 to 1.5. Leave unset to use each model's recommended default. */
  temperature?: number
  /** Set false to skip the response cache for this call. */
  cache?: boolean
  /** Total time budget across fallbacks, in ms. Defaults to 60 s for long jobs and 35 s for short ones. */
  timeoutMs?: number
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
}

const LONG_JOBS: AiJob[] = ["news", "summary", "code"]

export { listModels } from "./catalog"

type Attempt = { kind: FailureKind | "capped" }

function finalError(attempts: Attempt[]): AiError {
  const kinds = new Set(attempts.map((a) => a.kind))
  if (attempts.length === 0) return new AiError(503, "not_configured", NOT_CONFIGURED)
  if ([...kinds].every((k) => k === "capped")) return new AiError(503, "rate_limited", "Today's free AI allowance for this site is used up. It resets at midnight UTC.")
  if (kinds.has("declined") && [...kinds].every((k) => k === "declined" || k === "capped" || k === "bad_output")) {
    return new AiError(422, "declined", "The AI declined to help with this text.")
  }
  if ([...kinds].every((k) => k === "rate" || k === "capped")) return new AiError(503, "rate_limited", "The free AI services are busy right now. Try again in a minute.")
  if ([...kinds].every((k) => k === "timeout" || k === "capped")) return new AiError(504, "timeout", "The AI took too long to answer. Try again.")
  if (kinds.has("too_large") && [...kinds].every((k) => k === "too_large" || k === "bad_request" || k === "capped")) {
    return new AiError(413, "too_large", "That is too much text for the AI to read at once.")
  }
  if ([...kinds].every((k) => k === "bad_output" || k === "capped")) return new AiError(502, "bad_output", "The AI sent back something unreadable. Try again.")
  if ([...kinds].every((k) => k === "auth" || k === "capped")) {
    return new AiError(503, "not_configured", "AI is set up with keys that do not work. An admin needs to check them.")
  }
  return new AiError(503, "upstream", "The AI services are having trouble. Try again in a moment.")
}

async function run(o: LlmOptions, schema?: JsonSchema): Promise<LlmResult & { text: string; json?: unknown }> {
  const settings = await loadAiSettings()
  if (!settings.enabled) throw new AiError(503, "not_configured", "AI is switched off on this site right now.")

  let chain: ModelInfo[]
  if (o.model) {
    const m = modelById(o.model)
    if (!m) throw new AiError(400, "bad_request", "That model is not available.")
    chain = [m]
  } else {
    chain = chainFor(o.job, settings)
      .map(modelById)
      .filter((m): m is ModelInfo => Boolean(m))
  }
  const ready = chain.filter((m) => credentials(m.provider))
  if (!ready.length) {
    throw o.model ? new AiError(400, "bad_request", "That model is not switched on here.") : new AiError(503, "not_configured", NOT_CONFIGURED)
  }

  const started = Date.now()
  const ttl = o.cache === false || o.model ? 0 : CACHE_TTL[o.job]
  const key = ttl > 0 ? cacheKey(["v1", o.job, ready.map((m) => m.id), o.system, o.prompt, schema ?? null, o.maxTokens]) : ""
  if (key) {
    const hit = await cacheGet(key)
    if (hit && (schema ? hit.json !== undefined : typeof hit.text === "string")) {
      const m = modelById(`${hit.provider}:${hit.model}`)
      return {
        text: hit.text ?? "",
        json: hit.json,
        model: hit.model,
        provider: hit.provider,
        modelId: `${hit.provider}:${hit.model}`,
        label: m?.label ?? hit.model,
        ms: Date.now() - started,
        cached: true,
      }
    }
  }

  const budget = o.timeoutMs ?? (LONG_JOBS.includes(o.job) ? 60_000 : 35_000)
  const perAttempt = LONG_JOBS.includes(o.job) ? 45_000 : 20_000
  const deadline = started + budget
  const attempts: Attempt[] = []

  for (const m of ready) {
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
    const t0 = Date.now()
    try {
      const answer = await callModel(m, credentials(m.provider)!, {
        system: o.system,
        prompt: o.prompt,
        maxTokens: o.maxTokens,
        temperature: o.temperature,
        schema,
        timeoutMs: Math.min(perAttempt, left),
      })
      let json: unknown
      if (schema) {
        json = parseJsonLoose(answer.text)
        if (!isObject(json)) throw new ProviderFailure("bad_output")
      }
      const result = { text: answer.text, json, model: m.model, provider: m.provider, modelId: m.id, label: m.label, ms: Date.now() - t0, cached: false }
      if (key) await cachePut(key, o.job, { text: schema ? undefined : answer.text, json, model: m.model, provider: m.provider }, ttl)
      return result
    } catch (err) {
      const kind: FailureKind = err instanceof ProviderFailure ? err.kind : "network"
      const status = err instanceof ProviderFailure ? err.status : 0
      // Never the upstream body or the key: the kind and status are enough to see what happened.
      console.warn(`[ai] ${o.job}: ${m.id} failed (${kind}${status ? ` ${status}` : ""}), trying the next model`)
      attempts.push({ kind })
      await noteFailure(m.provider, m.model, o.job)
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

/** Ask for plain text. Throws AiError on any failure. */
export async function askText(o: LlmOptions): Promise<LlmResult & { text: string }> {
  const { json: _json, ...rest } = await run(o)
  void _json
  return rest
}
