/*
 * Server side of Nexverse Code: talks to Supabase's REST, RPC and Storage APIs *as the member*, with the access
 * token their browser sent. No service key is used, so row level security and the storage policies apply exactly
 * as they do in the browser. Only route handlers under src/app/api/code import this file.
 */

export class CodeError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15_000

export function supabase(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) throw new CodeError(503, "Code hosting needs the site's database, and it is not connected here.")
  return { url: url.replace(/\/+$/, ""), key }
}

export type Member = { id: string; token: string; handle: string | null }

function bearer(request: Request): string | null {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/)
  return m ? m[1] : null
}

/** The signed-in member behind the request, checked with Supabase Auth. */
export async function member(request: Request): Promise<Member> {
  const token = bearer(request)
  if (!token) throw new CodeError(401, "Sign in first.")
  const env = supabase()
  let res: Response
  try {
    res = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.key, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
  } catch {
    throw new CodeError(503, "Could not check your sign-in right now. Try again.")
  }
  if (res.status === 401 || res.status === 403) throw new CodeError(401, "Your session has expired. Sign in again.")
  if (!res.ok) throw new CodeError(503, "Could not check your sign-in right now. Try again.")
  const user = (await res.json()) as { id?: unknown }
  if (typeof user.id !== "string") throw new CodeError(401, "Sign in first.")
  const rows = await rest<{ handle: string | null }[]>({ id: user.id, token, handle: null }, `profiles?id=eq.${user.id}&select=handle`).catch(() => [])
  return { id: user.id, token, handle: rows[0]?.handle ?? null }
}

function headers(m: Member, extra: Record<string, string> = {}) {
  const env = supabase()
  return { apikey: env.key, authorization: `Bearer ${m.token}`, ...extra }
}

/** Turns a PostgREST error body into a member-facing message. */
async function why(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null
  const msg = body?.message ?? ""
  if (/code_repos_owner_slug_key|duplicate key/.test(msg)) return "You already have a repository with that name. Pick another name."
  if (/row-level security/.test(msg)) return "You are not allowed to do that. Check that your account can create repositories."
  if (/schema cache|does not exist/.test(msg)) return "Code hosting is still being switched on for this site. Try again soon."
  return msg.slice(0, 300) || `Request failed (${res.status}).`
}

export async function rest<T>(m: Member, path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const env = supabase()
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: headers(m, { "content-type": "application/json", accept: "application/json", ...(init.prefer ? { prefer: init.prefer } : {}) }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw new CodeError(res.status === 401 ? 401 : 400, await why(res))
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const rpc = <T>(m: Member, fn: string, args: Record<string, unknown>) => rest<T>(m, `rpc/${fn}`, { method: "POST", body: args })

/** Uploads one blob to "code/<repo>/<sha>". An object that is already there counts as uploaded. */
export async function putBlob(m: Member, repoId: string, sha: string, data: Uint8Array) {
  const env = supabase()
  const body = new Blob([data.slice().buffer], { type: "application/octet-stream" })
  const res = await fetch(`${env.url}/storage/v1/object/code/${repoId}/${sha}`, {
    method: "POST",
    headers: headers(m, { "content-type": "application/octet-stream", "x-upsert": "false" }),
    body,
    signal: AbortSignal.timeout(60_000),
  })
  if (res.ok || res.status === 409) return
  const text = await res.text().catch(() => "")
  if (/exists|Duplicate/i.test(text)) return
  throw new CodeError(400, res.status === 403 || /policy|row-level/i.test(text) ? "Storage refused the upload (you may have uploaded too much in the last hour)." : "Storage refused a file. Try again later.")
}

export const NO_STORE = { "cache-control": "no-store" }

export function errorJson(err: unknown): Response {
  const e = err instanceof CodeError ? err : new CodeError(500, "Something went wrong on our side. Try again.")
  if (!(err instanceof CodeError)) console.error("[code] unexpected error:", (err as Error)?.message ?? err)
  return Response.json({ error: { message: e.message } }, { status: e.status, headers: NO_STORE })
}
