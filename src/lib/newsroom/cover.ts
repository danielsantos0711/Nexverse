import { hostname, plain } from "@/lib/live/http"
import type { CoverCandidate, CoverCredit, NewsroomSettings } from "@/lib/newsroom"
import { tokens } from "./cluster"
import type { Doc } from "./gather"
import { getImageHead, getJson } from "./http"
import { cleanUrl, urlKey } from "./parse"

/*
 * Server only. The best cover for a story, in the editors' order (by default):
 *
 *   1. the source's own image: the picture the publisher set for sharing (og:image, twitter:image, the
 *      article's structured data) or the first large picture in the article. Each one is fetched (only its
 *      first bytes) to prove it loads and to read its real size from the file header; small, square or tall
 *      images and logos lose to wide ones of 1000 px or more.
 *   2. a free-licensed photo from Openverse or Wikimedia Commons, for a plain search the research step
 *      suggested. Only licences that allow reuse without permission (CC0, public domain, CC BY, CC BY-SA)
 *      are taken, never NC or ND; the creator, licence and page are stored and shown under the image.
 *   3. the generated Nexverse cover (/api/newsroom/cover), which always works.
 *
 * All candidates are kept with the story so editors can swap covers in the admin without searching again.
 */

export type CoverPolicy = NewsroomSettings["cover"]

// ─── Image size from the file header ───────────────────────────────────────────────────────────────────────

/** Width and height from the first bytes of a PNG, JPEG, GIF, WebP or AVIF file; null when unknown. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1]
  const u32 = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
  const le16 = (i: number) => b[i] | (b[i + 1] << 8)
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  if (b.length < 24) return null
  // PNG: IHDR right after the signature.
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return { width: u32(16), height: u32(20) }
  // GIF
  if (ascii(0, 3) === "GIF") return { width: le16(6), height: le16(8) }
  // WebP: lossy (VP8 ), lossless (VP8L) or extended (VP8X).
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4)
    if (kind === "VP8X" && b.length >= 30) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    if (kind === "VP8 " && b.length >= 30) return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff }
    if (kind === "VP8L" && b.length >= 25) {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }
    }
    return null
  }
  // JPEG: walk the segments to the first start-of-frame.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      const len = u16(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) }
      i += 2 + len
    }
    return null
  }
  // AVIF / HEIF: the "ispe" property box carries the size.
  if (ascii(4, 4) === "ftyp") {
    for (let i = 8; i + 20 < b.length; i++) {
      if (b[i] === 0x69 && ascii(i, 4) === "ispe") return { width: u32(i + 8), height: u32(i + 12) }
    }
  }
  return null
}

export type Probe = { ok: true; url: string; width: number | null; height: number | null; type: string } | { ok: false; error: string }

/** Does the image load, and how large is it really? Reads at most ~96 KB of it. */
export async function probeImage(url: string): Promise<Probe> {
  const got = await getImageHead(url)
  if (!got.ok) return got
  const size = imageSize(got.bytes)
  return { ok: true, url: got.url, width: size?.width ?? null, height: size?.height ?? null, type: got.type }
}

// ─── Scoring ────────────────────────────────────────────────────────────────────────────────────────────────

/** Higher is better; below 0 is not used. Width and shape decide most; where the image came from breaks ties. */
export function scoreImage(width: number | null, height: number | null, policy: CoverPolicy): number {
  if (!width || !height) return -1
  if (width < 600 || height < 300) return -1
  const ratio = width / height
  let s = 0
  s += width >= policy.minWidth ? 3 : width >= 800 ? 1 : 0
  if (ratio >= 1.3 && ratio <= 2.1) s += 2
  else if (ratio >= 1.1 && ratio <= 2.6) s += 1
  else if (policy.preferWide) s -= 3
  return s
}

const pool = async <T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
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

type Scored = CoverCandidate & { score: number }

// ─── 1. The source's own images ─────────────────────────────────────────────────────────────────────────────

const FROM_BONUS = { og: 2, ld: 1, twitter: 1, article: 0 } as const

