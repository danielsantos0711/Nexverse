import { hostname } from "@/lib/live/http"
import type { Signal } from "./cluster"
import { tokens } from "./cluster"
import { readPage, type PageImage, type PageLink, type ReadPage } from "./page"
import { urlKey } from "./parse"
import type { Db } from "./rest"

/*
 * Server only. Step one of a researched story: gather. The main page of the story is read in full, then up
 * to four related official pages: the other sources that reported the same event (the cluster), and the
 * official pages the article itself links to (the company's docs and other posts, the GitHub repository or
 * release, the arXiv paper, another vendor's official blog). Social networks, news aggregators and community
 * sites are never followed. Every page goes through the same locked fetcher and the page cache.
 */

export type Doc = {
  /** Its number in the story's source list, from 1. */
  n: number
  url: string
  title: string
  publisher: string
  publishedAt: string | null
  role: "primary" | "related"
  description: string
  text: string
  internalOnly: boolean
  images: PageImage[]
}

export type Gathered = { docs: Doc[]; errors: string[]; cached: number }

/** Hosts that are never followed from an article, even though they are public (not official sources). */
const NOT_OFFICIAL =
  /(^|\.)(x\.com|twitter\.com|t\.co|linkedin\.com|lnkd\.in|facebook\.com|fb\.me|instagram\.com|threads\.net|youtube\.com|youtu\.be|tiktok\.com|medium\.com|substack\.com|bsky\.app|mastodon\.social|wikipedia\.org|apps\.apple\.com|play\.google\.com|bit\.ly|goo\.gl|forms\.gle|eventbrite\.com|zoom\.us|calendly\.com)$/i

const NOT_ARTICLE = /^\/?(careers|jobs|legal|privacy|terms|cookies?|login|signin|sign-in|signup|sign-up|register|contact|about|press-kit|brand|search|subscribe|newsletter|events?)(\/|$)|(^|\/)(tag|tags|topic|topics|category|categories|author|authors|page)(\/|$)/i

const FILE = /\.(pdf|zip|tar|gz|png|jpe?g|gif|webp|svg|mp4|mov|webm|mp3|csv|xlsx?|pptx?|docx?)$/i

/** example.com from docs.example.com (and example.co.uk from www.example.co.uk). */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".")
  if (parts.length <= 2) return parts.join(".")
  const sld = parts[parts.length - 2]
  return (sld.length <= 3 && ["co", "com", "ac", "org", "gov", "net"].includes(sld) ? parts.slice(-3) : parts.slice(-2)).join(".")
}

export type LinkKind = "github" | "arxiv" | "docs" | "same-site" | "official" | null

/** Whether a link from an article is an official page worth reading, and what kind. */
export function linkKind(url: string, primaryUrl: string, officialSites: Set<string>): LinkKind {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  const path = u.pathname
  if (NOT_OFFICIAL.test(host) || FILE.test(path) || path === "/" || NOT_ARTICLE.test(path)) return null
  if (host === "github.com") {
    // A repository, its releases or its README; never issues, pull requests or discussions.
    const seg = path.split("/").filter(Boolean)
    if (seg.length < 2 || seg.length > 6) return null
    if (seg[2] && !["releases", "blob", "tree", "wiki"].includes(seg[2])) return null
    if (["orgs", "users", "topics", "sponsors", "marketplace", "features", "settings", "login", "apps"].includes(seg[0])) return null
    return "github"
  }
  if (host === "arxiv.org" || host === "www.arxiv.org") return /^\/(abs|html)\/\d{4}\.\d{4,5}/.test(path) ? "arxiv" : null
  const site = siteOf(host)
  let primarySite = ""
  try {
    primarySite = siteOf(new URL(primaryUrl).hostname)
  } catch {
    // keep empty
  }
  if (site === primarySite) return /^docs\.|^developers?\.|^platform\./.test(host) || /\/(docs|documentation|api|reference)\//.test(path) ? "docs" : "same-site"
  if (/\.github\.io$/.test(host)) return "official"
  if (officialSites.has(site)) return "official"
  return null
}

const KIND_BONUS: Record<Exclude<LinkKind, null>, number> = { github: 3, arxiv: 3, docs: 2, official: 1.5, "same-site": 1 }

