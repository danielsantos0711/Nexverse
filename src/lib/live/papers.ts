/**
 * One paper for /papers/[id]: metadata from the arXiv API, and citation data from a research index
 * (OpenAlex, falling back to Semantic Scholar). The two are separate cached functions so the page never waits
 * on, or fails because of, the citation index.
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, fetchSafe, isRecord, num, parseJson, plain, safeUrl, str, type Result } from "./http"
import { arxivBase, isArxivId } from "./ids"
import { arxivFrom, openAlexGet } from "./openalex"
import { parseArxiv } from "./parse"
import type { Paper } from "./types"

export type PaperDetail = Paper & {
  /** The id as requested (may carry a version). */
  requestedId: string
  pdf: string
}

export async function paperDetail(id: string): Promise<Result<PaperDetail>> {
  "use cache"
  const baseId = arxivBase(id)
  cacheTag("live", "live:papers", `paper:${baseId}`)
  const ax = await fetchSafe(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, {
    accept: "application/atom+xml",
    timeout: 15_000,
    maxBytes: 500_000,
  })
  if (!ax.ok) {
    if (ax.reason === "notfound") cacheLife("hours")
    else cacheLife("minutes")
    return { ok: false, reason: ax.reason }
  }
  // A direct visit shows the paper as published; only addresses of off-site communities are removed.
  const entry = parseArxiv(ax.text, { dropOffSite: false })[0]
  if (!entry) {
    // arXiv answers 200 with an empty feed (or an error entry) for ids it does not know.
    cacheLife("hours")
    return { ok: false, reason: "notfound" }
  }
  cacheLife("hours")
  return { ok: true, data: { ...entry, requestedId: id, pdf: `https://arxiv.org/pdf/${id}` } }
}

// ─── Citations ──────────────────────────────────────────────────────────────────────────────────────────────

/** A paper on the other end of a citation. `arxivId` is set when it is on arXiv, so it opens on Nexverse. */
export type CitedWork = { title: string; year: number; citations: number; arxivId: string; doi: string; authors: string }

export type Citations = {
  source: "openalex" | "semanticscholar"
  /** How many works cite this paper. */
  count: number
  /** Citations from works that build on it substantially (Semantic Scholar only; null otherwise). */
  influential: number | null
  referenceCount: number
  /** Citations per year, oldest first; only years with data. */
  byYear: { year: number; count: number }[]
  /** The most cited works that cite this paper. */
  citedBy: CitedWork[]
  /** Works this paper cites, most cited first. */
  references: CitedWork[]
  /** The record on the index's own site. */
  url: string
}

const S2 = "https://api.semanticscholar.org/graph/v1"

/** Optional keys: OpenAlex gives each key its own daily budget (sent as a header, see openalex.ts); Semantic Scholar raises its shared limits. */
function s2Headers(): Record<string, string> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY
  return key ? { "x-api-key": key } : {}
}

const year = (v: unknown) => {
  const n = num(v)
  return n >= 1800 && n <= 2200 ? n : 0
}

