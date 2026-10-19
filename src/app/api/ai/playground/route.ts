import { listModels } from "@/lib/ai/catalog"
import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { askText } from "@/lib/ai/llm"
import { aiRoute } from "@/lib/ai/route"

/**
 * The Lab playground: the member's own prompt to the free model they picked. Signed-in members only, counts
 * toward their daily allowance, never cached. Answers `data: { text, model, provider, ms }`.
 */
export const POST = aiRoute({
  async prepare(body) {
    const model = field(body, "model", { max: 160, label: "Model" })
    const system = field(body, "system", { max: 4000, optional: true, label: "System prompt" })
    const prompt = field(body, "prompt", { max: 12_000, min: 1, label: "Prompt" })
    let temperature: number | undefined
    if (body.temperature !== undefined && body.temperature !== null) {
      if (typeof body.temperature !== "number" || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 1.5) {
        throw new AiError(400, "bad_request", "temperature must be a number from 0 to 1.5.")
      }
      temperature = Math.round(body.temperature * 100) / 100
    }
    // Only models offered right now: a key is set, the admin allows it in the playground, AI is on.
    const offered = await listModels()
    if (!offered.some((m) => m.id === model)) throw new AiError(400, "bad_request", "That model is not available in the playground right now.")
    return async () => {
      const r = await askText({
        job: "playground",
        model,
        system: system || "You are a helpful assistant in the Nexverse Lab, a community for people who build with AI. Answer clearly and concisely.",
        prompt,
        maxTokens: 2000,
        temperature,
        cache: false,
      })
      return { data: { text: r.text, model: r.modelId, provider: r.provider, ms: r.ms }, model: r.model }
    }
  },
})

export const maxDuration = 60
