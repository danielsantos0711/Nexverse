import { askJson } from "@/lib/ai/llm"
import { field } from "@/lib/ai/json"
import { moderateRequest, readModeration } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"

/**
 * Staff only: a suggested triage for reported content. It only advises; nothing is hidden or removed here,
 * moderators act through moderate_content() as usual.
 */
export const POST = aiRoute({
  staffOnly: true,
  prepare(body) {
    const text = field(body, "text", { max: 8000, min: 1, label: "Text" })
    const context = field(body, "context", { max: 1500, optional: true, label: "Context" })
    return async () => {
      const { json, model } = await askJson(moderateRequest({ text, context: context || undefined }))
      return { data: readModeration(json), model }
    }
  },
})

/** Room for the router to fall back through several free models. */
export const maxDuration = 90
