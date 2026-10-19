import type { RealtimeChannel } from "@supabase/supabase-js"
import { localMember, type Room } from "@/lib/chat"
import { getCollection, REACTIONS, type Collection, type ReactionEmoji, type Reactions, type Who } from "@/lib/community"
import { getPerson } from "@/lib/data"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * Crews: groups of members (a lab, a study group, a project team) with a wall of posts, a chat room of their
 * own, shared collections and a members list. With a database connected everything reads and writes Supabase
 * (see supabase/migrations/…_crews_messages.sql); without one a handful of sample crews ship with the app and
 * whatever you do (start a crew, join one, post) is kept in this browser.
 */

// ─── Shapes ─────────────────────────────────────────────────────────────────────────────────────────────────

export const CREW_COLORS = {
  ion: { label: "Ion blue", value: "var(--ion)" },
  gold: { label: "Gold", value: "var(--gold)" },
  ok: { label: "Green", value: "var(--ok)" },
  violet: { label: "Violet", value: "#b49cff" },
  rose: { label: "Rose", value: "#ff8fb1" },
  teal: { label: "Teal", value: "#5fd3c6" },
  amber: { label: "Amber", value: "#ffb86b" },
  sky: { label: "Sky", value: "#7cc7ff" },
} as const
export type CrewColor = keyof typeof CREW_COLORS

/** Emblem icons a crew can pick, by lucide name. The component that draws them lives in components/crews. */
export const CREW_ICONS = [
  "orbit",
  "rocket",
  "atom",
  "brain",
  "bot",
  "languages",
  "book-open",
  "flask-conical",
  "cpu",
  "smartphone",
  "audio-lines",
  "image",
  "database",
  "telescope",
  "sparkles",
  "code",
  "globe",
  "shield",
  "graduation-cap",
  "satellite",
  "microscope",
  "palette",
  "scale",
  "leaf",
] as const
export type CrewIcon = (typeof CREW_ICONS)[number]

export type CrewVisibility = "public" | "invite"
export type CrewRole = "owner" | "admin" | "member"

export const CREW_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,32}[a-z0-9])?$/
export const CREW_TAG = /^[a-z0-9][a-z0-9-]{0,23}$/
export const CREW_LIMITS = { name: 60, blurb: 300, tags: 8, post: 10000, request: 300, pinned: 3 } as const
export const ROLE_LABEL: Record<CrewRole, string> = { owner: "Owner", admin: "Admin", member: "Member" }

export type Crew = {
  id: string
  slug: string
  name: string
  blurb: string
  icon: CrewIcon
  color: CrewColor
  visibility: CrewVisibility
  tags: string[]
  owner: Who
  memberCount: number
  createdAt: string
  updatedAt: string
  sample: boolean
  local: boolean
}

export type CrewMember = Who & { key: string; role: CrewRole; joinedAt: string }

export type CrewPost = {
  id: string
  crewId: string
  author: Who
  body: string
  pinned: boolean
  createdAt: string
  editedAt: string | null
  sample: boolean
  local: boolean
}

export type CrewRequest = { userId: string; name: string; message: string; createdAt: string }
export type CrewInvite = { token: string; maxUses: number; uses: number; expiresAt: string; createdAt: string }
export type ActivityDay = { day: string; posts: number; messages: number; joins: number }
/** Where you stand with one crew. */
export type Standing = { role: CrewRole | null; requested: boolean }

export type CrewInput = { name: string; slug: string; blurb: string; icon: CrewIcon; color: CrewColor; visibility: CrewVisibility; tags: string[] }

export const isCrewIcon = (s: string): s is CrewIcon => (CREW_ICONS as readonly string[]).includes(s)
export const isCrewColor = (s: string): s is CrewColor => s in CREW_COLORS
export const canManage = (role: CrewRole | null | undefined) => role === "owner" || role === "admin"

/** The chat room every crew gets: an ordinary room named after the crew, readable by its members only. */
export const crewRoomSlug = (slug: string) => `crew-${slug}`
export function crewRoom(c: Crew): Room {
  return { slug: crewRoomSlug(c.slug), name: c.name.slice(0, 40), topic: c.blurb.slice(0, 200), createdBy: null, createdAt: c.createdAt }
}

export function crewSlugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34)
    .replace(/-+$/g, "")
}

export function normalizeCrewTag(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
}

export function validateCrew(c: CrewInput): Partial<Record<keyof CrewInput, string>> {
  const e: Partial<Record<keyof CrewInput, string>> = {}
  const name = c.name.trim()
  if (name.length < 2) e.name = "Give the crew a name of at least 2 characters."
  else if (name.length > CREW_LIMITS.name) e.name = "Keep the name to 60 characters."
  if (!CREW_SLUG.test(c.slug)) e.slug = "Use 2 to 34 lowercase letters, numbers and dashes, starting and ending with a letter or number."
  if (c.blurb.length > CREW_LIMITS.blurb) e.blurb = "Keep the description to 300 characters."
  if (!isCrewIcon(c.icon)) e.icon = "Pick one of the emblems."
  if (!isCrewColor(c.color)) e.color = "Pick one of the colours."
  if (c.tags.length > CREW_LIMITS.tags) e.tags = "Use up to 8 topics."
  else if (c.tags.some((t) => !CREW_TAG.test(t))) e.tags = "Topics are lowercase letters, numbers and dashes, up to 24 characters."
  return e
}

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (error.code === "23505") throw new Error("That address is taken. Pick another one.")
  if (/violates row-level security/.test(error.message)) throw new Error("You are not allowed to do that. Are you signed in and a member of this crew?")
  if (/JWT|not authenticated/i.test(error.message)) throw new Error("Your session ran out. Sign in again.")
  if (/schema cache|does not exist/.test(error.message)) throw new Error("Crews are still being switched on for this copy of Nexverse. Try again soon.")
  throw new Error(error.message)
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
    throw new Error("This browser would not save that. Allow site data and try again.")
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

