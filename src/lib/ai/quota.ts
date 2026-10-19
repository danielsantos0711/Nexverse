import type { Caller } from "./auth"
import { AiError } from "./errors"
import { quotaFor, type AiSettings } from "./settings"
import { rpc } from "./store"
import { supabaseEnv } from "./config"

/*
 * Daily AI request limit per member, set per role by an admin in /admin/ai. The count lives in the ai_usage
 * table, bumped by the ai_consume() function (security definer, keyed on auth.uid(), so a member can only
 * spend their own allowance, and clamped in the database to the stored quota for their role, so a bigger
 * number sent from outside changes nothing). If that migration is not applied yet we fall back to an
 * in-memory counter, which is per server instance and resets on every cold start: good enough to stop a
 * runaway loop, not a real quota.
 */

const memory = new Map<string, { day: string; count: number }>()

function today() {
  return new Date().toISOString().slice(0, 10)
}

function consumeInMemory(userId: string, limit: number): number | null {
  const day = today()
  const cur = memory.get(userId)
  const count = cur && cur.day === day ? cur.count : 0
  if (count >= limit) return null
  memory.set(userId, { day, count: count + 1 })
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.day !== day) memory.delete(k)
  }
  return limit - count - 1
}

/** Spend one request. Returns how many are left today, or throws a 403/429 AiError. */
export async function consume(caller: Caller, settings: AiSettings): Promise<number> {
  const limit = quotaFor(caller.role, caller.staff, settings)
  if (limit <= 0) throw new AiError(403, "forbidden", "AI assist is not available for your account type.")
  const env = supabaseEnv()
  if (env) {
    const r = await rpc("ai_consume", { daily_limit: limit }, { apikey: env.key, authorization: `Bearer ${caller.token}` })
    if (r.ok && typeof r.value === "number") {
      if (r.value === -1) throw limitError(limit)
      if (r.value === -2) throw new AiError(403, "forbidden", "AI assist is not available for your account right now.")
      return Math.max(0, limit - r.value)
    }
    // Missing function or any other failure: fall through to the per-instance counter.
  }
  const left = consumeInMemory(caller.id, limit)
  if (left === null) throw limitError(limit)
  return left
}

function limitError(limit: number) {
  return new AiError(429, "rate_limited", `You have used today's ${limit} AI requests. The count resets at midnight UTC.`)
}
