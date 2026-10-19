import { supabaseEnv } from "@/lib/ai/config"

/*
 * Server only. A small PostgREST client for the newsroom routes, acting either as the service role (the
 * daily cron, when SUPABASE_SERVICE_ROLE_KEY is set) or as the signed-in editor with their own access token
 * (the "Collect now" button), so row level security applies exactly as it would in the browser. The keys
 * never leave the server and never appear in errors.
 */

export type Db = { url: string; headers: Record<string, string>; as: "service" | "member" }

/** The service role, when its key is configured; otherwise null. */
export function serviceDb(): Db | null {
  const env = supabaseEnv()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!env || !key) return null
  // New-style secret keys (sb_secret_…) are not JWTs: they go in the apikey header only.
  const headers: Record<string, string> = key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` }
  return { url: env.url, headers, as: "service" }
}

export function memberDb(token: string): Db | null {
  const env = supabaseEnv()
  if (!env) return null
  return { url: env.url, headers: { apikey: env.key, authorization: `Bearer ${token}` }, as: "member" }
}

/** Anyone: the publishable key, for public reads. */
export function publicDb(): Db | null {
  const env = supabaseEnv()
  if (!env) return null
  return { url: env.url, headers: { apikey: env.key }, as: "member" }
}

export class DbError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = ""
  ) {
    super(message)
  }
}

/** True when the table or function is not in the database yet (the migration is not applied). */
export const isMissing = (e: unknown) => e instanceof DbError && (e.status === 404 || ["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code))

async function call<T>(db: Db, path: string, init: { method?: string; body?: unknown; prefer?: string; timeout?: number } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${db.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...db.headers,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeout ?? 10_000),
      cache: "no-store",
    })
  } catch {
    throw new DbError("The database did not answer in time.", 503)
  }
  const raw = await res.text()
  let json: unknown = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const j = (json ?? {}) as { message?: string; code?: string }
    // Our own triggers raise readable messages (P0001); anything else stays generic.
    const message = j.code === "P0001" && j.message ? j.message : res.status === 401 || res.status === 403 || j.code === "42501" ? "Not allowed." : `Database error ${res.status}${j.code ? ` (${j.code})` : ""}.`
    throw new DbError(message, res.status, j.code ?? "")
  }
  return json as T
}

export const select = <T>(db: Db, table: string, query: string) => call<T[]>(db, `/rest/v1/${table}?${query}`)

export const insert = <T>(db: Db, table: string, rows: unknown, { ignoreDuplicates = false, returning = true, onConflict = "" } = {}) =>
  call<T[]>(db, `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
    method: "POST",
    body: rows,
    prefer: [returning ? "return=representation" : "return=minimal", ignoreDuplicates ? "resolution=ignore-duplicates" : ""].filter(Boolean).join(","),
  })

export const update = <T>(db: Db, table: string, query: string, patch: unknown) =>
  call<T[]>(db, `/rest/v1/${table}?${query}`, { method: "PATCH", body: patch, prefer: "return=representation" })

export const rpc = <T>(db: Db, fn: string, args: Record<string, unknown> = {}) => call<T>(db, `/rest/v1/rpc/${fn}`, { method: "POST", body: args })

/** PostgREST "in" filter of quoted values. */
export const inList = (values: string[]) => `(${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")})`
