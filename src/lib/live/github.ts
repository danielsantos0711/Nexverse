/**
 * GitHub repository details for /gh/[owner]/[repo]. Each call is a cached function ("use cache"): results are
 * kept for hours, failures for minutes. The REST API allows 60 unauthenticated requests an hour per server
 * IP; set GITHUB_TOKEN to raise that to 5,000. README and file contents come from raw.githubusercontent.com,
 * which does not count against the API limit.
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, fetchSafe, hostname, isoDate, isOffSiteHost, isRecord, num, parseJson, plain, safeUrl, str, type FailReason, type Result } from "./http"
import { isGitRef } from "./ids"
import { cleanTopics } from "./parse"

export type GhRepoDetail = {
  fullName: string
  owner: string
  name: string
  ownerAvatar: string
  ownerType: "User" | "Organization"
  description: string
  homepage: string
  topics: string[]
  stars: number
  forks: number
  watchers: number
  openIssues: number
  license: string
  defaultBranch: string
  pushedAt: string
  createdAt: string
  archived: boolean
  fork: boolean
  parent: string
  /** Kilobytes, as GitHub reports it. */
  size: number
}

export type GhLanguage = { name: string; bytes: number; share: number }

export type GhEntry = { name: string; path: string; type: "file" | "dir" | "symlink" | "submodule"; size: number }

export type GhCommit = { sha: string; message: string; author: string; login: string; avatar: string; date: string }

export type GhReleaseAsset = { name: string; size: number; downloads: number }

export type GhRelease = { tag: string; name: string; publishedAt: string; prerelease: boolean; body: string; author: string; assets: GhReleaseAsset[] }

export type GhReadme = { path: string; text: string }

export type GhFile =
  | { kind: "text"; path: string; text: string; bytes: number }
  | { kind: "image"; path: string; src: string }
  | { kind: "binary"; path: string }
  | { kind: "toolarge"; path: string }

const API = "https://api.github.com"
const RAW = "https://raw.githubusercontent.com"

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "X-GitHub-Api-Version": "2022-11-28" }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/")

async function api(path: string): Promise<{ ok: true; data: unknown } | { ok: false; reason: FailReason }> {
  const headers = apiHeaders()
  let res = await fetchSafe(`${API}${path}`, { accept: "application/vnd.github+json", headers, maxBytes: 3_000_000 })
  if (!res.ok && res.status === 401 && headers.Authorization) {
    // An expired or revoked GITHUB_TOKEN must not take every GitHub page down: ask again without it.
    console.warn("[live] GITHUB_TOKEN was rejected by GitHub (401); falling back to unauthenticated requests. Replace the token in Vercel.")
    delete headers.Authorization
    res = await fetchSafe(`${API}${path}`, { accept: "application/vnd.github+json", headers, maxBytes: 3_000_000 })
  }
  if (!res.ok) return res
  const data = parseJson(res.text)
  return data === undefined ? { ok: false, reason: "error" } : { ok: true, data }
}

/** Caches a result for hours when it worked and for minutes when it did not, then returns it. */
function settle<T>(r: Result<T>): Result<T> {
  if (r.ok || r.reason === "notfound") cacheLife("hours")
  else cacheLife("minutes")
  return r
}

const tags = (owner: string, repo: string) => cacheTag("live", "live:github", `gh:${owner.toLowerCase()}/${repo.toLowerCase()}`)

export function normalizeRepoDetail(raw: unknown): GhRepoDetail | null {
  if (!isRecord(raw) || raw.private === true) return null
  const fullName = str(raw.full_name, 150)
  if (!/^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/.test(fullName)) return null
  const [owner, name] = fullName.split("/")
  const o = isRecord(raw.owner) ? raw.owner : {}
  const avatar = safeUrl(o.avatar_url)
  const license = isRecord(raw.license) ? str(raw.license.spdx_id, 40) : ""
  const branch = str(raw.default_branch, 100)
  const homepage = safeUrl(raw.homepage)
  return {
    fullName,
    owner,
    name,
    ownerAvatar: avatar.startsWith("https://avatars.githubusercontent.com/") ? avatar : "",
    ownerType: o.type === "Organization" ? "Organization" : "User",
    description: plain(raw.description, 400),
    homepage: isOffSiteHost(hostname(homepage)) ? "" : homepage,
    topics: cleanTopics(raw.topics, 20),
    stars: num(raw.stargazers_count),
    forks: num(raw.forks_count),
    watchers: num(raw.subscribers_count ?? raw.watchers_count),
    openIssues: num(raw.open_issues_count),
    license: license && license !== "NOASSERTION" ? license : isRecord(raw.license) ? str(raw.license.name, 60) : "",
    defaultBranch: isGitRef(branch) ? branch : "HEAD",
    pushedAt: isoDate(raw.pushed_at),
    createdAt: isoDate(raw.created_at),
    archived: raw.archived === true,
    fork: raw.fork === true,
    parent: isRecord(raw.parent) ? str(raw.parent.full_name, 150) : "",
    size: num(raw.size),
  }
}