export async function sourceCandidates(docs: Doc[], policy: CoverPolicy): Promise<{ list: Scored[]; errors: string[] }> {
  const wanted: { url: string; doc: Doc; from: keyof typeof FROM_BONUS; alt: string }[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    // The main page's first few images, then each related page's sharing image.
    for (const im of d.images.slice(0, d.role === "primary" ? 4 : 1)) {
      if (seen.has(urlKey(im.url))) continue
      seen.add(urlKey(im.url))
      wanted.push({ url: im.url, doc: d, from: im.from, alt: im.alt })
    }
  }
  const errors: string[] = []
  const probed = await pool(wanted.slice(0, 7), 3, async (w) => ({ w, p: await probeImage(w.url) }))
  const list: Scored[] = []
  for (const { w, p } of probed) {
    if (!p.ok) {
      errors.push(`source image ${hostname(w.url)}: ${p.error}`)
      continue
    }
    const base = scoreImage(p.width, p.height, policy)
    if (base < 0) continue
    const credit: CoverCredit = { creator: w.doc.publisher, creatorUrl: "", license: "Publisher's image", licenseUrl: "", landing: w.doc.url, provider: hostname(w.doc.url) }
    list.push({
      url: p.url,
      kind: "source",
      width: p.width,
      height: p.height,
      alt: w.alt || `Image from ${w.doc.publisher}: ${w.doc.title}`.slice(0, 300),
      credit,
      score: base + FROM_BONUS[w.from] + (w.doc.role === "primary" ? 1 : 0),
    })
  }
  return { list: list.sort((a, b) => b.score - a.score), errors }
}

// ─── 2. Free-licensed photos ────────────────────────────────────────────────────────────────────────────────

const OK_LICENSE = /^(cc0|pdm|public domain|pd|by|by-sa|cc by(-sa)?)\b/i
const BAD_LICENSE = /\b(nc|nd|fair use|non-?commercial|no ?deriv)/i

function ccLabel(license: string, version: string): string {
  const l = license.toLowerCase()
  if (l === "cc0") return "CC0 1.0"
  if (l === "pdm") return "Public Domain Mark"
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ""}`
}

type OpenverseResult = {
  url?: string
  width?: number | null
  height?: number | null
  title?: string
  creator?: string | null
  creator_url?: string | null
  license?: string
  license_version?: string | null
  license_url?: string | null
  foreign_landing_url?: string | null
  provider?: string
  source?: string
  mature?: boolean
}

export async function openverseCandidates(query: string, policy: CoverPolicy): Promise<{ list: Scored[]; error: string | null }> {
  const q = encodeURIComponent(query.slice(0, 80))
  // The plain search answers far faster than the filtered one (measured 15 s against 40 s anonymously), so the
  // licence, size and shape filters are applied here instead of in the query.
  const res = await getJson(`https://api.openverse.org/v1/images/?q=${q}&page_size=20`, 25_000)
  if (!res.ok) return { list: [], error: `Openverse: ${res.error}` }
  const results = ((res.json as { results?: OpenverseResult[] })?.results ?? []).slice(0, 16)
  const list: Scored[] = []
  for (const r of results) {
    const url = cleanUrl(r.url ?? "")
    if (!url || r.mature) continue
    const license = String(r.license ?? "")
    if (!OK_LICENSE.test(license) || BAD_LICENSE.test(license)) continue
    const base = scoreImage(r.width ?? null, r.height ?? null, policy)
    // Size unknown: probe it below; known and poor: skip.
    if (r.width && r.height && base < 0) continue
    list.push({
      url,
      kind: "openverse",
      width: r.width ?? null,
      height: r.height ?? null,
      alt: plain(r.title ?? "", 200) || `Photo for: ${query}`,
      credit: {
        creator: plain(r.creator ?? "", 160) || "Unknown creator",
        creatorUrl: cleanUrl(r.creator_url ?? ""),
        license: ccLabel(license, String(r.license_version ?? "")),
        licenseUrl: cleanUrl(r.license_url ?? ""),
        landing: cleanUrl(r.foreign_landing_url ?? ""),
        provider: plain(r.source ?? r.provider ?? "Openverse", 60),
      },
      score: base < 0 ? 0 : base,
    })
  }
  return { list: await verify(list, policy), error: null }
}

type CommonsPage = {
  title?: string
  imageinfo?: {
    url?: string
    width?: number
    height?: number
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    descriptionurl?: string
    mime?: string
    extmetadata?: Record<string, { value?: string }>
  }[]
}

