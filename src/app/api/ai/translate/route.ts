import { askJson } from "@/lib/ai/anthropic"
import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { readTranslate, translateRequest } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"
import { LANGUAGES, type LanguageCode } from "@/lib/data"

/** Translate text into one of the site's languages. */
export const POST = aiRoute({
  prepare(body) {
    const text = field(body, "text", { max: 8000, min: 1, label: "Text" })
    const to = body.to as LanguageCode
    if (typeof to !== "string" || !Object.hasOwn(LANGUAGES, to)) throw new AiError(400, "bad_request", `to must be one of ${Object.keys(LANGUAGES).join(", ")}.`)
    return async () => {
      const { json, model } = await askJson(translateRequest({ text, to, toName: LANGUAGES[to].name }))
      return { data: { ...readTranslate(json), to }, model }
    }
  },
})
