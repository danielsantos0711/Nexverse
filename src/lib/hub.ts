import { describeLabTarget } from "@/components/lab/tools"
import { getCollection } from "@/lib/community"
import { getCategory, KINDS, type LanguageCode, type ResourceKind } from "@/lib/data"
import { describeLiveTarget, internalHref } from "@/lib/live/ids"
import { getProjectStats, listProjects, projectPath, type Project, type ProjectStats } from "@/lib/projects"
import { getMemberNames, getMemberThreads } from "@/lib/social"
import type { Member } from "@/lib/store"
import { hostOf, isHubId, ownerHref } from "@/lib/refs"
import { db } from "@/lib/supabase"

/**
 * The hub's real content, in one shape: projects members publish in the studio (public.projects) and links they
 * share (public.submissions). Nothing here is invented: with a database it is what members wrote, without one it
 * is what this browser saved. Live GitHub and arXiv data is fetched on the server (lib/live) and shown next to it.
 *
 * Keys follow the like/save convention: "project:<uuid>" for a project, "share:<uuid>" for a shared link.
 */

export { hostOf, isHubId, ownerHref }

export type HubOwner = { id: string | null; name: string; handle: string | null; avatarUrl: string | null }

export type HubEntry = {
  /** Like and bookmark key. */
  key: string
  id: string
  source: "project" | "share"
  kind: ResourceKind
  name: string
  summary: string
  /** Its page on Nexverse. */
  href: string
  /** For shared links: where the link points (shown as "Open link", or mapped onto a Nexverse page when it can be). */
  url: string | null
  owner: HubOwner | null
  tags: string[]
  /** Projects only. */
  license: string | null
  langs: LanguageCode[]
  /** Published (projects) or shared (links). */
  date: string
  featured: boolean
  local: boolean
}

export function fromProject(p: Project): HubEntry {
  return {
    key: `project:${p.id}`,
    id: p.id,
    source: "project",
    kind: p.kind,
    name: p.name,
    summary: p.summary,
    href: projectPath(p.id),
    url: null,
    owner: p.owner ? { id: p.owner.id, name: p.owner.name, handle: p.owner.handle, avatarUrl: p.owner.avatarUrl } : p.local ? { id: null, name: "You, in this browser", handle: null, avatarUrl: null } : null,
    tags: p.tags,
    license: p.license === "unspecified" ? null : p.license,
    langs: p.langs,
    date: p.publishedAt ?? p.updatedAt,
    featured: false,
    local: p.local,
  }
}

// ─── Shared links ───────────────────────────────────────────────────────────────────────────────────────────

export type SubmissionKind = ResourceKind | "news"

export type Share = {
  id: string
  kind: SubmissionKind
  title: string
  url: string
  summary: string
  tags: string[]
  createdAt: string
  featuredAt: string | null
  author: (Member & { handle?: string | null; avatarUrl?: string | null }) | null
  local: boolean
}

const BASE_COLUMNS = "id, kind, title, url, summary, tags, created_at, author:profiles(id, name, handle, avatar_url)"
const MOD_COLUMNS = `${BASE_COLUMNS}, featured_at, hidden_at`
const LOCAL_KEY = "nexverse-submissions"

type ShareRow = {
  id: string
  kind: SubmissionKind
  title: string
  url: string
  summary: string
  tags: string[] | null
  created_at: string
  featured_at?: string | null
  hidden_at?: string | null
  author: { id: string; name: string; handle: string | null; avatar_url: string | null } | null
}
type LocalShare = { id: string; kind: SubmissionKind; title: string; url: string; summary: string; tags?: string[]; date: string }

const fromRow = (r: ShareRow): Share => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  url: r.url,
  summary: r.summary,
  tags: r.tags ?? [],
  createdAt: r.created_at,
  featuredAt: r.featured_at ?? null,
  author: r.author ? { id: r.author.id, name: r.author.name, handle: r.author.handle, avatarUrl: r.author.avatar_url } : null,
  local: false,
})

