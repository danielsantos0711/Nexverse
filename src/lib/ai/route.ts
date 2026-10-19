import { requireMember, type Caller } from "./auth"
import { aiEnabled, MAX_BODY_BYTES, supabaseEnv } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"
import { isObject } from "./json"
import { consume } from "./quota"
import { loadAiSettings, rpc, withCaller } from "./store"

/*
 * The shared shape of every POST /api/ai/* route: check the caller, check AI is configured and switched on,
 * check the member may use AI (has_cap('ai.use') once the roles migration is in), check staff when needed,
 * read a size-capped JSON body, validate it, spend one request from the daily allowance, run the task and
 * answer with `{ data, model, remaining, aiGenerated: true }` or `{ error: { code, message } }`.
 * Errors never include API keys, upstream response bodies or stack traces.
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

/**
 * Whether the caller holds the "ai.use" capability. Until has_cap() exists in the database (or when it cannot
 * be reached) a signed-in member who is not suspended is allowed, as before.
 */
async function mayUseAi(caller: Caller): Promise<boolean> {
  const env = supabaseEnv()
  if (!env) return true
  const r = await rpc("has_cap", { cap: "ai.use" }, { apikey: env.key, authorization: `Bearer ${caller.token}` })
  return r.ok && typeof r.value === "boolean" ? r.value : true
}

export function aiRoute<T>(task: AiTask<T>) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const caller = await requireMember(request)
      if (!aiEnabled()) throw new AiError(503, "not_configured", NOT_CONFIGURED)
      const settings = await loadAiSettings()
      if (!settings.enabled) throw new AiError(503, "not_configured", "AI is switched off on this site right now.")
      if (task.staffOnly && !caller.staff) throw new AiError(403, "forbidden", "Only moderators and admins can use this.")
      if (!(await mayUseAi(caller))) throw new AiError(403, "forbidden", "Your account cannot use AI assist yet.")
      const body = await readBody(request)
      const run = await task.prepare(body, caller)
      const remaining = await consume(caller, settings)
      // The router finds the member's token here, so its counters and cache are written as this member.
      const { data, model } = await withCaller({ token: caller.token }, run)
      return Response.json({ data, model, remaining, aiGenerated: true }, { headers: NO_STORE })
    } catch (err) {
      return errorResponse(err)
    }
  }
}