const personWho = (handle: string): Who => ({ handle, name: getPerson(handle)?.name ?? handle })
const memberWho = (m: Member | null | undefined): Who => (m ? { name: m.name, memberId: m.id } : { name: "A member" })
/** In a browser without a database, you write as the same "You" the chat uses. */
const localWho = (): Who => {
  const m = localMember()
  return { name: m.name, memberId: m.id }
}

/** Keeps the fixed sample dates stable in prerendering: "n days before the preview's today". */
const PREVIEW_DAY = Date.parse("2026-10-18T12:00:00Z")
const daysAgo = (n: number, hour = 12) => new Date(PREVIEW_DAY - n * 864e5 + (hour - 12) * 36e5).toISOString()

// ─── Sample crews (browser-only mode) ───────────────────────────────────────────────────────────────────────

type SampleCrew = {
  slug: string
  name: string
  blurb: string
  icon: CrewIcon
  color: CrewColor
  visibility: CrewVisibility
  tags: string[]
  owner: string
  admins: string[]
  members: string[]
  created: number
  collections: string[]
  /** Posts, newest last: author handle, days ago, body, pinned. */
  posts: [string, number, string, boolean?][]
  /** Posts, messages and joins for each of the last seven days, oldest first. */
  activity: [number, number, number][]
  reactions: Record<number, Partial<Record<ReactionEmoji, number>>>
}

const SAMPLE_CREW_DATA: SampleCrew[] = [
  {
    slug: "pt-pt-builders",
    name: "PT-PT Builders",
    blurb: "Models, data and evals for European Portuguese. We fine-tune small models that sound like Lisbon, not São Paulo.",
    icon: "languages",
    color: "ok",
    visibility: "public",
    tags: ["portuguese", "fine-tuning", "nlp", "evals"],
    owner: "ines",
    admins: ["jonas"],
    members: ["amara", "layla", "noah"],
    created: 40,
    collections: ["starter-european-portuguese"],
    posts: [
      ["ines", 6, "**Welcome!** Start with the starter collection below, then say hello in the crew chat.\n\nWe meet on Thursdays at 18:00 Lisbon time for a 30 minute check-in.", true],
      ["jonas", 3, "Draft of the PT-PT eval card is up. It checks for Brazilian forms like `você` used where `tu` is expected, and for spelling before the 1990 agreement."],
      ["noah", 1, "Tried `tagus-3b-pt` with retrieval over the Diário da República. Recall at 10 went from 0.61 to 0.74 with `babel-embed`. Notes in the crew chat."],
    ],
    activity: [[1, 12, 0], [0, 8, 1], [2, 21, 0], [0, 5, 0], [1, 17, 2], [0, 9, 0], [1, 14, 1]],
    reactions: { 0: { "🎉": 6, "❤️": 3 }, 1: { "👍": 4 }, 2: { "🚀": 5, "👀": 2 } },
  },
  {
    slug: "agent-reliability",
    name: "Agent Reliability Club",
    blurb: "Agents that stop when they should. We share traces, failure cases and the guard rails that fixed them.",
    icon: "bot",
    color: "violet",
    visibility: "public",
    tags: ["agents", "tracing", "evals", "tool-use"],
    owner: "rafa",
    admins: ["sofia"],
    members: ["noah", "kai", "mei", "priya"],
    created: 28,
    collections: ["agents-that-stop"],
    posts: [
      ["rafa", 9, "House rule: every failure report comes with a trace. Use `loop-guard --export` and attach the JSON.", true],
      ["sofia", 4, "We cut cost per task by 38% by caching tool results for 60 seconds. The catch: two tools return stale prices. Write-up soon."],
      ["kai", 2, "Is anyone using a step budget per tool instead of per run? Curious how you pick the numbers."],
      ["mei", 0, "Shared a small eval: 40 tasks where the right move is to stop and ask. Most agents keep going."],
    ],
    activity: [[1, 22, 1], [2, 30, 0], [0, 18, 0], [1, 26, 1], [0, 11, 0], [1, 19, 0], [1, 24, 2]],
    reactions: { 0: { "👍": 9 }, 1: { "🚀": 7, "🤔": 2 }, 2: { "🤔": 3 }, 3: { "👀": 4 } },
  },
  {
    slug: "on-device-lab",
    name: "On-device Lab",
    blurb: "Quantisation, phones and laptops. What actually runs offline, and how to measure battery honestly.",
    icon: "smartphone",
    color: "amber",
    visibility: "public",
    tags: ["quantization", "mobile", "edge", "llama-cpp"],
    owner: "priya",
    admins: [],
    members: ["kai", "leo", "sofia"],
    created: 21,
    collections: ["phone-sized-models"],
    posts: [
      ["priya", 5, "Battery protocol v2: airplane mode, 50% brightness, 20 prompts of 200 tokens each. Report mAh, not percent.", true],
      ["leo", 2, "3-bit `orbit-1b-mobile` keeps 96% of the 4-bit score on our audio captions set. Worth a try if you are tight on RAM."],
    ],
    activity: [[0, 6, 0], [1, 9, 1], [0, 4, 0], [0, 7, 0], [1, 10, 0], [0, 3, 0], [0, 8, 1]],
    reactions: { 0: { "👍": 5, "❤️": 2 }, 1: { "🚀": 3 } },
  },
  {
    slug: "speech-commons",
    name: "Speech Commons",
    blurb: "Consent-first speech data and models for African languages. Invite only while we sort out data access.",
    icon: "audio-lines",
    color: "teal",
    visibility: "invite",
    tags: ["speech", "datasets", "yoruba", "swahili"],
    owner: "tunde",
    admins: ["amara"],
    members: ["leo"],
    created: 33,
    collections: ["speech-african-languages"],
    posts: [
      ["tunde", 7, "Recording guide for new contributors is pinned in the crew chat. Please read the consent section first.", true],
      ["amara", 3, "Kiswahili commons v2 is out: 1,200 more hours, all with speaker consent forms."],
    ],
    activity: [[0, 5, 0], [0, 3, 0], [1, 8, 0], [0, 2, 0], [0, 6, 1], [1, 4, 0], [0, 5, 0]],
    reactions: { 0: { "❤️": 4 }, 1: { "🎉": 6 } },
  },
  {
    slug: "eval-reading-group",
    name: "Eval Reading Group",
    blurb: "One evaluation paper a week, read slowly. We write a short summary and one thing worth trying.",
    icon: "book-open",
    color: "gold",
    visibility: "public",
    tags: ["evaluation", "papers", "reading-group"],
    owner: "mei",
    admins: ["noah"],
    members: ["jonas", "ines", "rafa"],
    created: 50,
    collections: ["agents-that-stop", "starter-european-portuguese"],
    posts: [
      ["mei", 8, "This week: contamination checks. Bring one benchmark you trust and one you do not.", true],
      ["noah", 1, "Summary from Tuesday: n-gram overlap misses paraphrased leaks. Embedding search over the training set caught 3x more."],
    ],
    activity: [[0, 4, 0], [1, 7, 0], [0, 2, 1], [0, 3, 0], [0, 9, 0], [1, 12, 0], [0, 5, 0]],
    reactions: { 0: { "👍": 7 }, 1: { "👀": 5, "🚀": 2 } },
  },
]