export function normalizeLanguages(raw: unknown): GhLanguage[] {
  if (!isRecord(raw)) return []
  const list = Object.entries(raw)
    .map(([name, bytes]) => ({ name: str(name, 40), bytes: num(bytes) }))
    .filter((l) => l.name && l.bytes > 0)
  const total = list.reduce((s, l) => s + l.bytes, 0)
  return list
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map((l) => ({ ...l, share: total ? l.bytes / total : 0 }))
}

export function normalizeEntries(raw: unknown): GhEntry[] {
  const order = { dir: 0, submodule: 1, symlink: 2, file: 3 } as const
  return asArray(raw)
    .map((e): GhEntry | null => {
      if (!isRecord(e)) return null
      const name = str(e.name, 255)
      const path = str(e.path, 1024)
      const type = e.type === "dir" || e.type === "file" || e.type === "symlink" || e.type === "submodule" ? e.type : null
      if (!name || !path || !type || name.includes("/")) return null
      return { name, path, type, size: num(e.size) }
    })
    .filter((e): e is GhEntry => e !== null)
    .sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    .slice(0, 1000)
}

export function normalizeCommits(raw: unknown): GhCommit[] {
  return asArray(raw)
    .map((c): GhCommit | null => {
      if (!isRecord(c) || !isRecord(c.commit)) return null
      const sha = str(c.sha, 40)
      if (!/^[0-9a-f]{40}$/.test(sha)) return null
      const author = isRecord(c.commit.author) ? c.commit.author : {}
      const user = isRecord(c.author) ? c.author : {}
      const avatar = safeUrl(user.avatar_url)
      const message = typeof c.commit.message === "string" ? c.commit.message.split("\n")[0] : ""
      return {
        sha,
        message: str(message, 200) || "(no message)",
        author: plain(author.name, 80),
        login: str(user.login, 40).replace(/[^\w-]/g, ""),
        avatar: avatar.startsWith("https://avatars.githubusercontent.com/") ? avatar : "",
        date: isoDate(author.date),
      }
    })
    .filter((c): c is GhCommit => c !== null)
}

export function normalizeReleases(raw: unknown): GhRelease[] {
  return asArray(raw)
    .map((r): GhRelease | null => {
      if (!isRecord(r) || r.draft === true) return null
      const tag = str(r.tag_name, 100)
      if (!tag) return null
      return {
        tag,
        name: plain(r.name, 200) || tag,
        publishedAt: isoDate(r.published_at ?? r.created_at),
        prerelease: r.prerelease === true,
        // Markdown; rendered by our own renderer, which never outputs raw HTML.
        body: typeof r.body === "string" ? r.body.slice(0, 20_000) : "",
        author: isRecord(r.author) ? str(r.author.login, 40) : "",
        // Downloaded through Nexverse (/api/gh/download), never linked to GitHub.
        assets: asArray(r.assets)
          .map((a) => (isRecord(a) && a.state !== "starter" ? { name: str(a.name, 255), size: typeof a.size === "number" ? a.size : 0, downloads: typeof a.download_count === "number" ? a.download_count : 0 } : null))
          .filter((a): a is GhReleaseAsset => Boolean(a && a.name))
          .slice(0, 50),
      }
    })
    .filter((r): r is GhRelease => r !== null)
}

export async function ghRepo(owner: string, repo: string): Promise<Result<GhRepoDetail>> {
  "use cache"
  tags(owner, repo)
  const res = await api(`/repos/${owner}/${repo}`)
  if (!res.ok) return settle(res)
  const data = normalizeRepoDetail(res.data)
  return settle(data ? { ok: true, data } : { ok: false, reason: "notfound" })
}

export async function ghLanguages(owner: string, repo: string): Promise<Result<GhLanguage[]>> {
  "use cache"
  tags(owner, repo)
  const res = await api(`/repos/${owner}/${repo}/languages`)
  return settle(res.ok ? { ok: true, data: normalizeLanguages(res.data) } : res)
}

/** The entries of a directory ("" for the root) at a ref. A path that is a file answers notfound. */
export async function ghContents(owner: string, repo: string, ref: string, path: string): Promise<Result<GhEntry[]>> {
  "use cache"
  tags(owner, repo)
  const q = ref && ref !== "HEAD" ? `?ref=${encodeURIComponent(ref)}` : ""
  const res = await api(`/repos/${owner}/${repo}/contents${path ? `/${enc(path)}` : ""}${q}`)
  if (!res.ok) return settle(res)
  if (!Array.isArray(res.data)) return settle({ ok: false, reason: "notfound" })
  return settle({ ok: true, data: normalizeEntries(res.data) })
}

