import { requireMember, type Caller } from "./auth"
import { aiEnabled, MAX_BODY_BYTES, supabaseEnv } from "./config"
import { AiError, messageFor, NOT_CONFIGURED } from "./errors"
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

/** `staff`: moderators and admins also learn which environment variable turns AI on. */
export function errorResponse(err: unknown, staff = false): Response {
  const e = err instanceof AiError ? err : new AiError(500, "upstream", "Something went wrong on our side. Try again.")
  if (!(err instanceof AiError)) console.error("[ai] unexpected error:", (err as Error)?.message ?? err)
  return Response.json({ error: { code: e.code, message: messageFor(e, staff) } }, { status: e.status, headers: NO_STORE })
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
    let staff = false
    try {
      const caller = await requireMember(request)
      staff = caller.staff
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
      return errorResponse(err, staff)
    }
  }
}

// Streaming

export type StreamIO = {
  /** Send the next piece of text to the reader. */
  onText: (delta: string) => void
  /** The model failed mid-answer and the next one starts over: the reader clears what it shows. */
  onReset: () => void
  /** Aborted when the reader goes away, so the model call stops too. */
  signal: AbortSignal
}

export type StreamDone = {
  model: string
  label?: string
  /** Sources to show as chips: Nexverse items first, then web pages. */
  sources?: { url: string; title: string; kind?: string }[]
  /** Anything else the interface needs (for example a structured part of the answer). */
  extra?: Record<string, unknown>
}

export type AiStreamTask = {
  staffOnly?: boolean
  /** Validate the body (costs nothing on failure) and return the function that streams the answer. */
  prepare: (body: Record<string, unknown>, caller: Caller) => Promise<(io: StreamIO) => Promise<StreamDone>> | ((io: StreamIO) => Promise<StreamDone>)
}

const SSE_HEADERS = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" }

/**
 * Like aiRoute, but the answer streams as server-sent events: `token` ({ t }) for each piece of text,
 * `reset` when a fallback model starts over, then `done` ({ model, label, sources, extra, remaining }) or
 * `error` ({ code, message }). Checks that fail before the stream starts answer with the usual JSON error.
 */
export function aiStreamRoute(task: AiStreamTask) {
  return async function POST(request: Request): Promise<Response> {
    let run: (io: StreamIO) => Promise<StreamDone>
    let caller: Caller
    let remaining: number
    let staff = false
    try {
      caller = await requireMember(request)
      staff = caller.staff
      if (!aiEnabled()) throw new AiError(503, "not_configured", NOT_CONFIGURED)
      const settings = await loadAiSettings()
      if (!settings.enabled) throw new AiError(503, "not_configured", "AI is switched off on this site right now.")
      if (task.staffOnly && !caller.staff) throw new AiError(403, "forbidden", "Only moderators and admins can use this.")
      if (!(await mayUseAi(caller))) throw new AiError(403, "forbidden", "Your account cannot use AI assist yet.")
      const body = await readBody(request)
      run = await task.prepare(body, caller)
      remaining = await consume(caller, settings)
    } catch (err) {
      return errorResponse(err, staff)
    }
    const enc = new TextEncoder()
    const ctrl = new AbortController()
    request.signal.addEventListener("abort", () => ctrl.abort(), { once: true })
    const stream = new ReadableStream<Uint8Array>({
      async start(out) {
        let open = true
        const send = (event: string, data: unknown) => {
          if (!open) return
          try {
            out.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            open = false
          }
        }
        // A first byte at once, so proxies start forwarding and the reader knows the request was accepted.
        send("start", { remaining })
        try {
          const done = await withCaller({ token: caller.token }, () =>
            run({ onText: (t) => send("token", { t }), onReset: () => send("reset", {}), signal: ctrl.signal })
          )
          send("done", { ...done, remaining, aiGenerated: true })
        } catch (err) {
          const e = err instanceof AiError ? err : new AiError(500, "upstream", "Something went wrong on our side. Try again.")
          if (!(err instanceof AiError)) console.error("[ai] unexpected stream error:", (err as Error)?.message ?? err)
          send("error", { code: e.code, message: messageFor(e, staff) })
        } finally {
          open = false
          try {
            out.close()
          } catch {}
        }
      },
      cancel() {
        ctrl.abort()
      },
    })
    return new Response(stream, { headers: SSE_HEADERS })
  }
}
