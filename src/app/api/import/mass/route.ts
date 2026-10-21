import { errorJson, member, NO_STORE } from "@/lib/code/server"
import { ImportError } from "@/lib/import/fetch"
import { importCandidate, isMassSource, listCandidates, logRun, requireAdmin, RUN_MAX } from "@/lib/import/mass"

/**
 * POST /api/import/mass, admins only, with the admin's access token as `Authorization: Bearer`:
 * - `{ action: "preview", source, limit }` → `{ data: { candidates } }`: what a run would import (dry run, writes nothing);
 * - `{ action: "start", source, runId, count }` / `{ action: "finish", source, runId, note }`: moderation log lines;
 * - `{ action: "item", source, runId, ref }` → `{ data: { status, href?, note? } }`: imports one candidate.
 * `source` is hf-models | hf-datasets | or-models | gh-repos | gh-tools | papers. Errors: `{ error: { message } }`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const m = await member(request)
    const text = await request.text()
    if (text.length > 2000) throw new ImportError(413, "That request is too large.")
    let b: Record<string, unknown>
    try {
      b = (JSON.parse(text) ?? {}) as Record<string, unknown>
    } catch {
      throw new ImportError(400, "Send a JSON body.")
    }
    if (!isMassSource(b.source)) throw new ImportError(400, "Choose what to import.")
    await requireAdmin(m)
    const runId = typeof b.runId === "string" && /^[0-9a-f-]{36}$/i.test(b.runId) ? b.runId : null
    if (b.action === "preview") {
      const limit = typeof b.limit === "number" ? Math.min(RUN_MAX, Math.max(1, b.limit)) : 10
      return Response.json({ data: { candidates: await listCandidates(m, b.source, limit) } }, { headers: NO_STORE })
    }
    if (!runId) throw new ImportError(400, "Missing the run id.")
    if (b.action === "start" || b.action === "finish") {
      const note = b.action === "start" ? `started, ${Math.min(RUN_MAX, Number(b.count) || 0)} items` : String(b.note ?? "finished").slice(0, 300)
      await logRun(m, runId, b.source, note)
      return Response.json({ data: { ok: true } }, { headers: NO_STORE })
    }
    if (b.action === "item") {
      const ref = typeof b.ref === "string" ? b.ref.trim() : ""
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,199}$/.test(ref) || ref.includes("..")) throw new ImportError(400, "That id is not valid.")
      return Response.json({ data: await importCandidate(m, runId, b.source, ref) }, { headers: NO_STORE })
    }
    throw new ImportError(400, "Unknown action.")
  } catch (err) {
    return errorJson(err)
  }
}

/** One item: reading the source, copying its cover and a few small files. */
export const maxDuration = 60
