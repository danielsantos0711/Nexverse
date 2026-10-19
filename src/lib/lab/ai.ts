"use client"

import { db, live } from "@/lib/supabase"

/*
 * The Lab's side of the free AI models: the list of models the site can run (GET /api/ai/models) and one
 * playground run (POST /api/ai/playground). Same contract and error shape as src/lib/ai-client.ts; runs carry
 * the member's Supabase access token, never a provider key. When AI is not switched on, the models call
 * answers with an empty list or fails, and the playground says so instead of offering a dead button.
 */

export type AiModel = { id: string; label: string; provider: string; context: number; notes?: string }

export type PlaygroundRun = { text: string; model: string; provider: string; ms: number }

export type LabAiErrorCode = "unauthorized" | "forbidden" | "suspended" | "rate_limited" | "not_configured" | "too_large" | "bad_request" | "upstream" | "timeout" | "network" | string

export class LabAiError extends Error {
  constructor(
    public code: LabAiErrorCode,
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function token(): Promise<string | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.access_token ?? null
}

export type ModelsState = { status: "ok"; models: AiModel[] } | { status: "off" } | { status: "error"; message: string }

let modelsCache: Promise<ModelsState> | null = null

/** The models the site can run. Cached for the page's lifetime. */
export function loadModels(): Promise<ModelsState> {
  if (modelsCache) return modelsCache
  modelsCache = (async (): Promise<ModelsState> => {
    if (!live) return { status: "off" }
    try {
      const t = await token()
      const res = await fetch("/api/ai/models", { cache: "no-store", headers: t ? { authorization: `Bearer ${t}` } : undefined })
      if (res.status === 404) return { status: "off" }
      const json = (await res.json().catch(() => null)) as { models?: unknown; error?: { code?: string; message?: string } } | null
      if (!res.ok || !json) {
        if (json?.error?.code === "not_configured" || res.status === 503) return { status: "off" }
        return { status: "error", message: json?.error?.message ?? "Could not load the model list." }
      }
      const models = Array.isArray(json.models) ? (json.models as AiModel[]).filter((m) => m && typeof m.id === "string" && typeof m.label === "string") : []
      return models.length ? { status: "ok", models } : { status: "off" }
    } catch {
      modelsCache = null
      return { status: "error", message: "Could not reach Nexverse. Check your connection and try again." }
    }
  })()
  return modelsCache
}

export async function runPlayground(
  input: { model: string; system?: string; prompt: string; temperature?: number },
  signal?: AbortSignal
): Promise<{ data: PlaygroundRun; remaining: number | null }> {
  const t = await token()
  if (!t) throw new LabAiError("unauthorized", "Sign in to run prompts.", 401)
  let res: Response
  try {
    res = await fetch("/api/ai/playground", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(input),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err
    throw new LabAiError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
  }
  const json = (await res.json().catch(() => null)) as { data?: PlaygroundRun; remaining?: number; error?: { code: string; message: string } } | null
  if (!res.ok || !json || json.error || !json.data) {
    throw new LabAiError(json?.error?.code ?? "upstream", json?.error?.message ?? "The model did not answer. Try again.", res.status)
  }
  return { data: json.data, remaining: typeof json.remaining === "number" ? json.remaining : null }
}
