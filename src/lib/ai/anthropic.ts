import { apiKey, modelFor, type AiTier } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"
import { parseJsonLoose } from "./json"

/*
 * A small client for the Anthropic Messages API over plain fetch (no SDK dependency). It asks for JSON that
 * matches a schema, falls back to prompt-only JSON if the model rejects the structured output setting, and
 * maps every failure to an AiError with a member-friendly message. The key is only ever sent as a header.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages"
const TIMEOUT_MS = 25_000

export type JsonSchema = Record<string, unknown>

export type AskOptions = {
  tier: AiTier
  system: string
  /** The user turn. Untrusted content inside it must already be wrapped with `fence()`. */
  prompt: string
  schema: JsonSchema
  maxTokens: number
  /** Thinking depth. "low" keeps cheap tasks fast; drafting uses "medium". */
  effort?: "low" | "medium" | "high"
}

export type AskResult = { json: unknown; model: string }

type MessagesResponse = {
  model?: string
  stop_reason?: string
  content?: { type: string; text?: string }[]
  error?: { type?: string; message?: string }
}

function body(o: AskOptions, model: string, structured: boolean) {
  return JSON.stringify({
    model,
    max_tokens: o.maxTokens,
    system: o.system,
    messages: [{ role: "user", content: o.prompt }],
    output_config: {
      effort: o.effort ?? "low",
      ...(structured ? { format: { type: "json_schema", schema: o.schema } } : {}),
    },
  })
}

async function post(o: AskOptions, key: string, model: string, structured: boolean) {
  try {
    return await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: body(o, model, structured),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (err) {
    const name = (err as Error)?.name
    if (name === "TimeoutError" || name === "AbortError") throw new AiError(504, "timeout", "The AI took too long to answer. Try again.")
    throw new AiError(502, "upstream", "Could not reach the AI service. Try again in a moment.")
  }
}

/** Map an Anthropic error status to what we tell the member. Upstream bodies are never passed through. */
export function upstreamError(status: number): AiError {
  if (status === 401 || status === 403) return new AiError(503, "not_configured", "AI assist is set up with a key that does not work. An admin needs to check it.")
  if (status === 429) return new AiError(503, "upstream", "The AI service is busy right now. Try again in a minute.")
  if (status === 413) return new AiError(413, "too_large", "That is too much text for the AI to read at once.")
  if (status === 529 || status >= 500) return new AiError(503, "upstream", "The AI service is having trouble. Try again in a moment.")
  return new AiError(502, "upstream", "The AI service could not handle that request.")
}

/** Ask the model for one JSON object. Throws AiError on any failure. */
export async function askJson(o: AskOptions): Promise<AskResult> {
  const key = apiKey()
  if (!key) throw new AiError(503, "not_configured", NOT_CONFIGURED)
  const model = modelFor(o.tier)

  let res = await post(o, key, model, true)
  if (res.status === 400) {
    // Some models or overrides may not accept structured output; retry once with prompt-only JSON.
    const err = (await res.json().catch(() => null)) as MessagesResponse | null
    const msg = err?.error?.message ?? ""
    if (/output_config|format|schema/i.test(msg)) res = await post(o, key, model, false)
    else throw upstreamError(400)
  }
  if (!res.ok) throw upstreamError(res.status)

  const data = (await res.json().catch(() => null)) as MessagesResponse | null
  if (!data) throw new AiError(502, "bad_output", "The AI sent back something unreadable. Try again.")
  if (data.stop_reason === "refusal") throw new AiError(422, "declined", "The AI declined to help with this text.")
  if (data.stop_reason === "max_tokens") throw new AiError(502, "bad_output", "The answer was cut short. Try with less text.")
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
  const json = parseJsonLoose(text)
  if (json === undefined) throw new AiError(502, "bad_output", "The AI sent back something unreadable. Try again.")
  return { json, model: data.model ?? model }
}
