import { importFromGithub } from "@/lib/code/github-import"
import { CodeError, errorJson, member, NO_STORE } from "@/lib/code/server"

/**
 * POST /api/code/import { url, name?, visibility? } with the member's access token as `Authorization: Bearer`.
 * Imports one snapshot of a public GitHub repository as the member's new repository and answers
 * `{ data: { owner, slug, files, skipped } }`, or `{ error: { message } }`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const m = await member(request)
    const text = await request.text()
    if (text.length > 4000) throw new CodeError(413, "That request is too large.")
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new CodeError(400, "Send a JSON body.")
    }
    const b = (body ?? {}) as { url?: unknown; name?: unknown; visibility?: unknown }
    if (typeof b.url !== "string" || !b.url.trim()) throw new CodeError(400, "Paste the address of a public GitHub repository.")
    const data = await importFromGithub(m, {
      url: b.url,
      name: typeof b.name === "string" ? b.name : undefined,
      visibility: b.visibility === "private" ? "private" : "public",
    })
    return Response.json({ data }, { headers: NO_STORE })
  } catch (err) {
    return errorJson(err)
  }
}

/** Downloading, hashing and uploading a few thousand files takes a while. */
export const maxDuration = 300
