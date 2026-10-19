import { supabaseEnv } from "./config"
import { AiError, NOT_CONFIGURED } from "./errors"

/*
 * Who is calling an AI route. The browser sends its Supabase access token as `Authorization: Bearer`; we ask
 * Supabase Auth who it belongs to, then read the member's role with the same token (profiles are readable by
 * everyone under row level security). Nothing here trusts the browser's claim about its own role.
 */

export type Caller = {
  id: string
  token: string
  role: "member" | "moderator" | "admin"
  staff: boolean
}

const TIMEOUT_MS = 6_000

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? ""
  const m = h.match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/)
  return m ? m[1] : null
}

/** Verify the caller is a signed-in member who is not suspended. Throws 401/403/503 AiErrors. */
export async function requireMember(request: Request): Promise<Caller> {
  const token = bearer(request)
  if (!token) throw new AiError(401, "unauthorized", "Sign in to use AI assist.")
  const env = supabaseEnv()
  if (!env) throw new AiError(503, "not_configured", NOT_CONFIGURED)

  const headers = { apikey: env.key, authorization: `Bearer ${token}` }
  let userId: string | undefined
  try {
    const res = await fetch(`${env.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    if (res.status === 401 || res.status === 403) throw new AiError(401, "unauthorized", "Your session has expired. Sign in again.")
    if (!res.ok) throw new AiError(503, "upstream", "Could not check your sign-in right now. Try again.")
    const user = (await res.json()) as { id?: unknown }
    if (typeof user.id === "string") userId = user.id
  } catch (err) {
    if (err instanceof AiError) throw err
    throw new AiError(503, "upstream", "Could not check your sign-in right now. Try again.")
  }
  if (!userId) throw new AiError(401, "unauthorized", "Sign in to use AI assist.")

  // Role and suspension. Before the roles migration is applied these columns may not exist; treat that as
  // an ordinary member who is not suspended.
  let role: Caller["role"] = "member"
  try {
    const res = await fetch(`${env.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,suspended_until`, {
      headers: { ...headers, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (res.ok) {
      const rows = (await res.json()) as { role?: unknown; suspended_until?: unknown }[]
      const row = rows[0]
      if (row?.role === "moderator" || row?.role === "admin") role = row.role
      if (typeof row?.suspended_until === "string" && new Date(row.suspended_until).getTime() > Date.now()) {
        throw new AiError(403, "suspended", "Your account is suspended, so AI assist is paused.")
      }
    }
  } catch (err) {
    if (err instanceof AiError) throw err
  }
  return { id: userId, token, role, staff: role !== "member" }
}