const sampleId = (slug: string) => `sample-${slug}`

export const SAMPLE_CREWS: Crew[] = SAMPLE_CREW_DATA.map((c) => ({
  id: sampleId(c.slug),
  slug: c.slug,
  name: c.name,
  blurb: c.blurb,
  icon: c.icon,
  color: c.color,
  visibility: c.visibility,
  tags: c.tags,
  owner: personWho(c.owner),
  memberCount: 1 + c.admins.length + c.members.length,
  createdAt: daysAgo(c.created),
  updatedAt: daysAgo(c.posts.length ? c.posts[c.posts.length - 1][1] : c.created),
  sample: true,
  local: false,
}))

export const getSampleCrew = (slug: string) => SAMPLE_CREWS.find((c) => c.slug === slug)
const sampleData = (crewId: string) => SAMPLE_CREW_DATA.find((c) => sampleId(c.slug) === crewId)

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const CREWS_KEY = "nexverse-crews"
const STANDING_KEY = "nexverse-crew-standing"
const REACTIONS_KEY = "nexverse-crew-reactions"
const postsKey = (crewId: string) => `nexverse-crew-posts:${crewId}`
const pinsKey = (crewId: string) => `nexverse-crew-pins:${crewId}`
const sharedKey = (crewId: string) => `nexverse-crew-collections:${crewId}`
const invitesKey = (crewId: string) => `nexverse-crew-invites:${crewId}`

type LocalStanding = Record<string, Standing>
const readStanding = () => readLocal<LocalStanding>(STANDING_KEY, {})
function writeStanding(crewId: string, s: Standing | null) {
  const all = readStanding()
  if (s && (s.role || s.requested)) all[crewId] = s
  else delete all[crewId]
  writeLocal(STANDING_KEY, all)
  emitLocal(crewId)
}

type LocalCrew = Omit<Crew, "owner" | "memberCount" | "sample" | "local">
const readLocalCrews = () => readLocal<LocalCrew[]>(CREWS_KEY, [])

function fromLocalCrew(c: LocalCrew): Crew {
  return { ...c, owner: localWho(), memberCount: 1, sample: false, local: true }
}

function withLocalStanding(c: Crew): Crew {
  if (!c.sample) return c
  const s = readStanding()[c.id]
  return s?.role ? { ...c, memberCount: c.memberCount + 1 } : c
}

const localCrews = () => [...readLocalCrews().map(fromLocalCrew), ...SAMPLE_CREWS.map(withLocalStanding)]

