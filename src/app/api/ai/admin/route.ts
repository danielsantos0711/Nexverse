import { connection } from "next/server"
import { requireMember } from "@/lib/ai/auth"
import { isConfigured, serviceKey, supabaseEnv } from "@/lib/ai/config"
import { AiError } from "@/lib/ai/errors"
import { PROVIDERS } from "@/lib/ai/models"
import { errorResponse } from "@/lib/ai/route"
import { forgetAiSettings, loadAiSettings } from "@/lib/ai/store"

/*
 * Everything the /admin/ai page shows that only the server knows: which provider keys are present (yes or
 * no, never the key) and today's usage, read with the staff member's own token under row level security.
 * Staff only. The settings themselves are public and saved by the page straight to site_settings.
 */

type UsageRow = { provider: string; model: string; job: string; requests: number; failures: number }

async function select<T>(path: string, token: string): Promise<T[] | null> {
  const env = supabaseEnv()
  if (!env) return null
  try {
    const res = await fetch(`${env.url}/rest/v1/${path}`, {
      headers: { apikey: env.key, authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    return res.ok ? ((await res.json()) as T[]) : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  await connection()
  try {
    const caller = await requireMember(request)
    if (!caller.staff) throw new AiError(403, "forbidden", "Only moderators and admins can see AI usage.")
    // An admin who just saved wants to see the new settings, not the 30-second cached copy.
    forgetAiSettings()
    const day = new Date().toISOString().slice(0, 10)
    const [settings, usage, members] = await Promise.all([
      loadAiSettings(),
      select<UsageRow>(`ai_provider_usage?day=eq.${day}&select=provider,model,job,requests,failures&limit=1000`, caller.token),
      select<{ count: number }>(`ai_usage?day=eq.${day}&select=count&limit=10000`, caller.token),
    ])
    return Response.json(
      {
        day,
        settings,
        providers: PROVIDERS.map((p) => ({
          id: p.id,
          configured: isConfigured(p.id),
          // Which variables are set, by name only, so the admin can see what is missing (e.g. the Cloudflare account id).
          envSet: Object.fromEntries(p.env.map((name) => [name, Boolean(process.env[name]?.trim())])),
          usedToday: usage ? usage.filter((u) => u.provider === p.id).reduce((n, u) => n + u.requests, 0) : null,
        })),
        usage,
        memberRequests: members ? members.reduce((n, r) => n + (r.count ?? 0), 0) : null,
        server: { supabase: Boolean(supabaseEnv()), serviceKey: Boolean(serviceKey()), cacheSecret: Boolean(process.env.AI_CACHE_SECRET?.trim()) },
      },
      { headers: { "cache-control": "no-store" } }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
