import { supabaseEnv } from "@/lib/ai/config"
import { field, str } from "@/lib/ai/json"
import { askJson, askText } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { isJob, jobById } from "@/lib/ai/models"
import { obj, systemJson } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"
import { resolveModel } from "@/lib/ai/settings"
import { loadAiSettings, rpc } from "@/lib/ai/store"

/**
 * Staff only. Two kinds of check, both real calls that count toward caps and the member's allowance, and both
 * logged in the moderation log:
 *   { model }  one tiny call to one model, to check its key and see how fast it answers;
 *   { job }    a small realistic task through the job's whole chain (fallbacks, JSON, thinking), to see which
 *              model actually answers that job right now, how fast, and with what.
 */
export const POST = aiRoute({
  staffOnly: true,
  async prepare(body, caller) {
    const env = supabaseEnv()
    const log = (target: string, note: string) => rpc("log_moderation", { action: "ai_test", target_kind: "ai_model", target_id: target, note }, env ? { apikey: env.key, authorization: `Bearer ${caller.token}` } : null)
    const settings = await loadAiSettings()
    if (body.job !== undefined) {
      const job = str(body.job, 20)
      if (!isJob(job) || job === "playground") throw new AiError(400, "bad_request", "Unknown job.")
      return async () => {
        try {
          const r = await askJson({
            job,
            maxTokens: 300,
            cache: false,
            system: systemJson(`This is a health check of the "${jobById(job)?.label}" job. Answer the question briefly and correctly.`),
            prompt: 'Question: a model has 8 billion parameters stored in 4-bit precision. Roughly how many gigabytes do the weights take? Return "answer" (one short sentence) and "gigabytes" (a number).',
            schema: obj({ answer: { type: "string" }, gigabytes: { type: "number" } }),
          })
          const j = r.json as { answer?: unknown; gigabytes?: unknown }
          const gb = Number(j.gigabytes)
          const correct = Number.isFinite(gb) && gb >= 3.5 && gb <= 5
          await log(`job:${job}`, `${r.modelId} in ${r.ms} ms, ${correct ? "correct" : "wrong"} answer`)
          return { data: { ok: true, ms: r.ms, reply: str(j.answer, 160), label: r.label, model: r.modelId, correct, tokens: r.tokensIn + r.tokensOut, costUsd: r.costUsd, premium: r.premium }, model: r.model }
        } catch (err) {
          await log(`job:${job}`, `failed: ${err instanceof AiError ? err.code : "error"}`)
          throw err
        }
      }
    }
    const id = field(body, "model", { max: 160, label: "Model" })
    const m = resolveModel(id, settings)
    if (!m) throw new AiError(400, "bad_request", "Unknown model.")
    return async () => {
      try {
        const r = await askText({ job: "playground", model: m.id, system: "You are a health check. Follow the instruction exactly.", prompt: "Reply with the single word: ready", maxTokens: 16, cache: false, effort: "low" })
        await log(m.id, `ok in ${r.ms} ms`)
        return { data: { ok: true, ms: r.ms, reply: r.text.slice(0, 80), label: m.label, model: m.id, tokens: r.tokensIn + r.tokensOut, costUsd: r.costUsd, premium: r.premium }, model: r.model }
      } catch (err) {
        await log(m.id, `failed: ${err instanceof AiError ? err.code : "error"}`)
        throw err
      }
    }
  },
})

export const maxDuration = 120
