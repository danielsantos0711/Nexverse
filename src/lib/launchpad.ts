import { getPerson, getResource, KINDS, resourcePath, type ResourceKind } from "@/lib/data"
import type { Member } from "@/lib/store"
import { isUuid, type Who } from "@/lib/community"
import { db, live } from "@/lib/supabase"

/**
 * The Launchpad: a member schedules a launch for one of their projects or for a hub resource. Before launch
 * time there is a countdown; for the 24 hours after it, members boost it (once each) on a live board; then it
 * joins the archive. The launch with the most boosts among those launched on a day (UTC) is that day's
 * "Launch of the day".
 *
 * With a database everything is in public.launches and public.launch_boosts, and boosts arrive live through
 * Realtime. Without one, sample launches dated around today are shown and your boosts and launches stay in this
 * browser (other tabs hear about them straight away).
 */

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
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

const personWho = (handle: string): Who => ({
  handle,
  name: getPerson(handle)?.name ?? handle,
})
const memberWho = (m: Member | null | undefined): Who => (m ? { name: m.name, memberId: m.id } : { name: "A member" })

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export const LAUNCH_DAY_MS = 864e5
const HOUR = 36e5

export type LaunchPhase = "scheduled" | "live" | "landed"

export type Launch = {
  id: string
  name: string
  tagline: string
  description: string
  launchAt: string
  /** Picture URLs in the owner's folder of the avatars bucket. Empty for sample launches. */
  gallery: string[]
  owner: Who
  /** The member's project being launched, or null. */
  projectId: string | null
  /** A hub resource being launched ("tool:token-tax"), or null. */
  resource: string | null
  boosts: number
  /** You boosted it. */
  boosted: boolean
  /** Sample people who boosted it (sample launches only), for the avatar row. */
  seedBoosters: string[]
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

/** Where the launched thing lives on Nexverse: its project page or its hub page. */
export function subjectOf(l: Pick<Launch, "projectId" | "resource">): { href: string; label: string } | null {
  if (l.projectId) return { href: `/p/${l.projectId}`, label: "Project page" }
  if (l.resource) {
    const [kind, slug] = l.resource.split(":") as [ResourceKind, string]
    const r = getResource(slug)
    if (r && r.kind === kind) return { href: resourcePath(r), label: `${KINDS[kind].label} page` }
  }
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

// ─── Sample launches (shown when no database is connected) ──────────────────────────────────────────────────

type SampleLaunch = {
  id: string
  name: string
  tagline: string
  description: string
  resource: string
  owner: string
  /** Days from today (UTC) and the UTC hour it launches. */
  day: number
  hour: number
  boosters: string[]
  /** Boosts beyond the named boosters, for a believable count. */
  extra: number
}

const SAMPLE_DATA: SampleLaunch[] = [
  {
    id: "token-tax-2",
    name: "token-tax 2.0",
    tagline: "See what every tokenizer charges for your language, side by side.",
    description:
      "token-tax counts how many tokens the same text costs across 40 tokenizers. Version 2 adds:\n\n- **Fertility charts** per language, so you can see Yoruba or Hindi costing three times English\n- Paste a whole document or a dataset sample\n- A shareable link for every comparison\n\nFree, runs in the browser, nothing is uploaded.",
    resource: "tool:token-tax",
    owner: "kai",
    day: 0,
    hour: 0,
    boosters: ["priya", "rafa", "mei", "layla", "noah", "sofia", "tunde"],
    extra: 41,
  },
  {
    id: "pocket-run-android",
    name: "Pocket Run for Android",
    tagline: "Run small open models on your phone, offline, with one tap.",
    description: "Pocket Run now has an Android build. Pick a model under 2 GB, download it once and chat offline. Benchmarks for 30 phones are in the app.",
    resource: "tool:pocket-run",
    owner: "priya",
    day: 0,
    hour: 1,
    boosters: ["kai", "sofia", "leo", "amara"],
    extra: 27,
  },
  {
    id: "tone-tokenizer-1",
    name: "tone-tokenizer 1.0",
    tagline: "A tokenizer that keeps Yoruba tone marks instead of throwing them away.",
    description: "The first stable release. Tone marks survive tokenisation, fertility drops by 38% on Yoruba, and it is a drop-in for most training scripts.",
    resource: "repo:tone-tokenizer",
    owner: "tunde",
    day: 0,
    hour: 2,
    boosters: ["amara", "ines", "layla"],
    extra: 12,
  },
  {
    id: "datasheet-studio-teams",
    name: "Datasheet Studio for teams",
    tagline: "Write dataset datasheets together, with review and sign-off.",
    description: "Invite reviewers, track who approved what, export to Markdown or PDF.",
    resource: "tool:datasheet-studio",
    owner: "amara",
    day: 0,
    hour: 20,
    boosters: [],
    extra: 0,
  },
  {
    id: "kansai-7b-v2",
    name: "Kansai 7B v2",
    tagline: "A Japanese model that understands Kansai dialect, now with 32k context.",
    description: "Retrained on twice as much Kansai speech transcribed by native speakers, with long-context support.",
    resource: "model:kansai-7b",
    owner: "mei",
    day: 1,
    hour: 15,
    boosters: [],
    extra: 0,
  },
  {
    id: "serve-small-1",
    name: "serve-small 1.0",
    tagline: "Serve a 3B model to a thousand users on one GPU.",
    description: "Continuous batching, prompt caching and a sensible default config.",
    resource: "repo:serve-small",
    owner: "sofia",
    day: 2,
    hour: 9,
    boosters: [],
    extra: 0,
  },
  {
    id: "subtitle-forge-live",
    name: "Subtitle Forge Live",
    tagline: "Live subtitles for streams in 20 languages, with speaker labels.",
    description: "Works with any streaming tool that takes a browser source.",
    resource: "tool:subtitle-forge",
    owner: "leo",
    day: 4,
    hour: 17,
    boosters: [],
    extra: 0,
  },
  {
    id: "act-checker-2",
    name: "Act Checker 2",
    tagline: "Check your model card against the EU AI Act in five minutes.",
    description: "Updated for the latest guidance, with plain-English explanations for every item.",
    resource: "tool:act-checker",
    owner: "jonas",
    day: 9,
    hour: 12,
    boosters: [],
    extra: 0,
  },
  {
    id: "loop-guard-0-9",
    name: "loop-guard 0.9",
    tagline: "Stops agents that go in circles, now for any framework.",
    description: "Adapters for five agent frameworks and a new detector trained on 600 labelled traces.",
    resource: "repo:loop-guard",
    owner: "rafa",
    day: -1,
    hour: 14,
    boosters: ["mei", "noah", "kai", "priya", "sofia"],
    extra: 58,
  },
  {
    id: "babel-embed-small",
    name: "babel-embed small",
    tagline: "Multilingual embeddings at a quarter of the size.",
    description: "Distilled from babel-embed, 110M parameters, 2 points behind on retrieval.",
    resource: "model:babel-embed",
    owner: "noah",
    day: -1,
    hour: 16,
    boosters: ["rafa", "ines"],
    extra: 21,
  },
  {
    id: "promptboard-history",
    name: "Promptboard history",
    tagline: "Every prompt you tried, searchable, with the outputs next to them.",
    description: "Local-first, exports to JSON.",
    resource: "tool:promptboard",
    owner: "kai",
    day: -2,
    hour: 10,
    boosters: ["leo", "layla"],
    extra: 34,
  },
  {
    id: "kiswahili-commons-v3",
    name: "Kiswahili Commons v3",
    tagline: "Two million more Swahili sentences, consented and documented.",
    description: "Adds Sheng and coastal varieties, with a new datasheet.",
    resource: "dataset:kiswahili-commons",
    owner: "amara",
    day: -3,
    hour: 8,
    boosters: ["tunde", "layla", "ines"],
    extra: 45,
  },
  {
    id: "leakcheck-1",
    name: "leakcheck 1.0",
    tagline: "Find out whether your eval set leaked into a model's training data.",
    description: "Membership tests for 12 open models, with a report you can attach to a paper.",
    resource: "repo:leakcheck",
    owner: "mei",
    day: -6,
    hour: 13,
    boosters: ["noah", "rafa"],
    extra: 39,
  },
]

const startOfUtcDay = (t: number) => Math.floor(t / LAUNCH_DAY_MS) * LAUNCH_DAY_MS

/** The sample launches, dated around `now` so there is always something live, upcoming and in the archive. */
export function sampleLaunches(now = Date.now()): Launch[] {
  const today = startOfUtcDay(now)
  return SAMPLE_DATA.map((s) => {
    const at = today + s.day * LAUNCH_DAY_MS + s.hour * HOUR
    // Boosts only exist once a launch has started.
    const started = at <= now
    return {
      id: s.id,
      name: s.name,
      tagline: s.tagline,
      description: s.description,
      launchAt: new Date(at).toISOString(),
      gallery: [],
      owner: personWho(s.owner),
      projectId: null,
      resource: s.resource,
      boosts: started ? s.boosters.length + s.extra : 0,
      boosted: false,
      seedBoosters: started ? s.boosters : [],
      sample: true,
      local: false,
    }
  })
}

export const SAMPLE_LAUNCH_IDS = SAMPLE_DATA.map((s) => s.id)

export function getSampleLaunchMeta(id: string) {
  const s = SAMPLE_DATA.find((x) => x.id === id)
  return s ? { title: s.name, description: s.tagline } : null
}

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

/** Launches from 60 days ago to 90 days ahead, soonest first. Without a database: yours, then the samples. */
export async function listLaunches(): Promise<Launch[]> {
  const client = db()
  if (!client) {
    const boosts = readBoosts()
    return [...readLaunches().map(fromLocal), ...sampleLaunches()].map((l) => withLocalBoost(l, boosts)).sort((a, b) => a.launchAt.localeCompare(b.launchAt))
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
  const sample = sampleLaunches().find((l) => l.id === id)
  if (sample) return client ? sample : withLocalBoost(sample)
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

/** Members who boosted a launch, newest first (named sample people for sample launches). */
export async function getBoosters(l: Launch, limit = 24): Promise<Who[]> {
  const client = db()
  const seeded = l.seedBoosters.map(personWho)
  if (l.sample || !client) return l.boosted ? [{ name: "You" }, ...seeded] : seeded
  const { data, error } = await client.from("launch_boosts").select("member:profiles(id, name)").eq("launch_id", l.id).order("created_at", { ascending: false }).limit(limit)
  fail(error)
  return (data as unknown as { member: Member | null }[]).map((r) => memberWho(r.member))
}

// ─── Scheduling ─────────────────────────────────────────────────────────────────────────────────────────────

export type NewLaunch = {
  /** "project" with a project id, or "resource" with "kind:slug". */
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
  if (!l.subject.name.trim()) e.subject = "Pick what you are launching."
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
  if (l.sample) throw new Error("This is an example launch, so it cannot be boosted.")
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
