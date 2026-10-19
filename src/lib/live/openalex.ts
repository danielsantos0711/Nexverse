/**
 * OpenAlex (https://openalex.org): a free, open index of research works. No key is needed, but anonymous use
 * shares a small daily budget per network address; an optional OPENALEX_API_KEY (free, from openalex.org) gives
 * this site its own, larger budget. Looking up one work by id or DOI costs nothing; lists and filters spend
 * the budget, so they are cached for a day and used sparingly. Everything here fails soft: a missing answer
 * just leaves a section out.
 *
 * Server-only: reads OPENALEX_API_KEY (sent as a header, never in a URL that could be logged) and
 * OPENALEX_EMAIL or OPENALEX_MAILTO (the "polite pool" contact address).
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, fetchSafe, isOffSite, isRecord, isSafe, num, parseJson, plain, safeUrl, str, type Fetched, type Result } from "./http"
import { arxivBase, isArxivId } from "./ids"

export const OPENALEX = "https://api.openalex.org"
/** OpenAlex's id for arXiv as a source. */
const ARXIV_SOURCE = "S4306400194"

/** The contact address OpenAlex asks for, as a query parameter ("" when none is configured). */
export function openAlexMailto(): string {
  const mail = process.env.OPENALEX_EMAIL ?? process.env.OPENALEX_MAILTO
  return mail && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(mail) ? `mailto=${encodeURIComponent(mail)}` : ""
}

export function openAlexHeaders(): Record<string, string> {
  const key = process.env.OPENALEX_API_KEY
  return key ? { Authorization: `Bearer ${key}` } : {}
}

/** GET an OpenAlex path ("/works/W123?select=…"), with the contact address and key added. */
export function openAlexGet(path: string, maxBytes = 1_000_000): Promise<Fetched> {
  const mail = openAlexMailto()
  const url = `${OPENALEX}${path}${mail ? `${path.includes("?") ? "&" : "?"}${mail}` : ""}`
  return fetchSafe(url, { headers: openAlexHeaders(), maxBytes })
}

const workId = (v: unknown) => str(v, 80).match(/W\d{1,12}$/)?.[0] ?? ""

const year = (v: unknown) => {
  const n = num(v)
  return n >= 1800 && n <= 2200 ? n : 0
}

/** An arXiv id from a DOI (10.48550/arXiv.<id>) or an arxiv.org address. */
export function arxivFrom(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v !== "string") continue
    const m = v.match(/10\.48550\/arxiv\.([\w./-]+)$/i) ?? v.match(/arxiv\.org\/(?:abs|pdf)\/([\w./-]+?)(?:\.pdf)?$/i)
    const id = m ? arxivBase(m[1]) : ""
    if (id && isArxivId(id)) return id
  }
  return ""
}

// ─── One paper ──────────────────────────────────────────────────────────────────────────────────────────────

/** Where the paper was published, when OpenAlex knows a journal or conference version. */
export type Venue = {
  name: string
  kind: "journal" | "conference" | "other"
  /** The publisher's page for that version. */
  url: string
  /** A free PDF of the published version, when one is open access. */
  pdf: string
}

/** A related or listed work, short. `arxivId` is set when it is on arXiv, so it opens on Nexverse. */
export type RelatedWork = { title: string; year: number; citations: number; arxivId: string; doi: string; venue: string }

export type PaperRecord = {
  workId: string
  citations: number
  venue: Venue | null
  /** OpenAlex's main research topic for the paper, e.g. "Natural Language Processing Techniques". */
  topic: string
  related: RelatedWork[]
  url: string
}

