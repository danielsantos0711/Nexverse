import { isUuid } from "@/lib/community"
import { db, live } from "@/lib/supabase"
import { sha256Hex } from "./hash"
import type { Tree, TreeEntry } from "./tree"

/**
 * Nexverse Code in the browser: every read and write goes straight to Supabase with the member's session, and row
 * level security in supabase/migrations/20261019125000_code.sql decides what is allowed. Commits, merges, forks
 * and deletes go through security-definer functions that check permission and refuse to move a branch that moved
 * in the meantime. Blob bytes live in the private "code" bucket; they are hashed here before upload and checked
 * again after download.
 *
 * There is no browser-only copy of the code host: without a database, `CodeUnavailable` explains why.
 */

// ─── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────

export class CodeUnavailable extends Error {
  constructor(message = "Code hosting is still being switched on for this site. Try again soon.") {
    super(message)
  }
}

/** The branch moved since the page loaded; the member reloads instead of overwriting someone's work. */
export class StaleHead extends Error {}

function friendly(message: string): string {
  if (/stale_head:/.test(message)) return message.replace(/^.*stale_head:\s*/, "")
  if (/violates row-level security/.test(message)) return "You are not allowed to do that here. Check that you are signed in and have access to this repository."
  if (/code_repos_owner_slug_key|duplicate key.*code_repos/.test(message)) return "You already have a repository with that name."
  if (/code_refs_pkey/.test(message)) return "A branch or tag with that name already exists."
  if (/code_releases_repo_id_tag_key/.test(message)) return "There is already a release for that tag."
  if (/code_stars_pkey|code_watchers_pkey|duplicate key/.test(message)) return "That is already done."
  if (/code_collaborators_pkey/.test(message)) return "That member is already a collaborator."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/slug_check|code_repos_slug/.test(message)) return "Use lowercase letters, numbers, dots, dashes and underscores for the name."
  return message
}

function unavailable(message: string) {
  return /schema cache|does not exist|Could not find the (table|function)/.test(message)
}

function fail(error: { message: string } | null): asserts error is null {
  if (!error) return
  if (unavailable(error.message)) throw new CodeUnavailable()
  if (/stale_head:/.test(error.message)) throw new StaleHead(friendly(error.message))
  throw new Error(friendly(error.message))
}

function client() {
  const c = db()
  if (!c) throw new CodeUnavailable(live ? "Loading…" : "Code hosting needs the site's database, and this copy of Nexverse runs without one.")
  return c
}

export async function myId(): Promise<string | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await myId()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

export async function accessToken(): Promise<string | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.access_token ?? null
}

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export type Person = { id: string; name: string; handle: string | null; avatarUrl: string | null }

export type Visibility = "public" | "private"

export type Repo = {
  id: string
  owner: Person
  slug: string
  name: string
  description: string
  visibility: Visibility
  defaultBranch: string
  topics: string[]
  license: string | null
  homepage: string | null
  readme: string
  links: string[]
  forkedFrom: string | null
  stars: number
  forks: number
  watchers: number
  openIssues: number
  openPulls: number
  storedBytes: number
  pushedAt: string | null
  archivedAt: string | null
  hiddenAt: string | null
  hiddenReason: string | null
  createdAt: string
  updatedAt: string
}

export type Role = "owner" | "admin" | "write" | "read" | null

export type Ref = { kind: "branch" | "tag"; name: string; commit: string; updatedAt: string }

export type CommitMeta = { id: string; parents: string[]; message: string; author: Person | null; authorName: string; stats: { added?: number; modified?: number; removed?: number }; createdAt: string }
export type Commit = CommitMeta & { tree: Tree }

export type Label = { name: string; color: string; description: string }

export type Issue = {
  id: string
  repoId: string
  number: number
  title: string
  body: string
  state: "open" | "closed"
  labels: string[]
  assignees: string[]
  author: Person | null
  comments: number
  closedAt: string | null
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
}

export type Comment = { id: string; body: string; author: Person | null; createdAt: string; updatedAt: string; hiddenAt: string | null; path?: string | null; line?: number | null; side?: "old" | "new" | null }

export type Pull = {
  id: string
  repoId: string
  number: number
  title: string
  body: string
  state: "open" | "merged" | "closed"
  fromRepo: string
  fromBranch: string
  toBranch: string
  author: Person | null
  comments: number
  baseCommit: string | null
  headCommit: string | null
  mergeCommit: string | null
  mergedBy: Person | null
  mergedAt: string | null
  closedAt: string | null
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
}

export type ReleaseAsset = { name: string; sha: string; size: number; type: string }
export type Release = { id: string; tag: string; title: string; notes: string; assets: ReleaseAsset[]; prerelease: boolean; author: Person | null; createdAt: string }

export type Collaborator = { member: Person; role: "read" | "write" | "admin"; createdAt: string }

export type ActivityKind = "create" | "commit" | "branch" | "tag" | "release" | "issue" | "issue_closed" | "issue_reopened" | "pull" | "pull_merged" | "pull_closed" | "fork" | "archive" | "visibility" | "import"
export type Activity = { id: number; repoId: string; kind: ActivityKind; title: string; ref: string; actor: Person | null; createdAt: string; repo: { slug: string; owner: Person } | null }

