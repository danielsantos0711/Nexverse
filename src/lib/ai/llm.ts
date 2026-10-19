import { AiError, NOT_CONFIGURED } from "./errors"

/*
 * The one door to a language model. Every caller names the job it needs done; the router behind this picks
 * the best free model that is configured for that job and falls back to the next one when a provider is
 * down or out of free quota. (Stub: the free router replaces the body of these functions.)
 */

export type AiJob = "news" | "summary" | "moderation" | "rewrite" | "translate" | "code" | "playground"

export type LlmOptions = {
  job: AiJob
  system: string
  /** The user turn. Untrusted content inside it must already be wrapped with `fence()`. */
  prompt: string
  maxTokens: number
  /** Playground only: a model id from `listModels()` the member picked. */
  model?: string
}

export type JsonSchema = Record<string, unknown>
export type LlmResult = { model: string; provider: string }

/** Ask for one JSON object that matches `schema`. Throws AiError on any failure. */
export async function askJson(o: LlmOptions & { schema: JsonSchema }): Promise<LlmResult & { json: unknown }> {
  void o
  throw new AiError(503, "not_configured", NOT_CONFIGURED)
}

/** Ask for plain text. Throws AiError on any failure. */
export async function askText(o: LlmOptions): Promise<LlmResult & { text: string }> {
  void o
  throw new AiError(503, "not_configured", NOT_CONFIGURED)
}
