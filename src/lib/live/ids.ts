/**
 * Identifiers and in-site addresses for external items. Every GitHub repository, GitHub topic and arXiv paper
 * has its own page on Nexverse; these helpers validate the ids that reach those routes and map external URLs
 * (in READMEs, abstracts and feeds) onto them.
 */
import { isOffSite, isOffSiteOwner } from "./http"

// ─── Validation ─────────────────────────────────────────────────────────────────────────────────────────────

/** GitHub user or organisation: alphanumerics and single inner hyphens, up to 39 characters. */
export const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
/** GitHub repository name. "." and ".." are rejected separately. */
export const GH_REPO = /^[\w.-]{1,100}$/
/** A branch, tag or commit as the first path segment of blob/tree URLs. */
export const GIT_REF = /^[\w.-]{1,100}$/
/** A GitHub topic: lowercase letters, digits and inner hyphens, up to 50 characters. */
export const GH_TOPIC = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,49}$/
/** New-style arXiv ids with an optional version, e.g. 2610.21601 or 2610.21601v2. */
export const ARXIV_NEW = /^\d{4}\.\d{4,5}(v\d{1,3})?$/
/** Old-style arXiv ids, e.g. hep-th/9901001 or math.GT/0309136v1. */
export const ARXIV_OLD = /^[a-z-]{2,20}(\.[A-Z]{2})?\/\d{7}(v\d{1,3})?$/

const dotty = (s: string) => s === "." || s === ".." || s.includes("..")

/** A valid owner whose repositories Nexverse shows. */
export const isGhOwner = (s: string) => GH_OWNER.test(s) && !isOffSiteOwner(s)
/** A valid topic that Nexverse shows (not one named after an off-site community). */
export const isGhTopic = (s: string) => GH_TOPIC.test(s) && s !== "hf" && !isOffSite(s.replace(/-/g, " "))
export const isGhRepo = (s: string) => GH_REPO.test(s) && !dotty(s) && !s.endsWith(".git")
export const isGitRef = (s: string) => GIT_REF.test(s) && !dotty(s)
export const isArxivId = (s: string) => ARXIV_NEW.test(s) || ARXIV_OLD.test(s)
/** The id without its version suffix. */
export const arxivBase = (id: string) => id.replace(/v\d{1,3}$/, "")