export const LIMITS = { repoBytes: 100 * 1024 * 1024, memberBytes: 300 * 1024 * 1024, fileBytes: 25 * 1024 * 1024, files: 5000, zipBytes: 200 * 1024 * 1024 } as const

// ─── Rows ───────────────────────────────────────────────────────────────────────────────────────────────────

type PersonRow = { id: string; name: string; handle: string | null; avatar_url: string | null } | null
const person = (p: PersonRow): Person | null => (p ? { id: p.id, name: p.name, handle: p.handle ?? null, avatarUrl: p.avatar_url ?? null } : null)
const P = "id, name, handle, avatar_url"

const REPO_COLUMNS = `id, slug, name, description, visibility, default_branch, topics, license, homepage, readme, links, forked_from, stars_count, forks_count, watchers_count, open_issues_count, open_pulls_count, stored_bytes, pushed_at, archived_at, hidden_at, hidden_reason, created_at, updated_at, owner:profiles!code_repos_owner_id_fkey(${P})`
// Lists leave the README out.
const REPO_LIST = REPO_COLUMNS.replace(" readme,", "")

type RepoRow = {
  id: string
  slug: string
  name: string
  description: string
  visibility: Visibility
  default_branch: string
  topics: string[] | null
  license: string | null
  homepage: string | null
  readme?: string
  links: string[] | null
  forked_from: string | null
  stars_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  open_pulls_count: number
  stored_bytes: number
  pushed_at: string | null
  archived_at: string | null
  hidden_at: string | null
  hidden_reason: string | null
  created_at: string
  updated_at: string
  owner: PersonRow
}