// Tabs of one browser hear about each other's changes (a join, a post) so open pages stay current.
const localListeners = new Map<string, Set<() => void>>()
let localBus: BroadcastChannel | null | undefined
function bus() {
  if (localBus !== undefined) return localBus
  localBus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("nexverse-crews")
  localBus?.addEventListener("message", (e) => {
    const id = (e.data as { crewId?: string })?.crewId
    if (id) for (const l of localListeners.get(id) ?? []) l()
  })
  return localBus
}
function emitLocal(crewId: string) {
  for (const l of localListeners.get(crewId) ?? []) l()
  bus()?.postMessage({ crewId })
}

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const CREW_COLUMNS = "id, slug, name, blurb, icon, color, visibility, tags, member_count, created_at, updated_at, owner:profiles!crews_owner_id_fkey(id, name)"
type CrewRow = {
  id: string
  slug: string
  name: string
  blurb: string
  icon: string
  color: string
  visibility: CrewVisibility
  tags: string[] | null
  member_count: number
  created_at: string
  updated_at: string
  owner: Member | null
}

const fromCrewRow = (r: CrewRow): Crew => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  blurb: r.blurb ?? "",
  icon: isCrewIcon(r.icon) ? r.icon : "orbit",
  color: isCrewColor(r.color) ? r.color : "ion",
  visibility: r.visibility,
  tags: r.tags ?? [],
  owner: memberWho(r.owner),
  memberCount: r.member_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  sample: false,
  local: false,
})

const POST_COLUMNS = "id, crew_id, body, pinned, created_at, edited_at, author:profiles!crew_posts_author_id_fkey(id, name)"
type PostRow = { id: string; crew_id: string; body: string; pinned: boolean; created_at: string; edited_at: string | null; author: Member | null }
const fromPostRow = (r: PostRow): CrewPost => ({
  id: r.id,
  crewId: r.crew_id,
  author: memberWho(r.author),
  body: r.body,
  pinned: r.pinned,
  createdAt: r.created_at,
  editedAt: r.edited_at,
  sample: false,
  local: false,
})

// ─── Crews ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Crews to discover: most recently active first. Without a database, yours and the samples. */
export async function listCrews(): Promise<Crew[]> {
  const client = db()
  if (!client) return localCrews()
  const { data, error } = await client.from("crews").select(CREW_COLUMNS).order("updated_at", { ascending: false }).limit(120)
  fail(error)
  return (data as unknown as CrewRow[]).map(fromCrewRow)
}

/** Your role in each crew you belong to, and the invite-only crews you asked to join, keyed by crew id. */
export async function myStandings(): Promise<Record<string, Standing>> {
  const client = db()
  if (!client) {
    const out: Record<string, Standing> = { ...readStanding() }
    for (const c of readLocalCrews()) out[c.id] = { role: "owner", requested: false }
    return out
  }
  const userId = await me()
  if (!userId) return {}
  const [members, requests] = await Promise.all([
    client.from("crew_members").select("crew_id, role").eq("user_id", userId).limit(500),
    client.from("crew_requests").select("crew_id").eq("user_id", userId).limit(100),
  ])
  fail(members.error)
  fail(requests.error)
  const out: Record<string, Standing> = {}
  for (const r of requests.data as { crew_id: string }[]) out[r.crew_id] = { role: null, requested: true }
  for (const m of members.data as { crew_id: string; role: CrewRole }[]) out[m.crew_id] = { role: m.role, requested: false }
  return out
}

export async function getCrew(slug: string): Promise<Crew | null> {
  const client = db()
  if (!client) return localCrews().find((c) => c.slug === slug) ?? null
  if (!CREW_SLUG.test(slug)) return null
  const { data, error } = await client.from("crews").select(CREW_COLUMNS).eq("slug", slug).maybeSingle()
  fail(error)
  return data ? fromCrewRow(data as unknown as CrewRow) : null
}

export async function getStanding(c: Crew): Promise<Standing> {
  const client = db()
  if (!client) {
    if (c.local) return { role: "owner", requested: false }
    return readStanding()[c.id] ?? { role: null, requested: false }
  }
  const userId = await me()
  if (!userId) return { role: null, requested: false }
  const [m, r] = await Promise.all([
    client.from("crew_members").select("role").eq("crew_id", c.id).eq("user_id", userId).maybeSingle(),
    client.from("crew_requests").select("crew_id").eq("crew_id", c.id).eq("user_id", userId).maybeSingle(),
  ])
  fail(m.error)
  fail(r.error)
  return { role: (m.data as { role: CrewRole } | null)?.role ?? null, requested: Boolean(r.data) }
}

function cleanInput(input: CrewInput): CrewInput {
  return { ...input, name: input.name.trim(), blurb: input.blurb.trim(), tags: [...new Set(input.tags.map(normalizeCrewTag).filter(Boolean))] }
}

export async function createCrew(raw: CrewInput): Promise<Crew> {
  const input = cleanInput(raw)
  const errors = validateCrew(input)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const client = db()
  if (!client) {
    if (localCrews().some((c) => c.slug === input.slug)) throw new Error("That address is taken. Pick another one.")
    const now = new Date().toISOString()
    const crew: LocalCrew = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }
    writeLocal(CREWS_KEY, [crew, ...readLocalCrews()])
    return fromLocalCrew(crew)
  }
  await requireMe()
  const { data, error } = await client.from("crews").insert(input).select(CREW_COLUMNS).single()
  fail(error)
  return fromCrewRow(data as unknown as CrewRow)
}