const fromLocal = (s: LocalShare): Share => ({ id: s.id, kind: s.kind, title: s.title, url: s.url, summary: s.summary, tags: s.tags ?? [], createdAt: s.date, featuredAt: null, author: null, local: true })

function readLocal(): LocalShare[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]")
    return Array.isArray(v) ? (v as LocalShare[]).filter((s) => s && typeof s.id === "string" && typeof s.url === "string") : []
  } catch {
    return []
  }
}

/** True when an error only says the moderation columns (featured_at, hidden_at) are not in the database yet. */
const missingModColumns = (e: { message: string } | null) => Boolean(e && /featured_at|hidden_at|schema cache|does not exist/.test(e.message))

/**
 * Shared links, newest first, featured ones first when asked. Hidden links are left out of public lists (the
 * database already hides them from everyone but their author and staff; this keeps an author's own hidden link out
 * of the public pages too). Works before the moderation migration is applied: it then reads the plain columns.
 */
export async function listShares({ kind, kinds, author, limit = 30, featuredFirst = false }: { kind?: SubmissionKind; kinds?: SubmissionKind[]; author?: string; limit?: number; featuredFirst?: boolean } = {}): Promise<Share[]> {
  const client = db()
  if (!client) {
    if (author) return []
    return readLocal()
      .filter((s) => (!kind || s.kind === kind) && (!kinds || kinds.includes(s.kind)))
      .slice(0, limit)
      .map(fromLocal)
  }
  const build = (columns: string, mod: boolean) => {
    let q = client.from("submissions").select(columns).limit(limit)
    if (mod && featuredFirst) q = q.order("featured_at", { ascending: false, nullsFirst: false })
    q = q.order("created_at", { ascending: false })
    if (mod && !author) q = q.is("hidden_at", null)
    if (kind) q = q.eq("kind", kind)
    if (kinds) q = q.in("kind", kinds)
    if (author) q = q.eq("author_id", author)
    return q
  }
  let res = await build(MOD_COLUMNS, true)
  if (missingModColumns(res.error)) res = await build(BASE_COLUMNS, false)
  if (res.error) throw new Error(res.error.message)
  return (res.data as unknown as ShareRow[]).map(fromRow)
}

export async function getShare(id: string): Promise<Share | null> {
  if (!isHubId(id)) return null
  const client = db()
  if (!client) {
    const s = readLocal().find((x) => x.id === id)
    return s ? fromLocal(s) : null
  }
  let res = await client.from("submissions").select(MOD_COLUMNS).eq("id", id).maybeSingle()
  if (missingModColumns(res.error)) res = await client.from("submissions").select(BASE_COLUMNS).eq("id", id).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? fromRow(res.data as unknown as ShareRow) : null
}

export async function getShares(ids: string[]): Promise<Share[]> {
  const list = ids.filter(isHubId).slice(0, 200)
  if (!list.length) return []
  const client = db()
  if (!client) return readLocal().filter((s) => list.includes(s.id)).map(fromLocal)
  const { data, error } = await client.from("submissions").select(BASE_COLUMNS).in("id", list)
  if (error) throw new Error(error.message)
  return (data as unknown as ShareRow[]).map(fromRow)
}

export async function deleteShare(id: string) {
  const client = db()
  if (!client) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(readLocal().filter((s) => s.id !== id)))
    } catch {}
    return
  }
  const { error } = await client.from("submissions").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

/** Where a shared link is read on Nexverse: its own page. */
export const sharePath = (s: Pick<Share, "id" | "kind">) => (s.kind === "news" ? `/news/${s.id}` : `${KINDS[s.kind].path}/${s.id}`)

export function fromShare(s: Share): HubEntry {
  const kind = s.kind === "news" ? "repo" : s.kind
  return {
    key: `share:${s.id}`,
    id: s.id,
    source: "share",
    kind,
    name: s.title,
    summary: s.summary,
    href: sharePath(s),
    url: s.url,
    owner: s.author ? { id: s.author.id, name: s.author.name, handle: s.author.handle ?? null, avatarUrl: s.author.avatarUrl ?? null } : s.local ? { id: null, name: "You, in this browser", handle: null, avatarUrl: null } : null,
    tags: s.tags,
    license: null,
    langs: [],
    date: s.createdAt,
    featured: Boolean(s.featuredAt),
    local: s.local,
  }
}

