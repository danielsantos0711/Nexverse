import { requireMember } from "@/lib/ai/auth"
import { supabaseEnv } from "@/lib/ai/config"
import { AiError } from "@/lib/ai/errors"
import { field, isObject } from "@/lib/ai/json"
import { errorResponse } from "@/lib/ai/route"

/**
 * "Was this useful?" on an AI answer. One vote per member, AI moment and target (changing your mind updates
 * it). Stored in ai_feedback with the member's own token, so row level security keeps it theirs; staff see the
 * totals in /admin/ai. Costs nothing from the daily AI allowance.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireMember(request)
    const env = supabaseEnv()
    if (!env) throw new AiError(503, "not_configured", "Feedback needs the database.")
    let body: unknown
    try {
      body = JSON.parse((await request.text()).slice(0, 4000))
    } catch {
      throw new AiError(400, "bad_request", "Send a JSON body.")
    }
    if (!isObject(body)) throw new AiError(400, "bad_request", "Send a JSON object.")
    const feature = field(body, "feature", { max: 40, min: 2, label: "Feature" })
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(feature)) throw new AiError(400, "bad_request", "Unknown feature.")
    if (typeof body.useful !== "boolean") throw new AiError(400, "bad_request", "useful must be true or false.")
    const row = {
      feature,
      target: field(body, "target", { max: 200, optional: true, label: "Target" }),
      useful: body.useful,
      model: field(body, "model", { max: 160, optional: true, label: "Model" }),
      note: field(body, "note", { max: 500, optional: true, label: "Note" }),
      updated_at: new Date().toISOString(),
    }
    const res = await fetch(`${env.url}/rest/v1/ai_feedback?on_conflict=user_id,feature,target`, {
      method: "POST",
      headers: { apikey: env.key, authorization: `Bearer ${caller.token}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    }).catch(() => null)
    if (!res?.ok) throw new AiError(503, "upstream", res?.status === 404 ? "Feedback is not on this database yet." : "Could not save your feedback. Try again.")
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return errorResponse(err)
  }
}