const cleanDoi = (v: unknown) => {
  const s = str(v, 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : ""
}

const authorLine = (names: string[]) => (names.length ? `${names[0]}${names.length > 1 ? " et al." : ""}` : "")

function openAlexWork(w: unknown): CitedWork | null {
  if (!isRecord(w)) return null
  const title = plain(w.display_name ?? w.title, 300)
  if (!title) return null
  const ids = isRecord(w.ids) ? w.ids : {}
  const locations = asArray(w.locations).map((l) => (isRecord(l) ? l.landing_page_url : null))
  const doi = cleanDoi(w.doi ?? ids.doi)
  const authors = asArray(w.authorships)
    .map((a) => (isRecord(a) && isRecord(a.author) ? plain(a.author.display_name, 80) : ""))
    .filter(Boolean)
  return { title, year: year(w.publication_year), citations: num(w.cited_by_count), arxivId: arxivFrom(doi, ids.doi, ...locations), doi, authors: authorLine(authors) }
}

async function openAlexList(filter: string, sort: string, perPage: number): Promise<CitedWork[] | null> {
  const select = "id,display_name,publication_year,cited_by_count,doi,ids,locations,authorships"
  const res = await openAlexGet(`/works?filter=${filter}&sort=${sort}&per-page=${perPage}&select=${select}`, 3_000_000)
  if (!res.ok) return null
  const data = parseJson(res.text)
  return asArray(isRecord(data) ? data.results : null)
    .map(openAlexWork)
    .filter((w): w is CitedWork => w !== null)
}

async function fromOpenAlex(baseId: string): Promise<Result<Citations>> {
  const res = await openAlexGet(`/works/doi:10.48550/arXiv.${encodeURIComponent(baseId)}?select=id,cited_by_count,referenced_works,referenced_works_count,counts_by_year`)
  if (!res.ok) return res
  const w = parseJson(res.text)
  if (!isRecord(w)) return { ok: false, reason: "error" }
  const workId = str(w.id, 80).match(/W\d{1,12}$/)?.[0]
  if (!workId) return { ok: false, reason: "notfound" }
  const refIds = asArray(w.referenced_works)
    .map((r) => str(r, 80).match(/W\d{1,12}$/)?.[0])
    .filter((r): r is string => Boolean(r))
    .slice(0, 50)
  const [citedBy, references] = await Promise.all([
    num(w.cited_by_count) > 0 ? openAlexList(`cites:${workId}`, "cited_by_count:desc", 10) : Promise.resolve([]),
    refIds.length ? openAlexList(`openalex:${refIds.join("|")}`, "cited_by_count:desc", 50) : Promise.resolve([]),
  ])
  const byYear = asArray(w.counts_by_year)
    .map((c) => (isRecord(c) ? { year: year(c.year), count: num(c.cited_by_count) } : null))
    .filter((c): c is { year: number; count: number } => c !== null && c.year > 0)
    .sort((a, b) => a.year - b.year)
  return {
    ok: true,
    data: {
      source: "openalex",
      count: num(w.cited_by_count),
      influential: null,
      referenceCount: num(w.referenced_works_count) || refIds.length,
      byYear,
      citedBy: citedBy ?? [],
      references: (references ?? []).slice(0, 25),
      url: `https://openalex.org/works/${workId}`,
    },
  }
}

function s2Work(p: unknown): CitedWork | null {
  if (!isRecord(p)) return null
  const title = plain(p.title, 300)
  if (!title) return null
  const ext = isRecord(p.externalIds) ? p.externalIds : {}
  const arxiv = str(ext.ArXiv, 40)
  const authors = asArray(p.authors)
    .map((a) => (isRecord(a) ? plain(a.name, 80) : ""))
    .filter(Boolean)
  return { title, year: year(p.year), citations: num(p.citationCount), arxivId: isArxivId(arxiv) ? arxiv : "", doi: cleanDoi(ext.DOI), authors: authorLine(authors) }
}

async function fromSemanticScholar(baseId: string): Promise<Result<Citations>> {
  const fields = "title,citationCount,influentialCitationCount,referenceCount,url"
  const res = await fetchSafe(`${S2}/paper/arXiv:${encodeURIComponent(baseId)}?fields=${fields}`, { headers: s2Headers(), maxBytes: 200_000 })
  if (!res.ok) return res
  const p = parseJson(res.text)
  if (!isRecord(p)) return { ok: false, reason: "error" }
  const workFields = "title,year,citationCount,externalIds,authors"
  const [refs, cites] = await Promise.all([
    fetchSafe(`${S2}/paper/arXiv:${encodeURIComponent(baseId)}/references?fields=${workFields}&limit=100`, { headers: s2Headers(), maxBytes: 2_000_000 }),
    num(p.citationCount) > 0
      ? fetchSafe(`${S2}/paper/arXiv:${encodeURIComponent(baseId)}/citations?fields=${workFields}&limit=100`, { headers: s2Headers(), maxBytes: 2_000_000 })
      : Promise.resolve(null),
  ])
  const list = (r: typeof refs | null, key: "citedPaper" | "citingPaper") => {
    if (!r?.ok) return []
    const d = parseJson(r.text)
    return asArray(isRecord(d) ? d.data : null)
      .map((x) => (isRecord(x) ? s2Work(x[key]) : null))
      .filter((w): w is CitedWork => w !== null)
      .sort((a, b) => b.citations - a.citations)
  }
  const url = safeUrl(p.url)
  return {
    ok: true,
    data: {
      source: "semanticscholar",
      count: num(p.citationCount),
      influential: num(p.influentialCitationCount),
      referenceCount: num(p.referenceCount),
      byYear: [],
      citedBy: list(cites, "citingPaper").slice(0, 10),
      references: list(refs, "citedPaper").slice(0, 25),
      url: url.startsWith("https://www.semanticscholar.org/") ? url : "",
    },
  }
}

/**
 * Citation count, citations per year, the most cited works that cite the paper and the works it cites.
 * OpenAlex first; Semantic Scholar when OpenAlex is down, over budget or does not know the paper.
 * Never throws: the page shows a quiet note when neither answers.
 */
export async function paperCitations(id: string): Promise<Result<Citations>> {
  "use cache"
  const baseId = arxivBase(id)
  cacheTag("live", "live:papers", `paper:${baseId}`, `paper-citations:${baseId}`)
  const primary = await fromOpenAlex(baseId)
  const res = primary.ok ? primary : await fromSemanticScholar(baseId)
  // Citation counts move slowly: a day when it worked; retry soon after a failure.
  if (res.ok) cacheLife("days")
  else if (res.reason === "notfound" && (primary.ok || primary.reason === "notfound")) cacheLife("hours")
  else cacheLife("minutes")
  return res
}