/** Decodes a route segment once if it is still percent-encoded; null when it does not decode. */
export function segment(s: string): string | null {
  if (!s.includes("%")) return s
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

/**
 * A repository-relative file path from catch-all segments: no empty, "." or ".." parts, no control
 * characters, at most 1 KB. Returns null when anything looks off.
 */
export function filePath(parts: string[]): string | null {
  if (!parts.length || parts.length > 40) return null
  const out: string[] = []
  for (const raw of parts) {
    const p = segment(raw)
    if (!p || p === "." || p === ".." || p.length > 255 || /[\u0000-\u001f\u007f/\\]/.test(p)) return null
    out.push(p)
  }
  const path = out.join("/")
  return path.length <= 1024 ? path : null
}

// ─── In-site addresses ──────────────────────────────────────────────────────────────────────────────────────

const encPath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

export const ghHref = (owner: string, repo: string) => `/gh/${owner}/${repo}`
export const ghBlobHref = (owner: string, repo: string, ref: string, path: string) => `/gh/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encPath(path)}`
export const ghTreeHref = (owner: string, repo: string, ref: string, path: string) =>
  path ? `/gh/${owner}/${repo}/tree/${encodeURIComponent(ref)}/${encPath(path)}` : ghHref(owner, repo)
export const ghTopicHref = (topic: string) => `/gh/topics/${topic}`
export const paperHref = (id: string) => `/papers/${id.includes("/") ? encodeURIComponent(id) : id}`

/** The forum's new-thread page, prefilled with a title and a body that links back to the item's page. */
export function discussItemHref(title: string, body: string) {
  return `/forum/new?title=${encodeURIComponent(title.slice(0, 280))}&body=${encodeURIComponent(body.slice(0, 4000))}`
}

/** First path segments on github.com that are site pages, not owners. */
const GH_RESERVED = new Set([
  "orgs", "settings", "topics", "marketplace", "features", "sponsors", "explore", "collections", "apps", "login", "logout", "join", "about",
  "pricing", "enterprise", "search", "notifications", "trending", "users", "site", "security", "contact", "new", "issues", "pulls", "codespaces",
  "customer-stories", "readme", "events", "team", "copilot", "resources", "solutions", "organizations", "dashboard", "account", "github-copilot",
])

/**
 * Maps an external URL to its Nexverse page when we have one: GitHub repositories (and their files), GitHub
 * topics and arXiv papers. Returns null otherwise.
 */
export function internalHref(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.replace(/^www\./, "").toLowerCase()
  const parts = u.pathname.split("/").filter(Boolean).map((p) => segment(p) ?? "")
  if (parts.some((p) => !p)) return null

  if (host === "github.com" && parts[0] === "topics" && parts.length === 2) {
    const topic = parts[1].toLowerCase()
    return isGhTopic(topic) ? ghTopicHref(topic) : null
  }

  if (host === "github.com" && parts.length >= 2) {
    const [owner, rawRepo, mode, ref, ...rest] = parts
    const repo = rawRepo.replace(/\.git$/, "")
    if (GH_RESERVED.has(owner.toLowerCase()) || !isGhOwner(owner) || !isGhRepo(repo)) return null
    if ((mode === "blob" || mode === "tree") && ref && isGitRef(ref)) {
      const path = rest.length ? filePath(rest) : ""
      if (path === null) return ghHref(owner, repo)
      if (mode === "tree") return ghTreeHref(owner, repo, ref, path)
      if (path) return ghBlobHref(owner, repo, ref, path)
    }
    return ghHref(owner, repo)
  }

  if (host === "arxiv.org" || host === "export.arxiv.org") {
    const [mode, ...rest] = parts
    if (mode === "abs" || mode === "pdf" || mode === "html") {
      const id = rest.join("/").replace(/\.pdf$/, "")
      if (isArxivId(id)) return paperHref(id)
    }
    return null
  }

  return null
}

// ─── Like and save targets ──────────────────────────────────────────────────────────────────────────────────

/*
 * Likes and bookmarks use keys matching ^[a-z]{2,16}:[a-z0-9-]{1,80}$. External ids contain capitals, dots,
 * underscores and slashes, so they are encoded reversibly into that alphabet: letters are lowercased (GitHub
 * resolves names case-insensitively) and "-" is an escape: "-h" hyphen, "-d" dot, "-u" underscore,
 * "--" slash. An id whose encoding is longer than 80 characters cannot be liked or saved (null).
 */

export type LiveTargetType = "ghrepo" | "paper"

const ESC: Record<string, string> = { "-": "-h", ".": "-d", _: "-u", "/": "--" }
const UNESC: Record<string, string> = { h: "-", d: ".", u: "_", "-": "/" }

export function encodeTargetId(id: string): string | null {
  let out = ""
  for (const ch of id.toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) out += ch
    else if (ESC[ch]) out += ESC[ch]
    else return null
  }
  return out.length >= 1 && out.length <= 80 ? out : null
}

export function decodeTargetId(enc: string): string | null {
  let out = ""
  for (let i = 0; i < enc.length; i++) {
    const ch = enc[i]
    if (ch !== "-") {
      out += ch
      continue
    }
    const next = UNESC[enc[i + 1]]
    if (!next) return null
    out += next
    i++
  }
  return out
}

/** The like/save key for an external item, or null when its id cannot be encoded in 80 characters. */
export function liveTarget(type: LiveTargetType, id: string): string | null {
  const enc = encodeTargetId(id)
  return enc ? `${type}:${enc}` : null
}

/**
 * A label and in-site link for a live target key, for the Saved page and notifications. Returns null for keys
 * that are not live targets, so callers can fall through to their own catalogue.
 */
export function describeLiveTarget(target: string): { type: LiveTargetType; id: string; label: string; href: string } | null {
  const m = target.match(/^(ghrepo|paper):([a-z0-9-]{1,80})$/)
  if (!m) return null
  const type = m[1] as LiveTargetType
  const id = decodeTargetId(m[2])
  if (!id) return null
  if (type === "ghrepo") {
    const [owner, repo, extra] = id.split("/")
    if (extra !== undefined || !owner || !repo || !isGhOwner(owner) || !isGhRepo(repo)) return null
    return { type, id, label: id, href: ghHref(owner, repo) }
  }
  return isArxivId(id) ? { type, id, label: `arXiv:${id}`, href: paperHref(id) } : null
}