/** A shared link's Nexverse page when it points at GitHub or arXiv, so readers stay on the site. */
export const shareInternalHref = (s: Pick<Share, "url">) => internalHref(s.url)

// ─── The hub catalogue ──────────────────────────────────────────────────────────────────────────────────────

export type HubList = { entries: HubEntry[]; stats: Record<string, ProjectStats>; errors: string[] }

/**
 * Everything members published or shared, of one kind or all four: featured first, then newest. Each source
 * fails on its own, so a missing table does not blank the page; errors are returned for an honest notice.
 */
export async function listHub({ kind, limit = 60 }: { kind?: ResourceKind; limit?: number } = {}): Promise<HubList> {
  const [projects, shares] = await Promise.allSettled([
    listProjects({ kind, limit }),
    listShares({ kind, kinds: kind ? undefined : ["model", "dataset", "tool", "repo"], limit, featuredFirst: true }),
  ])
  const errors: string[] = []
  const list: HubEntry[] = []
  if (projects.status === "fulfilled") list.push(...projects.value.map(fromProject))
  else errors.push(String((projects.reason as Error)?.message ?? projects.reason))
  if (shares.status === "fulfilled") list.push(...shares.value.map(fromShare))
  else errors.push(String((shares.reason as Error)?.message ?? shares.reason))
  list.sort((a, b) => Number(b.featured) - Number(a.featured) || b.date.localeCompare(a.date))
  const ids = list.filter((e) => e.source === "project" && !e.local).map((e) => e.id)
  const stats = ids.length ? await getProjectStats(ids).catch(() => ({})) : {}
  return { entries: list, stats, errors }
}

/** Newest-first projects by id. Missing or private ones are absent. */
export async function getProjects(ids: string[]): Promise<Project[]> {
  const list = ids.filter(isHubId).slice(0, 200)
  if (!list.length) return []
  const client = db()
  if (!client) return (await listProjects({ owner: "local", limit: 500 })).filter((p) => list.includes(p.id))
  const { data, error } = await client
    .from("projects")
    .select("id, owner_id, kind, name, slug, summary, tags, license, langs, repo_url, paper_url, demo_url, status, created_at, updated_at, published_at, owner:profiles(id, name, handle, avatar_url)")
    .in("id", list)
  if (error) throw new Error(error.message)
  return (data as unknown as Parameters<typeof rowToProject>[0][]).map(rowToProject)
}

function rowToProject(r: {
  id: string
  owner_id: string
  kind: ResourceKind
  name: string
  slug: string
  summary: string
  tags: string[] | null
  license: string
  langs: string[] | null
  repo_url: string | null
  paper_url: string | null
  demo_url: string | null
  status: "draft" | "published"
  created_at: string
  updated_at: string
  published_at: string | null
  owner: { id: string; name: string; handle: string | null; avatar_url: string | null } | null
}): Project {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    summary: r.summary,
    readme: "",
    tags: r.tags ?? [],
    license: r.license as Project["license"],
    langs: (r.langs ?? []) as LanguageCode[],
    links: { repo: r.repo_url ?? "", paper: r.paper_url ?? "", demo: r.demo_url ?? "" },
    status: r.status,
    versions: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
    owner: r.owner ? { id: r.owner.id, name: r.owner.name, handle: r.owner.handle, avatarUrl: r.owner.avatar_url } : null,
    ownerId: r.owner_id,
    local: false,
  }
}

// ─── Describing anything by its key ─────────────────────────────────────────────────────────────────────────

export type ItemGroup = ResourceKind | "news" | "thread" | "collection" | "category" | "member" | "paper" | "ghrepo" | "lab" | "other"

