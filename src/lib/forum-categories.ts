"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useCaps, type Cap } from "@/lib/caps"
import { categories as PRESET_CATEGORIES, categoryGroups as PRESET_GROUPS, categoryOf } from "@/lib/data"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/*
 * The forum's groups and categories. They live in public.forum_groups and public.forum_categories (…_cms.sql),
 * which the admin panel edits; until that migration reaches a database, and in copies without one, the presets
 * in lib/data.ts describe the same forum (same slugs, so every thread keeps its category). The database checks
 * every rule here (who reads, who posts, archived, staff only, reputation); the interface only explains them.
 */

export type ReadRole = "guest" | "member" | "moderator" | "admin"
export type CategoryAccent = "ion" | "gold" | "model" | "dataset" | "tool" | "repo"

export type ForumGroup = { slug: string; name: string; blurb: string; position: number; hidden: boolean }

export type ForumCategory = {
  slug: string
  name: string
  blurb: string
  icon: string
  accent: CategoryAccent
  group: string
  position: number
  archived: boolean
  hidden: boolean
  readMinRole: ReadRole
  postCap: Cap
  replyCap: Cap
  minReputation: number
  staffOnlyPosting: boolean
  moderators: string[]
}

export const ACCENTS: { id: CategoryAccent; label: string; chip: string; dot: string }[] = [
  { id: "ion", label: "Ion blue", chip: "border-ion/25 bg-ion/10 text-ion", dot: "bg-ion" },
  { id: "gold", label: "Gold", chip: "border-gold/25 bg-gold/10 text-gold", dot: "bg-gold" },
  { id: "model", label: "Model violet", chip: "border-model/25 bg-model/10 text-model", dot: "bg-model" },
  { id: "dataset", label: "Dataset green", chip: "border-dataset/25 bg-dataset/10 text-dataset", dot: "bg-dataset" },
  { id: "tool", label: "Tool orange", chip: "border-tool/25 bg-tool/10 text-tool", dot: "bg-tool" },
  { id: "repo", label: "Repo teal", chip: "border-repo/25 bg-repo/10 text-repo", dot: "bg-repo" },
]

export const accentChip = (a: string) => (ACCENTS.find((x) => x.id === a) ?? ACCENTS[0]).chip

export const READ_ROLES: { id: ReadRole; label: string }[] = [
  { id: "guest", label: "Everyone, signed in or not" },
  { id: "member", label: "Signed-in members" },
  { id: "moderator", label: "Moderators and admins" },
  { id: "admin", label: "Admins only" },
]

const PRESET_ACCENT: Record<string, CategoryAccent> = {
  announcements: "gold",
  show: "gold",
  models: "model",
  local: "tool",
  data: "dataset",
  benchmarks: "dataset",
  policy: "gold",
  europe: "repo",
  africa: "gold",
  asia: "model",
  arabic: "tool",
}

const presetGroups = (): ForumGroup[] => PRESET_GROUPS.map((g, i) => ({ slug: g.slug, name: g.name, blurb: g.blurb, position: i, hidden: false }))

const presetCategories = (): ForumCategory[] =>
  PRESET_CATEGORIES.map((c) => ({
    slug: c.slug,
    name: c.name,
    blurb: c.blurb,
    icon: c.icon,
    accent: PRESET_ACCENT[c.slug] ?? "ion",
    group: c.group,
    position: PRESET_CATEGORIES.filter((x) => x.group === c.group).indexOf(c),
    archived: false,
    hidden: false,
    readMinRole: "guest",
    postCap: "thread.create",
    replyCap: "reply.create",
    minReputation: 0,
    staffOnlyPosting: c.slug === "announcements",
    moderators: [],
  }))

// ─── The live list ──────────────────────────────────────────────────────────────────────────────────────────

export type ForumMap = { groups: ForumGroup[]; categories: ForumCategory[]; ready: boolean; source: "database" | "presets" }

const PRESETS: ForumMap = { groups: presetGroups(), categories: presetCategories(), ready: false, source: "presets" }
let state: ForumMap = PRESETS
let started = false
const listeners = new Set<() => void>()

function set(next: ForumMap) {
  state = next
  listeners.forEach((l) => l())
}

type GroupRow = { slug: string; name: string; blurb: string; position: number; hidden: boolean }
type CategoryRow = {
  slug: string
  name: string
  description: string
  icon: string
  accent: CategoryAccent
  group_slug: string
  position: number
  archived: boolean
  hidden: boolean
  read_min_role: ReadRole
  post_cap: string
  reply_cap: string
  min_reputation: number
  staff_only_posting: boolean
  moderators: string[] | null
}

const fromCategoryRow = (r: CategoryRow): ForumCategory => ({
  slug: r.slug,
  name: r.name,
  blurb: r.description,
  icon: r.icon,
  accent: r.accent,
  group: r.group_slug,
  position: r.position,
  archived: r.archived,
  hidden: r.hidden,
  readMinRole: r.read_min_role,
  postCap: r.post_cap as Cap,
  replyCap: r.reply_cap as Cap,
  minReputation: r.min_reputation,
  staffOnlyPosting: r.staff_only_posting,
  moderators: r.moderators ?? [],
})

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) => a.position - b.position || a.name.localeCompare(b.name)

