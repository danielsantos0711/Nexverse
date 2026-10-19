/**
 * Where links and images in a README point. Relative paths resolve against the repository the file lives
 * in; links to GitHub repositories and topics become in-site links; links and images on
 * other AI communities' sites are dropped (the text stays); everything else must be an absolute http(s) or
 * mailto URL, or it is dropped.
 */
import { isOffSiteHost } from "@/lib/live/http"
import { ghBlobHref, ghTreeHref, internalHref } from "@/lib/live/ids"

export type MdContext =
  | { source: "github"; owner: string; repo: string; branch: string; /** Directory of the Markdown file, "" for the root. */ dir: string }
  | { source: "none" }

export type MdLink = { href: string; internal: boolean }

/** Joins a relative path onto a directory, resolving "." and ".."; null if it climbs above the root. */
export function resolvePath(dir: string, rel: string): string | null {
  const parts = rel.startsWith("/") ? [] : dir.split("/").filter(Boolean)
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join("/")
}

function splitRef(href: string) {
  const hash = href.indexOf("#")
  const q = href.indexOf("?")
  const end = Math.min(hash < 0 ? href.length : hash, q < 0 ? href.length : q)
  return { path: href.slice(0, end), hash: hash >= 0 ? href.slice(hash) : "" }
}

function decode(s: string) {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

/** GitHub-style heading anchors. */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-")
    .slice(0, 80)
}

function absolute(href: string): URL | null {
  try {
    const u = new URL(href.startsWith("//") ? `https:${href}` : href)
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:" ? u : null
  } catch {
    return null
  }
}

const isAbsolute = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")

/** A link target, or null when it is unsafe (javascript:, data:, …) or cannot be resolved. */
export function rewriteLink(raw: string, ctx: MdContext): MdLink | null {
  const href = raw.trim()
  if (!href || href.length > 2048) return null
  if (href.startsWith("#")) return { href: `#${slugify(decode(href.slice(1)))}`, internal: true }
  if (isAbsolute(href)) {
    const u = absolute(href)
    if (!u) return null
    if (u.protocol === "mailto:") return { href: u.toString(), internal: false }
    if (isOffSiteHost(u.hostname)) return null
    const inside = internalHref(u.toString())
    return inside ? { href: inside, internal: true } : { href: u.toString(), internal: false }
  }
  // A bare e-mail address written as a link.
  if (/^[^\s/@:]+@[^\s/@]+\.[a-z]{2,}$/i.test(href)) return { href: `mailto:${href}`, internal: false }
  if (ctx.source === "none") return null
  const { path, hash } = splitRef(href)
  if (!path) return { href: hash ? `#${slugify(decode(hash.slice(1)))}` : "#", internal: true }
  const resolved = resolvePath(ctx.dir, decode(path))
  if (resolved === null) return null
  if (!resolved) return { href: ghTreeHref(ctx.owner, ctx.repo, ctx.branch, ""), internal: true }
  return { href: path.endsWith("/") ? ghTreeHref(ctx.owner, ctx.repo, ctx.branch, resolved) : ghBlobHref(ctx.owner, ctx.repo, ctx.branch, resolved), internal: true }
}

const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/")

/** An image source, always absolute https; relative paths load from the repository's raw files. */
export function rewriteImage(raw: string, ctx: MdContext): string | null {
  const src = raw.trim()
  if (!src || src.length > 2048) return null
  if (isAbsolute(src)) {
    const u = absolute(src)
    if (!u || u.protocol === "mailto:") return null
    u.protocol = "https:"
    const host = u.hostname.toLowerCase()
    if (isOffSiteHost(host)) return null
    // github.com/<o>/<r>/blob|raw/<ref>/<path> as an image means the raw file.
    const gh = host === "github.com" ? u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/(?:blob|raw)\/(.+)$/) : null
    if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}${/\.svg$/i.test(gh[3]) ? "?sanitize=true" : ""}`
    if (host === "raw.githubusercontent.com" && /\.svg$/i.test(u.pathname) && !u.searchParams.has("sanitize")) u.searchParams.set("sanitize", "true")
    return u.toString()
  }
  if (ctx.source === "none") return null
  const { path } = splitRef(src)
  const resolved = resolvePath(ctx.dir, decode(path))
  if (!resolved) return null
  return `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${encodeURIComponent(ctx.branch)}/${encPath(resolved)}${/\.svg$/i.test(resolved) ? "?sanitize=true" : ""}`
}
