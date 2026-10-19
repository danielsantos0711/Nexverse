/*
 * Server-only AI settings. Everything here reads secrets from the environment, so it must only be imported
 * by route handlers under src/app/api/ai. Client code talks to those routes through src/lib/ai-client.ts.
 * (The `server-only` package is not installed in this repo, so this comment is the guard: never import
 * src/lib/ai/** from a "use client" file.)
 */

/** Cheap, fast tasks (rewrites, translation, triage, summaries) and longer drafting tasks. */
export type AiTier = "fast" | "draft"

const DEFAULT_MODELS: Record<AiTier, string> = {
  fast: "claude-haiku-5-5",
  draft: "claude-sonnet-5-5",
}

/** The API key, or null. Never return or log this value. */
export function apiKey(): string | null {
  const k = process.env.ANTHROPIC_API_KEY?.trim()
  return k ? k : null
}

/** The model for a task. AI_MODEL, when set, overrides both tiers. */
export function modelFor(tier: AiTier): string {
  const override = process.env.AI_MODEL?.trim()
  return override || DEFAULT_MODELS[tier]
}

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null
}

/** AI is usable only with a key and with accounts (every AI route needs a signed-in member). */
export function aiEnabled(): boolean {
  return Boolean(apiKey() && supabaseEnv())
}

/** Requests per member per day. Staff work the reports queue, so they get five times as many. */
export function dailyLimit(staff: boolean): number {
  const raw = Number.parseInt(process.env.AI_DAILY_LIMIT ?? "", 10)
  const base = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 1000) : 30
  return staff ? Math.min(base * 5, 5000) : base
}

/** Largest request body any AI route accepts, in bytes. Individual fields have tighter caps. */
export const MAX_BODY_BYTES = 64 * 1024