export async function ghCommits(owner: string, repo: string): Promise<Result<GhCommit[]>> {
  "use cache"
  tags(owner, repo)
  const res = await api(`/repos/${owner}/${repo}/commits?per_page=20`)
  // An empty repository answers 409.
  return settle(res.ok ? { ok: true, data: normalizeCommits(res.data) } : res)
}

export async function ghReleases(owner: string, repo: string): Promise<Result<GhRelease[]>> {
  "use cache"
  tags(owner, repo)
  const res = await api(`/repos/${owner}/${repo}/releases?per_page=10`)
  return settle(res.ok ? { ok: true, data: normalizeReleases(res.data) } : res)
}

const README_MAX = 500_000

/**
 * The repository's README. Tries README.md on raw.githubusercontent.com first (free), then asks the API,
 * which finds any README name and location.
 */
export async function ghReadme(owner: string, repo: string, ref: string): Promise<Result<GhReadme>> {
  "use cache"
  tags(owner, repo)
  const raw = await fetchSafe(`${RAW}/${owner}/${repo}/${encodeURIComponent(ref || "HEAD")}/README.md`, { accept: "text/plain", maxBytes: README_MAX })
  if (raw.ok) return settle({ ok: true, data: { path: "README.md", text: raw.text } })
  if (raw.reason === "toolarge") return settle({ ok: false, reason: "toolarge" })
  const res = await api(`/repos/${owner}/${repo}/readme`)
  if (!res.ok) return settle(res)
  const d = res.data
  if (!isRecord(d) || d.encoding !== "base64" || typeof d.content !== "string") return settle({ ok: false, reason: "error" })
  const path = str(d.path, 300) || "README.md"
  const text = Buffer.from(d.content.replace(/\s+/g, ""), "base64").toString("utf8")
  return settle(text.length > README_MAX ? { ok: false, reason: "toolarge" } : { ok: true, data: { path, text } })
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i
const BINARY_EXT =
  /\.(zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war|exe|dll|so|dylib|bin|o|a|class|pyc|whl|pdf|mp[34]|mov|avi|mkv|webm|wav|flac|ogg|ttf|otf|woff2?|eot|psd|ai|sketch|fig|parquet|arrow|safetensors|pt|pth|ckpt|onnx|h5|pb|tflite|gguf|npy|npz|pkl|db|sqlite)$/i

export const FILE_MAX = 200_000

/** Builds the raw URL for a file; SVGs need ?sanitize=true to be served as images. */
export function ghRawUrl(owner: string, repo: string, ref: string, path: string) {
  return `${RAW}/${owner}/${repo}/${encodeURIComponent(ref)}/${enc(path)}${/\.svg$/i.test(path) ? "?sanitize=true" : ""}`
}

/** A file's contents for the in-site viewer: text up to 200 KB, images by URL, anything else described. */
export async function ghFile(owner: string, repo: string, ref: string, path: string): Promise<Result<GhFile>> {
  "use cache"
  tags(owner, repo)
  if (IMAGE_EXT.test(path)) {
    // Confirm it exists without downloading it: a ranged GET of one byte.
    const head = await fetchSafe(`${RAW}/${owner}/${repo}/${encodeURIComponent(ref)}/${enc(path)}`, { accept: "*/*", headers: { Range: "bytes=0-0" }, maxBytes: 1024 })
    if (!head.ok && head.reason !== "toolarge") return settle(head)
    return settle({ ok: true, data: { kind: "image", path, src: ghRawUrl(owner, repo, ref, path) } })
  }
  if (BINARY_EXT.test(path)) return settle({ ok: true, data: { kind: "binary", path } })
  const res = await fetchSafe(`${RAW}/${owner}/${repo}/${encodeURIComponent(ref)}/${enc(path)}`, { accept: "text/plain, */*", maxBytes: FILE_MAX })
  if (!res.ok) return settle(res.reason === "toolarge" ? { ok: true, data: { kind: "toolarge", path } } : res)
  // NUL bytes or many replacement characters mean this is not text.
  const head = res.text.slice(0, 8000)
  if (head.includes("\u0000") || (head.match(/�/g)?.length ?? 0) > 8) return settle({ ok: true, data: { kind: "binary", path } })
  return settle({ ok: true, data: { kind: "text", path, text: res.text, bytes: Buffer.byteLength(res.text) } })
}
