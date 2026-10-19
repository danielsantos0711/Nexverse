import { requireMember, type Caller } from "./auth"
import { aiEnabled, MAX_BODY_BYTES } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"
import { isObject } from "./json"
import { consume } from "./quota"

/*
 * The shared shape of every POST /api/ai/* route: check the caller, check AI is configured, check staff when
 * needed, read a size-capped JSON body, validate it, spend one request from the daily allowance, run the task
 * and answer with `{ data, model, remaining, aiGenerated: true }` or `{ error: { code, message } }`.
 * Errors never include the API key, upstream response bodies or stack traces.
 */

export type AiTask<T> = {
  staffOnly?: boolean
  /** Validate the body and return a function that runs the task. Validation errors cost nothing. */
  prepare: (body: Record<string, unknown>, caller: Caller) => Promise<() => Promise<{ data: T; model: string }>> | (() => Promise<{ data: T; model: string }>)
}

const NO_STORE = { "cache-control": "no-store" }

export function errorResponse(err: unknown): Response {
  const e = err instanceof AiError ? err : new AiError(500, "upstream", "Something went wrong on our side. Try again.")
  if (!(err instanceof AiError)) console.error("[ai] unexpected error:", (err as Error)?.message ?? err)
  return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: NO_STORE })
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > MAX_BODY_BYTES) throw new AiError(413, "too_large", "That is too much text for AI assist.")
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new AiError(413, "too_large", "That is too much text for AI assist.")
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new AiError(400, "bad_request", "Send a JSON body.")
  }
  if (!isObject(body)) throw new AiError(400, "bad_request", "Send a JSON object.")
  return body
}

export function aiRoute<T>(task: AiTask<T>) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const caller = await requireMember(request)
      if (!aiEnabled()) throw new AiError(503, "not_configured", NOT_CONFIGURED)
      if (task.staffOnly && !caller.staff) throw new AiError(403, "forbidden", "Only moderators and admins can use this.")
      const body = await readBody(request)
      const run = await task.prepare(body, caller)
      const remaining = await consume(caller)
      const { data, model } = await run()
      return Response.json({ data, model, remaining, aiGenerated: true }, { headers: NO_STORE })
    } catch (err) {
      return errorResponse(err)
    }
  }
}
