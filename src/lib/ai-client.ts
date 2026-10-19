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

export type AiStatus = { enabled: boolean; ready: boolean }

const OFF: AiStatus = { enabled: false, ready: false }
let status: AiStatus = OFF
let loading = false
const listeners = new Set<() => void>()

async function loadStatus() {
  if (loading || status.ready) return
  loading = true
  try {
    if (!live) throw new Error("no accounts")
    const res = await fetch("/api/ai/status", { cache: "no-store" })
    const json = (await res.json()) as { enabled?: unknown }
    status = { enabled: json.enabled === true, ready: true }
  } catch {
    status = { enabled: false, ready: true }
  } finally {
    loading = false
    listeners.forEach((l) => l())
  }
}

/** Whether AI assist is configured on this site. Fetched once per page load and shared by every component. */
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
export type VideoShot = { duration: number; description: string; camera: string; lens: string; lighting: string }
export type VideoPromptResult = { title: string; prompt: string; shots: VideoShot[]; style: string; negative: string }

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
  videoPrompt: (input: { idea: string; style?: string; camera?: string; duration?: number }, signal?: AbortSignal) =>
    post<VideoPromptResult>("video-prompt", input, signal),
}
