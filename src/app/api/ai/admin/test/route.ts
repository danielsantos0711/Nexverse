import { supabaseEnv } from "@/lib/ai/config"
import { field } from "@/lib/ai/json"
import { askText } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { modelById } from "@/lib/ai/models"
import { aiRoute } from "@/lib/ai/route"
import { rpc } from "@/lib/ai/store"

/**
 * Staff only: one tiny real call to one model, to check its key and see how fast it answers. It counts toward
 * the provider's daily cap and the member's allowance like any other request, and goes in the moderation log.
 */
export const POST = aiRoute({
  staffOnly: true,
  prepare(body, caller) {
    const id = field(body, "model", { max: 160, label: "Model" })
    const m = modelById(id)
    if (!m) throw new AiError(400, "bad_request", "Unknown model.")
    return async () => {
      const env = supabaseEnv()
      const log = (note: string) => rpc("log_moderation", { action: "ai_test", target_kind: "ai_model", target_id: m.id, note }, env ? { apikey: env.key, authorization: `Bearer ${caller.token}` } : null)
      try {
        const r = await askText({ job: "playground", model: m.id, system: "You are a health check. Follow the instruction exactly.", prompt: "Reply with the single word: ready", maxTokens: 16, cache: false })
        await log(`ok in ${r.ms} ms`)
        return { data: { ok: true, ms: r.ms, reply: r.text.slice(0, 80), label: m.label }, model: r.model }
      } catch (err) {
        await log(`failed: ${err instanceof AiError ? err.code : "error"}`)
        throw err
      }
    }
  },
})

export const maxDuration = 30
