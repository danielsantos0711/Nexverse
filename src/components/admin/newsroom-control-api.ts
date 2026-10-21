"use client"

import type { EngineState } from "@/lib/newsroom/engine/state"
import { db } from "@/lib/supabase"

/** Calls /api/newsroom/engine with the editor's own session. Errors carry the server's plain message. */
export async function engineCall<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const c = db()
  if (!c) throw new Error("This copy of the site is not connected to a database.")
  const { data } = await c.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sign in again to use the newsroom.")
  let res: Response
  try {
    res = await fetch("/api/newsroom/engine", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: "no-store" })
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.")
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  if (!res.ok) throw new Error(json?.error?.message ?? `The server answered ${res.status}.`)
  return json as T
}

export const loadEngineState = () => engineCall<EngineState>({ action: "state" })

export const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)
export const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)