export async function updateCrew(c: Crew, raw: Omit<CrewInput, "slug">): Promise<Crew> {
  const input = cleanInput({ ...raw, slug: c.slug })
  const errors = validateCrew(input)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const { slug: _slug, ...patch } = input
  void _slug
  const client = db()
  if (!client) {
    const all = readLocalCrews()
    const i = all.findIndex((x) => x.id === c.id)
    if (i < 0) throw new Error("Only crews you started in this browser can be edited here.")
    all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() }
    writeLocal(CREWS_KEY, all)
    emitLocal(c.id)
    return fromLocalCrew(all[i])
  }
  const { data, error } = await client.from("crews").update(patch).eq("id", c.id).select(CREW_COLUMNS).single()
  fail(error)
  return fromCrewRow(data as unknown as CrewRow)
}

export async function deleteCrew(c: Crew) {
  const client = db()
  if (!client) {
    writeLocal(
      CREWS_KEY,
      readLocalCrews().filter((x) => x.id !== c.id)
    )
    for (const k of [postsKey(c.id), pinsKey(c.id), sharedKey(c.id), invitesKey(c.id)]) {
      try {
        localStorage.removeItem(k)
      } catch {}
    }
    return
  }
  const { error } = await client.from("crews").delete().eq("id", c.id)
  fail(error)
}

// ─── Membership ─────────────────────────────────────────────────────────────────────────────────────────────

export async function joinCrew(c: Crew) {
  if (c.visibility !== "public") throw new Error("This crew is invite only. Ask to join instead.")
  const client = db()
  if (!client) return writeStanding(c.id, { role: "member", requested: false })
  const userId = await requireMe()
  const { error } = await client.from("crew_members").insert({ crew_id: c.id, user_id: userId })
  if (error?.code === "23505") return
  fail(error)
}

export async function leaveCrew(c: Crew) {
  const client = db()
  if (!client) {
    if (c.local) throw new Error("You started this crew. Delete it instead.")
    return writeStanding(c.id, null)
  }
  const userId = await requireMe()
  const { error } = await client.from("crew_members").delete().eq("crew_id", c.id).eq("user_id", userId)
  fail(error)
}

export async function requestToJoin(c: Crew, message: string) {
  const text = message.trim()
  if (text.length > CREW_LIMITS.request) throw new Error("Keep the note to 300 characters.")
  const client = db()
  if (!client) return writeStanding(c.id, { role: null, requested: true })
  await requireMe()
  const { error } = await client.from("crew_requests").insert({ crew_id: c.id, message: text })
  if (error?.code === "23505") return
  fail(error)
}

export async function withdrawRequest(c: Crew) {
  const client = db()
  if (!client) return writeStanding(c.id, null)
  const userId = await requireMe()
  const { error } = await client.from("crew_requests").delete().eq("crew_id", c.id).eq("user_id", userId)
  fail(error)
}

export async function listRequests(c: Crew): Promise<CrewRequest[]> {
  const client = db()
  if (!client) return []
  const { data, error } = await client
    .from("crew_requests")
    .select("user_id, message, created_at, who:profiles!crew_requests_user_id_fkey(id, name)")
    .eq("crew_id", c.id)
    .order("created_at")
    .limit(100)
  fail(error)
  return (data as unknown as { user_id: string; message: string; created_at: string; who: Member | null }[]).map((r) => ({
    userId: r.user_id,
    name: r.who?.name ?? "A member",
    message: r.message,
    createdAt: r.created_at,
  }))
}

export async function answerRequest(c: Crew, userId: string, accept: boolean) {
  const client = db()
  if (!client) return
  const { error } = accept
    ? await client.from("crew_members").insert({ crew_id: c.id, user_id: userId })
    : await client.from("crew_requests").delete().eq("crew_id", c.id).eq("user_id", userId)
  fail(error)
}

const ROLE_ORDER: Record<CrewRole, number> = { owner: 0, admin: 1, member: 2 }

/** Everyone in the crew: owner, then admins, then members, oldest first within each. */
export async function listMembers(c: Crew): Promise<CrewMember[]> {
  const client = db()
  if (!client) {
    const you = localWho()
    if (c.local) return [{ ...you, key: `member:${you.memberId}`, role: "owner", joinedAt: c.createdAt }]
    const s = sampleData(c.id)
    if (!s) return []
    const list: CrewMember[] = [
      { ...personWho(s.owner), key: `person:${s.owner}`, role: "owner", joinedAt: daysAgo(s.created) },
      ...s.admins.map((h, i) => ({ ...personWho(h), key: `person:${h}`, role: "admin" as const, joinedAt: daysAgo(s.created - 1 - i) })),
      ...s.members.map((h, i) => ({ ...personWho(h), key: `person:${h}`, role: "member" as const, joinedAt: daysAgo(Math.max(0, s.created - 3 - i * 4)) })),
    ]
    const mine = readStanding()[c.id]
    if (mine?.role) list.push({ ...you, key: `member:${you.memberId}`, role: mine.role, joinedAt: new Date().toISOString() })
    return list
  }
  const { data, error } = await client
    .from("crew_members")
    .select("user_id, role, joined_at, who:profiles!crew_members_user_id_fkey(id, name)")
    .eq("crew_id", c.id)
    .order("joined_at")
    .limit(500)
  fail(error)
  return (data as unknown as { user_id: string; role: CrewRole; joined_at: string; who: Member | null }[])
    .map((r) => ({ name: r.who?.name ?? "A member", memberId: r.user_id, key: `member:${r.user_id}`, role: r.role, joinedAt: r.joined_at }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt))
}