const toRepo = (r: RepoRow): Repo => ({
  id: r.id,
  owner: person(r.owner) ?? { id: "", name: "A member", handle: null, avatarUrl: null },
  slug: r.slug,
  name: r.name,
  description: r.description,
  visibility: r.visibility,
  defaultBranch: r.default_branch,
  topics: r.topics ?? [],
  license: r.license,
  homepage: r.homepage,
  readme: r.readme ?? "",
  links: r.links ?? [],
  forkedFrom: r.forked_from,
  stars: r.stars_count,
  forks: r.forks_count,
  watchers: r.watchers_count,
  openIssues: r.open_issues_count,
  openPulls: r.open_pulls_count,
  storedBytes: Number(r.stored_bytes ?? 0),
  pushedAt: r.pushed_at,
  archivedAt: r.archived_at,
  hiddenAt: r.hidden_at,
  hiddenReason: r.hidden_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

// ─── Addresses ──────────────────────────────────────────────────────────────────────────────────────────────

/** The owner segment of a repository URL: the member's handle, or their id when they have none. */
export const ownerKey = (p: Pick<Person, "id" | "handle">) => p.handle ?? p.id
/** What people read: the handle, else the display name (never the raw member id). */
export const ownerLabel = (p: Pick<Person, "name" | "handle">) => p.handle ?? p.name
export const repoPath = (r: Pick<Repo, "owner" | "slug">) => `/code/${ownerKey(r.owner)}/${r.slug}`
export const fullName = (r: Pick<Repo, "owner" | "slug">) => `${ownerKey(r.owner)}/${r.slug}`

/** Encodes each path segment for a URL, keeping the slashes. */
export const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/")

// ─── Repositories ───────────────────────────────────────────────────────────────────────────────────────────

/** A member by handle or id. */
export async function getPerson(ref: string): Promise<Person | null> {
  const c = client()
  const q = c.from("profiles").select(P)
  const { data, error } = await (isUuid(ref) ? q.eq("id", ref.toLowerCase()) : q.eq("handle", ref.toLowerCase())).maybeSingle()
  fail(error)
  return person(data as PersonRow)
}

export async function getRepo(owner: string, slug: string): Promise<Repo | null> {
  const p = await getPerson(owner)
  if (!p) return null
  const { data, error } = await client().from("code_repos").select(REPO_COLUMNS).eq("owner_id", p.id).eq("slug", slug.toLowerCase()).is("deleted_at", null).maybeSingle()
  fail(error)
  return data ? toRepo(data as unknown as RepoRow) : null
}

export async function getRepoById(id: string): Promise<Repo | null> {
  if (!isUuid(id)) return null
  const { data, error } = await client().from("code_repos").select(REPO_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle()
  fail(error)
  return data ? toRepo(data as unknown as RepoRow) : null
}

export async function getReposById(ids: string[]): Promise<Repo[]> {
  const list = [...new Set(ids.filter(isUuid))].slice(0, 100)
  if (!list.length) return []
  const { data, error } = await client().from("code_repos").select(REPO_LIST).in("id", list).is("deleted_at", null)
  fail(error)
  return (data as unknown as RepoRow[]).map(toRepo)
}

export type RepoSort = "new" | "stars" | "updated"

/** Removes characters that have meaning in PostgREST filter strings. */
const safeTerm = (q: string) => q.replace(/[%,()*\\:"'.]/g, " ").trim().slice(0, 80)

/** Public repositories (and your own private ones, which row level security also returns to you). */
export async function listRepos({ sort = "updated", q = "", topic, ownerId, limit = 30 }: { sort?: RepoSort; q?: string; topic?: string; ownerId?: string; limit?: number } = {}): Promise<Repo[]> {
  let query = client().from("code_repos").select(REPO_LIST).is("deleted_at", null)
  if (ownerId) query = query.eq("owner_id", ownerId)
  else query = query.eq("visibility", "public")
  if (topic) query = query.contains("topics", [topic])
  const term = safeTerm(q)
  if (term) query = query.or(`slug.ilike.*${term}*,name.ilike.*${term}*,description.ilike.*${term}*`)
  if (sort === "stars") query = query.order("stars_count", { ascending: false }).order("pushed_at", { ascending: false, nullsFirst: false })
  else if (sort === "new") query = query.order("created_at", { ascending: false })
  else query = query.order("pushed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
  const { data, error } = await query.limit(limit)
  fail(error)
  return (data as unknown as RepoRow[]).map(toRepo)
}

/** Public repositories ordered by stars gained in the last `days` days, then by recent pushes. */
export async function trendingRepos(days = 7, limit = 30): Promise<Repo[]> {
  const c = client()
  const { data, error } = await c.rpc("code_trending", { days, max_rows: limit })
  fail(error)
  const rows = (data ?? []) as { id: string }[]
  if (!rows.length) return []
  const repos = await getReposById(rows.map((r) => r.id))
  const order = new Map(rows.map((r, i) => [r.id, i]))
  return repos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

/** Repositories you starred, newest star first. */
export async function starredRepos(memberId: string, limit = 60): Promise<Repo[]> {
  const { data, error } = await client().from("code_stars").select("repo_id, created_at").eq("member_id", memberId).order("created_at", { ascending: false }).limit(limit)
  fail(error)
  const ids = (data as { repo_id: string }[]).map((r) => r.repo_id)
  const repos = await getReposById(ids)
  return ids.map((id) => repos.find((r) => r.id === id)).filter((r): r is Repo => Boolean(r))
}

/** Repositories where you are a collaborator. */
export async function collaboratingRepos(memberId: string): Promise<Repo[]> {
  const { data, error } = await client().from("code_collaborators").select("repo_id").eq("member_id", memberId).limit(100)
  fail(error)
  return getReposById((data as { repo_id: string }[]).map((r) => r.repo_id))
}

export type NewRepo = { name: string; slug: string; description: string; visibility: Visibility; topics: string[]; license: string | null }

export async function createRepo(input: NewRepo): Promise<Repo> {
  const me = await requireMe()
  const { data, error } = await client()
    .from("code_repos")
    .insert({ owner_id: me, name: input.name.trim(), slug: input.slug, description: input.description.trim(), visibility: input.visibility, topics: input.topics, license: input.license })
    .select(REPO_COLUMNS)
    .single()
  fail(error)
  return toRepo(data as unknown as RepoRow)
}

export type RepoPatch = Partial<{ name: string; slug: string; description: string; visibility: Visibility; default_branch: string; topics: string[]; license: string | null; homepage: string | null; readme: string; links: string[]; archived_at: string | null }>

export async function updateRepo(id: string, patch: RepoPatch): Promise<Repo> {
  const { data, error } = await client().from("code_repos").update(patch).eq("id", id).select(REPO_COLUMNS).maybeSingle()
  fail(error)
  if (!data) throw new Error("You are not allowed to change this repository.")
  return toRepo(data as unknown as RepoRow)
}

export async function deleteRepo(id: string) {
  fail((await client().rpc("code_delete_repo", { repo: id })).error)
}

export async function forkRepo(id: string, slug: string, name?: string): Promise<string> {
  const { data, error } = await client().rpc("code_fork", { source: id, new_slug: slug, new_name: name ?? null })
  fail(error)
  return data as string
}

export async function moderate(kind: "repo" | "issue" | "pull" | "issue_comment" | "pull_comment", id: string, hide: boolean, reason = "") {
  fail((await client().rpc("code_moderate", { target_kind: kind, target: id, hide, reason })).error)
}

/** Your role on a repository. */
export async function myRole(repo: Repo): Promise<Role> {
  const me = await myId()
  if (!me) return null
  if (me === repo.owner.id) return "owner"
  const { data, error } = await client().from("code_collaborators").select("role").eq("repo_id", repo.id).eq("member_id", me).maybeSingle()
  fail(error)
  return ((data as { role: Role } | null)?.role ?? null) as Role
}

export const canWrite = (role: Role, repo: Pick<Repo, "archivedAt" | "hiddenAt">) => (role === "owner" || role === "admin" || role === "write") && !repo.archivedAt && !repo.hiddenAt
export const canAdmin = (role: Role) => role === "owner" || role === "admin"

// ─── Refs and commits ───────────────────────────────────────────────────────────────────────────────────────

export async function listRefs(repoId: string): Promise<Ref[]> {
  const { data, error } = await client().from("code_refs").select("kind, name, commit_id, updated_at").eq("repo_id", repoId).order("name").limit(1000)
  fail(error)
  return (data as { kind: Ref["kind"]; name: string; commit_id: string; updated_at: string }[]).map((r) => ({ kind: r.kind, name: r.name, commit: r.commit_id, updatedAt: r.updated_at }))
}

export async function createRef(repoId: string, kind: Ref["kind"], name: string, commit: string) {
  const me = await requireMe()
  fail((await client().from("code_refs").insert({ repo_id: repoId, kind, name, commit_id: commit, created_by: me })).error)
}

export async function deleteRef(repoId: string, kind: Ref["kind"], name: string) {
  fail((await client().rpc("code_delete_ref", { repo: repoId, ref_kind: kind, ref_name: name })).error)
}

const META = `id, parents, message, author_name, stats, created_at, author:profiles!code_commits_author_id_fkey(${P})`
type MetaRow = { id: string; parents: string[]; message: string; author_name: string; stats: CommitMeta["stats"] | null; created_at: string; author: PersonRow; tree?: Tree }
const toMeta = (r: MetaRow): CommitMeta => ({ id: r.id, parents: r.parents ?? [], message: r.message, author: person(r.author), authorName: r.author_name, stats: r.stats ?? {}, createdAt: r.created_at })

const commitCache = new Map<string, Commit>()

/** A commit with its tree. `id` may be a prefix of at least 7 characters. */
export async function getCommit(repoId: string, id: string): Promise<Commit | null> {
  const key = `${repoId}:${id}`
  const hit = commitCache.get(key)
  if (hit) return hit
  if (!/^[0-9a-f]{7,64}$/.test(id)) return null
  let q = client().from("code_commits").select(`${META}, tree`).eq("repo_id", repoId)
  q = id.length === 64 ? q.eq("id", id) : q.like("id", `${id}%`)
  const { data, error } = await q.limit(2)
  fail(error)
  const rows = data as unknown as MetaRow[]
  if (rows.length !== 1) return null
  const c: Commit = { ...toMeta(rows[0]), tree: rows[0].tree ?? {} }
  commitCache.set(`${repoId}:${c.id}`, c)
  commitCache.set(key, c)
  return c
}

/** Parents of many commits at once, without trees. */
export async function getCommitMetas(repoId: string, ids: string[]): Promise<Map<string, CommitMeta>> {
  const out = new Map<string, CommitMeta>()
  const list = [...new Set(ids)].filter((id) => /^[0-9a-f]{64}$/.test(id))
  for (let i = 0; i < list.length; i += 150) {
    const { data, error } = await client().from("code_commits").select(META).eq("repo_id", repoId).in("id", list.slice(i, i + 150))
    fail(error)
    for (const r of data as unknown as MetaRow[]) out.set(r.id, toMeta(r))
  }
  return out
}

/**
 * History from `head`, newest first: walks parents breadth-first by date, loading commit rows in batches.
 * `path` limits it to commits that changed that file or folder. Returns up to `limit` commits after `skip`.
 */
export async function history(repoId: string, head: string, { path, limit = 30, skip = 0 }: { path?: string; limit?: number; skip?: number } = {}): Promise<{ commits: CommitMeta[]; more: boolean }> {
  const seen = new Set<string>()
  const metas = new Map<string, CommitMeta>()
  let frontier = [head]
  const ordered: CommitMeta[] = []
  // Load the ancestry (metadata only) up to a sensible horizon.
  const horizon = path ? 600 : skip + limit + 1
  while (frontier.length && ordered.length < horizon) {
    const fresh = frontier.filter((id) => !seen.has(id))
    fresh.forEach((id) => seen.add(id))
    const got = await getCommitMetas(repoId, fresh)
    got.forEach((v, k) => metas.set(k, v))
    const next: string[] = []
    for (const id of fresh) {
      const m = metas.get(id)
      if (!m) continue
      ordered.push(m)
      next.push(...m.parents)
    }
    frontier = next
  }
  ordered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  if (!path) return { commits: ordered.slice(skip, skip + limit), more: ordered.length > skip + limit }

  // For a path, compare each commit's entry with its first parent's.
  const touched: CommitMeta[] = []
  const prefix = `${path}/`
  const fingerprint = (t: Tree) => {
    const e = t[path]
    if (e) return e.sha
    let s = ""
    for (const k of Object.keys(t).sort()) if (k.startsWith(prefix)) s += `${k}:${t[k].sha};`
    return s
  }
  for (const m of ordered) {
    if (touched.length >= skip + limit + 1) break
    const c = await getCommit(repoId, m.id)
    const parent = m.parents[0] ? await getCommit(repoId, m.parents[0]) : null
    if (!c) continue
    if (fingerprint(c.tree) !== (parent ? fingerprint(parent.tree) : "")) touched.push(m)
  }
  return { commits: touched.slice(skip, skip + limit), more: touched.length > skip + limit }
}

/** Commit a whole tree. Throws StaleHead when the branch moved since `expectedHead`. */
export async function commitTree(repoId: string, branch: string, expectedHead: string | null, tree: Tree, message: string): Promise<string> {
  const { data, error } = await client().rpc("code_commit", { repo: repoId, branch, expected_head: expectedHead, tree, message })
  fail(error)
  return data as string
}

// ─── Blobs ──────────────────────────────────────────────────────────────────────────────────────────────────

const storeCache = new Map<string, string>()

/** Where each blob's bytes live (the folder of this repository or of the one it was forked from). */
async function stores(repoId: string, shas: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const missing: string[] = []
  for (const s of new Set(shas)) {
    const hit = storeCache.get(`${repoId}:${s}`)
    if (hit) out.set(s, hit)
    else missing.push(s)
  }
  for (let i = 0; i < missing.length; i += 150) {
    const { data, error } = await client().from("code_blobs").select("sha, store_repo").eq("repo_id", repoId).in("sha", missing.slice(i, i + 150))
    fail(error)
    for (const r of data as { sha: string; store_repo: string }[]) {
      storeCache.set(`${repoId}:${r.sha}`, r.store_repo)
      out.set(r.sha, r.store_repo)
    }
  }
  return out
}

export type BlobData = { bytes: Uint8Array; verified: boolean }

const blobCache = new Map<string, BlobData>()

/** Downloads a blob and checks its hash. `verified: false` means the stored bytes do not match their name. */
export async function readBlob(repoId: string, sha: string): Promise<BlobData> {
  const hit = blobCache.get(sha)
  if (hit) return hit
  const store = (await stores(repoId, [sha])).get(sha)
  if (!store) throw new Error("This file's content is not in this repository.")
  const { data, error } = await client().storage.from("code").download(`${store}/${sha}`)
  if (error || !data) throw new Error("Could not download this file. Try again.")
  const bytes = new Uint8Array(await data.arrayBuffer())
  const out = { bytes, verified: (await sha256Hex(bytes)) === sha }
  if (bytes.length < 2_000_000) blobCache.set(sha, out)
  return out
}

export async function readText(repoId: string, sha: string): Promise<string> {
  return new TextDecoder().decode((await readBlob(repoId, sha)).bytes)
}

/** A short-lived link to the raw bytes; with `downloadAs`, the browser saves it under that name. */
export async function blobUrl(repoId: string, sha: string, downloadAs?: string): Promise<string> {
  const store = (await stores(repoId, [sha])).get(sha)
  if (!store) throw new Error("This file's content is not in this repository.")
  const { data, error } = await client().storage.from("code").createSignedUrl(`${store}/${sha}`, 300, downloadAs ? { download: downloadAs } : undefined)
  if (error || !data) throw new Error("Could not make a link to this file. Try again.")
  return data.signedUrl
}

export type Upload = { path: string; data: Uint8Array; mode?: TreeEntry["mode"] }

/**
 * Hashes files, uploads only blobs the repository does not have yet, and registers them. Returns tree entries by
 * path. `onProgress(done, total)` counts files.
 */
export async function uploadFiles(repoId: string, files: Upload[], onProgress?: (done: number, total: number, phase: "hashing" | "uploading") => void): Promise<Record<string, TreeEntry>> {
  const c = client()
  const entries: Record<string, TreeEntry> = {}
  const bySha = new Map<string, Uint8Array>()
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if (f.data.length > LIMITS.fileBytes) throw new Error(`${f.path} is over the 25 MB limit for one file.`)
    const sha = await sha256Hex(f.data)
    entries[f.path] = { sha, size: f.data.length, mode: f.mode ?? "100644" }
    bySha.set(sha, f.data)
    onProgress?.(i + 1, files.length, "hashing")
  }

  const shas = [...bySha.keys()]
  const have = new Set<string>()
  for (let i = 0; i < shas.length; i += 150) {
    const { data, error } = await c.from("code_blobs").select("sha").eq("repo_id", repoId).in("sha", shas.slice(i, i + 150))
    fail(error)
    for (const r of data as { sha: string }[]) have.add(r.sha)
  }
  const todo = shas.filter((s) => !have.has(s))
  let done = 0
  const queue = [...todo]
  const worker = async () => {
    for (let sha = queue.shift(); sha; sha = queue.shift()) {
      const bytes = bySha.get(sha)!
      const body = new Blob([bytes.slice().buffer], { type: "application/octet-stream" })
      const { error } = await c.storage.from("code").upload(`${repoId}/${sha}`, body, { contentType: "application/octet-stream", upsert: false })
      // Already there (an earlier upload that was never registered): fine, it is the same bytes by name.
      if (error && !/exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`)) {
        throw new Error(/row-level|policy|403|Unauthorized/i.test(error.message) ? "You cannot upload to this repository, or you uploaded too much in the last hour." : `Upload failed: ${error.message}`)
      }
      onProgress?.(++done, todo.length, "uploading")
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker))

  for (let i = 0; i < todo.length; i += 500) {
    const { data, error } = await c.rpc("code_register_blobs", { repo: repoId, shas: todo.slice(i, i + 500) })
    fail(error)
    const got = new Set((data as string[]) ?? [])
    const lost = todo.slice(i, i + 500).find((s) => !got.has(s))
    if (lost) throw new Error("A file did not finish uploading. Try again.")
  }
  todo.forEach((s) => storeCache.set(`${repoId}:${s}`, repoId))
  return entries
}

// ─── Releases ───────────────────────────────────────────────────────────────────────────────────────────────

type ReleaseRow = { id: string; tag: string; title: string; notes: string; assets: ReleaseAsset[]; prerelease: boolean; created_at: string; author: PersonRow }
const toRelease = (r: ReleaseRow): Release => ({ id: r.id, tag: r.tag, title: r.title, notes: r.notes, assets: r.assets ?? [], prerelease: r.prerelease, author: person(r.author), createdAt: r.created_at })

export async function listReleases(repoId: string): Promise<Release[]> {
  const { data, error } = await client().from("code_releases").select(`id, tag, title, notes, assets, prerelease, created_at, author:profiles!code_releases_author_id_fkey(${P})`).eq("repo_id", repoId).order("created_at", { ascending: false }).limit(100)
  fail(error)
  return (data as unknown as ReleaseRow[]).map(toRelease)
}

export async function createRelease(repoId: string, input: { tag: string; title: string; notes: string; prerelease: boolean; assets: ReleaseAsset[] }) {
  const me = await requireMe()
  fail((await client().from("code_releases").insert({ repo_id: repoId, author_id: me, ...input })).error)
}

export async function deleteRelease(id: string) {
  fail((await client().from("code_releases").delete().eq("id", id)).error)
}

// ─── Stars and watching ─────────────────────────────────────────────────────────────────────────────────────

export async function getMarks(repoId: string): Promise<{ starred: boolean; watching: boolean }> {
  const me = await myId()
  if (!me) return { starred: false, watching: false }
  const c = client()
  const [s, w] = await Promise.all([
    c.from("code_stars").select("repo_id").eq("repo_id", repoId).eq("member_id", me).maybeSingle(),
    c.from("code_watchers").select("repo_id").eq("repo_id", repoId).eq("member_id", me).maybeSingle(),
  ])
  fail(s.error)
  fail(w.error)
  return { starred: Boolean(s.data), watching: Boolean(w.data) }
}

export async function setMark(kind: "star" | "watch", repoId: string, on: boolean) {
  const me = await requireMe()
  const table = kind === "star" ? "code_stars" : "code_watchers"
  const c = client()
  const { error } = on ? await c.from(table).insert({ repo_id: repoId, member_id: me }) : await c.from(table).delete().eq("repo_id", repoId).eq("member_id", me)
  if (error && /duplicate key/.test(error.message)) return
  fail(error)
}

// ─── Labels ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function listLabels(repoId: string): Promise<Label[]> {
  const { data, error } = await client().from("code_labels").select("name, color, description").eq("repo_id", repoId).order("name")
  fail(error)
  return data as Label[]
}

export async function createLabel(repoId: string, l: Label) {
  fail((await client().from("code_labels").insert({ repo_id: repoId, ...l })).error)
}

export async function deleteLabel(repoId: string, name: string) {
  fail((await client().from("code_labels").delete().eq("repo_id", repoId).eq("name", name)).error)
}

// ─── Issues ─────────────────────────────────────────────────────────────────────────────────────────────────

const ISSUE = `id, repo_id, number, title, body, state, labels, assignees, comments_count, closed_at, hidden_at, created_at, updated_at, author:profiles!code_issues_author_id_fkey(${P})`
type IssueRow = { id: string; repo_id: string; number: number; title: string; body: string; state: Issue["state"]; labels: string[]; assignees: string[]; comments_count: number; closed_at: string | null; hidden_at: string | null; created_at: string; updated_at: string; author: PersonRow }
const toIssue = (r: IssueRow): Issue => ({ id: r.id, repoId: r.repo_id, number: r.number, title: r.title, body: r.body, state: r.state, labels: r.labels ?? [], assignees: r.assignees ?? [], author: person(r.author), comments: r.comments_count, closedAt: r.closed_at, hiddenAt: r.hidden_at, createdAt: r.created_at, updatedAt: r.updated_at })

export async function listIssues(repoId: string, { state = "open", label, q = "" }: { state?: "open" | "closed" | "all"; label?: string; q?: string } = {}): Promise<Issue[]> {
  let query = client().from("code_issues").select(ISSUE).eq("repo_id", repoId)
  if (state !== "all") query = query.eq("state", state)
  if (label) query = query.contains("labels", [label])
  const term = safeTerm(q)
  if (term) query = query.ilike("title", `%${term}%`)
  const { data, error } = await query.order("number", { ascending: false }).limit(100)
  fail(error)
  return (data as unknown as IssueRow[]).map(toIssue)
}

export async function getIssue(repoId: string, number: number): Promise<Issue | null> {
  const { data, error } = await client().from("code_issues").select(ISSUE).eq("repo_id", repoId).eq("number", number).maybeSingle()
  fail(error)
  return data ? toIssue(data as unknown as IssueRow) : null
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const { data, error } = await client().from("code_issues").select(ISSUE).eq("id", id).maybeSingle()
  fail(error)
  return data ? toIssue(data as unknown as IssueRow) : null
}

export async function createIssue(repoId: string, input: { title: string; body: string; labels: string[] }): Promise<Issue> {
  const me = await requireMe()
  const { data, error } = await client().from("code_issues").insert({ repo_id: repoId, author_id: me, title: input.title.trim(), body: input.body, labels: input.labels }).select(ISSUE).single()
  fail(error)
  return toIssue(data as unknown as IssueRow)
}

export async function updateIssue(id: string, patch: Partial<{ title: string; body: string; state: Issue["state"]; labels: string[]; assignees: string[] }>): Promise<Issue> {
  const { data, error } = await client().from("code_issues").update(patch).eq("id", id).select(ISSUE).maybeSingle()
  fail(error)
  if (!data) throw new Error("You are not allowed to change this issue.")
  return toIssue(data as unknown as IssueRow)
}

type CommentRow = { id: string; body: string; created_at: string; updated_at: string; hidden_at: string | null; author: PersonRow; path?: string | null; line?: number | null; side?: "old" | "new" | null }
const toComment = (r: CommentRow): Comment => ({ id: r.id, body: r.body, author: person(r.author), createdAt: r.created_at, updatedAt: r.updated_at, hiddenAt: r.hidden_at, path: r.path ?? null, line: r.line ?? null, side: r.side ?? null })

export async function listIssueComments(issueId: string): Promise<Comment[]> {
  const { data, error } = await client().from("code_issue_comments").select(`id, body, created_at, updated_at, hidden_at, author:profiles!code_issue_comments_author_id_fkey(${P})`).eq("issue_id", issueId).order("created_at").limit(500)
  fail(error)
  return (data as unknown as CommentRow[]).map(toComment)
}

export async function addIssueComment(issueId: string, body: string): Promise<Comment> {
  const me = await requireMe()
  const { data, error } = await client().from("code_issue_comments").insert({ issue_id: issueId, author_id: me, body }).select(`id, body, created_at, updated_at, hidden_at, author:profiles!code_issue_comments_author_id_fkey(${P})`).single()
  fail(error)
  return toComment(data as unknown as CommentRow)
}

export async function deleteComment(kind: "issue" | "pull", id: string) {
  fail((await client().from(kind === "issue" ? "code_issue_comments" : "code_pull_comments").delete().eq("id", id)).error)
}

// ─── Pull requests ──────────────────────────────────────────────────────────────────────────────────────────

const PULL = `id, repo_id, number, title, body, state, from_repo, from_branch, to_branch, comments_count, base_commit, head_commit, merge_commit, merged_at, closed_at, hidden_at, created_at, updated_at, author:profiles!code_pulls_author_id_fkey(${P}), merger:profiles!code_pulls_merged_by_fkey(${P})`
type PullRow = { id: string; repo_id: string; number: number; title: string; body: string; state: Pull["state"]; from_repo: string; from_branch: string; to_branch: string; comments_count: number; base_commit: string | null; head_commit: string | null; merge_commit: string | null; merged_at: string | null; closed_at: string | null; hidden_at: string | null; created_at: string; updated_at: string; author: PersonRow; merger: PersonRow }
const toPull = (r: PullRow): Pull => ({ id: r.id, repoId: r.repo_id, number: r.number, title: r.title, body: r.body, state: r.state, fromRepo: r.from_repo, fromBranch: r.from_branch, toBranch: r.to_branch, author: person(r.author), comments: r.comments_count, baseCommit: r.base_commit, headCommit: r.head_commit, mergeCommit: r.merge_commit, mergedBy: person(r.merger), mergedAt: r.merged_at, closedAt: r.closed_at, hiddenAt: r.hidden_at, createdAt: r.created_at, updatedAt: r.updated_at })

export async function listPulls(repoId: string, state: "open" | "closed" | "merged" | "all" = "open"): Promise<Pull[]> {
  let q = client().from("code_pulls").select(PULL).eq("repo_id", repoId)
  if (state === "closed") q = q.in("state", ["closed", "merged"])
  else if (state !== "all") q = q.eq("state", state)
  const { data, error } = await q.order("number", { ascending: false }).limit(100)
  fail(error)
  return (data as unknown as PullRow[]).map(toPull)
}

export async function getPull(repoId: string, number: number): Promise<Pull | null> {
  const { data, error } = await client().from("code_pulls").select(PULL).eq("repo_id", repoId).eq("number", number).maybeSingle()
  fail(error)
  return data ? toPull(data as unknown as PullRow) : null
}

export async function getPullById(id: string): Promise<Pull | null> {
  const { data, error } = await client().from("code_pulls").select(PULL).eq("id", id).maybeSingle()
  fail(error)
  return data ? toPull(data as unknown as PullRow) : null
}

/** An issue or pull request number in a repository: which one it is. */
export async function whichNumber(repoId: string, number: number): Promise<"issue" | "pull" | null> {
  const c = client()
  const [i, p] = await Promise.all([
    c.from("code_issues").select("id").eq("repo_id", repoId).eq("number", number).maybeSingle(),
    c.from("code_pulls").select("id").eq("repo_id", repoId).eq("number", number).maybeSingle(),
  ])
  return i.data ? "issue" : p.data ? "pull" : null
}

export async function createPull(input: { repoId: string; fromRepo: string; fromBranch: string; toBranch: string; title: string; body: string }): Promise<Pull> {
  const me = await requireMe()
  const { data, error } = await client()
    .from("code_pulls")
    .insert({ repo_id: input.repoId, from_repo: input.fromRepo, from_branch: input.fromBranch, to_branch: input.toBranch, title: input.title.trim(), body: input.body, author_id: me })
    .select(PULL)
    .single()
  fail(error)
  return toPull(data as unknown as PullRow)
}

export async function updatePull(id: string, patch: Partial<{ title: string; body: string; state: "open" | "closed" }>): Promise<Pull> {
  const { data, error } = await client().from("code_pulls").update(patch).eq("id", id).select(PULL).maybeSingle()
  fail(error)
  if (!data) throw new Error("You are not allowed to change this pull request.")
  return toPull(data as unknown as PullRow)
}

export async function mergePull(id: string, expectedBase: string, expectedHead: string, fastForward: boolean, tree: Tree | null, message: string): Promise<string> {
  const { data, error } = await client().rpc("code_merge_pull", { pull: id, expected_base: expectedBase, expected_head: expectedHead, fast_forward: fastForward, merged_tree: tree, message })
  fail(error)
  return data as string
}

const PC = `id, body, path, line, side, created_at, updated_at, hidden_at, author:profiles!code_pull_comments_author_id_fkey(${P})`

export async function listPullComments(pullId: string): Promise<Comment[]> {
  const { data, error } = await client().from("code_pull_comments").select(PC).eq("pull_id", pullId).order("created_at").limit(1000)
  fail(error)
  return (data as unknown as CommentRow[]).map(toComment)
}

export async function addPullComment(pullId: string, body: string, at?: { path: string; line: number; side: "old" | "new" }): Promise<Comment> {
  const me = await requireMe()
  const { data, error } = await client()
    .from("code_pull_comments")
    .insert({ pull_id: pullId, author_id: me, body, path: at?.path ?? null, line: at?.line ?? null, side: at?.side ?? null })
    .select(PC)
    .single()
  fail(error)
  return toComment(data as unknown as CommentRow)
}

/** Forks of a repository you can read (to open a pull request from one). */
export async function listForks(repoId: string): Promise<Repo[]> {
  const { data, error } = await client().from("code_repos").select(REPO_LIST).eq("forked_from", repoId).is("deleted_at", null).order("pushed_at", { ascending: false, nullsFirst: false }).limit(100)
  fail(error)
  return (data as unknown as RepoRow[]).map(toRepo)
}

// ─── Collaborators ──────────────────────────────────────────────────────────────────────────────────────────

export async function listCollaborators(repoId: string): Promise<Collaborator[]> {
  const { data, error } = await client().from("code_collaborators").select(`role, created_at, member:profiles!code_collaborators_member_id_fkey(${P})`).eq("repo_id", repoId).order("created_at")
  fail(error)
  return (data as unknown as { role: Collaborator["role"]; created_at: string; member: PersonRow }[]).filter((r) => r.member).map((r) => ({ role: r.role, createdAt: r.created_at, member: person(r.member)! }))
}

export async function addCollaborator(repoId: string, handleOrId: string, role: Collaborator["role"]) {
  const p = await getPerson(handleOrId.replace(/^@/, "").trim())
  if (!p) throw new Error("No member has that handle.")
  fail((await client().from("code_collaborators").insert({ repo_id: repoId, member_id: p.id, role })).error)
}

export async function setCollaboratorRole(repoId: string, memberId: string, role: Collaborator["role"]) {
  fail((await client().from("code_collaborators").update({ role }).eq("repo_id", repoId).eq("member_id", memberId)).error)
}

export async function removeCollaborator(repoId: string, memberId: string) {
  fail((await client().from("code_collaborators").delete().eq("repo_id", repoId).eq("member_id", memberId)).error)
}

// ─── Activity ───────────────────────────────────────────────────────────────────────────────────────────────

type ActivityRow = { id: number; repo_id: string; kind: ActivityKind; title: string; ref: string; created_at: string; actor: PersonRow; repo: { slug: string; owner: PersonRow } | null }
const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  repoId: r.repo_id,
  kind: r.kind,
  title: r.title,
  ref: r.ref,
  actor: person(r.actor),
  createdAt: r.created_at,
  repo: r.repo && r.repo.owner ? { slug: r.repo.slug, owner: person(r.repo.owner)! } : null,
})

export async function listActivity(repoId?: string, limit = 50): Promise<Activity[]> {
  let q = client().from("code_activity").select(`id, repo_id, kind, title, ref, created_at, actor:profiles!code_activity_actor_id_fkey(${P}), repo:code_repos(slug, owner:profiles!code_repos_owner_id_fkey(${P}))`)
  if (repoId) q = q.eq("repo_id", repoId)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit)
  fail(error)
  return (data as unknown as ActivityRow[]).map(toActivity)
}
