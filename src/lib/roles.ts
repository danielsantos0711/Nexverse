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
