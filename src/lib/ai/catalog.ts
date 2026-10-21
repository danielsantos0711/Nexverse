import { credentials } from "./config"
import { JOBS, type AiJob, type JsonMode, type ModelInfo, type ProviderId } from "./models"
import { chainFor, resolveModel } from "./settings"
import { loadAiSettings } from "./store"

/*
 * What members may pick from, what the status route reports, and the live model catalogue the admin page
 * refreshes from each provider's public model list. A model is offered only when its provider has a key, the
 * admin has not switched it off, and AI is on.
 */

export type PublicModel = { id: string; label: string; provider: string; context: number; notes: string }

/** Models offered in the Lab playground, in the admin's order. Empty when AI is off or no key is set. */
export async function listModels(): Promise<PublicModel[]> {
  const s = await loadAiSettings()
  if (!s.enabled) return []
  return chainFor("playground", s)
    .map((id) => resolveModel(id, s))
    .filter((m): m is ModelInfo => Boolean(m && m.playground && !m.premium && credentials(m.provider)))
    .map((m) => ({ id: m.id, label: m.label, provider: m.provider, context: m.context, notes: m.notes }))
}

/** Whether a job has at least one model it can use right now (ignoring today's caps). */
export async function jobsReady(): Promise<{ enabled: boolean; jobs: Record<AiJob, boolean> }> {
  const s = await loadAiSettings()
  const jobs = {} as Record<AiJob, boolean>
  for (const { id: job } of JOBS) {
    const free = chainFor(job, s).some((id) => {
      const m = resolveModel(id, s)
      return Boolean(m && !m.premium && credentials(m.provider) && (job !== "playground" || m.playground))
    })
    const pid = s.premium[job]
    const pm = pid ? resolveModel(pid, s) : undefined
    jobs[job] = s.enabled && (free || Boolean(pm && credentials(pm.provider) && s.premiumBudgetUsd > 0))
  }
  return { enabled: s.enabled && Object.values(jobs).some(Boolean), jobs }
}

// Live catalogue

export type CatalogEntry = {
  provider: ProviderId
  model: string
  label: string
  context: number
  json: JsonMode
  vision: boolean
  reasoning: boolean
  /** Dollars per million tokens, when the catalogue publishes it. */
  price?: { in: number; out: number }
}

const T = 8_000

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(T), cache: "no-store" })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

type OpenRouterModel = {
  id: string
  name?: string
  context_length?: number
  supported_parameters?: string[]
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
  pricing?: { prompt?: string; completion?: string }
}

/** OpenRouter's public list (no key needed): free models for the free provider, paid ones for the premium slot. */
async function openRouter(): Promise<Partial<Record<ProviderId, CatalogEntry[]>>> {
  const data = await getJson<{ data?: OpenRouterModel[] }>("https://openrouter.ai/api/v1/models")
  if (!data?.data) return {}
  const free: CatalogEntry[] = []
  const paid: CatalogEntry[] = []
  for (const x of data.data) {
    if (!x.architecture?.output_modalities?.includes("text")) continue
    const params = x.supported_parameters ?? []
    const entry: CatalogEntry = {
      provider: x.id.endsWith(":free") ? "openrouter" : "openrouterpaid",
      model: x.id,
      label: (x.name ?? x.id).replace(/\s*\(free\)\s*$/i, "").slice(0, 80),
      context: x.context_length ?? 0,
      json: params.includes("structured_outputs") ? "schema" : params.includes("response_format") ? "object" : "prompt",
      vision: Boolean(x.architecture?.input_modalities?.includes("image")),
      reasoning: params.includes("reasoning"),
    }
    const pin = Number(x.pricing?.prompt) * 1e6
    const pout = Number(x.pricing?.completion) * 1e6
    if (entry.provider === "openrouter") free.push(entry)
    else if (Number.isFinite(pin) && Number.isFinite(pout) && pin >= 0 && pout >= 0 && !x.id.endsWith(":batch")) paid.push({ ...entry, price: { in: Math.round(pin * 1000) / 1000, out: Math.round(pout * 1000) / 1000 } })
  }
  return { openrouter: free, openrouterpaid: paid.slice(0, 400) }
}

async function openAiStyle(provider: ProviderId, url: string): Promise<CatalogEntry[] | null> {
  const c = credentials(provider)
  if (!c) return null
  const data = await getJson<{ data?: { id: string; context_window?: number; max_context_length?: number; active?: boolean; capabilities?: { vision?: boolean } }[] }>(url, { authorization: `Bearer ${c.key}` })
  if (!data?.data) return null
  return data.data
    .filter((x) => x.active !== false && !/whisper|tts|orpheus|guard|embed|moderation|ocr|transcri/i.test(x.id))
    .map((x) => ({ provider, model: x.id, label: x.id, context: x.context_window ?? x.max_context_length ?? 0, json: "object" as JsonMode, vision: Boolean(x.capabilities?.vision), reasoning: /gpt-oss|qwen|magistral|reason/i.test(x.id) }))
}

async function gemini(): Promise<CatalogEntry[] | null> {
  const c = credentials("gemini")
  if (!c) return null
  const data = await getJson<{ models?: { name: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[]; thinking?: boolean }[] }>(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
    { "x-goog-api-key": c.key }
  )
  if (!data?.models) return null
  return data.models
    .filter((x) => x.supportedGenerationMethods?.includes("generateContent") && !/tts|image|embedding|live|audio|robotics|transcribe/i.test(x.name))
    .map((x) => ({ provider: "gemini" as ProviderId, model: x.name.replace(/^models\//, ""), label: x.displayName ?? x.name, context: x.inputTokenLimit ?? 0, json: "schema" as JsonMode, vision: true, reasoning: Boolean(x.thinking) }))
}

async function anthropicModels(): Promise<CatalogEntry[] | null> {
  const c = credentials("anthropic")
  if (!c) return null
  const data = await getJson<{ data?: { id: string; display_name?: string; max_input_tokens?: number }[] }>("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": c.key, "anthropic-version": "2023-06-01" })
  if (!data?.data) return null
  return data.data.map((x) => ({ provider: "anthropic" as ProviderId, model: x.id, label: x.display_name ?? x.id, context: x.max_input_tokens ?? 0, json: "schema" as JsonMode, vision: true, reasoning: true }))
}

/**
 * Fetch every provider's current model list. Providers without a key are skipped, except OpenRouter, whose
 * catalogue is public. Returns what was found per provider and which ones could not be read.
 */
export async function fetchLiveCatalog(): Promise<{ providers: Partial<Record<ProviderId, CatalogEntry[]>>; failed: ProviderId[] }> {
  const [or, groq, cerebras, mistral, gem, anth] = await Promise.all([
    openRouter(),
    openAiStyle("groq", "https://api.groq.com/openai/v1/models"),
    openAiStyle("cerebras", "https://api.cerebras.ai/v1/models"),
    openAiStyle("mistral", "https://api.mistral.ai/v1/models"),
    gemini(),
    anthropicModels(),
  ])
  const providers: Partial<Record<ProviderId, CatalogEntry[]>> = { ...or }
  const failed: ProviderId[] = []
  if (!or.openrouter) failed.push("openrouter")
  const add = (id: ProviderId, list: CatalogEntry[] | null) => {
    if (list) providers[id] = list
    else if (credentials(id)) failed.push(id)
  }
  add("groq", groq)
  add("cerebras", cerebras)
  add("mistral", mistral)
  add("gemini", gem)
  add("anthropic", anth)
  return { providers, failed }
}