/** Reads the groups and categories. Errors (no table yet, no database) leave the presets in place. */
export async function reloadForumMap() {
  const c = db()
  if (!c) {
    set({ ...PRESETS, ready: true })
    return
  }
  const [g, k] = await Promise.all([
    c.from("forum_groups").select("slug, name, blurb, position, hidden"),
    c
      .from("forum_categories")
      .select("slug, name, description, icon, accent, group_slug, position, archived, hidden, read_min_role, post_cap, reply_cap, min_reputation, staff_only_posting, moderators"),
  ])
  if (g.error || k.error || !g.data?.length) {
    set({ ...PRESETS, ready: true })
    return
  }
  set({
    groups: (g.data as GroupRow[]).map((r) => ({ ...r })).sort(byPosition),
    categories: (k.data as CategoryRow[]).map(fromCategoryRow).sort(byPosition),
    ready: true,
    source: "database",
  })
}

function start() {
  if (started || typeof window === "undefined") return
  started = true
  void reloadForumMap()
  db()
    ?.channel("forum-map")
    .on("postgres_changes", { event: "*", schema: "public", table: "forum_categories" }, () => void reloadForumMap())
    .on("postgres_changes", { event: "*", schema: "public", table: "forum_groups" }, () => void reloadForumMap())
    .subscribe()
}

/** The forum's groups and categories, live: an admin's change shows up in every open tab. */
export function useForumMap(): ForumMap {
  useEffect(start, [])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => PRESETS
  )
}

/** A category by slug, following the first version's community slugs. */
export const findCategory = (map: Pick<ForumMap, "categories">, slug: string) => map.categories.find((c) => c.slug === categoryOf(slug))

/** Groups with their visible categories, in order; empty groups are left out. */
export function visibleGroups(map: ForumMap) {
  return map.groups
    .filter((g) => !g.hidden)
    .map((g) => ({ group: g, categories: map.categories.filter((c) => c.group === g.slug && !c.hidden) }))
    .filter((x) => x.categories.length > 0)
}

// ─── Who may post ───────────────────────────────────────────────────────────────────────────────────────────

export type PostBlock = "archived" | "staff" | "cap" | "reputation" | null

/** The same rule the database applies (forum_post_block), for explaining it before anyone fills in a form. */
export function postBlock(
  c: ForumCategory,
  me: { id: string | null; isStaff: boolean; can: (cap: Cap) => boolean; reputation: number | null },
  replying = false
): PostBlock {
  if (me.isStaff) return null
  if (c.archived) return "archived"
  if (me.id && c.moderators.includes(me.id)) return null
  if (!replying && c.staffOnlyPosting) return "staff"
  if (!me.can(replying ? c.replyCap : c.postCap)) return "cap"
  if (!replying && c.minReputation > 0 && me.reputation !== null && me.reputation < c.minReputation) return "reputation"
  return null
}

export function postBlockText(b: PostBlock, c: ForumCategory) {
  switch (b) {
    case "archived":
      return `${c.name} is archived. You can read it, but it takes no new posts.`
    case "staff":
      return `Only the Nexverse team starts threads in ${c.name}. Members can reply.`
    case "cap":
      return `Your account cannot post in ${c.name} yet.`
    case "reputation":
      return `Starting a thread in ${c.name} needs ${c.minReputation.toLocaleString("en")} reputation. Help out elsewhere in the forum to get there.`
    default:
      return ""
  }
}

/** Whether you may start a thread (or reply) in a category, as far as this browser can tell. */
export function usePostBlock(c: ForumCategory | undefined, replying = false): { ready: boolean; block: PostBlock; signedIn: boolean } {
  const role = useRole()
  const caps = useCaps()
  const { user } = useSession()
  const id = user?.id ?? null
  const needsRep = Boolean(c && !replying && c.minReputation > 0 && id)
  const [rep, setRep] = useState<{ id: string; points: number | null } | null>(null)
  useEffect(() => {
    if (!needsRep || !id) return
    let on = true
    void myReputation(id).then((points) => on && setRep({ id, points }))
    return () => {
      on = false
    }
  }, [needsRep, id])
  if (!c) return { ready: state.ready, block: null, signedIn: Boolean(id) }
  // Without a database everything stays local and open.
  if (!live) return { ready: true, block: c.archived ? "archived" : null, signedIn: true }
  const reputation = needsRep ? (rep?.id === id ? rep.points : null) : null
  const ready = role.ready && caps.ready && (!needsRep || rep?.id === id)
  return { ready, block: postBlock(c, { id, isStaff: role.isStaff, can: caps.can, reputation }, replying), signedIn: Boolean(id) }
}

let repCache: { id: string; points: number } | null = null

/** Your reputation points, for the minimum-reputation rule. Null when it cannot be read. */
export async function myReputation(id: string): Promise<number | null> {
  if (repCache?.id === id) return repCache.points
  const c = db()
  if (!c) return null
  const { data, error } = await c.rpc("member_reputation", { member: id })
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as { points?: number } | null
  const points = Number(row?.points ?? 0)
  repCache = { id, points }
  return points
}

