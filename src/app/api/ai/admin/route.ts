import { connection } from "next/server"
import { requireMember } from "@/lib/ai/auth"
import { credentials, isConfigured, serviceKey, supabaseEnv } from "@/lib/ai/config"
import { AiError } from "@/lib/ai/errors"
import { JOBS, PROVIDERS } from "@/lib/ai/models"
import { errorResponse } from "@/lib/ai/route"
import { chainFor, resolveModel } from "@/lib/ai/settings"
import { forgetAiSettings, forgetCatalog, loadAiSettings, premiumSpent, withCaller } from "@/lib/ai/store"

/*
 * Everything the /admin/ai page shows that only the server knows: which provider keys are present (yes or
 * no, never the key) and today's usage, read with the staff member's own token under row level security.
 * Staff only. The settings themselves are public and saved by the page straight to site_settings.
 */

type UsageRow = { provider: string; model: string; job: string; requests: number; failures: number }
type StatRow = { day: string; provider: string; model: string; job: string; ok: number; fail: number; ms_total: number; tokens_in: number; tokens_out: number; cost_usd: number | string; last_error: string | null; last_at: string }
type FeedbackRow = { feature: string; useful: boolean }

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
    forgetCatalog()
    const week = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const [settings, usage, members, stats, feedback, catalog, spent] = await Promise.all([
      loadAiSettings(),
      select<UsageRow>(`ai_provider_usage?day=eq.${day}&select=provider,model,job,requests,failures&limit=1000`, caller.token),
      select<{ count: number }>(`ai_usage?day=eq.${day}&select=count&limit=10000`, caller.token),
      select<StatRow>(`ai_call_stats?day=gte.${week}&select=day,provider,model,job,ok,fail,ms_total,tokens_in,tokens_out,cost_usd,last_error,last_at&order=last_at.desc&limit=3000`, caller.token),
      select<FeedbackRow>(`ai_feedback?updated_at=gte.${encodeURIComponent(month)}&select=feature,useful&limit=20000`, caller.token),
      select<{ provider: string; models: unknown[]; fetched_at: string }>(`ai_catalog?select=provider,models,fetched_at`, caller.token),
      withCaller({ token: caller.token }, () => premiumSpent()),
    ])
    // Feedback totals per AI moment.
    const votes: Record<string, { up: number; down: number }> = {}
    for (const f of feedback ?? []) {
      const v = (votes[f.feature] ??= { up: 0, down: 0 })
      if (f.useful) v.up++
      else v.down++
    }
    // Per job: the model that would answer first right now (the first in its chain with a key).
    const firstChoice = Object.fromEntries(
      JOBS.map((j) => {
        const pid = settings.premium[j.id]
        const pm = pid ? resolveModel(pid, settings) : undefined
        if (pm && credentials(pm.provider) && settings.premiumBudgetUsd > 0 && spent < settings.premiumBudgetUsd) return [j.id, pm.id]
        const first = chainFor(j.id, settings).find((id) => {
          const m = resolveModel(id, settings)
          return Boolean(m && !m.premium && credentials(m.provider))
        })
        return [j.id, first ?? null]
      })
    )
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
        stats: stats ? stats.map((r) => ({ ...r, cost_usd: Number(r.cost_usd) || 0 })) : null,
        feedback: feedback ? votes : null,
        catalog: catalog ?? null,
        premiumSpent: spent,
        firstChoice,
        server: { supabase: Boolean(supabaseEnv()), serviceKey: Boolean(serviceKey()), cacheSecret: Boolean(process.env.AI_CACHE_SECRET?.trim()) },
      },
      { headers: { "cache-control": "no-store" } }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
