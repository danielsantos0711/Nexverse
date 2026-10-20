import { decodeEntities, plain } from "@/lib/live/http"
import { getPage, getPublic } from "./http"
import { cleanUrl, signalHash, urlKey } from "./parse"
import { DbError, isMissing, select, upsert, type Db } from "./rest"

/*
 * Server only. Reading one official page properly: the article's own text (structured data first, then the
 * largest <article>, then <main>), its headings kept as "## " lines so the writer sees the structure, the
 * images the publisher offers for sharing and inside the article, the links the article makes, and the date
 * it was published. Pages are cached in news_pages for three days, so re-researching a story or reading the
 * same page from two stories costs one fetch.
 */

export type PageImage = { url: string; width: number | null; height: number | null; alt: string; from: "og" | "twitter" | "ld" | "article" }
export type PageLink = { url: string; text: string }

export type ReadPage = {
  url: string
  title: string
  description: string
  siteName: string
  text: string
  publishedAt: string | null
  images: PageImage[]
  links: PageLink[]
}

/** Most text a page contributes; long pages are chunked later, not here. */
export const PAGE_TEXT_MAX = 60_000
const CACHE_MS = 3 * 864e5

// ─── Extraction (pure) ──────────────────────────────────────────────────────────────────────────────────────

type Meta = Map<string, string[]>

function readMeta(html: string): Meta {
  const out: Meta = new Map()
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = m[1]
    const key = (attrs.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").toLowerCase()
    const content = attrs.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? attrs.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1]
    if (!key || content === undefined) continue
    const list = out.get(key) ?? []
    list.push(decodeEntities(content).trim())
    out.set(key, list)
  }
  return out
}

const first = (meta: Meta, ...keys: string[]) => {
  for (const k of keys) {
    const v = meta.get(k)?.find(Boolean)
    if (v) return v
  }
  return ""
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN
  return Number.isFinite(n) && n > 0 && n < 50_000 ? n : null
}

/** Every JSON-LD object on the page, flattened out of arrays and @graph. */
function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (v: unknown, depth = 0) => {
    if (depth > 4 || !v) return
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
    if (typeof v !== "object") return
    const o = v as Record<string, unknown>
    out.push(o)
    if (o["@graph"]) walk(o["@graph"], depth + 1)
  }
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()))
    } catch {
      // A broken block on someone else's page: skip it.
    }
  }
  return out.slice(0, 40)
}

const isArticleType = (o: Record<string, unknown>) => {
  const t = o["@type"]
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => typeof x === "string" && /Article|BlogPosting|NewsArticle|TechArticle|Report|ScholarlyArticle/i.test(x))
}

/** The date a page says it was published (Open Graph, schema.org or a <time> element), if it says. */
export function pagePublished(html: string): string | null {
  const raw =
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|date|pubdate|citation_publication_date|citation_date)["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1]
  const t = raw ? Date.parse(raw.replace(/\//g, "-")) : NaN
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null
}

const BLOCK_TAGS = /<(script|style|noscript|svg|template|iframe|nav|footer|form|header|aside|button|select|dialog|object|canvas)\b[\s\S]*?<\/\1>/gi

const NOISE = /^(share|share this|copy link|link copied|subscribe|sign up|sign in|log in|cookie|cookies|accept|read more|learn more|related( posts| articles)?|tags?:|table of contents|back to top|skip to (main )?content|menu|close|previous|next|loading…?|advertisement)\b.{0,40}$/i

/** HTML to readable text with "## " headings and "- " list items, entities decoded, noise lines dropped. */
export function htmlToArticleText(fragment: string, max = PAGE_TEXT_MAX): string {
  const text = decodeEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BLOCK_TAGS, " ")
      .replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, t: string) => `\n\n## ${t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n`)
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|tr|table|section|article|blockquote|pre|figure|figcaption|dd|dt)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  )
  const lines = text
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r ]+/g, " ").trim())
    .filter((l) => l && l !== "-" && l !== "##" && !NOISE.test(l))
  // Paragraph breaks back, at most one blank line in a row.
  const out: string[] = []
  for (const l of lines) {
    if (l.startsWith("## ") && out.length) out.push("")
    out.push(l)
    if (l.startsWith("## ")) out.push("")
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}

