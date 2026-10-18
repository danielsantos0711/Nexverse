/**
 * Pure normalisers: raw API payloads in, typed items out. Anything malformed is dropped rather than
 * repaired, so a change on the other side shows fewer items instead of broken ones.
 */
import { asArray, decodeEntities, hostname, isoDate, isOffSite, isOffSiteOwner, isRecord, isSafe, num, plain, safeUrl, str, stripOffSiteUrls } from "./http"
import { isGhTopic } from "./ids"
import type { GhReleaseItem, GhRepo, Paper } from "./types"

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})$/

/** The inner text of the first matching XML element, or "". */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : ""
}

function allTags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1])
}

function attrs(xml: string, name: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}\\s[^>]*?${attr}="([^"]*)"`, "g"))].map((m) => decodeEntities(m[1]))
}

const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

/** The first github.com/<owner>/<repo> named in a piece of text, as a clean repository URL; "" if none. */
export function findGithubRepo(...texts: string[]): string {
  for (const t of texts) {
    for (const m of t.matchAll(/\bgithub\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([\w.-]{1,100})/g)) {
      const owner = m[1]
      const repo = m[2].replace(/[.,;:)]+$/, "").replace(/\.git$/, "")
      if (!repo || repo === "." || repo === ".." || isOffSiteOwner(owner)) continue
      if (/^(orgs|topics|features|sponsors|marketplace|settings|about|login|join)$/i.test(owner)) continue
      return `https://github.com/${owner}/${repo}`
    }
  }
  return ""
}

/**
 * A DOM-free parser for arXiv's Atom feed. CDATA is unwrapped; markup inside text is stripped. Entries that
 * name sites Nexverse does not feature are left out of feeds (`dropOffSite`); otherwise their addresses are
 * removed from the abstract and note.
 */
export function parseArxiv(xml: string, { dropOffSite = true }: { dropOffSite?: boolean } = {}): Paper[] {
  const out: Paper[] = []
  const seen = new Set<string>()
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const rawId = plain(tag(entry, "id"), 200)
    const m = rawId.match(/arxiv\.org\/abs\/(.+?)(v\d+)?$/)
    const id = m?.[1] ?? ""
    if (!ARXIV_ID.test(id) || seen.has(id)) continue
    const title = plain(unwrap(tag(entry, "title")), 300)
    if (!title) continue
    const rawSummary = plain(unwrap(tag(entry, "summary")), 4000)
    const rawComment = plain(unwrap(tag(entry, "arxiv:comment")), 400)
    if (dropOffSite && isOffSite(title, rawSummary, rawComment)) continue
    if (!isSafe(title)) continue
    seen.add(id)
    const categories = attrs(entry, "category", "term")
      .map((c) => str(c, 20))
      .filter((c) => /^[a-z-]+(\.[A-Za-z-]+)?$/.test(c))
    const primary = attrs(entry, "arxiv:primary_category", "term")[0]
    const summary = stripOffSiteUrls(rawSummary)
    const comment = stripOffSiteUrls(rawComment)
    out.push({
      id,
      title,
      summary,
      authors: allTags(entry, "author")
        .map((a) => plain(unwrap(tag(a, "name")), 80))
        .filter(Boolean)
        .slice(0, 60),
      published: isoDate(plain(tag(entry, "published"), 40)),
      updated: isoDate(plain(tag(entry, "updated"), 40)),
      categories: primary && categories.includes(primary) ? [primary, ...categories.filter((c) => c !== primary)].slice(0, 6) : categories.slice(0, 6),
      comment,
      links: { arxiv: `https://arxiv.org/abs/${id}`, pdf: `https://arxiv.org/pdf/${id}`, code: findGithubRepo(comment, summary) },
    })
  }
  return out
}

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
