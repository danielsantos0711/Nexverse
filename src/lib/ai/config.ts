import { MODELS, PROVIDERS, type ModelInfo, type ProviderId } from "./models"

/*
 * Server-only AI settings. Everything here reads secrets from the environment, so it must only be imported
 * by route handlers and server code. Client code talks to /api/ai through src/lib/ai-client.ts.
 * (The `server-only` package is not installed in this repo, so this comment is the guard: never import
 * src/lib/ai/** from a "use client" file, except the pure data modules models.ts and settings.ts.)
 */

export type Credentials = { key: string; account?: string }

function env(name: string): string | null {
  const v = process.env[name]?.trim()
  return v ? v : null
}

/** A provider's credentials, or null when it is not configured. Never return these to a client or log them. */
export function credentials(id: ProviderId): Credentials | null {
  switch (id) {
    case "gemini": {
      const key = env("GEMINI_API_KEY")
      return key ? { key } : null
    }
    case "groq": {
      const key = env("GROQ_API_KEY")
      return key ? { key } : null
    }
    case "openrouter": {
      const key = env("OPENROUTER_API_KEY")
      return key ? { key } : null
    }
    case "cloudflare": {
      const key = env("CLOUDFLARE_API_TOKEN")
      const account = env("CLOUDFLARE_ACCOUNT_ID")
      // The account id goes into the URL path, so it must look like one.
      return key && account && /^[a-f0-9]{32}$/i.test(account) ? { key, account } : null
    }
    case "mistral": {
      const key = env("MISTRAL_API_KEY")
      return key ? { key } : null
    }
    case "cerebras": {
      const key = env("CEREBRAS_API_KEY")
      return key ? { key } : null
    }
    // Premium (paid). Each needs its own variable on purpose, so a paid model is never used by accident.
    case "anthropic": {
      const key = env("ANTHROPIC_API_KEY")
      return key ? { key } : null
    }
    case "openrouterpaid": {
      const key = env("OPENROUTER_PREMIUM_API_KEY")
      return key ? { key } : null
    }
  }
}

export const isConfigured = (id: ProviderId) => credentials(id) !== null

/** Providers with a key set. */
export function configuredProviders(): ProviderId[] {
  return PROVIDERS.filter((p) => isConfigured(p.id)).map((p) => p.id)
}

/** Free providers with a key set. Premium keys alone do not switch member AI on: Nexverse runs on free AI. */
export function configuredFreeProviders(): ProviderId[] {
  return PROVIDERS.filter((p) => !p.premium && isConfigured(p.id)).map((p) => p.id)
}

/** Models whose provider has a key. */
export function activeModels(): ModelInfo[] {
  const on = new Set(configuredProviders())
  return MODELS.filter((m) => on.has(m.provider))
}

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null
}

/** Optional. Lets server jobs without a signed-in member (cron) count usage and cache in the database. */
export function serviceKey(): string | null {
  return env("SUPABASE_SERVICE_ROLE_KEY")
}

/**
 * Secret for cache keys. Cache keys are HMACs, so a member who knows a prompt cannot compute its key to read
 * or plant a cached answer. AI_CACHE_SECRET when set, else derived from the provider keys (which rotate the
 * cache when they change, which is fine).
 */
export function cacheSecret(): string {
  const own = env("AI_CACHE_SECRET")
  if (own) return own
  return PROVIDERS.map((p) => credentials(p.id)?.key ?? "").join("|")
}

/** At least one provider has a key. Which jobs can run is decided per job (catalog.ts `jobsReady`). */
export function anyProvider(): boolean {
  return configuredProviders().length > 0
}

/** AI is usable by members only with a provider key and with accounts (every AI route needs a signed-in member). */
export function aiEnabled(): boolean {
  return anyProvider() && Boolean(supabaseEnv())
}

/** Largest request body any AI route accepts, in bytes. Individual fields have tighter caps. */
export const MAX_BODY_BYTES = 64 * 1024
