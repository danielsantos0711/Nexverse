import { useEffect, useSyncExternalStore } from "react"
import { categories, KINDS, type ResourceKind } from "@/lib/data"
import { renameMember, useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * A member's profile beyond their name: handle, picture, bio, links, interests and notification switches.
 * With a database it lives on public.profiles and pictures go to the "avatars" storage bucket; without one
 * it is kept in this browser and the picture is an initials avatar drawn from the name.
 */

export type NotifyKind = "reply" | "like" | "follow" | "mention" | "digest"
export type NotifyPrefs = Record<NotifyKind, boolean>

export const NOTIFY_OPTIONS: { kind: NotifyKind; label: string; hint: string }[] = [
  { kind: "reply", label: "Replies", hint: "Someone answers your thread or comments on your project." },
  { kind: "like", label: "Likes", hint: "Someone upvotes your thread or likes your project." },
  { kind: "follow", label: "New followers", hint: "Someone starts following you." },
  { kind: "mention", label: "Mentions", hint: "Someone mentions you by name." },
  { kind: "digest", label: "Weekly email digest", hint: "A short email with what happened around the things you follow. Coming soon." },
]

export const DEFAULT_NOTIFY: NotifyPrefs = { reply: true, like: true, follow: true, mention: true, digest: false }

export type Profile = {
  id: string
  name: string
  handle: string | null
  bio: string
  website: string
  github: string
  location: string
  /** "category:<slug>" and "kind:<model|dataset|tool|repo>". */
  interests: string[]
  avatarUrl: string | null
  notify: NotifyPrefs
  onboardedAt: string | null
  deletionRequestedAt: string | null
  local: boolean
}

export type ProfilePatch = Partial<Pick<Profile, "name" | "handle" | "bio" | "website" | "github" | "location" | "interests" | "notify">>

export const HANDLE = /^[a-z0-9_]{3,30}$/
export const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
export const INTEREST = /^(category|kind):[a-z0-9-]{1,40}$/
export const PROFILE_LIMITS = { name: 60, bio: 300, location: 80, website: 300, interests: 30 } as const
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Every interest a member can pick: the forum's categories and the four kinds of thing on the hub. */
export const INTERESTS = [
  ...(Object.keys(KINDS) as ResourceKind[]).map((k) => ({ id: `kind:${k}`, label: KINDS[k].plural, group: "kind" as const })),
  ...categories.map((c) => ({ id: `category:${c.slug}`, label: c.name, group: "category" as const })),
]

export type ProfileErrors = Partial<Record<"name" | "handle" | "bio" | "website" | "github" | "location" | "interests", string>>

export function validateProfile(p: ProfilePatch): ProfileErrors {
  const e: ProfileErrors = {}
  if (p.name !== undefined) {
    const n = p.name.trim()
    if (!n) e.name = "Your name cannot be empty."
    else if (n.length > PROFILE_LIMITS.name) e.name = "Use up to 60 characters."
  }
  if (p.handle && !HANDLE.test(p.handle)) e.handle = "Use 3 to 30 lowercase letters, numbers or underscores."
  if (p.bio !== undefined && p.bio.length > PROFILE_LIMITS.bio) e.bio = "Keep your bio to 300 characters."
  if (p.website) {
    try {
      const u = new URL(p.website)
      if (u.protocol !== "https:" || /\s/.test(p.website)) e.website = "Use a full link that starts with https://"
      else if (p.website.length > PROFILE_LIMITS.website) e.website = "That link is too long."
    } catch {
      e.website = "Use a full link that starts with https://"
    }
  }
  if (p.github && !GITHUB_HANDLE.test(p.github)) e.github = "That is not a GitHub username. Leave out the @ and the github.com part."
  if (p.location !== undefined && p.location.length > PROFILE_LIMITS.location) e.location = "Keep it to 80 characters."
  if (p.interests && p.interests.length > PROFILE_LIMITS.interests) e.interests = "Pick up to 30 interests."
  return e
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (error.code === "23505") throw new Error("That handle is taken. Try another one.")
  throw new Error(error.message)
}

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const LOCAL_KEY = "nexverse-profile"

function readLocalProfile(): Profile {
  let stored: Partial<Profile> = {}
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}")
    if (v && typeof v === "object" && !Array.isArray(v)) stored = v
  } catch {}
  return {
    id: "local",
    name: typeof stored.name === "string" && stored.name ? stored.name : "You",
    handle: typeof stored.handle === "string" ? stored.handle : null,
    bio: typeof stored.bio === "string" ? stored.bio : "",
    website: typeof stored.website === "string" ? stored.website : "",
    github: typeof stored.github === "string" ? stored.github : "",
    location: typeof stored.location === "string" ? stored.location : "",
    interests: Array.isArray(stored.interests) ? stored.interests.filter((i) => typeof i === "string" && INTEREST.test(i)) : [],
    avatarUrl: null,
    notify: { ...DEFAULT_NOTIFY, ...(stored.notify ?? {}) },
    onboardedAt: typeof stored.onboardedAt === "string" ? stored.onboardedAt : null,
    deletionRequestedAt: null,
    local: true,
  }
}

