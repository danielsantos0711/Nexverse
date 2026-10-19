/**
 * Pure normalisers: raw API payloads in, typed items out. Anything malformed is dropped rather than
 * repaired, so a change on the other side shows fewer items instead of broken ones.
 */
import { asArray, decodeEntities, hostname, isoDate, isOffSite, isOffSiteOwner, isRecord, isSafe, num, plain, safeUrl, str } from "./http"
import { isGhTopic } from "./ids"
import type { GhReleaseItem, GhRepo } from "./types"

/** The inner text of the first matching XML element, or "". */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : ""
}

function attrs(xml: string, name: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}\\s[^>]*?${attr}="([^"]*)"`, "g"))].map((m) => decodeEntities(m[1]))
}

const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

/** GitHub topics, minus any that name sites Nexverse does not feature. */
export function cleanTopics(v: unknown, max = 4): string[] {
  return asArray(v)
    .map((t) => str(t, 50))
    .filter((t) => isGhTopic(t))
    .slice(0, max)
}

export function normalizeGh(raw: unknown): GhRepo | null {
  if (!isRecord(raw)) return null
  const fullName = str(raw.full_name, 200)
  if (!/^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/.test(fullName) || raw.private === true || raw.archived === true || raw.disabled === true) return null
  const description = plain(raw.description, 220)
  const [owner, name] = fullName.split("/")
  if (!isSafe(fullName, description) || isOffSiteOwner(owner) || isOffSite(fullName, description)) return null
  return {
    fullName,
    owner,
    name,
    url: `https://github.com/${fullName}`,
    description,
    stars: num(raw.stargazers_count),
    forks: num(raw.forks_count),
    language: str(raw.language, 30),
    topics: cleanTopics(raw.topics),
    pushedAt: isoDate(raw.pushed_at),
    createdAt: isoDate(raw.created_at),
  }
}

/** Releases from a repository's public Atom feed (github.com/<owner>/<repo>/releases.atom). */
export function parseReleasesAtom(xml: string, owner: string, name: string, max = 3): GhReleaseItem[] {
  const out: GhReleaseItem[] = []
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const href = safeUrl(decodeEntities(attrs(entry, "link", "href")[0] ?? ""))
    if (hostname(href) !== "github.com") continue
    const m = new URL(href).pathname.match(/\/releases\/tag\/([^/]+)$/)
    let tagName = ""
    try {
      tagName = m ? decodeURIComponent(m[1]) : ""
    } catch {
      tagName = ""
    }
    tagName = str(tagName, 100)
    if (!tagName) continue
    const title = plain(unwrap(tag(entry, "title")), 160) || tagName
    if (isOffSite(title)) continue
    out.push({ repo: `${owner}/${name}`, owner, name, tag: tagName, title, publishedAt: isoDate(plain(tag(entry, "updated"), 40)) })
    if (out.length >= max) break
  }
  return out
}
