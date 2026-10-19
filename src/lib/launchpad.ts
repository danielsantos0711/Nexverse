import type { Member } from "@/lib/store"
import { isUuid, type Who } from "@/lib/community"
import { db, live } from "@/lib/supabase"

/**
 * The Launchpad: a member schedules a launch for one of their published projects. Before launch
 * time there is a countdown; for the 24 hours after it, members boost it (once each) on a live board; then it
 * joins the archive. The launch with the most boosts among those launched on a day (UTC) is that day's
 * "Launch of the day".
 *
 * With a database everything is in public.launches and public.launch_boosts, and boosts arrive live through
 * Realtime. Without one (a browser-only copy), only the launches you schedule here are shown, and they stay in
 * this browser (other tabs hear about them straight away).
 */

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message))
    return "You are not allowed to do that. Check that you are signed in; if your account is paused, posting stays off until the pause ends (your notifications say why)."
  if (/launch_boosts_pkey|duplicate key/.test(message)) return "You already boosted this launch."
  if (/launches_gallery_check/.test(message)) return "Gallery pictures must be ones you uploaded here."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/schema cache|does not exist/.test(message)) return "The Launchpad is still being switched on for this site. Try again soon."
  return message
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error("This browser would not save that. Free some storage or allow site data, then try again.")
  }
}

async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await me()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

const memberWho = (m: Member | null | undefined): Who => (m ? { name: m.name, memberId: m.id } : { name: "A member" })

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export const LAUNCH_DAY_MS = 864e5

export type LaunchPhase = "scheduled" | "live" | "landed"

export type Launch = {
  id: string
  name: string
  tagline: string
  description: string
  launchAt: string
  /** Picture URLs in the owner's folder of the avatars bucket. */
  gallery: string[]
  owner: Who
  /** The member's project being launched, or null. */
  projectId: string | null
  /** Older launches pointed at a hub entry ("tool:token-tax") instead of a project. Kept for display only. */
  resource: string | null
  boosts: number
  /** You boosted it. */
  boosted: boolean
  /** @deprecated Always empty: there are no sample launches any more. */
  seedBoosters: string[]
  /** @deprecated Always false. */
  sample: boolean
  local: boolean
}

export const LIMITS = {
  name: [2, 80],
  tagline: [10, 140],
  description: 4000,
  gallery: 6,
  daysAhead: 90,
} as const

export function launchPhase(l: Pick<Launch, "launchAt">, now: number): LaunchPhase {
  const at = Date.parse(l.launchAt)
  if (now < at) return "scheduled"
  if (now < at + LAUNCH_DAY_MS) return "live"
  return "landed"
}

/** The UTC day a launch belongs to, as "2026-10-18". */
export const dayKey = (iso: string | number) => new Date(iso).toISOString().slice(0, 10)

/** Where the launched thing lives on Nexverse: its project page. */
export function subjectOf(l: Pick<Launch, "projectId" | "resource">): { href: string; label: string } | null {
  if (l.projectId) return { href: `/p/${l.projectId}`, label: "Project page" }
  return null
}

/** The winner among launches dated `day`: most boosts, then the earlier launch. Only launches that have started. */
export function launchOfTheDay(launches: Launch[], day: string, now: number): Launch | null {
  let best: Launch | null = null
  for (const l of launches) {
    if (dayKey(l.launchAt) !== day || launchPhase(l, now) === "scheduled") continue
    if (!best || l.boosts > best.boosts || (l.boosts === best.boosts && l.launchAt < best.launchAt)) best = l
  }
  return best
}

/** Each past day's winner (days whose launches have all landed or are flying), newest first. */
export function dailyWinners(launches: Launch[], now: number): { day: string; winner: Launch; others: Launch[] }[] {
  const byDay = new Map<string, Launch[]>()
  for (const l of launches) {
    if (launchPhase(l, now) !== "landed") continue
    const d = dayKey(l.launchAt)
    byDay.set(d, [...(byDay.get(d) ?? []), l])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => {
      const sorted = [...list].sort((a, b) => b.boosts - a.boosts || a.launchAt.localeCompare(b.launchAt))
      return { day, winner: sorted[0], others: sorted.slice(1) }
    })
}

// ─── Deprecated sample exports ──────────────────────────────────────────────────────────────────────────────

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const LAUNCHES_KEY = "nexverse-launches"
const BOOSTS_KEY = "nexverse-launch-boosts"
const CHANNEL = "nexverse-launchpad"

type LocalLaunch = Pick<Launch, "id" | "name" | "tagline" | "description" | "launchAt" | "projectId" | "resource">

const readLaunches = () => readLocal<LocalLaunch[]>(LAUNCHES_KEY, []).filter((l) => l && typeof l.id === "string")
const readBoosts = () => readLocal<string[]>(BOOSTS_KEY, [])

const fromLocal = (l: LocalLaunch): Launch => ({
  ...l,
  gallery: [],
  owner: { name: "You" },
  boosts: 0,
  boosted: false,
  seedBoosters: [],
  sample: false,
  local: true,
})

