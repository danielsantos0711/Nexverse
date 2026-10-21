import type { Credentials } from "./config"
import { THINKING_HEADROOM, type Effort, type ModelInfo, type ProviderId } from "./models"
import { fetchPublicImage } from "./safe-url"

/*
 * Clients for every provider over plain fetch (no SDKs, no new dependencies). Gemini and Anthropic have their
 * own APIs; Groq, Cerebras, OpenRouter, Mistral and Cloudflare speak the OpenAI chat completions format. Every
 * call streams (server-sent events) and is read to the end, so long answers never hit an HTTP timeout and a
 * caller that passes `onText` sees the answer as it is written. Each call either returns the model's text with
 * its token counts and any web sources, or throws a ProviderFailure that says what went wrong, so the router
 * can decide whether to retry, repair or try the next model. Keys only ever travel in request headers;
 * upstream bodies are read for the answer and never passed on or logged.
 */

export type JsonSchema = Record<string, unknown>

/** An earlier turn, for multi-step work (draft, then critique, then revise). */
export type ChatTurn = { role: "user" | "assistant"; content: string }

export type Source = { url: string; title: string }

export type ProviderRequest = {
  system: string
  prompt: string
  history?: ChatTurn[]
  /** https image links (or data: URLs) the model should look at, for models with `vision`. */
  images?: string[]
  maxTokens: number
  temperature?: number
  /** Ask for one JSON object matching this schema. */
  schema?: JsonSchema
  timeoutMs: number
  effort: Effort
  /** Let the provider search the web while answering (Gemini Google Search; Anthropic web search on premium). */
  search?: boolean
  /** Called with each new piece of text as it arrives. */
  onText?: (delta: string) => void
  signal?: AbortSignal
}

export type ProviderAnswer = { text: string; tokensIn: number; tokensOut: number; sources: Source[]; truncated: boolean }

/**
 * rate: 429 or out of free allowance. server: 5xx. timeout/network: no answer. auth: the key was refused.
 * bad_request: the provider would not take this request (model gone, unsupported option). too_large: the
 * input does not fit. bad_output: an answer we cannot use. truncated: the answer hit the token limit.
 * declined: the model or its safety filter refused.
 */
export type FailureKind = "rate" | "server" | "timeout" | "network" | "auth" | "bad_request" | "too_large" | "bad_output" | "truncated" | "declined"

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
  if (status === 404) return new ProviderFailure("bad_request", status)
  if (status >= 500) return new ProviderFailure("server", status)
  return new ProviderFailure("bad_request", status)
}

function signalFor(r: ProviderRequest): AbortSignal {
  const t = AbortSignal.timeout(r.timeoutMs)
  return r.signal ? AbortSignal.any([t, r.signal]) : t
}

async function send(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    })
  } catch (err) {
    const name = (err as Error)?.name
    throw new ProviderFailure(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network")
  }
}

/** Server-sent events from a response body: one `{ event, data }` per block. */
async function* sse(res: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!res.body) return
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, "\n")
      let i: number
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        let event = ""
        const data: string[] = []
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""))
        }
        if (data.length) yield { event, data: data.join("\n") }
      }
    }
  } catch (err) {
    const name = (err as Error)?.name
    throw new ProviderFailure(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network")
  } finally {
    reader.releaseLock()
  }
}

function parse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

/** The schema spelled out in the instructions, for models without native structured output. */
export function schemaInstruction(schema: JsonSchema): string {
  return `Reply with only one JSON object, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(schema)}`
}

/** Output tokens to ask for: the answer's budget plus room to think for reasoning models. */
function outputBudget(m: ModelInfo, r: ProviderRequest): number {
  return r.maxTokens + (m.reasoning ? THINKING_HEADROOM[r.effort] : 0)
}

function addSource(list: Source[], url: unknown, title: unknown) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url) || list.some((s) => s.url === url) || list.length >= 12) return
  list.push({ url: url.slice(0, 500), title: (typeof title === "string" && title.trim() ? title.trim() : new URL(url).hostname).slice(0, 200) })
}