function writeLocalProfile(p: Profile) {
  const { name, handle, bio, website, github, location, interests, notify, onboardedAt } = p
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ name, handle, bio, website, github, location, interests, notify, onboardedAt }))
  } catch {
    throw new Error("This browser would not save your profile. Allow site data and try again.")
  }
}

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const COLUMNS = "id, name, handle, bio, website, github, location, interests, avatar_url, notify_prefs, onboarded_at, deletion_requested_at"

type Row = {
  id: string
  name: string
  handle: string | null
  bio: string | null
  website: string | null
  github: string | null
  location: string | null
  interests: string[] | null
  avatar_url: string | null
  notify_prefs: Partial<NotifyPrefs> | null
  onboarded_at: string | null
  deletion_requested_at: string | null
}

const fromRow = (r: Row): Profile => ({
  id: r.id,
  name: r.name,
  handle: r.handle,
  bio: r.bio ?? "",
  website: r.website ?? "",
  github: r.github ?? "",
  location: r.location ?? "",
  interests: r.interests ?? [],
  avatarUrl: r.avatar_url,
  notify: { ...DEFAULT_NOTIFY, ...(r.notify_prefs ?? {}) },
  onboardedAt: r.onboarded_at,
  deletionRequestedAt: r.deletion_requested_at,
  local: false,
})

async function me() {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session ? { client, id: data.session.user.id } : null
}

// ─── Shared store ───────────────────────────────────────────────────────────────────────────────────────────

type State = { ready: boolean; profile: Profile | null; error: string }
const SERVER: State = { ready: false, profile: null, error: "" }
let state: State = SERVER
let loadedFor: string | undefined
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Your profile: null when signed out. In a copy without a database, the profile kept in this browser. */
export async function getMyProfile(): Promise<Profile | null> {
  if (!live) return readLocalProfile()
  const s = await me()
  if (!s) return null
  const { data, error } = await s.client.from("profiles").select(COLUMNS).eq("id", s.id).maybeSingle()
  fail(error)
  return data ? fromRow(data as Row) : null
}

async function load(owner: string) {
  try {
    const profile = await getMyProfile()
    if (loadedFor === owner) set({ ready: true, profile, error: "" })
  } catch (e) {
    if (loadedFor === owner) set({ ready: true, profile: null, error: (e as Error).message })
  }
}

/** Your profile, shared by every component that asks for it. */
export function useProfile() {
  const session = useSession()
  const owner = live ? (session.ready ? (session.user?.id ?? "") : undefined) : "local"
  useEffect(() => {
    if (owner === undefined || loadedFor === owner) return
    loadedFor = owner
    set({ ...SERVER })
    void load(owner)
  }, [owner])
  return useSyncExternalStore(subscribe, () => state, () => SERVER)
}

function patchState(p: Partial<Profile>) {
  if (state.profile) set({ ...state, profile: { ...state.profile, ...p } })
}