const cleanDoi = (v: unknown) => {
  const s = str(v, 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : ""
}

/** The first published (not preprint) location in a journal or conference, if any. */
function venueOf(locations: unknown[]): Venue | null {
  for (const l of locations) {
    if (!isRecord(l) || l.is_published !== true || !isRecord(l.source)) continue
    const type = str(l.source.type, 40)
    if (type === "repository") continue
    const name = plain(l.source.display_name, 160)
    if (!name || /arxiv/i.test(name)) continue
    const url = safeUrl(l.landing_page_url)
    const pdf = l.is_oa === true ? safeUrl(l.pdf_url) : ""
    return { name, kind: type === "journal" ? "journal" : type === "conference" ? "conference" : "other", url: url.startsWith("https://") ? url : "", pdf: pdf.startsWith("https://") ? pdf : "" }
  }
  return null
}

function relatedOf(w: unknown): RelatedWork | null {
  if (!isRecord(w)) return null
  const title = plain(w.display_name, 300)
  if (!title) return null
  const ids = isRecord(w.ids) ? w.ids : {}
  const locations = asArray(w.locations).map((l) => (isRecord(l) ? l.landing_page_url : null))
  const doi = cleanDoi(w.doi ?? ids.doi)
  const primary = isRecord(w.primary_location) && isRecord(w.primary_location.source) ? plain(w.primary_location.source.display_name, 120) : ""
  return { title, year: year(w.publication_year), citations: num(w.cited_by_count), arxivId: arxivFrom(doi, ids.doi, ...locations), doi, venue: /arxiv/i.test(primary) ? "" : primary }
}

/**
 * Citation count, publication venue (with an open-access PDF of the published version when there is one), main
 * topic and up to six related works for an arXiv paper. Uses only single-work lookups, which OpenAlex does not
 * charge against the budget. Cached for a day when it worked, a few minutes when it did not.
 */
export async function paperRecord(id: string): Promise<Result<PaperRecord>> {
  "use cache"
  const baseId = arxivBase(id)
  cacheTag("live", "live:papers", `paper:${baseId}`, `paper-openalex:${baseId}`)
  const res = await openAlexGet(`/works/doi:10.48550/arXiv.${encodeURIComponent(baseId)}?select=id,cited_by_count,locations,primary_topic,related_works`)
  if (!res.ok) {
    if (res.reason === "notfound") cacheLife("hours")
    else cacheLife("minutes")
    return { ok: false, reason: res.reason }
  }
  const w = parseJson(res.text)
  const wid = isRecord(w) ? workId(w.id) : ""
  if (!isRecord(w) || !wid) {
    cacheLife("minutes")
    return { ok: false, reason: "error" }
  }
  const relatedIds = asArray(w.related_works).map(workId).filter(Boolean).slice(0, 6)
  const related = (
    await Promise.all(
      relatedIds.map(async (rid) => {
        const r = await openAlexGet(`/works/${rid}?select=display_name,publication_year,cited_by_count,doi,ids,locations,primary_location`)
        return r.ok ? relatedOf(parseJson(r.text)) : null
      })
    )
  )
    .filter((r): r is RelatedWork => r !== null && !isOffSite(r.title) && isSafe(r.title))
    .sort((a, b) => b.citations - a.citations)
  cacheLife("days")
  return {
    ok: true,
    data: {
      workId: wid,
      citations: num(w.cited_by_count),
      venue: venueOf(asArray(w.locations)),
      topic: isRecord(w.primary_topic) ? plain(w.primary_topic.display_name, 120) : "",
      related,
      url: `https://openalex.org/works/${wid}`,
    },
  }
}

// ─── Most cited lately ──────────────────────────────────────────────────────────────────────────────────────

/** OpenAlex subfields for AI research: Artificial Intelligence, and Computer Vision and Pattern Recognition. */
const AI_SUBFIELDS = "1702|1707"

/**
 * The most cited AI papers first posted to arXiv in the last twelve months, by OpenAlex's count. One list request a day
 * (lists spend the OpenAlex budget). Fails soft: the page shows a quiet note instead.
 */
export async function mostCitedRecent(limit = 20): Promise<Result<RelatedWork[]>> {
  "use cache"
  cacheTag("live", "live:papers", "papers:most-cited")
  const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10)
  const n = Math.min(50, Math.max(1, Math.floor(limit)))
  // OpenAlex dates a paper by its latest published version, so an older preprint that appeared in a journal this
  // year would count as new. The arXiv id carries the month it was first posted (YYMM.xxxxx): keep only those.
  const cutoff = Number(since.slice(2, 4) + since.slice(5, 7))
  const recent = (arxivId: string) => /^\d{4}\./.test(arxivId) && Number(arxivId.slice(0, 4)) >= cutoff
  const filter = `locations.source.id:${ARXIV_SOURCE},from_publication_date:${since},primary_topic.subfield.id:${AI_SUBFIELDS}`
  const res = await openAlexGet(
    `/works?filter=${filter}&sort=cited_by_count:desc&per-page=100&select=display_name,publication_year,cited_by_count,doi,ids,locations,primary_location`,
    3_000_000
  )
  if (!res.ok) {
    cacheLife("minutes")
    return { ok: false, reason: res.reason }
  }
  const data = parseJson(res.text)
  const items = asArray(isRecord(data) ? data.results : null)
    .map(relatedOf)
    .filter((w): w is RelatedWork => w !== null && recent(w.arxivId) && !isOffSite(w.title) && isSafe(w.title))
    .slice(0, n)
  if (!items.length) {
    cacheLife("hours")
    return { ok: false, reason: "notfound" }
  }
  cacheLife("days")
  return { ok: true, data: items }
}
