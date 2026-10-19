import type { Credentials } from "./config"
import type { ModelInfo, ProviderId } from "./models"

/*
 * Clients for the free providers over plain fetch (no SDKs). Gemini has its own API; Groq, OpenRouter,
 * Cloudflare Workers AI and Mistral speak the OpenAI chat completions format. Each call either returns the
 * model's text or throws a ProviderFailure that says what kind of failure it was, so the router can decide
 * whether to try the next model. Keys only ever travel in request headers; upstream bodies are read for the
 * answer and never passed on or logged.
 */

export type JsonSchema = Record<string, unknown>

export type ProviderRequest = {
  system: string
  prompt: string
  maxTokens: number
  temperature?: number
  /** Ask for one JSON object matching this schema. */
  schema?: JsonSchema
  timeoutMs: number
}

export type ProviderAnswer = { text: string; tokens: number | null }

/**
 * rate: 429 or out of free allowance. server: 5xx. timeout/network: no answer. auth: the key was refused.
 * bad_request: the provider would not take this request (model gone, too long, unsupported option).
 * bad_output: an answer we cannot use. declined: the model or its safety filter refused.
 */
export type FailureKind = "rate" | "server" | "timeout" | "network" | "auth" | "bad_request" | "too_large" | "bad_output" | "declined"

export class ProviderFailure extends Error {
  constructor(
    public kind: FailureKind,
    public status = 0
  ) {
    super(`provider failure: ${kind}${status ? ` (${status})` : ""}`)
  }
}

export function failureFor(status: number): ProviderFailure {
  if (status === 429 || status === 402) return new ProviderFailure("rate", status)
  if (status === 401 || status === 403) return new ProviderFailure("auth", status)
  if (status === 413) return new ProviderFailure("too_large", status)
  if (status >= 500) return new ProviderFailure("server", status)
  return new ProviderFailure("bad_request", status)
}

async function send(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
  } catch (err) {
    const name = (err as Error)?.name
    throw new ProviderFailure(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network")
  }
}

/** The schema spelled out in the instructions, for models without native structured output. */
export function schemaInstruction(schema: JsonSchema): string {
  return `Reply with only one JSON object, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(schema)}`
}

// Gemini (generateContent)

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { totalTokenCount?: number }
}

const GEMINI_BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"])

async function gemini(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.model)}:generateContent`
  // Thinking tokens count toward maxOutputTokens on Gemini 3, so leave headroom and ask for light thinking.
  const build = (rich: boolean) => ({
    systemInstruction: { parts: [{ text: rich || !r.schema ? r.system : `${r.system}\n\n${schemaInstruction(r.schema)}` }] },
    contents: [{ role: "user", parts: [{ text: r.prompt }] }],
    generationConfig: {
      maxOutputTokens: r.maxTokens + (m.reasoning ? 2048 : 0),
      // Google advises keeping Gemini 3 at its default temperature; only the playground sets one.
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(r.schema ? { responseMimeType: "application/json" } : {}),
      ...(rich && r.schema ? { responseJsonSchema: r.schema } : {}),
      ...(rich && m.reasoning === "gemini3" ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
    },
  })
  const headers = { "x-goog-api-key": c.key }
  let res = await send(url, headers, build(true), r.timeoutMs)
  // An option this model does not accept: try once more with plain JSON mode and the schema in the prompt.
  if (res.status === 400) res = await send(url, headers, build(false), r.timeoutMs)
  if (!res.ok) throw failureFor(res.status)
  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  if (!data) throw new ProviderFailure("bad_output")
  if (data.promptFeedback?.blockReason) throw new ProviderFailure("declined")
  const cand = data.candidates?.[0]
  if (cand?.finishReason && GEMINI_BLOCKED.has(cand.finishReason)) throw new ProviderFailure("declined")
  if (cand?.finishReason === "MAX_TOKENS") throw new ProviderFailure("bad_output")
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim()
  if (!text) throw new ProviderFailure("bad_output")
  return { text, tokens: data.usageMetadata?.totalTokenCount ?? null }
}

// OpenAI-compatible chat completions (Groq, OpenRouter, Cloudflare, Mistral)

type ChatResponse = {
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null; refusal?: string | null }; finish_reason?: string }[]
  usage?: { total_tokens?: number }
}

function endpoint(provider: ProviderId, c: Credentials): { url: string; headers: Record<string, string> } {
  const auth = { authorization: `Bearer ${c.key}` }
  switch (provider) {
    case "groq":
      return { url: "https://api.groq.com/openai/v1/chat/completions", headers: auth }
    case "openrouter":
      // Optional attribution headers OpenRouter documents for app rankings; they carry no secrets.
      return { url: "https://openrouter.ai/api/v1/chat/completions", headers: { ...auth, "x-title": "Nexverse" } }
    case "cloudflare":
      return { url: `https://api.cloudflare.com/client/v4/accounts/${c.account}/ai/v1/chat/completions`, headers: auth }
    case "mistral":
      return { url: "https://api.mistral.ai/v1/chat/completions", headers: auth }
    case "gemini":
      throw new Error("Gemini uses its own client")
  }
}

async function chat(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  const { url, headers } = endpoint(m.provider, c)
  const build = (rich: boolean) => {
    const native = rich && r.schema ? m.json : "prompt"
    const system = r.schema && native !== "schema" ? `${r.system}\n\n${schemaInstruction(r.schema)}` : r.system
    const tokens = r.maxTokens + (m.reasoning ? 1024 : 0)
    return {
      model: m.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: r.prompt },
      ],
      ...(m.provider === "groq" ? { max_completion_tokens: tokens } : { max_tokens: tokens }),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(native === "schema" && r.schema ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: r.schema } } } : {}),
      ...(native === "object" ? { response_format: { type: "json_object" } } : {}),
      ...(rich && m.reasoning === "gpt-oss" && m.provider === "groq" ? { reasoning_effort: "low" } : {}),
    }
  }
  let res = await send(url, headers, build(true), r.timeoutMs)
  if (res.status === 400 && (r.schema || m.reasoning)) res = await send(url, headers, build(false), r.timeoutMs)
  if (!res.ok) throw failureFor(res.status)
  const data = (await res.json().catch(() => null)) as ChatResponse | null
  const choice = data?.choices?.[0]
  if (!choice) throw new ProviderFailure("bad_output")
  if (choice.finish_reason === "content_filter" || choice.message?.refusal) throw new ProviderFailure("declined")
  if (choice.finish_reason === "length") throw new ProviderFailure("bad_output")
  const content = choice.message?.content
  const text = (
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text)
            .join("")
        : ""
  ).trim()
  if (!text) throw new ProviderFailure("bad_output")
  return { text, tokens: data?.usage?.total_tokens ?? null }
}

/** One call to one model. Throws ProviderFailure. */
export function callModel(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  return m.provider === "gemini" ? gemini(m, c, r) : chat(m, c, r)
}
