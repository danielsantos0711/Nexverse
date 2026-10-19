import type { Caller } from "./auth"
import { dailyLimit, supabaseEnv } from "./config"
import { AiError } from "./errors"

/*
 * Daily AI request limit per member. The count lives in the ai_usage table, bumped by the ai_consume()
 * function (security definer, keyed on auth.uid(), so a member can only spend their own allowance). If that
 * migration is not applied yet we fall back to an in-memory counter, which is per server instance and resets
 * on every cold start: good enough to stop a runaway loop, not a real quota.
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

/** Spend one request. Returns how many are left today, or throws a 429 AiError. */
export async function consume(caller: Caller): Promise<number> {
  const limit = dailyLimit(caller.staff)
  const env = supabaseEnv()
  if (env) {
    try {
      const res = await fetch(`${env.url}/rest/v1/rpc/ai_consume`, {
        method: "POST",
        headers: { apikey: env.key, authorization: `Bearer ${caller.token}`, "content-type": "application/json" },
        body: JSON.stringify({ daily_limit: limit }),
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      })
      if (res.ok) {
        const used = (await res.json()) as unknown
        if (typeof used === "number") {
          if (used < 0) throw limitError(limit)
          return Math.max(0, limit - used)
        }
      }
      // Missing function (404) or any other failure: fall through to the per-instance counter.
    } catch (err) {
      if (err instanceof AiError) throw err
    }
  }
  const left = consumeInMemory(caller.id, limit)
  if (left === null) throw limitError(limit)
  return left
}

function limitError(limit: number) {
  return new AiError(429, "rate_limited", `You have used today's ${limit} AI requests. The count resets at midnight UTC.`)
}
