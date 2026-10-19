import type { RealtimeChannel } from "@supabase/supabase-js"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { localMember } from "@/lib/chat"
import { useSession, type Member } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * Live presence: who is on Nexverse right now and which page they are on. One Supabase Realtime presence
 * channel per tab carries a signed-in member's id, display name and the path they are looking at, nothing
 * more (no IP, no query string, no device details). Signed-out visitors are not tracked, and anyone can opt
 * out with a switch that is remembered in this browser. Without a database only you are shown.
 */

export type Visitor = { member: Member; path: string; at: number }

const OPT_OUT_KEY = "nexverse-presence-off"
const TOPIC = "presence:site"

/** Pages whose address says more than "which page": a conversation id is kept private. Anything that is not a plain internal path (another site, odd characters) becomes the home page, since paths arrive from other browsers. */
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

// ─── The shared channel ─────────────────────────────────────────────────────────────────────────────────────

let visitors: Visitor[] = []
const listeners = new Set<() => void>()
let channel: RealtimeChannel | null = null
let joined = false
let refs = 0
let closeTimer: ReturnType<typeof setTimeout> | undefined
let current: { member: Member | null; path: string } = { member: null, path: "/" }
let tracked = ""

function emit() {
  for (const l of listeners) l()
}

/**
 * Names come from members' profiles, never from what another browser announces, and ids with no profile are
 * left out, so nobody shows up in "Online now" under a made-up name.
 */
const names = new Map<string, string | null>()
const asking = new Set<string>()

function withProfiles(list: Visitor[]): Visitor[] {
  return list.flatMap((v) => {
    const name = names.get(v.member.id)
    return name ? [{ ...v, member: { id: v.member.id, name } }] : []
  })
}

function lookUp(ids: string[]) {
  const client = db()
  const missing = ids.filter((id) => !names.has(id) && !asking.has(id) && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
  if (!client || !missing.length) return
  for (const id of missing) asking.add(id)
  client
    .from("profiles")
    .select("id, name")
    .in("id", missing)
    .then(({ data }) => {
      for (const id of missing) {
        asking.delete(id)
        names.set(id, null)
      }
      for (const row of (data ?? []) as { id: string; name: string | null }[]) names.set(row.id, (row.name || "Member").slice(0, 60))
      if (channel) {
        visitors = withProfiles(readState(channel))
        emit()
      }
    })
}

/** Everyone in the channel, one row per member (their most recent tab wins). */
function readState(ch: RealtimeChannel): Visitor[] {
  const byMember = new Map<string, Visitor>()
  for (const metas of Object.values(ch.presenceState<{ member?: Member; path?: string; at?: number }>())) {
    for (const m of metas) {
      if (!m.member?.id) continue
      const v: Visitor = { member: { id: String(m.member.id), name: String(m.member.name ?? "Member").slice(0, 60) }, path: publicPath(String(m.path ?? "/")), at: Number(m.at) || 0 }
      const had = byMember.get(v.member.id)
      if (!had || had.at < v.at) byMember.set(v.member.id, v)
    }
  }
  return [...byMember.values()].sort((a, b) => b.at - a.at)
}

/** Tells the channel where this tab is, or leaves it when signed out or opted out. */
function sync() {
  if (!channel || !joined) return
  const off = readOptOut()
  const key = off || !current.member ? "" : `${current.member.id}|${current.member.name}|${current.path}`
  if (key === tracked) return
  tracked = key
  if (!key) channel.untrack().catch(() => {})
  else channel.track({ member: current.member, path: current.path, at: Date.now() }).catch(() => {})
}

function open() {
  clearTimeout(closeTimer)
  refs++
  const client = db()
  if (!client || channel) return
  const tabKey = crypto.randomUUID()
  const ch = client.channel(TOPIC, { config: { presence: { key: tabKey } } })
  ch.on("presence", { event: "sync" }, () => {
    const all = readState(ch)
    lookUp(all.map((v) => v.member.id))
    visitors = withProfiles(all)
    emit()
  }).subscribe((status) => {
    joined = status === "SUBSCRIBED"
    tracked = ""
    if (joined) sync()
  })
  channel = ch
}

function close() {
  if (--refs > 0) return
  closeTimer = setTimeout(() => {
    const client = db()
    if (channel && client) client.removeChannel(channel)
    channel = null
    joined = false
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