export type Resolved = {
  target: string
  group: ItemGroup
  /** The small label above the name: "Model", "Forum thread", "GitHub repo"… */
  type: string
  label: string
  summary?: string
  href: string | null
  kind?: ResourceKind
  /** Who made or shared it, when known. */
  by?: string
  date?: string
  /** False for keys that point at something that no longer exists (or at old sample content). */
  found: boolean
}

const LIVE_TYPE = { ghrepo: "GitHub repo", paper: "Paper" } as const

/** What can be said about a key without asking the database: live items, Lab tools and forum categories. */
export function describeNow(target: string): Resolved {
  const i = target.indexOf(":")
  const type = target.slice(0, i)
  const id = target.slice(i + 1)
  const live = describeLiveTarget(target)
  if (live) return { target, group: live.type, type: LIVE_TYPE[live.type], label: live.label, href: live.href, found: true }
  const lab = describeLabTarget(target)
  if (lab) return { target, group: "lab", type: "Lab tool", label: lab.label, href: lab.href, found: true }
  if (type === "category") {
    const c = getCategory(id)
    return c ? { target, group: "category", type: "Forum category", label: c.name, summary: c.blurb, href: `/forum/c/${c.slug}`, found: true } : missing(target)
  }
  return missing(target)
}

const missing = (target: string): Resolved => ({ target, group: "other", type: "No longer available", label: "This item is no longer on Nexverse", href: null, found: false })

/**
 * Labels, summaries and links for many keys at once, with one query per source. Keys of things that are gone
 * (deleted, private, or old sample content) come back with `found: false`, so lists can offer to remove them.
 */
export async function resolveTargets(targets: string[]): Promise<Record<string, Resolved>> {
  const out: Record<string, Resolved> = {}
  const ids = (prefix: string) => targets.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1)).filter(isHubId)
  const [projects, shares, threads, collections, members] = await Promise.all([
    getProjects(ids("project")).catch(() => [] as Project[]),
    getShares(ids("share")).catch(() => [] as Share[]),
    getMemberThreads(ids("thread")).catch(() => []),
    Promise.all(ids("collection").slice(0, 40).map((id) => getCollection(id).catch(() => null))),
    getMemberNames(ids("member")).catch(() => ({}) as Record<string, string>),
  ])
  for (const t of targets) out[t] = describeNow(t)
  for (const p of projects) {
    if (p.status !== "published" && !p.local) continue
    out[`project:${p.id}`] = { target: `project:${p.id}`, group: p.kind, type: KINDS[p.kind].label, kind: p.kind, label: p.name, summary: p.summary, href: projectPath(p.id), by: p.owner?.name, date: p.publishedAt ?? p.updatedAt, found: true }
  }
  for (const s of shares) {
    const group: ItemGroup = s.kind
    out[`share:${s.id}`] = { target: `share:${s.id}`, group, type: s.kind === "news" ? "News" : KINDS[s.kind].label, kind: s.kind === "news" ? undefined : s.kind, label: s.title, summary: s.summary, href: sharePath(s), by: s.author?.name, date: s.createdAt, found: true }
  }
  for (const q of threads) {
    out[`thread:${q.id}`] = { target: `thread:${q.id}`, group: "thread", type: "Forum thread", label: q.title, summary: `${getCategory(q.orbit)?.name ?? q.orbit} · ${q.answerCount} ${q.answerCount === 1 ? "reply" : "replies"}`, href: `/forum/${q.id}`, by: q.author?.name, date: q.createdAt, found: true }
  }
  for (const c of collections) {
    if (!c) continue
    out[`collection:${c.id}`] = { target: `collection:${c.id}`, group: "collection", type: "Collection", label: c.title, summary: c.description, href: `/collections/${c.id}`, by: c.owner.name, date: c.updatedAt, found: true }
  }
  for (const [id, name] of Object.entries(members)) {
    out[`member:${id}`] = { target: `member:${id}`, group: "member", type: "Member", label: name, href: `/people/${id}`, found: true }
  }
  return out
}
