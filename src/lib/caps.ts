"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useRole, type SiteRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/*
 * What the signed-in member may do. The database is the authority: every write is checked with
 * `public.has_cap(cap)` (supabase/migrations/20261019121000_capabilities.sql). This hook only decides what the
 * interface shows and explains: the member's capabilities come from `my_standing()` (their roles, the roles an
 * admin granted them and the reputation tiers they reached). While that function is missing from the database,
 * it falls back to a plain role check.
 */

export const CAPS = [
  "thread.create",
  "reply.create",
  "link.post",
  "submission.create",
  "project.create",
  "collection.create",
  "event.create",
  "mission.create",
  "launch.create",
  "duel.create",
  "crew.create",
  "room.create",
  "room.post",
  "message.send",
  "repo.create",
  "issue.create",
  "news.tip",
  "news.write",
  "news.publish",
  "pages.edit",
  "menus.edit",
  "forum.manage",
  "chat.manage",
  "moderate",
  "members.manage",
  "roles.manage",
  "settings.manage",
  "ai.use",
] as const
export type Cap = (typeof CAPS)[number]

export const isCap = (s: string): s is Cap => (CAPS as readonly string[]).includes(s)

export type CapGroup = "Talk" | "Share" | "Create" | "Code" | "News and pages" | "Run the site"

/** Each capability in plain words: a label for lists, and the verb for "Reach 100 reputation to …". */
export const CAP_INFO: Record<Cap, { label: string; verb: string; group: CapGroup }> = {
  "thread.create": { label: "Start forum threads", verb: "start a thread", group: "Talk" },
  "reply.create": { label: "Reply and comment", verb: "reply", group: "Talk" },
  "room.post": { label: "Talk in chat rooms", verb: "talk in chat", group: "Talk" },
  "message.send": { label: "Send direct messages", verb: "send messages", group: "Talk" },
  "ai.use": { label: "Use the free AI tools", verb: "use the AI tools", group: "Talk" },
  "link.post": { label: "Post outside links", verb: "post links", group: "Share" },
  "submission.create": { label: "Share models, tools and results", verb: "share something", group: "Share" },
  "collection.create": { label: "Make collections", verb: "start a collection", group: "Share" },
  "news.tip": { label: "Send news tips", verb: "send a news tip", group: "Share" },
  "project.create": { label: "Publish projects", verb: "publish a project", group: "Create" },
  "event.create": { label: "Host events", verb: "host an event", group: "Create" },
  "mission.create": { label: "Post missions", verb: "post a mission", group: "Create" },
  "launch.create": { label: "Schedule launches", verb: "schedule a launch", group: "Create" },
  "duel.create": { label: "Start arena duels", verb: "start a duel", group: "Create" },
  "crew.create": { label: "Start crews", verb: "start a crew", group: "Create" },
  "room.create": { label: "Open chat rooms", verb: "open a chat room", group: "Create" },
  "repo.create": { label: "Create code repositories", verb: "create a repository", group: "Code" },
  "issue.create": { label: "Open issues on repositories", verb: "open an issue", group: "Code" },
  "news.write": { label: "Write news stories", verb: "write news", group: "News and pages" },
  "news.publish": { label: "Approve and publish news", verb: "publish news", group: "News and pages" },
  "pages.edit": { label: "Edit the site's pages", verb: "edit pages", group: "News and pages" },
  "menus.edit": { label: "Edit menus", verb: "edit menus", group: "News and pages" },
  "forum.manage": { label: "Manage forum categories", verb: "manage the forum", group: "Run the site" },
  "chat.manage": { label: "Manage chat rooms", verb: "manage chat", group: "Run the site" },
  moderate: { label: "Moderate: reports, hiding, pausing", verb: "moderate", group: "Run the site" },
  "members.manage": { label: "Manage members", verb: "manage members", group: "Run the site" },
  "roles.manage": { label: "Manage roles and powers", verb: "manage roles", group: "Run the site" },
  "settings.manage": { label: "Change site settings", verb: "change site settings", group: "Run the site" },
}

export const CAP_GROUPS: CapGroup[] = ["Talk", "Share", "Create", "Code", "News and pages", "Run the site"]

/** Powers the database ties to the base roles: moderators always moderate, the rest are for admins only. */
export const STAFF_CAPS: Cap[] = ["moderate", "members.manage", "roles.manage", "settings.manage"]

export type RoleDef = { key: string; label: string; description: string; color: string; caps: string[]; builtin: boolean; rank: number }
export type Tier = { key: string; label: string; minPoints: number; caps: string[]; grantsRole: string | null }