const visible = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length

/** The part of the page that is the article: the largest <article>, else <main>, else <body>. */
function articleHtml(html: string): string {
  const body = html.replace(BLOCK_TAGS, " ")
  const articles = [...body.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0])
  const best = articles.sort((a, b) => visible(b) - visible(a))[0]
  if (best && visible(best) > 600) return best
  const main = body.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? body.match(/<div[^>]+role=["']main["'][\s\S]*$/i)?.[0]
  if (main && visible(main) > 400) return main
  return body.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? body
}

const SKIP_IMAGE = /(logo|icon|avatar|favicon|sprite|badge|emoji|spinner|placeholder|pixel|tracking|1x1|blank\.)|\.svg(\?|$)/i

/** The largest candidate of a srcset ("a.jpg 640w, b.jpg 1600w"). */
function largestSrc(srcset: string): { src: string; w: number | null } | null {
  let best: { src: string; w: number | null } | null = null
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [src, size] = part.trim().split(/\s+/)
    if (!src) continue
    const w = size?.endsWith("w") ? parseInt(size, 10) : null
    if (!best || (w ?? 0) > (best.w ?? 0)) best = { src, w: Number.isFinite(w) ? w : null }
  }
  return best
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : ""
}

/** Read a page's HTML into clean text, images, links and dates. */
export function extractPage(html: string, url: string): ReadPage {
  const meta = readMeta(html)
  const ld = jsonLd(html)
  const article = ld.find(isArticleType)

  const title = plain(first(meta, "og:title", "twitter:title", "citation_title") || (typeof article?.headline === "string" ? article.headline : "") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), 300)
  const description = plain(first(meta, "og:description", "description", "twitter:description", "citation_abstract") || (typeof article?.description === "string" ? article.description : ""), 600)
  const siteName = plain(first(meta, "og:site_name", "application-name", "citation_publisher"), 120)

  const fragment = articleHtml(html)
  const fromLd = typeof article?.articleBody === "string" ? article.articleBody.trim() : ""
  const fromHtml = htmlToArticleText(fragment)
  // Structured data often carries the full body without the page's furniture; use it when it is the longer one.
  let text = fromLd.length > 800 && fromLd.length >= fromHtml.length * 0.6 ? plain(fromLd, PAGE_TEXT_MAX).replace(/\s{2,}/g, "\n\n") : fromHtml
  // arXiv and other paper pages keep the abstract in meta tags only.
  const abstract = first(meta, "citation_abstract", "dc.description")
  if (abstract && !text.includes(abstract.slice(0, 60))) text = `${plain(abstract, 4000)}\n\n${text}`.slice(0, PAGE_TEXT_MAX)

  // Images: what the publisher offers for sharing, then structured data, then large pictures in the article.
  const images: PageImage[] = []
  const seen = new Set<string>()
  const add = (raw: string, img: Omit<PageImage, "url">) => {
    const u = cleanUrl(raw, url)
    if (!u || SKIP_IMAGE.test(new URL(u).pathname) || seen.has(urlKey(u)) || images.length >= 12) return
    seen.add(urlKey(u))
    images.push({ url: u, ...img })
  }
  const ogAlt = first(meta, "og:image:alt", "twitter:image:alt")
  for (const og of [first(meta, "og:image:secure_url"), first(meta, "og:image", "og:image:url")]) {
    if (og) add(og, { width: num(first(meta, "og:image:width")), height: num(first(meta, "og:image:height")), alt: plain(ogAlt, 300), from: "og" })
  }
  const tw = first(meta, "twitter:image", "twitter:image:src")
  if (tw) add(tw, { width: null, height: null, alt: plain(ogAlt, 300), from: "twitter" })
  const ldImage = article?.image
  for (const im of Array.isArray(ldImage) ? ldImage : ldImage ? [ldImage] : []) {
    if (typeof im === "string") add(im, { width: null, height: null, alt: "", from: "ld" })
    else if (im && typeof im === "object") {
      const o = im as Record<string, unknown>
      if (typeof o.url === "string") add(o.url, { width: num(o.width), height: num(o.height), alt: plain(o.caption, 300), from: "ld" })
    }
  }
  const imageSrc = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1]
  if (imageSrc) add(imageSrc, { width: null, height: null, alt: "", from: "og" })
  for (const m of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    const set = largestSrc(attr(tag, "srcset") || attr(tag, "data-srcset"))
    const src = set?.src || attr(tag, "src") || attr(tag, "data-src")
    if (!src || src.startsWith("data:")) continue
    const w = set?.w ?? num(attr(tag, "width"))
    const h = num(attr(tag, "height"))
    // Small pictures in the text are icons and diagrams of buttons, not covers.
    if (w !== null && w < 480) continue
    add(src, { width: w, height: set?.w ? null : h, alt: plain(attr(tag, "alt"), 300), from: "article" })
  }

  // Links the article makes (for related official pages), deduplicated, with their text.
  const links: PageLink[] = []
  const seenLinks = new Set<string>([urlKey(url)])
  for (const m of fragment.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = cleanUrl(m[1], url)
    if (!u || seenLinks.has(urlKey(u))) continue
    seenLinks.add(urlKey(u))
    links.push({ url: u, text: plain(m[2], 160) })
    if (links.length >= 120) break
  }

  return { url, title, description, siteName, text, publishedAt: pagePublished(html), images, links }
}