// Gemini (streamGenerateContent)

type GeminiChunk = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
    finishReason?: string
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
  }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

const GEMINI_BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"])

async function geminiImages(images: string[] | undefined) {
  const parts: { inlineData: { mimeType: string; data: string } }[] = []
  for (const url of (images ?? []).slice(0, 6)) {
    const data = url.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i)
    if (data) parts.push({ inlineData: { mimeType: data[1], data: data[2] } })
    else {
      // An image that cannot be fetched is left out rather than failing the whole request.
      const img = await fetchPublicImage(url).catch(() => null)
      if (img) parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } })
    }
  }
  return parts
}

async function gemini(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.model)}:streamGenerateContent?alt=sse`
  const images = await geminiImages(r.images)
  // With live search the schema goes in the prompt: grounding and strict JSON output do not always mix.
  const nativeJson = Boolean(r.schema) && !(r.search && m.search)
  const build = (rich: boolean) => {
    const schemaInPrompt = r.schema && (!rich || !nativeJson)
    const thinking =
      rich && m.reasoning === "gemini3"
        ? { thinkingConfig: { thinkingLevel: r.effort === "high" ? "high" : "low" } }
        : rich && m.reasoning === "gemini25"
          ? { thinkingConfig: { thinkingBudget: r.effort === "high" ? 8192 : r.effort === "medium" ? 4096 : 1024 } }
          : {}
    return {
      systemInstruction: { parts: [{ text: schemaInPrompt ? `${r.system}\n\n${schemaInstruction(r.schema!)}` : r.system }] },
      contents: [
        ...(r.history ?? []).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        { role: "user", parts: [...images, { text: r.prompt }] },
      ],
      ...(rich && r.search && m.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        maxOutputTokens: outputBudget(m, r),
        // Google advises keeping Gemini 3 at its default temperature; only callers that ask set one.
        ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
        ...(r.schema && nativeJson ? { responseMimeType: "application/json" } : {}),
        ...(rich && r.schema && nativeJson ? { responseJsonSchema: r.schema } : {}),
        ...thinking,
      },
    }
  }
  const headers = { "x-goog-api-key": c.key }
  const signal = signalFor(r)
  let res = await send(url, headers, build(true), signal)
  // An option this model does not accept: try once more with the plain request.
  if (res.status === 400) res = await send(url, headers, build(false), signal)
  if (!res.ok) throw failureFor(res.status)

  let text = ""
  let finish = ""
  let tokensIn = 0
  let tokensOut = 0
  const sources: Source[] = []
  for await (const ev of sse(res)) {
    const chunk = parse<GeminiChunk>(ev.data)
    if (!chunk) continue
    if (chunk.promptFeedback?.blockReason) throw new ProviderFailure("declined")
    const cand = chunk.candidates?.[0]
    for (const p of cand?.content?.parts ?? []) {
      if (p.thought || typeof p.text !== "string" || !p.text) continue
      text += p.text
      r.onText?.(p.text)
    }
    for (const g of cand?.groundingMetadata?.groundingChunks ?? []) addSource(sources, g.web?.uri, g.web?.title)
    if (cand?.finishReason) finish = cand.finishReason
    if (chunk.usageMetadata) {
      tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn
      tokensOut = (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0) || tokensOut
    }
  }
  if (GEMINI_BLOCKED.has(finish)) throw new ProviderFailure("declined")
  text = text.trim()
  if (!text) throw new ProviderFailure(finish === "MAX_TOKENS" ? "truncated" : "bad_output")
  return { text, tokensIn, tokensOut, sources, truncated: finish === "MAX_TOKENS" }
}

// Anthropic Messages API (premium only)

type AnthropicEvent = {
  type?: string
  message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
  content_block?: { type?: string; content?: { type?: string; url?: string; title?: string }[] }
  delta?: { type?: string; text?: string; stop_reason?: string; citation?: { url?: string; title?: string } }
  usage?: { output_tokens?: number }
  error?: { type?: string }
}

async function anthropic(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  const images = (r.images ?? []).slice(0, 6).map((url) => {
    const data = url.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i)
    return data ? { type: "image", source: { type: "base64", media_type: data[1], data: data[2] } } : { type: "image", source: { type: "url", url } }
  })
  const nativeJson = Boolean(r.schema) && !r.search
  // Server-side refusal fallback is offered for Opus and Sonnet on the Claude API; Haiku has none.
  const fallback = m.model.startsWith("claude-opus") || m.model.startsWith("claude-sonnet")
  const body = {
    model: m.model,
    max_tokens: outputBudget(m, r),
    stream: true,
    system: r.schema && !nativeJson ? `${r.system}\n\n${schemaInstruction(r.schema)}` : r.system,
    messages: [...(r.history ?? []).map((t) => ({ role: t.role, content: t.content })), { role: "user", content: [...images, { type: "text", text: r.prompt }] }],
    // Thinking is adaptive by default on these models; effort sets how deep it goes.
    output_config: { effort: r.effort, ...(nativeJson ? { format: { type: "json_schema", schema: r.schema } } : {}) },
    ...(r.search ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
    ...(fallback ? { fallbacks: "default" } : {}),
  }
  const headers: Record<string, string> = {
    "x-api-key": c.key,
    "anthropic-version": "2023-06-01",
    ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
  }
  const res = await send("https://api.anthropic.com/v1/messages", headers, body, signalFor(r))
  if (!res.ok) throw failureFor(res.status)
  let text = ""
  let stop = ""
  let tokensIn = 0
  let tokensOut = 0
  const sources: Source[] = []
  for await (const ev of sse(res)) {
    const e = parse<AnthropicEvent>(ev.data)
    if (!e) continue
    if (e.type === "error") throw new ProviderFailure(e.error?.type === "overloaded_error" ? "server" : e.error?.type === "rate_limit_error" ? "rate" : "bad_output")
    if (e.type === "message_start") {
      const u = e.message?.usage
      tokensIn = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0)
    }
    if (e.type === "content_block_start" && e.content_block?.type === "web_search_tool_result") {
      for (const s of e.content_block.content ?? []) addSource(sources, s.url, s.title)
    }
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
      text += e.delta.text
      r.onText?.(e.delta.text)
    }
    if (e.type === "content_block_delta" && e.delta?.type === "citations_delta") addSource(sources, e.delta.citation?.url, e.delta.citation?.title)
    if (e.type === "message_delta") {
      if (e.delta?.stop_reason) stop = e.delta.stop_reason
      if (e.usage?.output_tokens) tokensOut = e.usage.output_tokens
    }
  }
  if (stop === "refusal") throw new ProviderFailure("declined")
  text = text.trim()
  if (!text) throw new ProviderFailure(stop === "max_tokens" ? "truncated" : "bad_output")
  return { text, tokensIn, tokensOut, sources, truncated: stop === "max_tokens" }
}

// OpenAI-compatible chat completions (Groq, Cerebras, OpenRouter, Mistral, Cloudflare)

type ChatChunk = {
  choices?: {
    delta?: { content?: string | null; refusal?: string | null; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { code?: number | string }
}

function endpoint(provider: ProviderId, c: Credentials): { url: string; headers: Record<string, string> } {
  const auth = { authorization: `Bearer ${c.key}` }
  switch (provider) {
    case "groq":
      return { url: "https://api.groq.com/openai/v1/chat/completions", headers: auth }
    case "cerebras":
      return { url: "https://api.cerebras.ai/v1/chat/completions", headers: auth }
    case "openrouter":
    case "openrouterpaid":
      // Optional attribution headers OpenRouter documents for app rankings; they carry no secrets.
      return { url: "https://openrouter.ai/api/v1/chat/completions", headers: { ...auth, "x-title": "Nexverse", "http-referer": "https://nexverse-one.vercel.app" } }
    case "cloudflare":
      return { url: `https://api.cloudflare.com/client/v4/accounts/${c.account}/ai/v1/chat/completions`, headers: auth }
    case "mistral":
      return { url: "https://api.mistral.ai/v1/chat/completions", headers: auth }
    case "gemini":
    case "anthropic":
      throw new Error("This provider uses its own client")
  }
}