/** The same defaults the migration seeds, used before the database answers or when it has no roles yet. */
export const DEFAULT_ROLES: RoleDef[] = [
  { key: "member", label: "Member", description: "", color: "#949cad", builtin: true, rank: 0, caps: ["thread.create", "reply.create", "room.post", "message.send", "news.tip", "ai.use", "collection.create", "issue.create"] },
  { key: "contributor", label: "Contributor", description: "", color: "#7fe0b0", builtin: true, rank: 20, caps: ["link.post", "submission.create", "project.create", "repo.create", "event.create", "mission.create", "launch.create", "duel.create", "crew.create"] },
  { key: "editor", label: "Editor", description: "", color: "#d8c59e", builtin: true, rank: 40, caps: ["news.write", "news.publish", "pages.edit", "menus.edit", "link.post", "submission.create", "project.create", "repo.create"] },
  {
    key: "moderator",
    label: "Moderator",
    description: "",
    color: "#8fb4ff",
    builtin: true,
    rank: 60,
    caps: ["moderate", "forum.manage", "chat.manage", "room.create", "link.post", "submission.create", "project.create", "repo.create", "event.create", "mission.create", "launch.create", "duel.create", "crew.create"],
  },
  { key: "admin", label: "Admin", description: "", color: "#ffb4e6", builtin: true, rank: 100, caps: [...CAPS] },
]

export const DEFAULT_TIERS: Tier[] = [
  { key: "stardust", label: "Stardust", minPoints: 0, caps: [], grantsRole: null },
  { key: "comet", label: "Comet", minPoints: 25, caps: ["link.post", "submission.create", "project.create", "repo.create"], grantsRole: null },
  { key: "planet", label: "Planet", minPoints: 100, caps: ["event.create", "mission.create", "launch.create", "duel.create", "crew.create"], grantsRole: null },
  { key: "star", label: "Star", minPoints: 300, caps: [], grantsRole: "contributor" },
]

/** Where "how reputation works" is explained. */
export const REPUTATION_HELP = "/leaderboard#how-points"

// ─── The member's standing, loaded once per account and shared by every component ─────────────────────────

export type Standing = {
  /** False while the capabilities migration is missing: `can` is then a plain role check. */
  real: boolean
  caps: Set<string>
  points: number
  /** Extra roles: granted by an admin, then earned by reputation. */
  roles: string[]
  earned: string[]
}

type Store = { ready: boolean; owner: string; standing: Standing | null; roles: RoleDef[]; tiers: Tier[] }

const EMPTY: Store = { ready: false, owner: "", standing: null, roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS }
let store: Store = EMPTY
let loadedFor: string | undefined
const listeners = new Set<() => void>()

function set(next: Store) {
  store = next
  listeners.forEach((l) => l())
}

type RoleRow = { key: string; label: string; description: string; color: string; caps: string[]; builtin: boolean; rank: number }
type TierRow = { key: string; label: string; min_points: number; caps: string[]; grants_role: string | null }

export const toTier = (r: TierRow): Tier => ({ key: r.key, label: r.label, minPoints: r.min_points, caps: r.caps ?? [], grantsRole: r.grants_role })

/** The roles and tiers everyone can read. Missing tables fall back to the defaults. */
export async function loadRoleDefs(): Promise<{ roles: RoleDef[]; tiers: Tier[]; ok: boolean }> {
  const c = db()
  if (!c) return { roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS, ok: false }
  const [r, t] = await Promise.all([
    c.from("role_defs").select("key, label, description, color, caps, builtin, rank").order("rank", { ascending: false }),
    c.from("rep_tiers").select("key, label, min_points, caps, grants_role").order("min_points"),
  ])
  if (r.error || t.error) return { roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS, ok: false }
  return { roles: (r.data as RoleRow[]).map((x) => ({ ...x, caps: x.caps ?? [] })), tiers: (t.data as TierRow[]).map(toTier), ok: true }
}

async function load(owner: string) {
  const c = db()
  if (!c || !owner) {
    set({ ...EMPTY, ready: true, owner })
    return
  }
  const [defs, me] = await Promise.all([loadRoleDefs(), c.rpc("my_standing")])
  if (loadedFor !== owner) return
  const s = me.data as { caps?: string[]; points?: number; roles?: string[]; earned?: string[] } | null
  const standing: Standing | null =
    me.error || !s ? null : { real: true, caps: new Set(s.caps ?? []), points: Number(s.points ?? 0), roles: s.roles ?? [], earned: s.earned ?? [] }
  set({ ready: true, owner, standing, roles: defs.roles, tiers: defs.tiers })
}

/** Loads the member's standing again, after an admin changed roles or tiers. */
export function refreshCaps() {
  if (loadedFor === undefined) return
  void load(loadedFor)
}

