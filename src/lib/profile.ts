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
