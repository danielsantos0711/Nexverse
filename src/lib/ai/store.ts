import { AsyncLocalStorage } from "node:async_hooks"
import { createHmac } from "node:crypto"
import { cacheSecret, serviceKey, supabaseEnv } from "./config"
import type { AiJob, ProviderId } from "./models"
import { DEFAULT_AI_SETTINGS, normalizeAiSettings, type AiSettings } from "./settings"

/*
 * What the router keeps in the database: the admin's settings, the response cache and the per-provider daily
 * counters. Writes go through security definer functions (ai_provider_reserve, ai_cache_put, ...) called with
 * the signed-in member's own token, which aiRoute puts in an async context so askJson/askText find it without
 * every caller passing it along. Server jobs with no member (cron) use SUPABASE_SERVICE_ROLE_KEY when it is
 * set. With neither, or before the migration is applied, everything falls back to per-instance memory: good
 * enough to stop a runaway loop, not a site-wide guarantee.
 */

type DbAuth = { token: string }
const context = new AsyncLocalStorage<DbAuth>()

/** Run `fn` with a member's token available to the router's database calls. */
export function withCaller<T>(auth: DbAuth, fn: () => Promise<T>): Promise<T> {
  return context.run(auth, fn)
}

const TIMEOUT_MS = 4_000

function headers(): Record<string, string> | null {
  const env = supabaseEnv()
  if (!env) return null
  const token = context.getStore()?.token
  if (token) return { apikey: env.key, authorization: `Bearer ${token}` }
  const svc = serviceKey()
  return svc ? { apikey: svc, authorization: `Bearer ${svc}` } : null
}

type RpcResult = { ok: true; value: unknown } | { ok: false }

/** Call a database function. Any failure (missing function, network, refused) comes back as `{ ok: false }`. */
export async function rpc(name: string, args: Record<string, unknown>, auth?: Record<string, string> | null): Promise<RpcResult> {
  const env = supabaseEnv()
  const h = auth ?? headers()
  if (!env || !h) return { ok: false }
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false }
    return { ok: true, value: (await res.json().catch(() => null)) as unknown }
  } catch {
    return { ok: false }
  }
}

const utcDay = () => new Date().toISOString().slice(0, 10)

// Settings

let settingsMemo: { at: number; value: AiSettings } | null = null
const SETTINGS_TTL_MS = 30_000

/** The admin's AI settings (public data), cached for 30 seconds per server instance. */
export async function loadAiSettings(): Promise<AiSettings> {
  if (settingsMemo && Date.now() - settingsMemo.at < SETTINGS_TTL_MS) return settingsMemo.value
  const env = supabaseEnv()
  let value = DEFAULT_AI_SETTINGS
  if (env) {
    try {
      const res = await fetch(`${env.url}/rest/v1/site_settings?key=eq.ai&select=value`, {
        headers: { apikey: env.key, authorization: `Bearer ${env.key}`, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
      if (res.ok) {
        const rows = (await res.json()) as { value?: unknown }[]
        value = normalizeAiSettings(rows[0]?.value)
      }
    } catch {
      // No table yet or the database is unreachable: the defaults describe a working router.
    }
  }
  settingsMemo = { at: Date.now(), value }
  return value
}

/** Forget the cached settings, so the next request reads the admin's latest save. */
export function forgetAiSettings() {
  settingsMemo = null
}

// Provider counters

const memoryCounts = new Map<string, number>()

export type Reservation = "ok" | "capped" | "no_budget" | "off"

/**
 * Count one request against a provider's daily cap before calling it. The database decides with the cap from
 * the stored settings (so nobody can pass a bigger one); without the database, a per-instance count is used.
 */
export async function reserve(provider: ProviderId, model: string, job: AiJob, settings: AiSettings): Promise<Reservation> {
  const r = await rpc("ai_provider_reserve", { p_provider: provider, p_model: model.slice(0, 120), p_job: job })
  if (r.ok && typeof r.value === "number") {
    if (r.value === -1) return "capped"
    if (r.value === -2) return "no_budget"
    if (r.value === -3) return "off"
    return "ok"
  }
  const key = `${utcDay()}|${provider}`
  const used = memoryCounts.get(key) ?? 0
  if (used >= settings.caps[provider]) return "capped"
  memoryCounts.set(key, used + 1)
  if (memoryCounts.size > 200) for (const k of memoryCounts.keys()) if (!k.startsWith(utcDay())) memoryCounts.delete(k)
  return "ok"
}

/** Note a failed call, for the admin's usage table. Best effort. */
export async function noteFailure(provider: ProviderId, model: string, job: AiJob) {
  await rpc("ai_provider_fail", { p_provider: provider, p_model: model.slice(0, 120), p_job: job })
}

// Response cache

const memoryCache = new Map<string, { value: unknown; expires: number }>()
const MEMORY_CACHE_MAX = 300

/** A cache key nobody can compute without the server's secret. */
export function cacheKey(parts: unknown[]): string {
  return createHmac("sha256", cacheSecret()).update(JSON.stringify(parts)).digest("hex")
}

export type CachedAnswer = { text?: string; json?: unknown; model: string; provider: string }

function readCached(v: unknown): CachedAnswer | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const value = o.value as Record<string, unknown> | undefined
  if (!value || typeof value !== "object") return null
  return { text: typeof value.text === "string" ? value.text : undefined, json: value.json, model: String(o.model ?? ""), provider: String(o.provider ?? "") }
}

export async function cacheGet(key: string): Promise<CachedAnswer | null> {
  const r = await rpc("ai_cache_get", { k: key })
  if (r.ok) return readCached(r.value)
  const hit = memoryCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as CachedAnswer
  return null
}

export async function cachePut(key: string, job: AiJob, answer: CachedAnswer, ttlSeconds: number) {
  const value = answer.json !== undefined ? { json: answer.json } : { text: answer.text ?? "" }
  const r = await rpc("ai_cache_put", { k: key, p_job: job, p_value: value, p_model: answer.model, p_provider: answer.provider, ttl_seconds: ttlSeconds })
  if (r.ok) return
  if (memoryCache.size >= MEMORY_CACHE_MAX) memoryCache.delete(memoryCache.keys().next().value as string)
  memoryCache.set(key, { value: answer, expires: Date.now() + ttlSeconds * 1000 })
}

/** Test hook: clear the per-instance fallbacks. */
export function resetMemory() {
  memoryCounts.clear()
  memoryCache.clear()
  settingsMemo = null
}
