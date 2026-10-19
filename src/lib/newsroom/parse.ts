import { createHash } from "node:crypto"
import { isBlockedHost } from "@/lib/ai/safe-url"
import { decodeEntities, isOffSite, isSafe, plain } from "@/lib/live/http"

/*
 * Server only. DOM-free readers for what the sources send: RSS 2.0, Atom (blogs, GitHub releases, arXiv) and
 * official news pages that list their articles as links. Everything is untrusted text: markup is stripped,
 * entities decoded, lengths capped, and only https links on public, non-community hosts survive.
 */

export type RawItem = {
  url: string
  title: string
  excerpt: string
  publishedAt: string | null
}

const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))
  return m ? unwrap(m[1]) : ""
}

function date(v: string): string | null {
  const t = Date.parse(v.trim())
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null
}

/** An https address on a public host that is not a community site, without tracking parameters; "" otherwise. */
export function cleanUrl(raw: string, base?: string): string {
  try {
    const u = new URL(decodeEntities(raw.trim()), base)
    if (u.protocol === "http:") u.protocol = "https:"
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return ""
    if (isBlockedHost(u.hostname)) return ""
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k)
    u.hash = ""
    const s = u.toString()
    return s.length <= 1000 ? s : ""
  } catch {
    return ""
  }
}

/** A stable key for an address: host and path, lowercased, without "www." or a trailing slash. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}${u.search}`
  } catch {
    return url.toLowerCase()
  }
}

export const signalHash = (url: string) => createHash("sha256").update(urlKey(url)).digest("hex").slice(0, 32)

function keep(item: RawItem): boolean {
  return Boolean(item.url && item.title) && isSafe(item.title) && !isOffSite(item.title, item.excerpt)
}

/** Items from an RSS 2.0 or Atom document, newest first as the feed lists them. */
export function parseFeed(xml: string, base: string, max = 30): RawItem[] {
  const out: RawItem[] = []
  const seen = new Set<string>()
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const blocks = atom ? xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi) : xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)
  for (const [, block] of blocks) {
    let link = ""
    if (atom) {
      const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1])
      const alt = links.find((l) => !/rel=["'](?!alternate)/i.test(l)) ?? links[0] ?? ""
      link = alt.match(/href=["']([^"']+)["']/i)?.[1] ?? ""
    } else {
      link = plain(tag(block, "link"), 1000) || (/isPermaLink=["']?true/i.test(block) || !/isPermaLink/i.test(block) ? plain(tag(block, "guid"), 1000) : "")
    }
    const url = cleanUrl(link, base)
    const title = plain(tag(block, "title"), 300)
    const excerpt = plain(tag(block, atom ? "summary" : "description") || tag(block, "content") || tag(block, "content:encoded"), 1200)
    const publishedAt = date(plain(tag(block, atom ? "published" : "pubDate"), 60) || plain(tag(block, "updated"), 60) || plain(tag(block, "dc:date"), 60))
    const item = { url, title, excerpt, publishedAt }
    if (!keep(item) || seen.has(urlKey(url))) continue
    seen.add(urlKey(url))
    out.push(item)
    if (out.length >= max) break
  }
  return out
}

/** GitHub's releases feed: one item per release, the title made explicit ("ollama v0.12.3"). */
export function parseReleases(xml: string, repo: string, max = 5): RawItem[] {
  const name = repo.split("/")[1] ?? repo
  return parseFeed(xml, `https://github.com/${repo}/releases`, max * 2)
    .filter((i) => {
      try {
        const u = new URL(i.url)
        return u.hostname === "github.com" && u.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/releases/tag/`)
      } catch {
        return false
      }
    })
    .map((i) => ({ ...i, title: i.title.toLowerCase().includes(name.toLowerCase()) ? i.title : `${name} ${i.title}` }))
    .slice(0, max)
}

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December"
const LEADING_DATE = new RegExp(`^(?:(${MONTHS})\\.? (\\d{1,2}), (\\d{4}))\\s*`, "i")
const SECTION_WORD = /^(Announcements|Policy|Product|Research|Societal Impacts|Interpretability|Alignment|Engineering|Company|News|Featured)\s+(?=[A-Z0-9])/

/**
 * Article links from an official news page that has no feed: anchors whose path starts with `prefix` on the
 * page's own host. The link text often carries a date and a section label; the date is read and removed, and
 * the longest sensible text for each address becomes its title. Pages without dates get none (the article page
 * is read later anyway).
 */
export function parseSiteLinks(html: string, pageUrl: string, prefix: string, max = 20): RawItem[] {
  let host = ""
  try {
    host = new URL(pageUrl).hostname
  } catch {
    return []
  }
  const texts = new Map<string, string[]>()
  const order: string[] = []
  const body = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = cleanUrl(m[1], pageUrl)
    if (!url) continue
    const u = new URL(url)
    if (u.hostname !== host) continue
    const path = u.pathname
    if (!path.startsWith(prefix) || path.replace(/\/+$/, "") === prefix.replace(/\/+$/, "")) continue
    // Only one level below the prefix: /news/some-story, not /news/category/x/page/2.
    if (path.slice(prefix.length).replace(/\/+$/, "").includes("/")) continue
    const key = urlKey(url)
    if (!texts.has(key)) {
      texts.set(key, [])
      order.push(url)
    }
    const t = plain(m[2], 400)
    if (t) texts.get(key)!.push(t)
  }
  const out: RawItem[] = []
  for (const url of order) {
    // Cards often hold the headline twice: alone, and with a date, a section word and the opening sentence.
    // Each text loses a leading date (kept as the publish date) and section word; the shortest real one wins.
    let publishedAt: string | null = null
    const cleaned = (texts.get(urlKey(url)) ?? []).map((raw) => {
      let t = raw
      const d = t.match(LEADING_DATE)
      if (d) {
        publishedAt ??= date(`${d[1]} ${d[2]}, ${d[3]} 12:00 UTC`)
        t = t.slice(d[0].length)
      }
      return t.replace(SECTION_WORD, "").trim()
    })
    let best = cleaned.filter((t) => t.length >= 12 && !/^(read more|learn more|featured|new)$/i.test(t)).sort((a, b) => a.length - b.length)[0] ?? ""
    if (!best) {
      const slug = new URL(url).pathname.replace(/\/+$/, "").split("/").pop() ?? ""
      best = slug.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
    }
    const item = { url, title: best.slice(0, 300), excerpt: "", publishedAt }
    if (keep(item)) out.push(item)
    if (out.length >= max) break
  }
  return out
}
