"use client"

import { useEffect, useSyncExternalStore } from "react"
import type { LanguageCode } from "@/lib/data"
import { db, live } from "@/lib/supabase"

/*
 * Browser side of AI assist. Every call goes to our own /api/ai routes with the member's Supabase access
 * token; the AI key never leaves the server. `useAiStatus()` tells components whether to render at all, so
 * members never see a button that cannot work.
 */

// Status

export type AiJob = "news" | "summary" | "moderation" | "rewrite" | "translate" | "code" | "playground"
export type AiStatus = { enabled: boolean; ready: boolean; jobs: Partial<Record<AiJob, boolean>> }

const OFF: AiStatus = { enabled: false, ready: false, jobs: {} }
let status: AiStatus = OFF
let loading = false
const listeners = new Set<() => void>()

async function loadStatus() {
  if (loading || status.ready) return
  loading = true
  try {
    if (!live) throw new Error("no accounts")
    const res = await fetch("/api/ai/status", { cache: "no-store" })
    const json = (await res.json()) as { enabled?: unknown; jobs?: unknown }
    const jobs = json.jobs && typeof json.jobs === "object" ? (json.jobs as Partial<Record<AiJob, boolean>>) : {}
    status = { enabled: json.enabled === true, ready: true, jobs }
  } catch {
    status = { enabled: false, ready: true, jobs: {} }
  } finally {
    loading = false
    listeners.forEach((l) => l())
  }
}

/**
 * Whether AI assist is configured on this site, and for which jobs (`status.jobs.translate`, ...). Fetched
 * once per page load and shared by every component.
 */
export function useAiStatus(): AiStatus {
  useEffect(() => {
    void loadStatus()
  }, [])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
    () => OFF
  )
}

// Calls

export type AiErrorCode =
  | "bad_request"
  | "too_large"
  | "unauthorized"
  | "forbidden"
  | "suspended"
  | "rate_limited"
  | "not_configured"
  | "blocked_url"
  | "fetch_failed"
  | "declined"
  | "upstream"
  | "timeout"
  | "bad_output"
  | "network"

export class AiRequestError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/** Every successful answer. `aiGenerated` is always true: show it as an editable AI suggestion. */
export type AiResult<T> = { data: T; model: string; remaining: number; aiGenerated: true }

export type NewsDraft = { title: string; summary: string; tags: string[]; note: string; source: { url: string; title: string } | null }
export type ThreadSummaryResult = { tldr: string; points: string[]; postsRead: number }
export type ImproveGoal = "clearer" | "shorter" | "friendlier" | "title"
export type TranslateResult = { text: string; from: string; to: LanguageCode }
export type ModerationVerdict = "ok" | "review" | "remove"
export type ModerationHintResult = { verdict: ModerationVerdict; categories: string[]; reason: string }
/** A free model members can pick in the Lab playground. `id` is what `ai.playground` takes as `model`. */
export type AiModel = { id: string; label: string; provider: string; context: number; notes: string }
export type PlaygroundInput = { model: string; system?: string; prompt: string; temperature?: number }
export type PlaygroundResult = { text: string; model: string; provider: string; ms: number }

async function token(): Promise<string | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.access_token ?? null
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<AiResult<T>> {
  const t = await token()
  if (!t) throw new AiRequestError("unauthorized", "Sign in to use AI assist.", 401)
  let res: Response
  try {
    res = await fetch(`/api/ai/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err
    throw new AiRequestError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
  }
  const json = (await res.json().catch(() => null)) as (AiResult<T> & { error?: { code: AiErrorCode; message: string } }) | null
  if (!res.ok || !json || json.error) {
    throw new AiRequestError(json?.error?.code ?? "upstream", json?.error?.message ?? "AI assist failed. Try again.", res.status)
  }
  return json
}

export const ai = {
  newsDraft: (input: { url?: string; title?: string; notes?: string }, signal?: AbortSignal) => post<NewsDraft>("news-draft", input, signal),
  threadSummary: (input: { title: string; posts: { author: string; body: string }[] }, signal?: AbortSignal) =>
    post<ThreadSummaryResult>("thread-summary", input, signal),
  improve: (input: { text: string; goal: ImproveGoal }, signal?: AbortSignal) => post<{ text: string }>("improve", input, signal),
  translate: (input: { text: string; to: LanguageCode }, signal?: AbortSignal) => post<TranslateResult>("translate", input, signal),
  /** Staff only. A suggestion for the reports queue; it never acts on anything. */
  moderate: (input: { text: string; context?: string }, signal?: AbortSignal) => post<ModerationHintResult>("moderate", input, signal),
  /** The free models on offer in the playground right now. Public: no sign-in needed. Empty when AI is off. */
  models: async (signal?: AbortSignal): Promise<AiModel[]> => {
    try {
      const res = await fetch("/api/ai/models", { cache: "no-store", signal })
      const json = (await res.json()) as { models?: AiModel[] }
      return Array.isArray(json.models) ? json.models : []
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err
      return []
    }
  },
  /** The member's own prompt to one free model. Counts toward their daily allowance. */
  playground: (input: PlaygroundInput, signal?: AbortSignal) => post<PlaygroundResult>("playground", input, signal),
}

// Admin (/admin/ai). Staff only on the server; the page itself is for admins.

export type AiAdminStatus = {
  day: string
  /** The stored settings, normalised by the server. */
  settings: unknown
  providers: { id: string; configured: boolean; envSet: Record<string, boolean>; usedToday: number | null }[]
  /** Today's calls per provider, model and job, or null when the usage table is not on the database yet. */
  usage: { provider: string; model: string; job: string; requests: number; failures: number }[] | null
  memberRequests: number | null
  server: { supabase: boolean; serviceKey: boolean; cacheSecret: boolean }
}

export type AiTestResult = { ok: true; ms: number; reply: string; label: string }

export const aiAdmin = {
  status: async (signal?: AbortSignal): Promise<AiAdminStatus> => {
    const t = await token()
    if (!t) throw new AiRequestError("unauthorized", "Sign in to see AI usage.", 401)
    let res: Response
    try {
      res = await fetch("/api/ai/admin", { headers: { authorization: `Bearer ${t}` }, cache: "no-store", signal })
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err
      throw new AiRequestError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
    }
    const json = (await res.json().catch(() => null)) as (AiAdminStatus & { error?: { code: AiErrorCode; message: string } }) | null
    if (!res.ok || !json || json.error) throw new AiRequestError(json?.error?.code ?? "upstream", json?.error?.message ?? "Could not load AI status.", res.status)
    return json
  },
  /** One tiny real call to one model. Counts toward that provider's daily cap. */
  test: (model: string, signal?: AbortSignal) => post<AiTestResult>("admin/test", { model }, signal),
}
