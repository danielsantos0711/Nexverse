import { errorJson, member, NO_STORE } from "@/lib/code/server"
import { refreshProjects } from "@/lib/import/create"
import { ImportError } from "@/lib/import/fetch"
import { convertShares, requireAdmin } from "@/lib/import/mass"

/**
 * POST /api/import/refresh { ids?, all?, shares? } with the member's access token: reads imported projects from
 * their source again and fills what is missing (README, facts and numbers, files, release, dataset preview,
 * tags, licence, cover). Members refresh their own imports; `all: true` (admins) covers every imported project.
 * `shares: true` (admins) turns GitHub repositories an earlier mass import shared as bare links into full pages.
 * A few projects a call: `{ data: { done, remaining } }`; call again while `remaining > 0`.
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
    if (b.shares === true) {
      await requireAdmin(m)
      return Response.json({ data: await convertShares(m, 3) }, { headers: NO_STORE })
    }
    const all = b.all === true
    if (all) await requireAdmin(m)
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : undefined
    return Response.json({ data: await refreshProjects(m, { ids, all, limit: 4 }) }, { headers: NO_STORE })
  } catch (err) {
    return errorJson(err)
  }
}

/** Each project reads its source again (a few requests) and may copy a cover. */
export const maxDuration = 120
