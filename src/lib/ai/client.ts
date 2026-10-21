"use client"

import { db } from "@/lib/supabase"
import { AiRequestError, type AiErrorCode } from "@/lib/ai-client"
import type { AiSettings } from "./settings"

/*
 * Browser side of the round 11 AI layer: streamed answers from /api/ai/stream, the structured helpers, the
 * "was this useful" vote and the admin calls. Every call carries the member's Supabase access token; no AI key
 * ever reaches the browser. (This file imports nothing from the server modules in this folder except types.)
 */

export type AiSource = { url: string; title: string; kind?: string }

export type StreamDone = { model: string; label?: string; sources?: AiSource[]; extra?: Record<string, unknown>; remaining?: number }

export type StreamHandlers = {
  onStart?: (remaining: number) => void
  onText: (delta: string) => void
  onReset?: () => void
}

async function token(): Promise<string> {
  const c = db()
  const t = c ? (await c.auth.getSession()).data.session?.access_token : null
  if (!t) throw new AiRequestError("unauthorized", "Sign in to use the AI helpers.", 401)
  return t
}

async function failure(res: Response): Promise<AiRequestError> {
  const json = (await res.json().catch(() => null)) as { error?: { code: AiErrorCode; message: string } } | null
  return new AiRequestError(json?.error?.code ?? "upstream", json?.error?.message ?? "The AI helper failed. Try again.", res.status)
}

async function postRaw(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const t = await token()
  try {
    return await fetch(`/api/ai/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new AiRequestError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
  }
}

/** Stream one AI moment from /api/ai/stream. Resolves with the final details; text arrives through `onText`. */
export async function streamAi(body: Record<string, unknown>, h: StreamHandlers, signal?: AbortSignal): Promise<StreamDone> {
  const res = await postRaw("stream", body, signal)
  if (!res.ok || !res.body) throw await failure(res)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let done: StreamDone | null = null
  for (;;) {
    const { value, done: end } = await reader.read()
    if (end) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const event = block.match(/^event: (.+)$/m)?.[1]
      const raw = block.match(/^data: (.*)$/m)?.[1]
      const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      if (event === "start") h.onStart?.(Number(data.remaining) || 0)
      else if (event === "token" && typeof data.t === "string") h.onText(data.t)
      else if (event === "reset") h.onReset?.()
      else if (event === "done") done = data as StreamDone
      else if (event === "error") throw new AiRequestError((data.code as AiErrorCode) ?? "upstream", String(data.message ?? "The AI helper failed. Try again."), 502)
    }
  }
  if (!done) throw new AiRequestError("upstream", "The answer was cut off. Try again.", 502)
  return done
}

/** A structured helper from /api/ai/helper (or any /api/ai JSON route). */
export async function askAi<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ data: T; model: string; remaining: number }> {
  const res = await postRaw(path, body, signal)
  const json = (await res.json().catch(() => null)) as { data?: T; model?: string; remaining?: number; error?: { code: AiErrorCode; message: string } } | null
  if (!res.ok || !json || json.error || json.data === undefined) {
    throw new AiRequestError(json?.error?.code ?? "upstream", json?.error?.message ?? "The AI helper failed. Try again.", res.status)
  }
  return { data: json.data, model: json.model ?? "", remaining: json.remaining ?? 0 }
}

/** "Was this useful?" One vote per member, feature and target; voting again changes it. */
export async function sendFeedback(input: { feature: string; target?: string; useful: boolean; model?: string; note?: string }): Promise<void> {
  const res = await postRaw("feedback", input)
  if (!res.ok) throw await failure(res)
}

// Admin

export type JobStat = {
  day: string
  provider: string
  model: string
  job: string
  ok: number
  fail: number
  ms_total: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  last_error: string | null
  last_at: string
}

export type CatalogEntry = { provider: string; model: string; label: string; context: number; json: "schema" | "object" | "prompt"; vision: boolean; reasoning: boolean; price?: { in: number; out: number } }

export type AdminStatus = {
  day: string
  settings: unknown
  providers: { id: string; configured: boolean; envSet: Record<string, boolean>; usedToday: number | null }[]
  usage: { provider: string; model: string; job: string; requests: number; failures: number }[] | null
  memberRequests: number | null
  server: { supabase: boolean; serviceKey: boolean; cacheSecret: boolean }
  stats: JobStat[] | null
  feedback: Record<string, { up: number; down: number }> | null
  catalog: { provider: string; models: CatalogEntry[]; fetched_at: string }[] | null
  premiumSpent: number
  firstChoice: Record<string, string | null>
}

export type TestResult = { ok: true; ms: number; reply: string; label: string; model: string; correct?: boolean; tokens: number; costUsd: number; premium: boolean }

export const aiAdmin2 = {
  status: async (signal?: AbortSignal): Promise<AdminStatus> => {
    const t = await token()
    let res: Response
    try {
      res = await fetch("/api/ai/admin", { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal })
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err
      throw new AiRequestError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
    }
    if (!res.ok) throw await failure(res)
    return (await res.json()) as AdminStatus
  },
  testModel: (model: string) => askAi<TestResult>("admin/test", { model }),
  testJob: (job: string) => askAi<TestResult>("admin/test", { job }),
  refreshCatalog: async (): Promise<{ providers: Record<string, CatalogEntry[]>; failed: string[]; saved: boolean; fetchedAt: string }> => {
    const res = await postRaw("admin/catalog", {})
    if (!res.ok) throw await failure(res)
    return res.json()
  },
}

export type { AiSettings }
