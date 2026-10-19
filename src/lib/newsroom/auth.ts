import { timingSafeEqual } from "node:crypto"
import { supabaseEnv } from "@/lib/ai/config"
import { memberDb, rpc, serviceDb, type Db } from "./rest"

/*
 * Server only. Who is calling a newsroom route. Either the Vercel cron, proving itself with CRON_SECRET
 * (and then acting as the service role, which needs SUPABASE_SERVICE_ROLE_KEY), or a signed-in editor
 * whose access token we check with Supabase Auth and whose capabilities we ask the database for.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export type Editor = { kind: "member"; id: string; db: Db; canWrite: boolean; canPublish: boolean; staff: boolean }
export type Cron = { kind: "cron"; db: Db; canPublish: true }

function bearer(request: Request): string | null {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+([A-Za-z0-9._~+/=-]{16,4096})$/)
  return m ? m[1] : null
}

/** True when the request carries the cron secret. Compared in constant time; never logged. */
export function isCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  const got = bearer(request)
  if (!secret || secret.length < 16 || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function cronCaller(): Cron {
  const db = serviceDb()
  if (!db) throw new AuthError("The daily newsroom run needs SUPABASE_SERVICE_ROLE_KEY on the server. Editors can still use Collect now.", 503)
  return { kind: "cron", db, canPublish: true }
}

/** A capability check as the member. Before the roles migration, has_cap is missing: fall back to staff. */
async function can(db: Db, cap: string, staff: boolean): Promise<boolean> {
  try {
    return (await rpc<boolean>(db, "has_cap", { cap })) === true
  } catch {
    return staff
  }
}

export async function editorCaller(request: Request, need: "news.write" | "news.publish" | "staff" = "news.write"): Promise<Editor> {
  const token = bearer(request)
  if (!token) throw new AuthError("Sign in to use the newsroom.", 401)
  const env = supabaseEnv()
  const db = memberDb(token)
  if (!env || !db) throw new AuthError("The newsroom needs the database to be connected.", 503)
  let id = ""
  try {
    const res = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.key, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6_000), cache: "no-store" })
    if (res.status === 401 || res.status === 403) throw new AuthError("Your session has expired. Sign in again.", 401)
    if (!res.ok) throw new AuthError("Could not check your sign-in right now. Try again.", 503)
    const user = (await res.json()) as { id?: unknown }
    if (typeof user.id === "string") id = user.id
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError("Could not check your sign-in right now. Try again.", 503)
  }
  if (!id) throw new AuthError("Sign in to use the newsroom.", 401)
  const staff = await rpc<boolean>(db, "is_staff").then((v) => v === true).catch(() => false)
  const [canWrite, canPublish] = await Promise.all([can(db, "news.write", staff), can(db, "news.publish", staff)])
  const ok = need === "staff" ? staff : need === "news.publish" ? canPublish : canWrite
  if (!ok) throw new AuthError(need === "staff" ? "Only moderators and admins can do this." : "Your account cannot work in the newsroom.", 403)
  return { kind: "member", id, db, canWrite, canPublish, staff }
}

/** A tiny per-instance limiter on top of the database's own limits, so a stuck button cannot hammer us. */
const recent = new Map<string, number[]>()
export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= max) {
    recent.set(key, hits)
    return true
  }
  hits.push(now)
  recent.set(key, hits)
  if (recent.size > 2000) for (const [k, v] of recent) if (!v.some((t) => now - t < windowMs)) recent.delete(k)
  return false
}

export const NO_STORE = { "cache-control": "no-store" }

export function fail(err: unknown): Response {
  const status = err instanceof AuthError || (err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number") ? (err as { status: number }).status : 500
  const message = err instanceof Error && status !== 500 ? err.message : "Something went wrong on our side. Try again."
  if (status === 500) console.error("[newsroom]", err instanceof Error ? err.message : err)
  return Response.json({ error: { message } }, { status: status >= 400 && status < 600 ? status : 500, headers: NO_STORE })
}

export async function readBody(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await request.text().catch(() => "")
  if (text.length > maxBytes) throw new AuthError("That request is too large.", 413)
  if (!text) return {}
  try {
    const v = JSON.parse(text) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    throw new AuthError("Send a JSON body.", 400)
  }
}