// ─── Fetching with the cache ────────────────────────────────────────────────────────────────────────────────

type PageRow = { url: string; title: string; description: string; site_name: string; text: string; published_at: string | null; images: unknown; links: unknown; fetched_at: string }

const memory = new Map<string, { at: number; page: ReadPage }>()

function fromRow(r: PageRow): ReadPage {
  return {
    url: r.url,
    title: r.title,
    description: r.description,
    siteName: r.site_name,
    text: r.text,
    publishedAt: r.published_at,
    images: Array.isArray(r.images) ? (r.images as PageImage[]).filter((i) => i && typeof i.url === "string") : [],
    links: Array.isArray(r.links) ? (r.links as PageLink[]).filter((l) => l && typeof l.url === "string") : [],
  }
}

export type PageResult = { ok: true; page: ReadPage; cached: boolean } | { ok: false; error: string }

/**
 * One page, read and cleaned. `db` is optional: with it, the three-day cache in news_pages is used (and a
 * missing table is simply skipped). A fetch failure never throws.
 */
export async function readPage(url: string, { db, timeoutMs = 10_000, fresh = false }: { db?: Db | null; timeoutMs?: number; fresh?: boolean } = {}): Promise<PageResult> {
  const hash = signalHash(url)
  const now = Date.now()
  const mem = memory.get(hash)
  if (!fresh && mem && now - mem.at < CACHE_MS) return { ok: true, page: mem.page, cached: true }
  if (db && !fresh) {
    try {
      const since = new Date(now - CACHE_MS).toISOString()
      const rows = await select<PageRow>(db, "news_pages", `hash=eq.${hash}&fetched_at=gte.${since}&select=url,title,description,site_name,text,published_at,images,links,fetched_at`)
      if (rows[0]) {
        const page = fromRow(rows[0])
        memory.set(hash, { at: Date.parse(rows[0].fetched_at), page })
        return { ok: true, page, cached: true }
      }
    } catch (err) {
      if (!isMissing(err) && !(err instanceof DbError)) console.warn("[newsroom] page cache read:", (err as Error).message)
    }
  }
  // Article pages can be large (inline scripts and styles); 3 MB is plenty for the text we keep.
  const got = await getPublic(url, { accept: "text/html,application/xhtml+xml", kinds: /text\/html|application\/xhtml\+xml/, timeoutMs, maxBytes: 3_000_000 }).catch(() => getPage(url, timeoutMs))
  if (!got.ok) return got
  const page = extractPage(got.text, got.url)
  memory.set(hash, { at: now, page })
  if (memory.size > 300) memory.delete(memory.keys().next().value as string)
  if (db) {
    await upsert(db, "news_pages", {
      hash,
      url: page.url.slice(0, 1000),
      title: page.title,
      description: page.description,
      site_name: page.siteName,
      text: page.text,
      published_at: page.publishedAt,
      images: page.images.slice(0, 16),
      links: page.links.slice(0, 120),
      fetched_at: new Date(now).toISOString(),
    }).catch(() => {})
  }
  return { ok: true, page, cached: false }
}