/** Saves the fields given. The name also updates the signed-in session, so the header changes at once. */
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const errors = validateProfile(patch)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  const clean: ProfilePatch = {
    ...patch,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.bio !== undefined && { bio: patch.bio.trim() }),
    ...(patch.location !== undefined && { location: patch.location.trim() }),
    ...(patch.website !== undefined && { website: patch.website.trim() }),
    ...(patch.github !== undefined && { github: patch.github.trim().replace(/^@/, "") }),
    ...(patch.interests && { interests: [...new Set(patch.interests)].filter((i) => INTEREST.test(i)) }),
  }
  if (!live) {
    const next = { ...readLocalProfile(), ...clean }
    writeLocalProfile(next)
    patchState(next)
    return next
  }
  const s = await me()
  if (!s) throw new Error("Sign in to edit your profile.")
  const row: Record<string, unknown> = {}
  if (clean.handle !== undefined) row.handle = clean.handle || null
  if (clean.bio !== undefined) row.bio = clean.bio
  if (clean.website !== undefined) row.website = clean.website || null
  if (clean.github !== undefined) row.github = clean.github || null
  if (clean.location !== undefined) row.location = clean.location
  if (clean.interests !== undefined) row.interests = clean.interests
  if (clean.notify !== undefined) row.notify_prefs = clean.notify
  if (Object.keys(row).length) {
    const { error } = await s.client.from("profiles").update(row).eq("id", s.id)
    fail(error)
  }
  if (clean.name !== undefined && clean.name !== state.profile?.name) await renameMember(s.id, clean.name)
  patchState(clean)
  return state.profile ?? (await getMyProfile())!
}

/** Whether a handle is free (yours counts as free). */
export async function handleAvailable(handle: string): Promise<boolean> {
  if (!HANDLE.test(handle)) return false
  const s = await me()
  if (!s) return true
  const { data, error } = await s.client.from("profiles").select("id").eq("handle", handle).neq("id", s.id).limit(1)
  fail(error)
  return (data ?? []).length === 0
}

/** True when pictures can be uploaded (a database is connected and you are signed in). */
export const canUploadAvatar = () => live

/** Uploads a new picture to "avatars/<your id>/", points your profile at it and removes the old files. */
export async function uploadAvatar(file: File): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.")
  if (file.size > AVATAR_MAX_BYTES) throw new Error("Use an image under 2 MB.")
  const s = await me()
  if (!s) throw new Error("Sign in to upload a picture.")
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[file.type]
  const path = `${s.id}/avatar-${Date.now()}.${ext}`
  const bucket = s.client.storage.from("avatars")
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
  if (error) throw new Error(error.message)
  const url = bucket.getPublicUrl(path).data.publicUrl
  const { error: saveError } = await s.client.from("profiles").update({ avatar_url: url }).eq("id", s.id)
  if (saveError) {
    await bucket.remove([path])
    fail(saveError)
  }
  patchState({ avatarUrl: url })
  void removeOldAvatars(path)
  return url
}

