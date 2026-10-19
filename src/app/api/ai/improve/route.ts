import { askJson } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { IMPROVE_GOALS, improveRequest, readImprove, type ImproveGoal } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"

/** Rewrite a draft: clearer, shorter, friendlier, or suggest a title. The member decides what to keep. */
export const POST = aiRoute({
  prepare(body) {
    const text = field(body, "text", { max: 8000, min: 3, label: "Text" })
    const goal = body.goal as ImproveGoal
    if (!IMPROVE_GOALS.includes(goal)) throw new AiError(400, "bad_request", `goal must be one of ${IMPROVE_GOALS.join(", ")}.`)
    return async () => {
      const { json, model } = await askJson(improveRequest({ text, goal }))
      return { data: readImprove(json, goal), model }
    }
  },
})

/** Room for the router to fall back through several free models. */
export const maxDuration = 90