export async function setMemberRole(c: Crew, userId: string, role: "admin" | "member") {
  const client = db()
  if (!client) throw new Error("Roles need accounts, which this copy of Nexverse does not have switched on.")
  const { error } = await client.from("crew_members").update({ role }).eq("crew_id", c.id).eq("user_id", userId)
  fail(error)
}

export async function removeMember(c: Crew, userId: string) {
  const client = db()
  if (!client) throw new Error("Members can only be removed when accounts are switched on.")
  const { error } = await client.from("crew_members").delete().eq("crew_id", c.id).eq("user_id", userId)
  fail(error)
}

// ─── Invite links ───────────────────────────────────────────────────────────────────────────────────────────

export const INVITE_TOKEN = /^[0-9a-f]{32}$/
export const inviteHref = (slug: string, token: string) => `/crews/${slug}?invite=${token}`

const INVITE_COLUMNS = "token, max_uses, uses, expires_at, created_at"
type InviteRow = { token: string; max_uses: number; uses: number; expires_at: string; created_at: string }
const fromInviteRow = (r: InviteRow): CrewInvite => ({ token: r.token, maxUses: r.max_uses, uses: r.uses, expiresAt: r.expires_at, createdAt: r.created_at })

export async function listInvites(c: Crew): Promise<CrewInvite[]> {
  const client = db()
  if (!client) return readLocal<CrewInvite[]>(invitesKey(c.id), []).filter((i) => Date.parse(i.expiresAt) > Date.now())
  const { data, error } = await client.from("crew_invites").select(INVITE_COLUMNS).eq("crew_id", c.id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(20)
  fail(error)
  return (data as InviteRow[]).map(fromInviteRow)
}

export async function createInvite(c: Crew, { days = 7, maxUses = 25 }: { days?: number; maxUses?: number } = {}): Promise<CrewInvite> {
  const expiresAt = new Date(Date.now() + Math.min(30, Math.max(1, days)) * 864e5).toISOString()
  const client = db()
  if (!client) {
    const invite: CrewInvite = { token: crypto.randomUUID().replace(/-/g, ""), maxUses, uses: 0, expiresAt, createdAt: new Date().toISOString() }
    writeLocal(invitesKey(c.id), [invite, ...readLocal<CrewInvite[]>(invitesKey(c.id), [])].slice(0, 20))
    return invite
  }
  const { data, error } = await client.from("crew_invites").insert({ crew_id: c.id, max_uses: maxUses, expires_at: expiresAt }).select(INVITE_COLUMNS).single()
  fail(error)
  return fromInviteRow(data as InviteRow)
}

export async function revokeInvite(c: Crew, token: string) {
  const client = db()
  if (!client) {
    writeLocal(
      invitesKey(c.id),
      readLocal<CrewInvite[]>(invitesKey(c.id), []).filter((i) => i.token !== token)
    )
    return
  }
  const { error } = await client.from("crew_invites").delete().eq("token", token)
  fail(error)
}

/** Opens an invite link: makes you a member if it is still good. Returns the slug of the crew the link belongs to. */
export async function acceptInvite(c: Crew, token: string): Promise<string> {
  if (!INVITE_TOKEN.test(token)) throw new Error("This invite link is not complete. Ask for a new one.")
  const client = db()
  if (!client) {
    const all = readLocal<CrewInvite[]>(invitesKey(c.id), [])
    const i = all.find((x) => x.token === token)
    // Sample crews accept any well-formed link, so the flow can be tried without a second browser.
    if (!c.sample && (!i || Date.parse(i.expiresAt) < Date.now() || i.uses >= i.maxUses)) throw new Error("This invite link has run out. Ask for a new one.")
    if (i) writeLocal(invitesKey(c.id), all.map((x) => (x.token === token ? { ...x, uses: x.uses + 1 } : x)))
    if (!c.local) writeStanding(c.id, { role: "member", requested: false })
    return c.slug
  }
  await requireMe()
  const { data, error } = await client.rpc("accept_crew_invite", { invite: token })
  fail(error)
  return typeof data === "string" && data ? data : c.slug
}

// ─── The wall ───────────────────────────────────────────────────────────────────────────────────────────────

function samplePosts(crewId: string): CrewPost[] {
  const s = sampleData(crewId)
  if (!s) return []
  return s.posts.map(([author, days, body, pinned], i) => ({
    id: `${s.slug}-${i}`,
    crewId,
    author: personWho(author),
    body,
    pinned: Boolean(pinned),
    createdAt: daysAgo(days, 9 + i),
    editedAt: null,
    sample: true,
    local: false,
  }))
}

/** Pinned posts first, then newest first. */
export const sortPosts = (list: CrewPost[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))

export async function listPosts(c: Crew): Promise<CrewPost[]> {
  const client = db()
  if (!client) {
    const pins = readLocal<Record<string, boolean>>(pinsKey(c.id), {})
    const own = readLocal<CrewPost[]>(postsKey(c.id), [])
    return sortPosts([...own, ...samplePosts(c.id)].map((p) => (p.id in pins ? { ...p, pinned: pins[p.id] } : p)))
  }
  const { data, error } = await client.from("crew_posts").select(POST_COLUMNS).eq("crew_id", c.id).order("created_at", { ascending: false }).limit(100)
  fail(error)
  return sortPosts((data as unknown as PostRow[]).map(fromPostRow))
}

export async function getPost(id: string): Promise<CrewPost | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.from("crew_posts").select(POST_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromPostRow(data as unknown as PostRow) : null
}

export function validatePost(body: string): string | null {
  if (!body.trim()) return "Write something first."
  if (body.length > CREW_LIMITS.post) return "Posts are up to 10,000 characters."
  return null
}

export async function createPost(c: Crew, body: string, mentions: string[] = []): Promise<CrewPost> {
  const problem = validatePost(body)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client) {
    const post: CrewPost = { id: crypto.randomUUID(), crewId: c.id, author: localWho(), body, pinned: false, createdAt: new Date().toISOString(), editedAt: null, sample: false, local: true }
    writeLocal(postsKey(c.id), [post, ...readLocal<CrewPost[]>(postsKey(c.id), [])].slice(0, 200))
    emitLocal(c.id)
    return post
  }
  await requireMe()
  const { data, error } = await client
    .from("crew_posts")
    .insert({ crew_id: c.id, body, mentions: mentions.slice(0, 10) })
    .select(POST_COLUMNS)
    .single()
  fail(error)
  return fromPostRow(data as unknown as PostRow)
}

