"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useSession } from "@/lib/store"
import { db } from "@/lib/supabase"

/*
 * The signed-in member's site role. The database is the authority (every write is checked by row level
 * security); this hook only decides what the interface shows, such as the admin link and moderation menus.
 */

export type SiteRole = "guest" | "member" | "moderator" | "admin"
export type RoleState = { role: SiteRole; suspendedUntil: string | null; suspended: boolean; ready: boolean }

const SERVER: RoleState = { role: "guest", suspendedUntil: null, suspended: false, ready: false }
let state: RoleState = SERVER
let loadedFor: string | undefined
const listeners = new Set<() => void>()

function set(next: RoleState) {
  state = next
  listeners.forEach((l) => l())
}

async function load(userId: string) {
  const c = db()
  if (!c || !userId) {
    set({ role: userId ? "member" : "guest", suspendedUntil: null, suspended: false, ready: true })
    return
  }
  const { data } = await c.from("profiles").select("role, suspended_until").eq("id", userId).maybeSingle()
  if (loadedFor !== userId) return
  const role = (data?.role as SiteRole | undefined) ?? "member"
  const until = (data?.suspended_until as string | null) ?? null
  set({ role, suspendedUntil: until, suspended: Boolean(until && new Date(until).getTime() > Date.now()), ready: true })
}

/** The current member's role. Guests and browser-only mode count as "guest" and "member". */
export function useRole() {
  const session = useSession()
  const owner = session.ready ? (session.user?.id ?? "") : undefined
  useEffect(() => {
    if (owner === undefined || loadedFor === owner) return
    loadedFor = owner
    set({ ...SERVER })
    void load(owner)
  }, [owner])
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => SERVER
  )
  return {
    ...s,
    isStaff: s.role === "moderator" || s.role === "admin",
    isAdmin: s.role === "admin",
  }
}

// ─── Roles and capabilities, for the admin panel (/admin/roles) ────────────────────────────────────────────
// Every change goes through an admin-only database function that also writes the moderation log.

/** A database error as a sentence; the capabilities migration missing reads as "not set up yet". */
function roleError(error: { code?: string; message: string }) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message)) {
    return "Roles are not set up on this database yet. The capabilities migration needs to be applied."
  }
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) return "Your account is not allowed to do this."
  return error.message.endsWith(".") ? error.message : `${error.message}.`
}

function client() {
  const c = db()
  if (!c) throw new Error("Roles need the database. This copy of Nexverse runs in the browser only.")
  return c
}

export type RoleInput = { key: string; label: string; description: string; color: string; caps: string[]; rank?: number | null }

export async function saveRoleDef(r: RoleInput) {
  const { error } = await client().rpc("save_role_def", {
    role_key: r.key,
    role_label: r.label.trim(),
    role_description: r.description.trim(),
    role_color: r.color,
    role_caps: r.caps,
    role_rank: r.rank ?? null,
  })
  if (error) throw new Error(roleError(error))
}

export async function deleteRoleDef(key: string) {
  const { error } = await client().rpc("delete_role_def", { role_key: key })
  if (error) throw new Error(roleError(error))
}

export async function grantRole(member: string, roleKey: string) {
  const { error } = await client().rpc("grant_role", { member, role_key: roleKey })
  if (error) throw new Error(roleError(error))
}

export async function revokeRole(member: string, roleKey: string) {
  const { error } = await client().rpc("revoke_role", { member, role_key: roleKey })
  if (error) throw new Error(roleError(error))
}

export type TierInput = { key: string; label: string; minPoints: number; caps: string[]; grantsRole: string | null }

export async function saveRepTiers(tiers: TierInput[]) {
  const { error } = await client().rpc("save_rep_tiers", {
    tiers: tiers.map((t) => ({ key: t.key, label: t.label.trim(), min_points: t.minPoints, caps: t.caps, grants_role: t.grantsRole })),
  })
  if (error) throw new Error(roleError(error))
}

export type RoleGrant = { userId: string; roleKey: string; grantedAt: string; member: { id: string; name: string; handle: string | null } | null }

/** Everyone holding an extra role, newest grant first. */
export async function listRoleGrants(limit = 200): Promise<{ grants: RoleGrant[]; error: string | null }> {
  const c = db()
  if (!c) return { grants: [], error: null }
  const { data, error } = await c
    .from("member_roles")
    .select("user_id, role_key, granted_at, member:profiles!member_roles_user_id_fkey(id, name, handle)")
    .order("granted_at", { ascending: false })
    .limit(limit)
  if (error) return { grants: [], error: roleError(error) }
  type Row = { user_id: string; role_key: string; granted_at: string; member: RoleGrant["member"] | RoleGrant["member"][] }
  return {
    grants: (data as unknown as Row[]).map((r) => ({
      userId: r.user_id,
      roleKey: r.role_key,
      grantedAt: r.granted_at,
      member: (Array.isArray(r.member) ? r.member[0] : r.member) ?? null,
    })),
    error: null,
  }
}

// Badges: the roles members show next to their name, fetched in batches and kept for the session.
const badgeCache = new Map<string, string[]>()
let badgeQueue: { ids: Set<string>; wait: Promise<void> } | null = null

/** The roles a member shows as badges (their staff role, granted roles, the role their reputation earned). */
export function memberBadges(id: string): Promise<string[]> {
  const hit = badgeCache.get(id)
  if (hit) return Promise.resolve(hit)
  const c = db()
  if (!c) return Promise.resolve([])
  if (!badgeQueue) {
    const ids = new Set<string>()
    const wait = new Promise<void>((resolve) =>
      setTimeout(async () => {
        badgeQueue = null
        const list = [...ids].slice(0, 100)
        const { data } = await c.rpc("member_badges", { members: list })
        for (const r of (data as { member_id: string; roles: string[] }[] | null) ?? []) badgeCache.set(r.member_id, r.roles ?? [])
        for (const m of list) if (!badgeCache.has(m)) badgeCache.set(m, [])
        resolve()
      }, 30)
    )
    badgeQueue = { ids, wait }
  }
  badgeQueue.ids.add(id)
  return badgeQueue.wait.then(() => badgeCache.get(id) ?? [])
}

/** Forget cached badges, after an admin granted or took away a role. */
export function clearBadgeCache(id?: string) {
  if (id) badgeCache.delete(id)
  else badgeCache.clear()
}