function withLocalBoost(l: Launch, boosts = readBoosts()): Launch {
  return boosts.includes(l.id) ? { ...l, boosts: l.boosts + 1, boosted: true } : l
}

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const COLUMNS = "id, name, tagline, description, launch_at, gallery, project_id, resource, owner:profiles!launches_owner_id_fkey(id, name), boosts:launch_boosts(count)"

type Row = {
  id: string
  name: string
  tagline: string
  description: string
  launch_at: string
  gallery: string[] | null
  project_id: string | null
  resource: string | null
  owner: Member | null
  boosts: { count: number }[] | null
}

const fromRow = (r: Row, mine: Set<string>): Launch => ({
  id: r.id,
  name: r.name,
  tagline: r.tagline,
  description: r.description,
  launchAt: r.launch_at,
  gallery: r.gallery ?? [],
  owner: memberWho(r.owner),
  projectId: r.project_id,
  resource: r.resource,
  boosts: r.boosts?.[0]?.count ?? 0,
  boosted: mine.has(r.id),
  seedBoosters: [],
  sample: false,
  local: false,
})

async function myBoosts(ids: string[]): Promise<Set<string>> {
  const client = db()
  const userId = await me()
  if (!client || !userId || !ids.length) return new Set()
  const { data, error } = await client.from("launch_boosts").select("launch_id").eq("user_id", userId).in("launch_id", ids.slice(0, 300))
  fail(error)
  return new Set((data as { launch_id: string }[]).map((r) => r.launch_id))
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

/** Launches from 60 days ago to 90 days ahead, soonest first. Without a database: the ones scheduled here. */
export async function listLaunches(): Promise<Launch[]> {
  const client = db()
  if (!client) {
    const boosts = readBoosts()
    return readLaunches()
      .map((l) => withLocalBoost(fromLocal(l), boosts))
      .sort((a, b) => a.launchAt.localeCompare(b.launchAt))
  }
  const since = new Date(Date.now() - 60 * LAUNCH_DAY_MS).toISOString()
  const { data, error } = await client.from("launches").select(COLUMNS).gte("launch_at", since).order("launch_at").limit(400)
  fail(error)
  const rows = data as unknown as Row[]
  const mine = await myBoosts(rows.map((r) => r.id))
  return rows.map((r) => fromRow(r, mine))
}

export async function getLaunch(id: string): Promise<Launch | null> {
  const client = db()
  if (!client) {
    const l = readLaunches().find((x) => x.id === id)
    return l ? withLocalBoost(fromLocal(l)) : null
  }
  if (!isUuid(id)) return null
  const { data, error } = await client.from("launches").select(COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  if (!data) return null
  return fromRow(data as unknown as Row, await myBoosts([id]))
}

/** Members who boosted a launch, newest first. */
export async function getBoosters(l: Launch, limit = 24): Promise<Who[]> {
  const client = db()
  if (!client) return l.boosted ? [{ name: "You" }] : []
  const { data, error } = await client.from("launch_boosts").select("member:profiles(id, name)").eq("launch_id", l.id).order("created_at", { ascending: false }).limit(limit)
  fail(error)
  return (data as unknown as { member: Member | null }[]).map((r) => memberWho(r.member))
}

// ─── Scheduling ─────────────────────────────────────────────────────────────────────────────────────────────

export type NewLaunch = {
  /** One of your published projects. ("resource" is how older launches pointed at hub entries; it is refused now.) */
  subject: { type: "project"; id: string; name: string } | { type: "resource"; key: string; name: string }
  tagline: string
  description: string
  launchAt: string
  gallery: string[]
}

export type LaunchErrors = Partial<Record<"subject" | "tagline" | "description" | "launchAt" | "gallery" | "form", string>>

export const GALLERY_URL = /^https:\/\/[^/\s]+\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/

export function validateLaunch(l: NewLaunch, now = Date.now()): LaunchErrors {
  const e: LaunchErrors = {}
  if (l.subject.type !== "project" || !l.subject.id || !l.subject.name.trim()) e.subject = "Pick the project you are launching."
  const tagline = l.tagline.trim()
  if (tagline.length < LIMITS.tagline[0]) e.tagline = "Write a tagline of at least 10 characters: what it does, for whom."
  else if (tagline.length > LIMITS.tagline[1]) e.tagline = "Keep the tagline to 140 characters."
  if (l.description.length > LIMITS.description) e.description = "Keep the description under 4,000 characters."
  const at = Date.parse(l.launchAt)
  if (!Number.isFinite(at)) e.launchAt = "Pick a launch date and time."
  else if (at < now + 10 * 60_000) e.launchAt = "Pick a time at least 10 minutes from now."
  else if (at > now + LIMITS.daysAhead * LAUNCH_DAY_MS) e.launchAt = "Launches can be scheduled up to 90 days ahead."
  if (l.gallery.length > LIMITS.gallery) e.gallery = "Use up to 6 pictures."
  else if (l.gallery.some((u) => !GALLERY_URL.test(u))) e.gallery = "Gallery pictures must be ones you uploaded here."
  return e
}

export async function createLaunch(input: NewLaunch): Promise<Launch> {
  const first = Object.values(validateLaunch(input))[0]
  if (first) throw new Error(first)
  const base = {
    name: input.subject.name.trim().slice(0, LIMITS.name[1]),
    tagline: input.tagline.trim(),
    description: input.description.trim(),
    launch_at: new Date(input.launchAt).toISOString(),
    project_id: input.subject.type === "project" ? input.subject.id : null,
    resource: input.subject.type === "resource" ? input.subject.key : null,
  }
  const client = db()
  if (!client) {
    const l: LocalLaunch = {
      id: crypto.randomUUID(),
      name: base.name,
      tagline: base.tagline,
      description: base.description,
      launchAt: base.launch_at,
      projectId: base.project_id,
      resource: base.resource,
    }
    writeLocal(LAUNCHES_KEY, [l, ...readLaunches()])
    announce({ type: "changed" })
    return fromLocal(l)
  }
  await requireMe()
  const { data, error } = await client
    .from("launches")
    .insert({ ...base, gallery: input.gallery })
    .select(COLUMNS)
    .single()
  fail(error)
  return fromRow(data as unknown as Row, new Set())
}

/** Scrubs your launch. Only possible before it starts. */
export async function deleteLaunch(id: string) {
  const client = db()
  if (!client) {
    writeLocal(
      LAUNCHES_KEY,
      readLaunches().filter((l) => l.id !== id),
    )
    announce({ type: "changed" })
    return
  }
  const { data, error } = await client.from("launches").delete().eq("id", id).select("id")
  fail(error)
  if (!(data ?? []).length) throw new Error("This launch has already started, so it can no longer be scrubbed.")
}

/** True when gallery pictures can be uploaded (a database is connected). */
export const canUploadGallery = () => live

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

/** Uploads a gallery picture to "avatars/<your id>/launch-…" and returns its public URL. */
export async function uploadGalleryImage(file: File): Promise<string> {
  const client = db()
  if (!client) throw new Error("Pictures can be added once this site is connected to its database.")
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.")
  if (file.size > 2 * 1024 * 1024) throw new Error("Use an image under 2 MB.")
  const userId = await requireMe()
  const ext = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  }[file.type]
  const path = `${userId}/launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bucket = client.storage.from("avatars")
  const { error } = await bucket.upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return bucket.getPublicUrl(path).data.publicUrl
}

// ─── Boosting ───────────────────────────────────────────────────────────────────────────────────────────────

/** Boosts a launch that is live. One per member per launch, and boosts are final. */
export async function boostLaunch(l: Launch) {
  const now = Date.now()
  if (launchPhase(l, now) === "scheduled") throw new Error("Boosting opens at launch time.")
  if (launchPhase(l, now) === "landed") throw new Error("This launch day is over.")
  const client = db()
  if (!client) {
    const all = readBoosts()
    if (all.includes(l.id)) throw new Error("You already boosted this launch.")
    if (l.local) throw new Error("You cannot boost your own launch. Share it instead.")
    writeLocal(BOOSTS_KEY, [...all, l.id])
    announce({ type: "boost", launchId: l.id, userId: "local" })
    return
  }
  await requireMe()
  const { error } = await client.from("launch_boosts").insert({ launch_id: l.id })
  fail(error)
}

// ─── Live updates ───────────────────────────────────────────────────────────────────────────────────────────

export type LaunchSignal = { type: "boost"; launchId: string; userId: string } | { type: "changed" }

// Tells this tab's own messages apart from other tabs' (a new BroadcastChannel hears its own tab too).
const TAB = Math.random().toString(36).slice(2)

function announce(signal: LaunchSignal) {
  try {
    const bc = new BroadcastChannel(CHANNEL)
    bc.postMessage({ ...signal, tab: TAB })
    bc.close()
  } catch {}
}

let channelSeq = 0

/**
 * Hears new boosts (and new or scrubbed launches) as they happen: from Realtime with a database, from this
 * browser's other tabs without one. Pass `launchId` to hear one launch only. Returns a function that stops.
 */
export function subscribeLaunchpad(onSignal: (s: LaunchSignal) => void, launchId?: string): () => void {
  const client = db()
  if (!client) {
    if (typeof BroadcastChannel === "undefined") return () => {}
    const bc = new BroadcastChannel(CHANNEL)
    bc.onmessage = (e: MessageEvent<LaunchSignal & { tab?: string }>) => {
      if (e.data.tab === TAB) return
      if (e.data.type === "changed" || !launchId || e.data.launchId === launchId) onSignal(e.data)
    }
    return () => bc.close()
  }
  const channel = client.channel(`launchpad:${launchId ?? "all"}:${++channelSeq}`)
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "launch_boosts",
      ...(launchId ? { filter: `launch_id=eq.${launchId}` } : {}),
    },
    (p) => {
      const row = p.new as { launch_id: string; user_id: string }
      onSignal({ type: "boost", launchId: row.launch_id, userId: row.user_id })
    },
  )
  if (!launchId) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: "launches" }, () => onSignal({ type: "changed" }))
  }
  channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

/** Your id, to tell your own boost apart from others' when it echoes back over Realtime. */
export const currentMemberId = me