export async function editPost(p: CrewPost, body: string, mentions: string[] = []): Promise<CrewPost> {
  const problem = validatePost(body)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client) {
    const editedAt = new Date().toISOString()
    writeLocal(
      postsKey(p.crewId),
      readLocal<CrewPost[]>(postsKey(p.crewId), []).map((x) => (x.id === p.id ? { ...x, body, editedAt } : x))
    )
    emitLocal(p.crewId)
    return { ...p, body, editedAt }
  }
  const { data, error } = await client.from("crew_posts").update({ body, mentions: mentions.slice(0, 10) }).eq("id", p.id).select(POST_COLUMNS).single()
  fail(error)
  return fromPostRow(data as unknown as PostRow)
}

export async function deletePost(p: CrewPost) {
  const client = db()
  if (!client) {
    writeLocal(
      postsKey(p.crewId),
      readLocal<CrewPost[]>(postsKey(p.crewId), []).filter((x) => x.id !== p.id)
    )
    emitLocal(p.crewId)
    return
  }
  const { error } = await client.from("crew_posts").delete().eq("id", p.id)
  fail(error)
}

export async function setPinned(p: CrewPost, pinned: boolean, all: CrewPost[]) {
  if (pinned && all.filter((x) => x.pinned && x.id !== p.id).length >= CREW_LIMITS.pinned) throw new Error("A crew pins up to 3 posts. Unpin one first.")
  const client = db()
  if (!client) {
    writeLocal(pinsKey(p.crewId), { ...readLocal<Record<string, boolean>>(pinsKey(p.crewId), {}), [p.id]: pinned })
    emitLocal(p.crewId)
    return
  }
  const { error } = await client.from("crew_posts").update({ pinned }).eq("id", p.id)
  fail(error)
}

// ─── Reactions on wall posts ────────────────────────────────────────────────────────────────────────────────

const emptyReactions = (): Reactions => Object.fromEntries(REACTIONS.map((e) => [e, { count: 0, mine: false }])) as Reactions

export async function getPostReactions(c: Crew, posts: CrewPost[]): Promise<Record<string, Reactions>> {
  const out: Record<string, Reactions> = Object.fromEntries(posts.map((p) => [p.id, emptyReactions()]))
  const client = db()
  if (!client) {
    const s = sampleData(c.id)
    if (s) {
      for (const [i, counts] of Object.entries(s.reactions)) {
        const r = out[`${s.slug}-${i}`]
        if (r) for (const [e, n] of Object.entries(counts)) r[e as ReactionEmoji].count += n ?? 0
      }
    }
    for (const key of readLocal<string[]>(REACTIONS_KEY, [])) {
      const [postId, emoji] = key.split("|") as [string, ReactionEmoji]
      const r = out[postId]?.[emoji]
      if (r) {
        r.count += 1
        r.mine = true
      }
    }
    return out
  }
  const ids = posts.filter((p) => !p.sample).map((p) => p.id)
  if (!ids.length) return out
  const [userId, res] = await Promise.all([me(), client.from("crew_post_reactions").select("post_id, emoji, user_id").in("post_id", ids).limit(5000)])
  fail(res.error)
  for (const row of res.data as { post_id: string; emoji: ReactionEmoji; user_id: string }[]) {
    const r = out[row.post_id]?.[row.emoji]
    if (!r) continue
    r.count += 1
    if (row.user_id === userId) r.mine = true
  }
  return out
}

export async function setPostReaction(p: CrewPost, emoji: ReactionEmoji, on: boolean) {
  if (!REACTIONS.includes(emoji)) throw new Error("You cannot react with that.")
  const client = db()
  if (!client) {
    const key = `${p.id}|${emoji}`
    const rest = readLocal<string[]>(REACTIONS_KEY, []).filter((k) => k !== key)
    writeLocal(REACTIONS_KEY, on ? [...rest, key].slice(-2000) : rest)
    return
  }
  const userId = await requireMe()
  const { error } = on
    ? await client.from("crew_post_reactions").upsert({ post_id: p.id, emoji }, { onConflict: "post_id,user_id,emoji", ignoreDuplicates: true })
    : await client.from("crew_post_reactions").delete().eq("post_id", p.id).eq("emoji", emoji).eq("user_id", userId)
  fail(error)
}