function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => store,
    () => EMPTY
  )
}

// ─── The hook ───────────────────────────────────────────────────────────────────────────────────────────────

const STAFF_ONLY: Cap[] = ["news.write", "news.publish", "pages.edit", "menus.edit", "forum.manage", "chat.manage", "moderate", "members.manage", "roles.manage", "settings.manage", "room.create"]

/** Why a member can or cannot do something. */
export type Why =
  | { ok: true }
  | { ok: false; reason: "loading" | "guest" | "suspended" }
  | { ok: false; reason: "reputation"; need: number; have: number; tier: string }
  | { ok: false; reason: "role"; roles: string[] }

const plural = (label: string) => (/s$/i.test(label) ? label : `${label}s`).toLowerCase()

/** "editors or moderators", for "Only … can". */
export function rolesSentence(labels: string[]) {
  const words = labels.map(plural)
  if (words.length <= 1) return words[0] ?? "the team"
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`
}

/**
 * `can(cap)`: whether to show a form. `why(cap)`: the reason when not, for a clear message. `tier`/`next`: the
 * reputation tier the member holds and the one after it. Guests and paused members can do nothing.
 */
export function useCaps() {
  const me = useRole()
  const session = useSession()
  const s = useStore()
  const owner = session.ready ? (session.user?.id ?? "") : undefined

  useEffect(() => {
    if (owner === undefined || loadedFor === owner) return
    loadedFor = owner
    set({ ...EMPTY })
    void load(owner)
  }, [owner])

  const standing = s.ready && s.owner === owner ? s.standing : null
  const ready = me.ready && (!live || (s.ready && s.owner === owner))

  const stub = (cap: Cap) => {
    if (me.role === "guest" || (me.suspended && !me.isAdmin)) return false
    if (me.isAdmin) return true
    if (STAFF_ONLY.includes(cap)) return me.isStaff && !["roles.manage", "settings.manage", "members.manage"].includes(cap)
    return true
  }

  const can = (cap: Cap) => {
    if (!live) return !STAFF_ONLY.includes(cap)
    if (me.role === "guest") return false
    if (me.isAdmin) return true
    if (me.suspended) return false
    return standing ? standing.caps.has(cap) : stub(cap)
  }

  const points = standing?.points ?? 0
  const tiers = [...s.tiers].sort((a, b) => a.minPoints - b.minPoints)
  const tierIndex = tiers.reduce((i, t, n) => (points >= t.minPoints ? n : i), 0)
  const tier = tiers[tierIndex] ?? null
  const next = tiers[tierIndex + 1] ?? null

  /** The lowest tier whose powers (or the role it hands out) include the capability. */
  const tierFor = (cap: Cap) =>
    tiers.find((t) => t.caps.includes(cap) || (t.grantsRole && s.roles.find((r) => r.key === t.grantsRole)?.caps.includes(cap))) ?? null

  const why = (cap: Cap): Why => {
    if (!ready) return { ok: false, reason: "loading" }
    if (can(cap)) return { ok: true }
    if (me.role === "guest") return { ok: false, reason: "guest" }
    if (me.suspended) return { ok: false, reason: "suspended" }
    const t = tierFor(cap)
    if (t && t.minPoints > points && !STAFF_CAPS.includes(cap)) return { ok: false, reason: "reputation", need: t.minPoints, have: points, tier: t.label }
    const holders = s.roles
      .filter((r) => r.key !== "member" && (r.key === "admin" || r.caps.includes(cap)))
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.label)
    return { ok: false, reason: "role", roles: holders.length ? holders : ["Admin"] }
  }

  /** What reaching the next tier unlocks that the member does not have yet. */
  const unlocksNext = next ? CAPS.filter((c) => !can(c) && tierFor(c)?.key === next.key) : []

  return {
    ready,
    can,
    why,
    /** True when the answers come from the database's capability check, not the role fallback. */
    real: Boolean(standing?.real),
    points,
    tier,
    next,
    unlocksNext,
    tiers,
    roles: s.roles,
    /** Extra roles the member holds: granted by an admin or earned with reputation. */
    myRoles: [...new Set([...(standing?.roles ?? []), ...(standing?.earned ?? [])])],
    base: me.role as SiteRole,
  }
}

/** A role colour lifted toward white until it reads well as text on the site's dark background. */
export function readableColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return "#c9cfdb"
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  const lum = () => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  // 0.3 relative luminance gives at least 7:1 against #05060a.
  for (let i = 0; i < 12 && lum() < 0.3; i++) [r, g, b] = [r, g, b].map((v) => Math.round(v + (255 - v) * 0.2))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}