// ─── Category moderators ────────────────────────────────────────────────────────────────────────────────────

/** Pins, locks or hides a thread, or hides a reply, as staff or as one of the category's moderators. */
export async function categoryModerate(kind: "question" | "answer", id: string, act: "pin" | "unpin" | "lock" | "unlock" | "hide" | "unhide") {
  const c = db()
  if (!c) throw new Error("Moderation needs the database.")
  const { error } = await c.rpc("forum_moderate", { kind, target: id, act, note: "" })
  if (error && /forum_moderate|schema cache|does not exist/.test(error.message)) throw new Error("Category moderation is not switched on in the database yet.")
  if (error) throw new Error(error.message)
}

// ─── Admin ──────────────────────────────────────────────────────────────────────────────────────────────────

export const CATEGORY_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/

function need() {
  const c = db()
  if (!c) throw new Error("Editing the forum needs the database. Connect Supabase first.")
  return c
}

function explain(error: { message: string; code?: string } | null) {
  if (!error) return
  if (error.code === "23505") throw new Error("That address is already taken. Pick another slug.")
  if (error.code === "23503") throw new Error("This group still has categories. Move or remove them first.")
  if (error.code === "23514") throw new Error("Something does not fit the rules: check the slug (lowercase letters, numbers and dashes) and the lengths.")
  if (error.code === "42501" || /row-level security/i.test(error.message)) throw new Error("Your account cannot manage the forum.")
  if (/schema cache|does not exist/.test(error.message)) throw new Error("Forum categories are not switched on in the database yet (migration …_cms.sql).")
  throw new Error(error.message)
}

const toCategoryRow = (c: ForumCategory) => ({
  slug: c.slug,
  name: c.name.trim(),
  description: c.blurb.trim(),
  icon: c.icon,
  accent: c.accent,
  group_slug: c.group,
  position: c.position,
  archived: c.archived,
  hidden: c.hidden,
  read_min_role: c.readMinRole,
  post_cap: c.postCap,
  reply_cap: c.replyCap,
  min_reputation: Math.max(0, Math.round(c.minReputation)),
  staff_only_posting: c.staffOnlyPosting,
  moderators: c.moderators,
})

export async function createCategory(c: ForumCategory) {
  const { error } = await need().from("forum_categories").insert(toCategoryRow(c))
  explain(error)
  await reloadForumMap()
}

/** Saves a category under its original slug (the slug itself never changes: threads point at it). */
export async function updateCategory(c: ForumCategory) {
  const row: Partial<ReturnType<typeof toCategoryRow>> = toCategoryRow(c)
  delete row.slug
  const { error } = await need().from("forum_categories").update(row).eq("slug", c.slug)
  explain(error)
  await reloadForumMap()
}

/** Removes a category that has no threads. Categories with threads are archived or hidden instead. */
export async function deleteCategory(slug: string) {
  const c = need()
  const { count, error: countError } = await c.from("questions").select("id", { count: "exact", head: true }).eq("orbit", slug)
  if (countError) explain(countError)
  if ((count ?? 0) > 0) throw new Error(`This category has ${count} ${count === 1 ? "thread" : "threads"}. Archive or hide it instead, so they stay readable.`)
  const { error } = await c.from("forum_categories").delete().eq("slug", slug)
  explain(error)
  await reloadForumMap()
}

export async function saveGroup(g: ForumGroup, isNew: boolean) {
  const c = need()
  const row = { name: g.name.trim(), blurb: g.blurb.trim(), position: g.position, hidden: g.hidden }
  const { error } = isNew ? await c.from("forum_groups").insert({ slug: g.slug, ...row }) : await c.from("forum_groups").update(row).eq("slug", g.slug)
  explain(error)
  await reloadForumMap()
}

export async function deleteGroup(slug: string) {
  const { error } = await need().from("forum_groups").delete().eq("slug", slug)
  explain(error)
  await reloadForumMap()
}

/** Saves a new order in one call (one line in the moderation log). */
export async function reorder(what: "forum_groups" | "forum_categories", slugs: string[]) {
  const { error } = await need().rpc("cms_reorder", { what, slugs })
  explain(error)
  await reloadForumMap()
}

// Members, for picking category moderators.

export type MemberHit = { id: string; name: string; handle: string | null }

export async function searchMembers(q: string): Promise<MemberHit[]> {
  const c = db()
  const term = q.replace(/[%_,()]/g, " ").trim()
  if (!c || term.length < 2) return []
  const like = `%${term}%`
  const { data } = await c.from("profiles").select("id, name, handle").or(`name.ilike.${like},handle.ilike.${like}`).limit(8)
  return (data as MemberHit[] | null) ?? []
}

export async function membersByIds(ids: string[]): Promise<MemberHit[]> {
  const c = db()
  if (!c || !ids.length) return []
  const { data } = await c.from("profiles").select("id, name, handle").in("id", ids)
  return (data as MemberHit[] | null) ?? []
}
