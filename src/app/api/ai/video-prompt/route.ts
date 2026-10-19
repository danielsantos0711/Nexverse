import { askJson } from "@/lib/ai/anthropic"
import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { readVideoPrompt, videoPromptRequest } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"

/** Turn a video idea into a structured text-to-video prompt with a shot list. */
export const POST = aiRoute({
  prepare(body) {
    const idea = field(body, "idea", { max: 2000, min: 8, label: "Idea" })
    const style = field(body, "style", { max: 300, optional: true, label: "Style" })
    const camera = field(body, "camera", { max: 300, optional: true, label: "Camera" })
    let duration: number | undefined
    if (body.duration !== undefined && body.duration !== null) {
      if (typeof body.duration !== "number" || !Number.isFinite(body.duration) || body.duration < 2 || body.duration > 60) {
        throw new AiError(400, "bad_request", "duration must be a number of seconds between 2 and 60.")
      }
      duration = Math.round(body.duration)
    }
    return async () => {
      const { json, model } = await askJson(videoPromptRequest({ idea, style: style || undefined, camera: camera || undefined, duration }))
      return { data: readVideoPrompt(json), model }
    }
  },
})