// ─── Shared collections ─────────────────────────────────────────────────────────────────────────────────────

const COLLECTION_ID = /^[a-z0-9-]{1,80}$/

/** The ids of the collections a crew shares, newest first. */
async function sharedIds(c: Crew): Promise<string[]> {
  const client = db()
  if (!client) return [...new Set([...readLocal<string[]>(sharedKey(c.id), []), ...(sampleData(c.id)?.collections ?? [])])]
  const { data, error } = await client.from("crew_collections").select("collection").eq("crew_id", c.id).order("added_at", { ascending: false }).limit(50)
  fail(error)
  return (data as { collection: string }[]).map((r) => r.collection)
}

/** The collections themselves. Private ones you cannot see are left out. */
export async function listCrewCollections(c: Crew): Promise<Collection[]> {
  const ids = await sharedIds(c)
  const found = await Promise.all(ids.map((id) => getCollection(id).catch(() => null)))
  return found.filter((x): x is Collection => Boolean(x))
}

export async function shareCollection(c: Crew, collectionId: string) {
  const id = collectionId.toLowerCase()
  if (!COLLECTION_ID.test(id)) throw new Error("That is not a collection.")
  const client = db()
  if (!client) {
    const list = readLocal<string[]>(sharedKey(c.id), [])
    if (list.length >= 50) throw new Error("A crew shares up to 50 collections.")
    writeLocal(sharedKey(c.id), [id, ...list.filter((x) => x !== id)])
    emitLocal(c.id)
    return
  }
  await requireMe()
  const { error } = await client.from("crew_collections").insert({ crew_id: c.id, collection: id })
  if (error?.code === "23505") return
  fail(error)
}

export async function unshareCollection(c: Crew, collectionId: string) {
  const client = db()
  if (!client) {
    if (sampleData(c.id)?.collections.includes(collectionId)) throw new Error("Sample collections stay on sample crews.")
    writeLocal(
      sharedKey(c.id),
      readLocal<string[]>(sharedKey(c.id), []).filter((x) => x !== collectionId)
    )
    emitLocal(c.id)
    return
  }
  const { error } = await client.from("crew_collections").delete().eq("crew_id", c.id).eq("collection", collectionId)
  fail(error)
}

// ─── Weekly activity ────────────────────────────────────────────────────────────────────────────────────────

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Posts, chat messages and people joining on each of the last seven days, oldest first. */
export async function getActivity(c: Crew): Promise<ActivityDay[]> {
  const client = db()
  const today = Date.now()
  const days = Array.from({ length: 7 }, (_, i) => isoDay(today - (6 - i) * 864e5))
  if (!client) {
    const s = sampleData(c.id)
    const own = readLocal<CrewPost[]>(postsKey(c.id), [])
    return days.map((day, i) => {
      const [posts, messages, joins] = s?.activity[i] ?? [0, 0, 0]
      return { day, posts: posts + own.filter((p) => p.createdAt.slice(0, 10) === day).length, messages, joins }
    })
  }
  const { data, error } = await client.rpc("crew_activity", { crew: c.id })
  fail(error)
  const rows = new Map((data as { day: string; posts: number; messages: number; joins: number }[]).map((r) => [r.day, r]))
  return days.map((day) => {
    const r = rows.get(day)
    return { day, posts: Number(r?.posts ?? 0), messages: Number(r?.messages ?? 0), joins: Number(r?.joins ?? 0) }
  })
}

// ─── Live updates ───────────────────────────────────────────────────────────────────────────────────────────

export type CrewHandlers = {
  onPost?: (p: CrewPost) => void
  onPostDeleted?: (id: string) => void
  onMembers?: () => void
  /** Without a database: something about this crew changed in another tab (or this one). Reload it. */
  onChange?: () => void
}

/** Listens to one crew's wall and members. Returns a function that stops listening. */
export function subscribeCrew(c: Crew, handlers: CrewHandlers) {
  const client = db()
  if (!client) {
    const set = localListeners.get(c.id) ?? new Set()
    localListeners.set(c.id, set)
    bus()
    const listener = () => handlers.onChange?.()
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }
  if (!handlers.onPost && !handlers.onPostDeleted && !handlers.onMembers) return () => {}
  const changed = (p: { new: unknown }) => {
    const id = (p.new as { id: string }).id
    getPost(id)
      .then((post) => post && handlers.onPost?.(post))
      .catch(() => {})
  }
  const channel: RealtimeChannel = client
    // Each listener gets its own topic, so the wall and the members list can listen at the same time.
    .channel(`crew:${c.id}:${crypto.randomUUID().slice(0, 8)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_posts", filter: `crew_id=eq.${c.id}` }, changed)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crew_posts", filter: `crew_id=eq.${c.id}` }, changed)
    // Deletes can't be filtered and arrive with the id only; the wall ignores ids it doesn't show.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "crew_posts" }, (p) => {
      const id = (p.old as { id?: string }).id
      if (id) handlers.onPostDeleted?.(id)
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_members", filter: `crew_id=eq.${c.id}` }, () => handlers.onMembers?.())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crew_members", filter: `crew_id=eq.${c.id}` }, () => handlers.onMembers?.())
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}
