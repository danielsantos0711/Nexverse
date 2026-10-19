import { DEFAULT_CHAINS, DEFAULT_QUOTAS, JOBS, modelById, PROVIDERS, type AiJob, type ProviderId } from "./models"

/*
 * The admin's AI settings, stored in site_settings under the key "ai". Public like every site setting, so it
 * holds no secrets: only switches, model order, quotas and caps. Pure functions, shared by the router (server)
 * and the admin page (client).
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
}

export const DEFAULT_CAPS = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.cap])) as Record<ProviderId, number>

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: true, chains: {}, quotas: { ...DEFAULT_QUOTAS }, caps: { ...DEFAULT_CAPS } }

const MAX_QUOTA = 5000
const MAX_CAP = 100_000

function int(v: unknown, fallback: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : fallback
}

/** Read whatever is stored (or nothing) into a complete, safe settings object. Unknown model ids are dropped. */
export function normalizeAiSettings(raw: unknown): AiSettings {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const chains: AiSettings["chains"] = {}
  const rawChains = v.chains && typeof v.chains === "object" ? (v.chains as Record<string, unknown>) : {}
  for (const j of JOBS) {
    const list = rawChains[j.id]
    if (!Array.isArray(list)) continue
    chains[j.id] = [...new Set(list.filter((x): x is string => typeof x === "string" && Boolean(modelById(x))))].slice(0, 20)
  }
  const quotas: Record<string, number> = { ...DEFAULT_QUOTAS }
  const rawQuotas = v.quotas && typeof v.quotas === "object" ? (v.quotas as Record<string, unknown>) : {}
  for (const [role, n] of Object.entries(rawQuotas)) {
    if (/^[a-z_]{2,30}$/.test(role)) quotas[role] = int(n, quotas[role] ?? DEFAULT_QUOTAS.member, MAX_QUOTA)
  }
  const caps = { ...DEFAULT_CAPS }
  const rawCaps = v.caps && typeof v.caps === "object" ? (v.caps as Record<string, unknown>) : {}
  for (const p of PROVIDERS) caps[p.id] = int(rawCaps[p.id], DEFAULT_CAPS[p.id], MAX_CAP)
  return { enabled: v.enabled !== false, chains, quotas, caps }
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