async function removeOldAvatars(keep?: string) {
  const s = await me()
  if (!s) return
  const bucket = s.client.storage.from("avatars")
  const { data } = await bucket.list(s.id, { limit: 100 })
  const old = (data ?? []).map((f) => `${s.id}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await bucket.remove(old)
}

export async function removeAvatar() {
  const s = await me()
  if (!s) return
  const { error } = await s.client.from("profiles").update({ avatar_url: null }).eq("id", s.id)
  fail(error)
  patchState({ avatarUrl: null })
  await removeOldAvatars().catch(() => {})
}

/** Saves the interests picked during onboarding and marks it done. */
export async function completeOnboarding(interests: string[]) {
  const at = new Date().toISOString()
  if (!live) {
    const next = { ...readLocalProfile(), interests, onboardedAt: at }
    writeLocalProfile(next)
    patchState(next)
    return
  }
  await updateProfile({ interests })
  const s = await me()
  if (!s) throw new Error("Sign in first.")
  const { error } = await s.client.from("profiles").update({ onboarded_at: at }).eq("id", s.id)
  fail(error)
  patchState({ onboardedAt: at })
}

/** True when the signed-in member has not been through /welcome yet. Use after sign-in to decide where to go. */
export async function needsWelcome(): Promise<boolean> {
  try {
    const p = await getMyProfile()
    return Boolean(p && !p.local && !p.onboardedAt)
  } catch {
    return false
  }
}

/** Asks for your account and everything you wrote to be deleted, or withdraws the request. */
export async function requestAccountDeletion(requested: boolean): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.rpc("set_account_deletion", { requested })
  fail(error)
  const at = (data as string | null) ?? null
  patchState({ deletionRequestedAt: at })
  return at
}

/** Removes everything Nexverse keeps in this browser (drafts, local projects, bookmarks, likes, profile). */
export function clearLocalData() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith("nexverse-")) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {}
  if (loadedFor !== undefined) void load(loadedFor)
}

// ─── A member's space ───────────────────────────────────────────────────────────────────────────────────────

/**
 * What a member chose for their profile page (public.member_spaces, supabase/migrations/…_engage.sql): a cover,
 * an accent colour, which world their planet is, a tagline and a status line, up to six pinned things, up to six
 * badges on display, and how their work is laid out. Everyone can read it; only the member writes it. Before the
 * migration (or without a database) every profile uses the defaults and saving explains why it cannot.
 */
export type SpaceLayout = "grid" | "list" | "orbit"
export type PlanetWorld = "ion" | "tide" | "champagne" | "violet" | "ice" | "ember" | "moss"

/** The seven worlds, in the order MemberPlanet's palette lists them. */
export const PLANET_WORLDS: { id: PlanetWorld; label: string }[] = [
  { id: "ion", label: "Ion bands" },
  { id: "tide", label: "Tide marble" },
  { id: "champagne", label: "Champagne bands" },
  { id: "violet", label: "Violet bands" },
  { id: "ice", label: "Ice marble" },
  { id: "ember", label: "Ember bands" },
  { id: "moss", label: "Moss marble" },
]

export type MemberSpace = {
  cover: string | null
  accent: string
  planet: PlanetWorld | null
  tagline: string
  status: string
  pinned: string[]
  badges: string[]
  layout: SpaceLayout
}

export const DEFAULT_SPACE: MemberSpace = { cover: null, accent: "ion", planet: null, tagline: "", status: "", pinned: [], badges: [], layout: "grid" }
export const SPACE_LIMITS = { tagline: 80, status: 60, pinned: 6, badges: 6 } as const
const PIN = /^[a-z]{2,16}:[a-z0-9-]{1,80}$/
const BADGE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

type SpaceRow = { cover: string | null; accent: string; planet: string | null; tagline: string; status: string; pinned: string[] | null; badges: string[] | null; layout: string }

const fromSpaceRow = (r: SpaceRow): MemberSpace => ({
  cover: r.cover,
  accent: r.accent || "ion",
  planet: PLANET_WORLDS.some((w) => w.id === r.planet) ? (r.planet as PlanetWorld) : null,
  tagline: r.tagline ?? "",
  status: r.status ?? "",
  pinned: (r.pinned ?? []).filter((p) => PIN.test(p)),
  badges: (r.badges ?? []).filter((b) => BADGE_ID.test(b)),
  layout: r.layout === "list" || r.layout === "orbit" ? r.layout : "grid",
})

/** A member's space, or the defaults (also when the table is not there yet). */
export async function getMemberSpace(memberId: string): Promise<MemberSpace> {
  const client = db()
  if (!client) {
    try {
      const v = JSON.parse(localStorage.getItem("nexverse-space") ?? "null")
      return v ? { ...DEFAULT_SPACE, ...v } : DEFAULT_SPACE
    } catch {
      return DEFAULT_SPACE
    }
  }
  const { data, error } = await client.from("member_spaces").select("cover, accent, planet, tagline, status, pinned, badges, layout").eq("member_id", memberId).maybeSingle()
  if (error || !data) return DEFAULT_SPACE
  return fromSpaceRow(data as SpaceRow)
}

export function validateSpace(s: MemberSpace): string | null {
  if (s.tagline.length > SPACE_LIMITS.tagline) return "Keep the tagline to 80 characters."
  if (s.status.length > SPACE_LIMITS.status) return "Keep the status to 60 characters."
  if (s.pinned.length > SPACE_LIMITS.pinned) return "Pin up to six things."
  if (s.badges.length > SPACE_LIMITS.badges) return "Show up to six badges."
  if (s.cover && !s.cover.startsWith("pattern:") && !/^https:\/\/[^\s]+$/.test(s.cover)) return "Use a full https:// link to an image for the cover."
  return null
}

/** Saves your space (you, signed in). */
export async function saveMemberSpace(s: MemberSpace): Promise<void> {
  const problem = validateSpace(s)
  if (problem) throw new Error(problem)
  const clean = { ...s, tagline: s.tagline.trim(), status: s.status.trim(), pinned: [...new Set(s.pinned)].filter((p) => PIN.test(p)), badges: [...new Set(s.badges)].filter((b) => BADGE_ID.test(b)) }
  const client = db()
  if (!client) {
    try {
      localStorage.setItem("nexverse-space", JSON.stringify(clean))
    } catch {
      throw new Error("This browser would not save that.")
    }
    return
  }
  const who = await me()
  if (!who) throw new Error("Sign in first.")
  const { error } = await client.from("member_spaces").upsert({ member_id: who.id, ...clean }, { onConflict: "member_id" })
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message)) throw new Error("Profile customisation is still being switched on for this site. Try again soon.")
    if (/row-level security/.test(error.message)) throw new Error("You are not allowed to change this profile. Paused accounts cannot until the pause ends.")
    throw new Error(error.message)
  }
}

// ─── Feed tuning ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How a member tuned their "For you" feed (public.feed_tuning, private to them): kinds of card they hid, members
 * or categories they see less of, and single items they marked "not interested". Kept in this browser without a
 * database, or while the table is not there yet.
 */
export type FeedTuning = { hiddenKinds: string[]; muted: string[]; hidden: string[] }
export const EMPTY_TUNING: FeedTuning = { hiddenKinds: [], muted: [], hidden: [] }
const TUNING_KEY = "nexverse-feed-tuning"

function readLocalTuning(): FeedTuning {
  try {
    const v = JSON.parse(localStorage.getItem(TUNING_KEY) ?? "null")
    return v ? { ...EMPTY_TUNING, ...v } : EMPTY_TUNING
  } catch {
    return EMPTY_TUNING
  }
}

export async function getFeedTuning(): Promise<FeedTuning> {
  const who = await me()
  if (!who) return readLocalTuning()
  const { data, error } = await who.client.from("feed_tuning").select("hidden_kinds, muted, hidden").eq("member_id", who.id).maybeSingle()
  if (error) return readLocalTuning()
  if (!data) return EMPTY_TUNING
  const r = data as { hidden_kinds: string[]; muted: string[]; hidden: string[] }
  return { hiddenKinds: r.hidden_kinds ?? [], muted: r.muted ?? [], hidden: r.hidden ?? [] }
}

export async function saveFeedTuning(t: FeedTuning): Promise<void> {
  const clean = { hiddenKinds: [...new Set(t.hiddenKinds)].slice(0, 12), muted: [...new Set(t.muted)].slice(-200), hidden: [...new Set(t.hidden)].slice(-500) }
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(clean))
  } catch {}
  const who = await me()
  if (!who) return
  const { error } = await who.client.from("feed_tuning").upsert({ member_id: who.id, hidden_kinds: clean.hiddenKinds, muted: clean.muted, hidden: clean.hidden }, { onConflict: "member_id" })
  // Before the table exists the browser copy above is what counts.
  if (error && !/does not exist|schema cache|Could not find/i.test(error.message)) throw new Error(error.message)
}
