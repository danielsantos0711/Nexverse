import type { LanguageCode, ResourceKind } from "@/lib/data"
import { LANGUAGES } from "@/lib/data"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * Projects members publish on Nexverse: a model, dataset, tool or repo with a README, links and a changelog.
 * With a database connected they live in public.projects (drafts are visible to their owner only); without one
 * they stay in this browser, so the studio still works as a local preview.
 *
 * Likes, saves and discussion use the keys every other page uses:
 *   project:<uuid>    like and bookmark target
 *   project-<uuid>    discussion thread id (stored as a "sample thread" in public.answers)
 */

export type ProjectKind = ResourceKind
export type ProjectStatus = "draft" | "published"

export const LICENSES = [
  { id: "unspecified", label: "No licence chosen yet" },
  { id: "Apache-2.0", label: "Apache 2.0" },
  { id: "MIT", label: "MIT" },
  { id: "BSD-3-Clause", label: "BSD 3-Clause" },
  { id: "GPL-3.0", label: "GPL 3.0" },
  { id: "AGPL-3.0", label: "AGPL 3.0" },
  { id: "LGPL-3.0", label: "LGPL 3.0" },
  { id: "MPL-2.0", label: "Mozilla Public License 2.0" },
  { id: "CC-BY-4.0", label: "Creative Commons BY 4.0" },
  { id: "CC-BY-SA-4.0", label: "Creative Commons BY-SA 4.0" },
  { id: "CC-BY-NC-4.0", label: "Creative Commons BY-NC 4.0" },
  { id: "CC0-1.0", label: "CC0 (public domain)" },
  { id: "OpenRAIL-M", label: "OpenRAIL-M" },
  { id: "Llama-community", label: "Llama community licence" },
  { id: "Proprietary", label: "Proprietary" },
] as const

export type LicenseId = (typeof LICENSES)[number]["id"]

export const licenseLabel = (id: string) => LICENSES.find((l) => l.id === id)?.label ?? id

export type ProjectVersion = { id?: string; version: string; notes: string; releasedOn: string }

export type ProjectLinks = { repo: string; paper: string; demo: string }

export type ProjectOwner = Member & { handle: string | null; avatarUrl: string | null }

export type Project = {
  id: string
  kind: ProjectKind
  name: string
  slug: string
  summary: string
  readme: string
  tags: string[]
  license: LicenseId
  langs: LanguageCode[]
  links: ProjectLinks
  status: ProjectStatus
  versions: ProjectVersion[]
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  owner: ProjectOwner | null
  ownerId: string | null
  /** Saved in this browser only (no database). */
  local: boolean
}

export type ProjectInput = Pick<Project, "kind" | "name" | "slug" | "summary" | "readme" | "tags" | "license" | "langs" | "links" | "status" | "versions">

export type ProjectStats = { likes: number; saves: number; replies: number }

export const LIMITS = { name: [2, 80], summary: [10, 160], readme: 50000, tags: 8, tag: 30, versions: 50, notes: 5000 } as const

