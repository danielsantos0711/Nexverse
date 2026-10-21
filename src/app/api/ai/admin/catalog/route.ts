import { connection } from "next/server"
import { requireMember } from "@/lib/ai/auth"
import { fetchLiveCatalog } from "@/lib/ai/catalog"
import { supabaseEnv } from "@/lib/ai/config"
import { AiError } from "@/lib/ai/errors"
import { errorResponse } from "@/lib/ai/route"
import { forgetCatalog, rpc } from "@/lib/ai/store"

/*
 * Admins: refresh the live model catalogue from every provider's public model list (OpenRouter needs no key;
 * the others are read with their own key, which never leaves the server). The lists are stored in ai_catalog
 * (public data: ids, context sizes, prices) so the router can skip free models that were withdrawn and the
 * admin's model picker shows what exists today. Each refresh goes in the moderation log.
 */
export async function POST(request: Request) {
  await connection()
  try {
    const caller = await requireMember(request)
    if (caller.role !== "admin") throw new AiError(403, "forbidden", "Only admins can refresh the model catalogue.")
    const env = supabaseEnv()
    const { providers, failed } = await fetchLiveCatalog()
    const now = new Date().toISOString()
    const rows = Object.entries(providers).map(([provider, models]) => ({ provider, models, fetched_at: now }))
    let saved = false
    if (env && rows.length) {
      const res = await fetch(`${env.url}/rest/v1/ai_catalog?on_conflict=provider`, {
        method: "POST",
        headers: { apikey: env.key, authorization: `Bearer ${caller.token}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      }).catch(() => null)
      saved = Boolean(res?.ok)
      await rpc("log_moderation", { action: "ai_catalog", target_kind: "site_setting", target_id: "ai", note: `catalogue refreshed: ${rows.map((r) => `${r.provider} ${r.models.length}`).join(", ")}`.slice(0, 300) }, { apikey: env.key, authorization: `Bearer ${caller.token}` })
    }
    forgetCatalog()
    return Response.json({ providers, failed, saved, fetchedAt: now }, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return errorResponse(err)
  }
}

export const maxDuration = 30