async function chat(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  const { url, headers } = endpoint(m.provider, c)
  const images = m.vision ? (r.images ?? []).slice(0, 6) : []
  const build = (rich: boolean) => {
    const native = rich && r.schema ? m.json : "prompt"
    const system = r.schema && native !== "schema" ? `${r.system}\n\n${schemaInstruction(r.schema)}` : r.system
    const tokens = outputBudget(m, r)
    const user = images.length ? [...images.map((u) => ({ type: "image_url", image_url: { url: u } })), { type: "text", text: r.prompt }] : r.prompt
    const effortParam =
      !rich || !m.reasoning
        ? {}
        : m.reasoning === "gpt-oss" && (m.provider === "groq" || m.provider === "cerebras")
          ? { reasoning_effort: r.effort }
          : m.provider === "openrouter" || m.provider === "openrouterpaid"
            ? { reasoning: { effort: r.effort, exclude: true } }
            : {}
    return {
      model: m.model,
      stream: true,
      ...(rich && m.provider !== "cloudflare" ? { stream_options: { include_usage: true } } : {}),
      messages: [{ role: "system", content: system }, ...(r.history ?? []), { role: "user", content: user }],
      ...(m.provider === "groq" || m.provider === "cerebras" ? { max_completion_tokens: tokens } : { max_tokens: tokens }),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(native === "schema" && r.schema ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: r.schema } } } : {}),
      ...(native === "object" ? { response_format: { type: "json_object" } } : {}),
      ...effortParam,
    }
  }
  const signal = signalFor(r)
  let res = await send(url, headers, build(true), signal)
  if (res.status === 400 || res.status === 422) res = await send(url, headers, build(false), signal)
  if (!res.ok) throw failureFor(res.status)

  let text = ""
  let finish = ""
  let tokensIn = 0
  let tokensOut = 0
  let refused = false
  const sources: Source[] = []
  for await (const ev of sse(res)) {
    if (ev.data === "[DONE]") break
    const chunk = parse<ChatChunk>(ev.data)
    if (!chunk) continue
    if (chunk.error) throw failureFor(Number(chunk.error.code) || 500)
    const choice = chunk.choices?.[0]
    const piece = choice?.delta?.content
    if (typeof piece === "string" && piece) {
      text += piece
      r.onText?.(piece)
    }
    if (choice?.delta?.refusal) refused = true
    for (const a of choice?.delta?.annotations ?? []) if (a.type === "url_citation") addSource(sources, a.url_citation?.url, a.url_citation?.title)
    if (choice?.finish_reason) finish = choice.finish_reason
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens ?? tokensIn
      tokensOut = chunk.usage.completion_tokens ?? tokensOut
    }
  }
  if (finish === "content_filter" || refused) throw new ProviderFailure("declined")
  text = text.trim()
  if (!text) throw new ProviderFailure(finish === "length" ? "truncated" : "bad_output")
  // Rough counts when the provider sent none (about four characters a token), so the admin still sees use.
  if (!tokensIn) tokensIn = Math.ceil((r.system.length + r.prompt.length) / 4)
  if (!tokensOut) tokensOut = Math.ceil(text.length / 4)
  return { text, tokensIn, tokensOut, sources, truncated: finish === "length" }
}

/** One call to one model. Throws ProviderFailure. */
export function callModel(m: ModelInfo, c: Credentials, r: ProviderRequest): Promise<ProviderAnswer> {
  if (m.provider === "gemini") return gemini(m, c, r)
  if (m.provider === "anthropic") return anthropic(m, c, r)
  return chat(m, c, r)
}
