import { errorJson, member, NO_STORE } from "@/lib/code/server"
import { previewAllowed, previewImport, runImport } from "@/lib/import/create"
import { ImportError } from "@/lib/import/fetch"
import { parseImportId, type ImportRequest } from "@/lib/import/types"

/**
 * POST /api/import { site, type, id, preview?, publish?, copyFiles? } with the member's access token as
 * `Authorization: Bearer`. `site` is "huggingface" (models and datasets) or "openrouter" (models); `id` is the
 * item's id or its address on that site. With `preview: true` it answers what would be created
 * (`{ data: ImportPreview }`) and writes nothing; otherwise it creates the project as the member and answers
 * `{ data: { id, kind, href, files, skipped } }`. Errors: `{ error: { message } }`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const m = await member(request)
    const text = await request.text()
    if (text.length > 2000) throw new ImportError(413, "That request is too large.")
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new ImportError(400, "Send a JSON body.")
    }
    const b = (body ?? {}) as Record<string, unknown>
    const site = b.site === "huggingface" || b.site === "openrouter" ? b.site : null
    const type = b.type === "model" || b.type === "dataset" ? b.type : null
    if (!site || !type) throw new ImportError(400, "Choose Hugging Face or OpenRouter, and a model or a dataset.")
    if (site === "openrouter" && type !== "model") throw new ImportError(400, "OpenRouter lists models only.")
    const id = typeof b.id === "string" ? parseImportId(site, type, b.id) : null
    if (!id) {
      throw new ImportError(
        400,
        site === "openrouter" ? "Paste an OpenRouter model id like author/model, or its address." : `Paste a Hugging Face ${type} id like owner/name, or its address.`
      )
    }
    const req: ImportRequest = { site, type, id, publish: b.publish === true, copyFiles: b.copyFiles !== false }
    if (b.preview === true) {
      if (!previewAllowed(m.id)) throw new ImportError(429, "That is a lot of previews in a minute. Wait a moment and try again.")
      return Response.json({ data: await previewImport(req) }, { headers: NO_STORE })
    }
    return Response.json({ data: await runImport(m, req) }, { headers: NO_STORE })
  } catch (err) {
    return errorJson(err)
  }
}

/** Reading the source, creating the project and copying a few small files. */
export const maxDuration = 60