export async function wikimediaCandidates(query: string, policy: CoverPolicy): Promise<{ list: Scored[]; error: string | null }> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query.slice(0, 80)} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "14",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1600",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|Restrictions|ObjectName",
  })
  const res = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, 12_000)
  if (!res.ok) return { list: [], error: `Wikimedia Commons: ${res.error}` }
  const pages = ((res.json as { query?: { pages?: CommonsPage[] } })?.query?.pages ?? []).slice(0, 14)
  const list: Scored[] = []
  for (const p of pages) {
    const ii = p.imageinfo?.[0]
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "")) continue
    const meta = ii.extmetadata ?? {}
    const license = plain(meta.LicenseShortName?.value ?? "", 60)
    if (!OK_LICENSE.test(license) && !/^cc[- ]by|^cc0|public domain/i.test(license)) continue
    if (BAD_LICENSE.test(license)) continue
    // Trademarks, personality rights and similar restrictions: not for a news cover.
    if (plain(meta.Restrictions?.value ?? "", 200)) continue
    const url = cleanUrl(ii.thumburl || ii.url || "")
    if (!url) continue
    const base = scoreImage(ii.width ?? null, ii.height ?? null, policy)
    if (base < 0) continue
    list.push({
      url,
      kind: "wikimedia",
      width: ii.thumbwidth ?? ii.width ?? null,
      height: ii.thumbheight ?? ii.height ?? null,
      alt: plain(meta.ImageDescription?.value ?? meta.ObjectName?.value ?? (p.title ?? "").replace(/^File:|\.\w+$/g, ""), 200) || `Photo for: ${query}`,
      credit: {
        creator: plain(meta.Artist?.value ?? "", 160) || "Unknown creator",
        creatorUrl: "",
        license,
        licenseUrl: cleanUrl(meta.LicenseUrl?.value ?? ""),
        landing: cleanUrl(ii.descriptionurl ?? ""),
        provider: "Wikimedia Commons",
      },
      score: base,
    })
  }
  return { list: await verify(list, policy), error: null }
}

/** The best few free photos, each fetched to prove it loads (and to learn its size when the API did not say). */
async function verify(list: Scored[], policy: CoverPolicy, keep = 4): Promise<Scored[]> {
  const top = list.sort((a, b) => b.score - a.score).slice(0, keep + 2)
  const probed = await pool(top, 3, async (c) => ({ c, p: await probeImage(c.url) }))
  const out: Scored[] = []
  for (const { c, p } of probed) {
    if (!p.ok) continue
    const width = c.width ?? p.width
    const height = c.height ?? p.height
    const score = scoreImage(width, height, policy)
    if (score < 0) continue
    out.push({ ...c, url: p.url, width, height, score })
    if (out.length >= keep) break
  }
  return out
}

// ─── 3. The generated cover, and the whole search ───────────────────────────────────────────────────────────

export const generatedCandidate = (title: string): CoverCandidate => ({ url: "", kind: "generated", width: 1200, height: 630, alt: `Nexverse cover for “${title}”`.slice(0, 300), credit: null })

const QUERY_STOP = new Set("ai model models launch launches released release introduces introducing announces announced new update version open source available today now company".split(" "))

/** A photo search from the research step's suggestion, or else from the headline's plainest words. */
export function coverQuery(title: string, suggestion = ""): string {
  const s = suggestion.trim()
  if (s.length >= 3) return s.slice(0, 60)
  const words = [...tokens(title)].filter((t) => t.length > 3 && !QUERY_STOP.has(t) && !/\d/.test(t)).slice(0, 3)
  return words.length ? words.join(" ") : "artificial intelligence"
}

const strip = ({ score: _score, ...c }: Scored): CoverCandidate => {
  void _score
  return c
}

/** Every candidate in the policy's order, and the one to use. */
export async function findCovers({ docs, title, query, policy }: { docs: Doc[]; title: string; query: string; policy: CoverPolicy }): Promise<{ chosen: CoverCandidate; candidates: CoverCandidate[]; errors: string[]; query: string }> {
  const errors: string[] = []
  const wants = new Set(policy.order)
  const [src, ov, wm] = await Promise.all([
    wants.has("source") && docs.length ? sourceCandidates(docs, policy) : Promise.resolve({ list: [] as Scored[], errors: [] as string[] }),
    wants.has("free") ? openverseCandidates(query, policy) : Promise.resolve({ list: [] as Scored[], error: null }),
    wants.has("free") ? wikimediaCandidates(query, policy) : Promise.resolve({ list: [] as Scored[], error: null }),
  ])
  errors.push(...src.errors)
  if (ov.error) errors.push(ov.error)
  if (wm.error) errors.push(wm.error)
  const free = [...ov.list, ...wm.list].sort((a, b) => b.score - a.score)
  const byTier: Record<string, Scored[]> = { source: src.list, free, generated: [] }
  const generated = generatedCandidate(title)
  let chosen: CoverCandidate = generated
  for (const tier of policy.order) {
    const best = byTier[tier]?.[0]
    if (best) {
      chosen = strip(best)
      break
    }
    if (tier === "generated") break
  }
  const candidates = [...src.list, ...free].map(strip)
  candidates.push(generated)
  return { chosen, candidates: candidates.slice(0, 24), errors, query }
}
