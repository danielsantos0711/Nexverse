import { askJson } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { newsDraftRequest, readNewsDraft } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"
import { checkUrlShape, fetchPublicPage, htmlToText } from "@/lib/ai/safe-url"

/** Draft a neutral news item (title, summary, tags) from a link and/or the member's notes. */
export const POST = aiRoute({
  prepare(body) {
    const url = field(body, "url", { max: 500, optional: true, label: "Link" })
    const title = field(body, "title", { max: 200, optional: true, label: "Title" })
    const notes = field(body, "notes", { max: 4000, optional: true, label: "Notes" })
    if (!url && notes.length < 20) throw new AiError(400, "bad_request", "Paste a link, or write at least a couple of sentences of notes.")
    // Check the link's shape now, so a bad or blocked link costs nothing from the daily allowance.
    const safe = url ? checkUrlShape(url).toString() : ""
    return async () => {
      let page: ReturnType<typeof htmlToText> | undefined
      if (safe) {
        const fetched = await fetchPublicPage(safe)
        page = htmlToText(fetched.html)
        if (page.text.length < 200 && !page.description && notes.length < 20) {
          throw new AiError(422, "fetch_failed", "That page has almost no readable text (it may need JavaScript). Add a few notes about it instead.")
        }
      }
      const { json, model } = await askJson(newsDraftRequest({ url: safe || undefined, title, notes, page }))
      return { data: { ...readNewsDraft(json), source: page ? { url: safe, title: page.title } : null }, model }
    }
  },
})

/** Room for the router to fall back through several free models. */
export const maxDuration = 90