export const projectPath = (id: string) => `/p/${id}`
export const projectTarget = (id: string) => `project:${id}`
export const projectThreadId = (id: string) => `project-${id}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isProjectId = (id: string) => UUID.test(id)

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const TAG = /^[a-z0-9][a-z0-9-]{0,29}$/
export const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/
const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$/

/** "Tagus 3B (PT)" → "tagus-3b-pt". */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

/** A tag as members type it ("#On Device") → "on-device", or "" when nothing usable is left. */
export function normalizeTag(raw: string) {
  return slugify(raw.replace(/^#/, "")).slice(0, LIMITS.tag).replace(/-+$/g, "")
}

function httpsUrl(raw: string) {
  try {
    const u = new URL(raw.trim())
    return u.protocol === "https:" && !/\s/.test(raw.trim()) ? u : null
  } catch {
    return null
  }
}

export type ProjectErrors = Partial<Record<"kind" | "name" | "slug" | "summary" | "readme" | "tags" | "repo" | "paper" | "demo" | "versions", string>>

/** The same rules the database enforces, checked first so the form can say exactly what to fix. */
export function validateProject(p: ProjectInput): ProjectErrors {
  const e: ProjectErrors = {}
  const name = p.name.trim()
  if (name.length < LIMITS.name[0]) e.name = "Give it a name of at least 2 characters."
  else if (name.length > LIMITS.name[1]) e.name = "Keep the name under 80 characters."
  if (!p.slug) e.slug = "Choose an address for the project."
  else if (!SLUG.test(p.slug)) e.slug = "Use lowercase letters, numbers and single dashes, up to 60 characters, not starting or ending with a dash."
  const summary = p.summary.trim()
  if (summary.length < LIMITS.summary[0]) e.summary = "Write a line of at least 10 characters about what it does."
  else if (summary.length > LIMITS.summary[1]) e.summary = "Keep the summary to one line of 160 characters."
  if (p.readme.length > LIMITS.readme) e.readme = "The README can be up to 50,000 characters."
  if (p.tags.length > LIMITS.tags) e.tags = "Use up to 8 tags."
  else if (p.tags.some((t) => !TAG.test(t))) e.tags = "Tags use lowercase letters, numbers and dashes."
  if (p.links.repo && !GITHUB_REPO.test(p.links.repo.trim())) e.repo = "Use a GitHub repository address, like https://github.com/owner/repo"
  if (p.links.paper && !httpsUrl(p.links.paper)) e.paper = "Use a full link that starts with https://"
  if (p.links.demo && !httpsUrl(p.links.demo)) e.demo = "Use a full link that starts with https://"
  if (p.versions.length > LIMITS.versions) e.versions = "List up to 50 versions."
  else {
    const seen = new Set<string>()
    for (const v of p.versions) {
      if (!VERSION.test(v.version)) {
        e.versions = `"${v.version || "(empty)"}" is not a version name. Use something like 1.0.0 or v2-beta.`
        break
      }
      if (seen.has(v.version)) {
        e.versions = `Version ${v.version} is listed twice.`
        break
      }
      if (v.notes.length > LIMITS.notes) {
        e.versions = `The notes for ${v.version} are longer than 5,000 characters.`
        break
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.releasedOn) || Number.isNaN(Date.parse(v.releasedOn))) {
        e.versions = `Pick a release date for ${v.version}.`
        break
      }
      seen.add(v.version)
    }
  }
  return e
}

function clean(p: ProjectInput): ProjectInput {
  const link = (s: string) => s.trim()
  return {
    ...p,
    name: p.name.trim(),
    summary: p.summary.trim().replace(/\s+/g, " "),
    tags: [...new Set(p.tags)].slice(0, LIMITS.tags),
    langs: [...new Set(p.langs)].filter((l) => l in LANGUAGES).slice(0, 12),
    links: { repo: link(p.links.repo).replace(/\/$/, ""), paper: link(p.links.paper), demo: link(p.links.demo) },
    versions: p.versions.map((v) => ({ ...v, version: v.version.trim(), notes: v.notes.trim() })),
  }
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (error.code === "23505") throw new Error("You already have a project at that address. Pick another one.")
  throw new Error(error.message)
}

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const LOCAL_KEY = "nexverse-projects"
type LocalProject = Omit<Project, "owner" | "ownerId" | "local">

function readLocal(): LocalProject[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]")
    return Array.isArray(v) ? (v as LocalProject[]).filter((p) => p && typeof p.id === "string" && typeof p.name === "string") : []
  } catch {
    return []
  }
}

function writeLocal(list: LocalProject[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    throw new Error("This browser would not save the project. Free some storage or allow site data, then try again.")
  }
}

const fromLocal = (p: LocalProject): Project => ({
  ...p,
  tags: p.tags ?? [],
  langs: p.langs ?? [],
  versions: p.versions ?? [],
  links: { repo: p.links?.repo ?? "", paper: p.links?.paper ?? "", demo: p.links?.demo ?? "" },
  owner: null,
  ownerId: null,
  local: true,
})

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const COLUMNS =
  "id, owner_id, kind, name, slug, summary, readme, tags, license, langs, repo_url, paper_url, demo_url, status, created_at, updated_at, published_at, owner:profiles(id, name, handle, avatar_url), versions:project_versions(id, version, notes, released_on)"
// Lists skip the README and changelog.
const LIST_COLUMNS =
  "id, owner_id, kind, name, slug, summary, tags, license, langs, repo_url, paper_url, demo_url, status, created_at, updated_at, published_at, owner:profiles(id, name, handle, avatar_url)"

type Row = {
  id: string
  owner_id: string
  kind: ProjectKind
  name: string
  slug: string
  summary: string
  readme?: string
  tags: string[] | null
  license: LicenseId
  langs: string[] | null
  repo_url: string | null
  paper_url: string | null
  demo_url: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
  published_at: string | null
  owner: { id: string; name: string; handle: string | null; avatar_url: string | null } | null
  versions?: { id: string; version: string; notes: string; released_on: string }[]
}

const byRelease = (a: ProjectVersion, b: ProjectVersion) => b.releasedOn.localeCompare(a.releasedOn) || b.version.localeCompare(a.version, "en", { numeric: true })

function fromRow(r: Row): Project {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    summary: r.summary,
    readme: r.readme ?? "",
    tags: r.tags ?? [],
    license: r.license,
    langs: (r.langs ?? []).filter((l): l is LanguageCode => l in LANGUAGES),
    links: { repo: r.repo_url ?? "", paper: r.paper_url ?? "", demo: r.demo_url ?? "" },
    status: r.status,
    versions: (r.versions ?? []).map((v) => ({ id: v.id, version: v.version, notes: v.notes, releasedOn: v.released_on })).sort(byRelease),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
    owner: r.owner ? { id: r.owner.id, name: r.owner.name, handle: r.owner.handle, avatarUrl: r.owner.avatar_url } : null,
    ownerId: r.owner_id,
    local: false,
  }
}

function toRow(p: ProjectInput) {
  return {
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    summary: p.summary,
    readme: p.readme,
    tags: p.tags,
    license: p.license,
    langs: p.langs,
    repo_url: p.links.repo || null,
    paper_url: p.links.paper || null,
    demo_url: p.links.demo || null,
    status: p.status,
  }
}

async function currentUserId() {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

/** Published projects, newest first; or every project of one owner (drafts included when it is you). */
export async function listProjects({ kind, owner, limit = 30 }: { kind?: ProjectKind; owner?: string; limit?: number } = {}): Promise<Project[]> {
  const client = db()
  if (!client) {
    return readLocal()
      .filter((p) => (owner ? true : p.status === "published") && (!kind || p.kind === kind))
      .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
      .slice(0, limit)
      .map(fromLocal)
  }
  let query = client.from("projects").select(LIST_COLUMNS).limit(limit)
  if (owner) query = query.eq("owner_id", owner).order("updated_at", { ascending: false })
  else query = query.eq("status", "published").order("published_at", { ascending: false })
  if (kind) query = query.eq("kind", kind)
  const { data, error } = await query
  fail(error)
  return (data as unknown as Row[]).map(fromRow)
}

/** Your own projects, drafts included, most recently edited first. Empty when signed out. */
export async function listMyProjects(limit = 100): Promise<Project[]> {
  const client = db()
  if (!client) return listProjects({ owner: "local", limit })
  const me = await currentUserId()
  if (!me) return []
  return listProjects({ owner: me, limit })
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null
  const client = db()
  if (!client) {
    const p = readLocal().find((x) => x.id === id)
    return p ? fromLocal(p) : null
  }
  const { data, error } = await client.from("projects").select(COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromRow(data as unknown as Row) : null
}

/** Whether one of your projects already uses this address (other than `except`). */
export async function slugTaken(slug: string, except?: string): Promise<boolean> {
  const client = db()
  if (!client) return readLocal().some((p) => p.slug === slug && p.id !== except)
  const me = await currentUserId()
  if (!me) return false
  let query = client.from("projects").select("id").eq("owner_id", me).eq("slug", slug).limit(1)
  if (except) query = query.neq("id", except)
  const { data, error } = await query
  fail(error)
  return (data ?? []).length > 0
}

/** Likes, saves and replies per project id. Missing ids count as zero. */
export async function getProjectStats(ids: string[]): Promise<Record<string, ProjectStats>> {
  const out: Record<string, ProjectStats> = Object.fromEntries(ids.map((id) => [id, { likes: 0, saves: 0, replies: 0 }]))
  if (!ids.length) return out
  const client = db()
  if (!client) {
    const read = (key: string) => {
      try {
        const v = JSON.parse(localStorage.getItem(key) ?? "[]")
        return Array.isArray(v) ? v : []
      } catch {
        return []
      }
    }
    const likes = new Set(read("nexverse-likes") as string[])
    const saves = new Set((read("nexverse-bookmarks") as { target?: string }[]).map((b) => b?.target))
    for (const id of ids) {
      out[id] = {
        likes: likes.has(projectTarget(id)) ? 1 : 0,
        saves: saves.has(projectTarget(id)) ? 1 : 0,
        replies: read(`nexverse-replies:${projectThreadId(id)}`).length,
      }
    }
    return out
  }
  const { data, error } = await client.rpc("project_stats", { project_ids: ids.slice(0, 200) })
  fail(error)
  for (const r of (data ?? []) as { project_id: string; likes: number; saves: number; replies: number }[]) {
    out[r.project_id] = { likes: Number(r.likes), saves: Number(r.saves), replies: Number(r.replies) }
  }
  return out
}

// ─── Writing ────────────────────────────────────────────────────────────────────────────────────────────────

/** Brings the database's changelog in line with the form: removed versions go, edited ones update, new ones arrive. */
async function syncVersions(projectId: string, versions: ProjectVersion[], before: ProjectVersion[]) {
  const client = db()!
  const keep = new Set(versions.map((v) => v.id).filter(Boolean))
  const gone = before.filter((v) => v.id && !keep.has(v.id)).map((v) => v.id!)
  if (gone.length) {
    const { error } = await client.from("project_versions").delete().in("id", gone)
    fail(error)
  }
  const existing = versions.filter((v) => v.id)
  for (const v of existing) {
    const old = before.find((b) => b.id === v.id)
    if (old && old.version === v.version && old.notes === v.notes && old.releasedOn === v.releasedOn) continue
    const { error } = await client.from("project_versions").update({ version: v.version, notes: v.notes, released_on: v.releasedOn }).eq("id", v.id!)
    fail(error)
  }
  const fresh = versions.filter((v) => !v.id)
  if (fresh.length) {
    const { error } = await client
      .from("project_versions")
      .insert(fresh.map((v) => ({ project_id: projectId, version: v.version, notes: v.notes, released_on: v.releasedOn })))
    fail(error)
  }
}

function assertValid(p: ProjectInput) {
  const errors = validateProject(p)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const p = clean(input)
  assertValid(p)
  const client = db()
  if (!client) {
    const list = readLocal()
    if (list.some((x) => x.slug === p.slug)) throw new Error("You already have a project at that address. Pick another one.")
    const now = new Date().toISOString()
    const local: LocalProject = {
      ...p,
      id: crypto.randomUUID(),
      versions: p.versions.map((v) => ({ ...v, id: crypto.randomUUID() })).sort(byRelease),
      createdAt: now,
      updatedAt: now,
      publishedAt: p.status === "published" ? now : null,
    }
    writeLocal([local, ...list])
    return fromLocal(local)
  }
  if (!(await currentUserId())) throw new Error("Sign in to create a project.")
  const { data, error } = await client.from("projects").insert(toRow(p)).select("id").single()
  fail(error)
  const id = (data as { id: string }).id
  if (p.versions.length) {
    try {
      await syncVersions(id, p.versions, [])
    } catch (e) {
      throw new Error(`The project was saved, but its changelog was not: ${(e as Error).message}`)
    }
  }
  return (await getProject(id))!
}

export async function updateProject(id: string, input: ProjectInput, before?: Project): Promise<Project> {
  const p = clean(input)
  assertValid(p)
  const client = db()
  if (!client) {
    const list = readLocal()
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) throw new Error("This project is no longer here.")
    if (list.some((x) => x.slug === p.slug && x.id !== id)) throw new Error("You already have a project at that address. Pick another one.")
    const now = new Date().toISOString()
    list[i] = {
      ...list[i],
      ...p,
      versions: p.versions.map((v) => ({ ...v, id: v.id ?? crypto.randomUUID() })).sort(byRelease),
      updatedAt: now,
      publishedAt: list[i].publishedAt ?? (p.status === "published" ? now : null),
    }
    writeLocal(list)
    return fromLocal(list[i])
  }
  const prev = before ?? (await getProject(id))
  if (!prev) throw new Error("This project is no longer here.")
  const { error } = await client.from("projects").update(toRow(p)).eq("id", id)
  fail(error)
  await syncVersions(id, p.versions, prev.versions)
  return (await getProject(id))!
}

export async function setProjectStatus(id: string, status: ProjectStatus) {
  const client = db()
  if (!client) {
    const list = readLocal()
    const p = list.find((x) => x.id === id)
    if (!p) throw new Error("This project is no longer here.")
    p.status = status
    p.updatedAt = new Date().toISOString()
    p.publishedAt ??= status === "published" ? p.updatedAt : null
    writeLocal(list)
    return
  }
  const { error } = await client.from("projects").update({ status }).eq("id", id)
  fail(error)
}

export async function deleteProject(id: string) {
  const client = db()
  if (!client) {
    writeLocal(readLocal().filter((p) => p.id !== id))
    try {
      localStorage.removeItem(`nexverse-replies:${projectThreadId(id)}`)
    } catch {}
    return
  }
  const { error } = await client.from("projects").delete().eq("id", id)
  fail(error)
}

/** A blank project for the editor. */
export function emptyProject(kind: ProjectKind = "model"): ProjectInput {
  return { kind, name: "", slug: "", summary: "", readme: "", tags: [], license: "unspecified", langs: [], links: { repo: "", paper: "", demo: "" }, status: "draft", versions: [] }
}

export const toInput = (p: Project): ProjectInput => ({
  kind: p.kind,
  name: p.name,
  slug: p.slug,
  summary: p.summary,
  readme: p.readme,
  tags: p.tags,
  license: p.license,
  langs: p.langs,
  links: p.links,
  status: p.status,
  versions: p.versions,
})
