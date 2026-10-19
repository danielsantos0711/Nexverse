"use client"

import { ai, AiRequestError, type AiModel, type PlaygroundResult } from "@/lib/ai-client"
import { live } from "@/lib/supabase"

/*
 * The Lab's view of the free AI models, on top of `ai.models()` and `ai.playground()` from the shared AI
 * client (every run carries the member's session token, never a provider key). The model list is cached for
 * the page's lifetime; an empty list means AI is not switched on, and the playground says so honestly.
 */

export type { AiModel }
export type PlaygroundRun = PlaygroundResult

/** Limits enforced by POST /api/ai/playground; the playground checks them before sending. */
export const LIMITS = { system: 4000, prompt: 12_000, temperatureMax: 1.5 }

export { AiRequestError as LabAiError }

export type ModelsState = { status: "ok"; models: AiModel[] } | { status: "off" }

let modelsCache: Promise<ModelsState> | null = null

export function loadModels(): Promise<ModelsState> {
  if (modelsCache) return modelsCache
  modelsCache = (async (): Promise<ModelsState> => {
    if (!live) return { status: "off" }
    const models = (await ai.models()).filter((m) => m && typeof m.id === "string" && typeof m.label === "string")
    return models.length ? { status: "ok", models } : { status: "off" }
  })()
  return modelsCache
}

export async function runPlayground(input: { model: string; system?: string; prompt: string; temperature?: number }, signal?: AbortSignal): Promise<{ data: PlaygroundRun; remaining: number | null }> {
  const r = await ai.playground(input, signal)
  return { data: r.data, remaining: typeof r.remaining === "number" ? r.remaining : null }
}