/** The article's links that are official pages, best first: closest to the story, then by kind. */
export function rankLinks(links: PageLink[], primaryUrl: string, title: string, officialSites: Set<string>): { url: string; kind: Exclude<LinkKind, null>; score: number }[] {
  // Words of the publisher's own address ("nvidia", "blogs") say nothing about the story: every link has them.
  let hostWords = new Set<string>()
  try {
    hostWords = new Set(new URL(primaryUrl).hostname.toLowerCase().split(/[.-]/))
  } catch {
    // keep empty
  }
  const want = new Set([...tokens(title)].filter((t) => !hostWords.has(t) && t.length > 2))
  const out: { url: string; kind: Exclude<LinkKind, null>; score: number }[] = []
  for (const l of links) {
    const kind = linkKind(l.url, primaryUrl, officialSites)
    if (!kind) continue
    let pathWords = ""
    try {
      pathWords = new URL(l.url).pathname.replace(/[/_.-]+/g, " ")
    } catch {
      continue
    }
    const have = tokens(`${l.text} ${pathWords}`)
    let shared = 0
    for (const t of want) if (have.has(t)) shared++
    const score = shared * 2 + KIND_BONUS[kind] - (l.text.length < 3 ? 1 : 0)
    // A link from the same company or another vendor that shares nothing with the story is navigation.
    if ((kind === "same-site" || kind === "official") && shared === 0) continue
    out.push({ url: l.url, kind, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

function publisherFor(url: string, page: ReadPage | null, known: Map<string, string>): string {
  const host = hostname(url)
  if (host === "github.com") {
    const seg = new URL(url).pathname.split("/").filter(Boolean)
    return seg.length >= 2 ? `GitHub (${seg[0]}/${seg[1]})` : "GitHub"
  }
  if (host === "arxiv.org") return "arXiv"
  return known.get(siteOf(host)) || page?.siteName || host
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

/**
 * Read the story's main page and up to `maxRelated` related official pages. `officialSites` maps the sites of
 * the newsroom's sources to their publisher names (openai.com → OpenAI), so links between vendors count.
 */
export async function gather({
  db,
  primary,
  cluster = [],
  maxRelated = 4,
  officialSites = new Map<string, string>(),
  extraUrls = [],
}: {
  db?: Db | null
  primary: Signal
  cluster?: Signal[]
  maxRelated?: number
  officialSites?: Map<string, string>
  /** Pages the story already cites (a rewrite): read them as related sources first. */
  extraUrls?: string[]
}): Promise<Gathered> {
  const errors: string[] = []
  let cached = 0
  const main = await readPage(primary.url, { db })
  if (!main.ok) errors.push(`${primary.url.slice(0, 120)}: ${main.error}`)
  else if (main.cached) cached++
  const mainPage = main.ok ? main.page : null
  const docs: Doc[] = [
    {
      n: 1,
      url: mainPage?.url ?? primary.url,
      title: (mainPage?.title || primary.title).slice(0, 300),
      publisher: primary.publisher || publisherFor(primary.url, mainPage, officialSites),
      publishedAt: primary.publishedAt ?? mainPage?.publishedAt ?? null,
      role: "primary",
      description: mainPage?.description || primary.excerpt,
      text: mainPage?.text || primary.excerpt,
      internalOnly: primary.internalOnly,
      images: mainPage?.images ?? [],
    },
  ]
  if (maxRelated <= 0) return { docs, errors, cached }

  // Candidates: what the editors already cited, the cluster's other reports, then the article's official links.
  const seen = new Set<string>([urlKey(primary.url), urlKey(docs[0].url)])
  const candidates: { url: string; signal?: Signal }[] = []
  const push = (url: string, signal?: Signal) => {
    if (!url || seen.has(urlKey(url))) return
    seen.add(urlKey(url))
    candidates.push({ url, signal })
  }
  for (const u of extraUrls) push(u)
  for (const s of cluster) push(s.url, s)
  const sites = new Set(officialSites.keys())
  if (mainPage) for (const l of rankLinks(mainPage.links, docs[0].url, docs[0].title, sites).slice(0, 10)) push(l.url)

  // Read a few more than needed, in parallel, and keep the first ones that have real text.
  const tried = candidates.slice(0, maxRelated + 3)
  const read = await pool(tried, 3, async (c) => ({ c, r: await readPage(c.url, { db, timeoutMs: 9_000 }) }))
  for (const { c, r } of read) {
    if (docs.length > maxRelated) break
    if (!r.ok) {
      errors.push(`${c.url.slice(0, 120)}: ${r.error}`)
      continue
    }
    if (r.cached) cached++
    const text = r.page.text || c.signal?.excerpt || ""
    if (text.length < 300) continue
    docs.push({
      n: docs.length + 1,
      url: r.page.url,
      title: (r.page.title || c.signal?.title || r.page.url).slice(0, 300),
      publisher: c.signal?.publisher || publisherFor(r.page.url, r.page, officialSites),
      publishedAt: c.signal?.publishedAt ?? r.page.publishedAt,
      role: "related",
      description: r.page.description,
      text,
      internalOnly: c.signal?.internalOnly ?? false,
      images: r.page.images,
    })
  }
  return { docs, errors, cached }
}
