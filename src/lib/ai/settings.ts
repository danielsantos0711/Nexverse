import { DEFAULT_CHAINS, DEFAULT_QUOTAS, JOBS, MODELS, modelById, PROVIDERS, type AiJob, type JsonMode, type ModelInfo, type ProviderId, type ReasoningKind, type Tier } from "./models"

/*
 * The admin's AI settings, stored in site_settings under the key "ai". Public like every site setting, so it
 * holds no secrets: only switches, model order, quotas, caps, the premium slot per job and models the admin
 * added from the live catalogue. Pure functions, shared by the router (server) and the admin page (client).
 */

export type AiSettings = {
  /** Master switch. Off hides every AI feature even when keys are set. */
  enabled: boolean
  /** Per-job model order. A job missing here uses DEFAULT_CHAINS; models left out are switched off. */
  chains: Partial<Record<AiJob, string[]>>
  /** Requests per member per day, by site role. 0 switches AI off for that role. */
  quotas: Record<string, number>
  /** Requests per provider per day across the whole site, kept below each free allowance. */
  caps: Record<ProviderId, number>
  /**
   * Premium slot: one paid model per job, tried first when its key is set and the month's spend is under the
   * budget. Empty by default, because Nexverse runs on free AI unless an admin decides otherwise.
   */
  premium: Partial<Record<AiJob, string>>
  /** US dollars the premium slot may spend per calendar month (UTC). 0 stops every premium call. */
  premiumBudgetUsd: number
  /** Models an admin added from the live catalogue (new free models appear there before this file knows them). */
  custom: ModelInfo[]
}

export const DEFAULT_CAPS = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.cap])) as Record<ProviderId, number>

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: true, chains: {}, quotas: { ...DEFAULT_QUOTAS }, caps: { ...DEFAULT_CAPS }, premium: {}, premiumBudgetUsd: 20, custom: [] }

const MAX_QUOTA = 5000
const MAX_CAP = 100_000
const MAX_CUSTOM = 40
const MODEL_ID = /^[A-Za-z0-9@._:/-]{1,120}$/

function int(v: unknown, fallback: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : fallback
}

function readCustom(v: unknown): ModelInfo | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const provider = PROVIDERS.find((p) => p.id === o.provider)?.id
  const model = typeof o.model === "string" ? o.model.trim() : ""
  if (!provider || !MODEL_ID.test(model)) return null
  const id = `${provider}:${model}`
  if (MODELS.some((x) => x.id === id)) return null
  const premium = provider === "anthropic" || provider === "openrouterpaid"
  const price = o.price && typeof o.price === "object" ? (o.price as Record<string, unknown>) : null
  const pin = Number(price?.in)
  const pout = Number(price?.out)
  // A paid model without a known price could spend without limit, so it is not accepted.
  if (premium && !(Number.isFinite(pin) && Number.isFinite(pout) && pin >= 0 && pout >= 0)) return null
  const json: JsonMode = o.json === "schema" || o.json === "object" ? o.json : "prompt"
  const reasoning = (["gemini3", "gemini25", "gpt-oss", "openrouter", "anthropic"] as ReasoningKind[]).find((r) => r === o.reasoning)
  const tier = ([1, 2, 3] as Tier[]).find((t) => t === o.tier) ?? 2
  return {
    id,
    provider,
    model,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 80) : model,
    context: int(o.context, 32_768, 10_000_000),
    notes: typeof o.notes === "string" ? o.notes.slice(0, 200) : "Added from the live catalogue.",
    json,
    playground: !premium && o.playground === true,
    tier,
    ...(reasoning ? { reasoning } : {}),
    ...(o.vision === true ? { vision: true } : {}),
    ...(premium ? { premium: true, price: { in: Math.min(pin, 1000), out: Math.min(pout, 1000) } } : {}),
  }
}

/** A model by id: the built-in catalogue first, then the admin's additions. */
export function resolveModel(id: string, s: Pick<AiSettings, "custom">): ModelInfo | undefined {
  return modelById(id) ?? s.custom.find((x) => x.id === id)
}

/** Every model the router knows on this site: built in plus added. */
export function allModels(s: Pick<AiSettings, "custom">): ModelInfo[] {
  return [...MODELS, ...s.custom]
}

/** Read whatever is stored (or nothing) into a complete, safe settings object. Unknown model ids are dropped. */
export function normalizeAiSettings(raw: unknown): AiSettings {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const custom: ModelInfo[] = []
  if (Array.isArray(v.custom)) {
    for (const c of v.custom) {
      const x = readCustom(c)
      if (x && !custom.some((y) => y.id === x.id)) custom.push(x)
      if (custom.length >= MAX_CUSTOM) break
    }
  }
  const known = (id: unknown): id is string => typeof id === "string" && Boolean(resolveModel(id, { custom }))

  const chains: AiSettings["chains"] = {}
  const rawChains = v.chains && typeof v.chains === "object" ? (v.chains as Record<string, unknown>) : {}
  for (const j of JOBS) {
    const list = rawChains[j.id]
    if (!Array.isArray(list)) continue
    // Premium models never sit in a free chain; they have their own slot.
    chains[j.id] = [...new Set(list.filter(known).filter((id) => !resolveModel(id, { custom })?.premium))].slice(0, 20)
  }
  const premium: AiSettings["premium"] = {}
  const rawPremium = v.premium && typeof v.premium === "object" ? (v.premium as Record<string, unknown>) : {}
  for (const j of JOBS) {
    const id = rawPremium[j.id]
    if (known(id) && resolveModel(id, { custom })?.premium) premium[j.id] = id
  }
  const quotas: Record<string, number> = { ...DEFAULT_QUOTAS }
  const rawQuotas = v.quotas && typeof v.quotas === "object" ? (v.quotas as Record<string, unknown>) : {}
  for (const [role, n] of Object.entries(rawQuotas)) {
    if (/^[a-z_]{2,30}$/.test(role)) quotas[role] = int(n, quotas[role] ?? DEFAULT_QUOTAS.member, MAX_QUOTA)
  }
  const caps = { ...DEFAULT_CAPS }
  const rawCaps = v.caps && typeof v.caps === "object" ? (v.caps as Record<string, unknown>) : {}
  for (const p of PROVIDERS) caps[p.id] = int(rawCaps[p.id], DEFAULT_CAPS[p.id], MAX_CAP)
  const budget = typeof v.premiumBudgetUsd === "number" && Number.isFinite(v.premiumBudgetUsd) ? Math.min(10_000, Math.max(0, Math.round(v.premiumBudgetUsd * 100) / 100)) : DEFAULT_AI_SETTINGS.premiumBudgetUsd
  return { enabled: v.enabled !== false, chains, quotas, caps, premium, premiumBudgetUsd: budget, custom }
}

/** The model order for a job: the admin's when set, else the default. */
export function chainFor(job: AiJob, s: AiSettings): string[] {
  return s.chains[job] ?? DEFAULT_CHAINS[job]
}

/** A member's daily allowance for their role. Staff roles we do not know use the moderator figure. */
export function quotaFor(role: string, staff: boolean, s: AiSettings): number {
  const q = s.quotas[role]
  if (typeof q === "number") return q
  return staff ? (s.quotas.moderator ?? DEFAULT_QUOTAS.moderator) : (s.quotas.member ?? DEFAULT_QUOTAS.member)
}
