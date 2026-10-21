import { errorJson, member, NO_STORE } from "@/lib/code/server"
import { reimageProjects } from "@/lib/import/create"
import { ImportError } from "@/lib/import/fetch"
import { requireAdmin } from "@/lib/import/mass"

/**
 * POST /api/import/images { ids?, all?, replace? } with the member's access token: fetches cover pictures for
 * projects imported from Hugging Face or OpenRouter without one (`replace: true` fetches a fresh one), copying
 * each into Nexverse storage with a credit. Members refresh their own imports; `all: true` (admins) covers every
 * imported project. Up to 6 projects a call: `{ data: { done, remaining } }`; call again while `remaining > 0`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const m = await member(request)
    const text = await request.text()
    if (text.length > 2000) throw new ImportError(413, "That request is too large.")
    let b: Record<string, unknown>
    try {
      b = (JSON.parse(text || "{}") ?? {}) as Record<string, unknown>
    } catch {
      throw new ImportError(400, "Send a JSON body.")
    }
    const all = b.all === true
    if (all) await requireAdmin(m)
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : undefined
    return Response.json({ data: await reimageProjects(m, { ids, all, replace: b.replace === true }) }, { headers: NO_STORE })
  } catch (err) {
    return errorJson(err)
  }
}

export const maxDuration = 60
