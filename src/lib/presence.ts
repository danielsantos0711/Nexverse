import type { RealtimeChannel } from "@supabase/supabase-js"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { localMember } from "@/lib/chat"
import { useSession, type Member } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * Live presence: who is on Nexverse right now and which page they are on. Each signed-in member keeps one row
 * in the `presence` table (their id comes from their session, so nobody can appear as someone else) with the
 * path they are looking at, nothing more (no IP, no query string, no device details). Signed-out visitors
 * are not tracked, and anyone can opt out with a switch that is remembered in this browser. Without a
 * database only you are shown.
 */

export type Visitor = { member: Member; path: string; at: number }

const OPT_OUT_KEY = "nexverse-presence-off"

/**
 * Pages whose address says more than "which page": a conversation id is kept private. Anything that is not a
 * plain internal path (another site, odd characters) becomes the home page.
 */
export function publicPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0] || "/"
  if (!/^\/(?!\/)[A-Za-z0-9/_.%-]*$/.test(path)) return "/"
  if (path.startsWith("/messages")) return "/messages"
  if (path.startsWith("/auth") || path.startsWith("/settings")) return "/settings"
  return path.slice(0, 120)
}

/** What to call a page in the "who is where" list. */
export function pageLabel(path: string) {
  if (path === "/") return "Home"
  const [first, ...rest] = path.slice(1).split("/")
  const section = first.replace(/-/g, " ")
  const name = section.charAt(0).toUpperCase() + section.slice(1)
  if (!rest.length) return name
  const last = decodeURIComponent(rest[rest.length - 1]).replace(/-/g, " ")
  return `${name} · ${last.length > 28 ? `${last.slice(0, 27)}…` : last}`
}

// ─── Opting out ─────────────────────────────────────────────────────────────────────────────────────────────

const optListeners = new Set<() => void>()

function readOptOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1"
  } catch {
    return false
  }
}

export function setPresenceOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1")
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch {}
  for (const l of optListeners) l()
  sync()
}

function subscribeOptOut(l: () => void) {
  optListeners.add(l)
  const onStorage = (e: StorageEvent) => e.key === OPT_OUT_KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    optListeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

export function usePresenceOptOut() {
  return useSyncExternalStore(subscribeOptOut, readOptOut, () => false)
}

// ─── The shared presence table ──────────────────────────────────────────────────────────────────────────────

/** A row counts as online for this long after its last heartbeat (the database applies the same window). */
const WINDOW_MS = 90_000
const HEARTBEAT_MS = 30_000

let visitors: Visitor[] = []
const listeners = new Set<() => void>()
let channel: RealtimeChannel | null = null
let poll: ReturnType<typeof setInterval> | undefined
let beat: ReturnType<typeof setInterval> | undefined
let refs = 0
let closeTimer: ReturnType<typeof setTimeout> | undefined
let reloadTimer: ReturnType<typeof setTimeout> | undefined
let current: { member: Member | null; path: string } = { member: null, path: "/" }
let tracked = ""

function emit() {
  for (const l of listeners) l()
}

type Row = { user_id: string; path: string; seen_at: string; who: { name: string | null } | null }

/**
 * Everyone seen in the last 90 seconds. Ids and names come from the database: each member can only write
 * their own row (the id is their session's), and the name is read from their profile.
 */
async function load() {
  const client = db()
  if (!client) return
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { data, error } = await client
    .from("presence")
    .select("user_id, path, seen_at, who:profiles(name)")
    .gt("seen_at", since)
    .order("seen_at", { ascending: false })
    .limit(200)
  if (error) return
  visitors = ((data ?? []) as unknown as Row[]).map((r) => ({
    member: { id: r.user_id, name: (r.who?.name || "Member").slice(0, 60) },
    path: publicPath(r.path),
    at: Date.parse(r.seen_at) || 0,
  }))
  emit()
}

/** Changes arrive in bursts (several tabs, heartbeats); one reload covers a burst. */
function reloadSoon() {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => void load(), 600)
}

/** Writes this member's row: where they are now. The server stamps the time. */
async function announce() {
  const client = db()
  const m = current.member
  if (!client || !m) return
  await client.from("presence").upsert({ user_id: m.id, path: current.path }, { onConflict: "user_id" })
}

/** Tells everyone where this tab is, or leaves when signed out or opted out. */
function sync() {
  const client = db()
  if (!client || refs === 0) return
  const off = readOptOut()
  const key = off || !current.member ? "" : `${current.member.id}|${current.path}`
  if (key === tracked) return
  const leaving = tracked && !key ? tracked.split("|")[0] : ""
  tracked = key
  clearInterval(beat)
  if (key) {
    void announce().then(reloadSoon)
    beat = setInterval(() => void announce(), HEARTBEAT_MS)
  } else if (leaving) {
    void client.from("presence").delete().eq("user_id", leaving).then(reloadSoon)
  }
}

function open() {
  clearTimeout(closeTimer)
  refs++
  const client = db()
  if (!client || channel) return
  channel = client
    .channel(`presence-table-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, reloadSoon)
    .subscribe()
  // Rows expire by time, which sends no change event: a slow poll drops members who left without a goodbye.
  poll = setInterval(() => void load(), HEARTBEAT_MS)
  void load()
  tracked = ""
  sync()
}

function close() {
  if (--refs > 0) return
  closeTimer = setTimeout(() => {
    const client = db()
    if (channel && client) client.removeChannel(channel)
    channel = null
    clearInterval(poll)
    clearInterval(beat)
    tracked = ""
    visitors = []
    emit()
  }, 400)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const EMPTY: Visitor[] = []

// ─── Hooks ──────────────────────────────────────────────────────────────────────────────────────────────────

export type PresenceState = {
  /** Members online now, most recently active first. Includes you unless you opted out. */
  online: Visitor[]
  me: Member | null
  path: string
  optedOut: boolean
  /** True once we know who you are (signed in or not). */
  ready: boolean
}

/**
 * Joins the site's presence channel and tells it which page you are on. Every component that shows who is
 * online calls this; they share one channel per tab.
 */
export function usePresence(): PresenceState {
  const session = useSession()
  const pathname = usePathname()
  const path = publicPath(pathname ?? "/")
  const optedOut = usePresenceOptOut()
  const localMe = useSyncExternalStore(
    noop,
    () => (live ? null : localMember()),
    () => null
  )
  const memberId = live ? session.member?.id : localMe?.id
  const memberName = live ? session.member?.name : localMe?.name
  const me = useMemo<Member | null>(() => (memberId ? { id: memberId, name: memberName ?? "Member" } : null), [memberId, memberName])

  useEffect(() => {
    if (!live) return
    open()
    return close
  }, [])

  useEffect(() => {
    current = { member: live && session.user ? me : null, path }
    sync()
  }, [me, path, session.user])

  const list = useSyncExternalStore(subscribe, () => visitors, () => EMPTY)

  return useMemo(() => {
    if (!live) {
      return { online: me && !optedOut ? [{ member: me, path, at: 0 }] : [], me, path, optedOut, ready: Boolean(me) }
    }
    return { online: list, me, path, optedOut, ready: session.ready }
  }, [list, me, path, optedOut, session.ready])
}

const noop = () => () => {}
