import { isBlockedHost } from "@/lib/ai/safe-url"
import { plain } from "@/lib/live/http"
import { cleanUrl, parseFeed } from "../parse"
import { fetchAllowed, fetchJson, pause, type Budget } from "./fetch"
import type { Desk } from "./types"

/*
 * Server only. The scouts: each one asks one public, original source what is new and hands back plain
 * findings. They never decide what is a story (the triage does) and never invent anything: every finding is
 * an address and the words the source itself used.
 *
 *   github_rising   new repositories gaining stars fast, by topic or search (the GitHub search API)
 *   github_releases releases of repositories a desk watches (their public Atom feed)
 *   hf_models       new and trending models on the Hugging Face API, followed to their paper, repository or
 *   hf_datasets     official post (the README's own links); Hugging Face itself is never linked or cited
 *   arxiv_search    new papers by category and search (the arXiv API)
 *   front_page      what engineers are reading (the Hacker News front page API), followed to the article;
 *                   discovery only, the front page is never linked or cited
 *   federal         the US Federal Register: rules, notices, executive documents (the official record)
 *   gdelt           coverage worldwide (the GDELT index), to find stories and corroborate leads
 */

export type Found = {
  url: string
  title: string
  excerpt: string
  publisher: string
  publishedAt: string | null
  scout: string
  desk: string | null
  metrics?: Record<string, number | string>
  /** A discovery platform the finding came through, which is never linked or cited. */
  via?: string
  internalOnly?: boolean
}

export type ScoutResult = { found: Found[]; errors: string[]; note?: string }

const DAY = 864e5
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const str = (v: unknown, max = 300) => (typeof v === "string" ? plain(v, max) : "")
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

// ─── GitHub ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Repositories created in the window and gaining stars quickly, best first by stars per day. */
export async function githubRising(desk: Desk, { budget, days = 10, queries }: { budget: Budget; days?: number; queries?: string[] }): Promise<ScoutResult> {
  const m = desk.methods.github ?? {}
  const asks = (queries?.length ? queries : [...(m.topics ?? []).map((t) => `topic:${t}`), ...(m.queries ?? [])]).slice(0, 4)
  if (!asks.length) return { found: [], errors: [] }
  const since = iso(Date.now() - days * DAY)
  const found: Found[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const q of asks) {
    const query = `${q.replace(/[^\w\s:./"-]/g, " ").trim()} created:>${since} stars:>40 archived:false`
    const got = await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=12`, { budget })
    if (!got.ok) {
      errors.push(`GitHub search "${q}": ${got.error}`)
      if (/rate limited|budget/.test(got.error)) break
      continue
    }
    for (const raw of (rec(got.json).items as unknown[]) ?? []) {
      const r = rec(raw)
      const full = str(r.full_name, 140)
      const url = cleanUrl(str(r.html_url, 300))
      const desc = str(r.description, 400)
      if (!full || !url || !desc || seen.has(full.toLowerCase()) || r.fork === true) continue
      seen.add(full.toLowerCase())
      const created = Date.parse(str(r.created_at, 40))
      const ageDays = Math.max(1, (Date.now() - created) / DAY)
      const stars = n(r.stargazers_count)
      found.push({
        url,
        title: `${full}: ${desc}`.slice(0, 300),
        excerpt: [desc, Array.isArray(r.topics) ? `Topics: ${(r.topics as unknown[]).filter((t) => typeof t === "string").slice(0, 8).join(", ")}` : ""].filter(Boolean).join("\n"),
        publisher: `GitHub (${full})`.slice(0, 80),
        publishedAt: Number.isFinite(created) ? new Date(created).toISOString() : null,
        scout: "github_rising",
        desk: desk.id,
        metrics: { stars, forks: n(r.forks_count), starsPerDay: Math.round(stars / ageDays), language: str(r.language, 40), license: str(rec(r.license).spdx_id, 40) },
      })
    }
  }
  found.sort((a, b) => n(b.metrics?.starsPerDay) - n(a.metrics?.starsPerDay))
  return { found: found.slice(0, 15), errors }
}

/** New releases of the repositories a desk watches. */
export async function githubReleases(desk: Desk, { budget, days = 10 }: { budget: Budget; days?: number }): Promise<ScoutResult> {
  const repos = (desk.methods.github?.watchRepos ?? []).slice(0, 10)
  const found: Found[] = []
  const errors: string[] = []
  const cutoff = Date.now() - days * DAY
  for (const repo of repos) {
    const got = await fetchAllowed(`https://github.com/${repo}/releases.atom`, { budget, accept: "application/atom+xml" })
    if (!got.ok) {
      errors.push(`${repo} releases: ${got.error}`)
      continue
    }
    for (const it of parseFeed(got.text, `https://github.com/${repo}/releases`, 4)) {
      if (it.publishedAt && Date.parse(it.publishedAt) < cutoff) continue
      if (/\b(rc\d*|alpha|beta|nightly|dev|preview)\b/i.test(it.title)) continue
      found.push({ url: it.url, title: it.title.includes(repo.split("/")[1]) ? it.title : `${repo.split("/")[1]} ${it.title}`, excerpt: it.excerpt, publisher: `GitHub (${repo})`.slice(0, 80), publishedAt: it.publishedAt, scout: "github_releases", desk: desk.id })
    }
  }
  return { found, errors }
}

// ─── Hugging Face (discovery only) ──────────────────────────────────────────────────────────────────────────

const ORIGIN_SKIP = /(^|\.)(huggingface\.co|hf\.co|x\.com|twitter\.com|discord\.(gg|com)|linkedin\.com|youtube\.com|youtu\.be|wikipedia\.org|shields\.io|img\.shields\.io|creativecommons\.org|opensource\.org|apache\.org|choosealicense\.com|colab\.research\.google\.com|wandb\.ai|bit\.ly|t\.co)$/i

/** The original sources a model card links to: its paper, its repository, its official post. Best first. */
export function originLinks(markdown: string): { url: string; kind: "paper" | "repo" | "post" }[] {
  const out: { url: string; kind: "paper" | "repo" | "post"; rank: number }[] = []
  const seen = new Set<string>()
  for (const m of markdown.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
    const url = cleanUrl(m[0].replace(/[.,;:]+$/, ""))
    if (!url) continue
    let u: URL
    try {
      u = new URL(url)
    } catch {
      continue
    }
    if (ORIGIN_SKIP.test(u.hostname) || isBlockedHost(u.hostname) || /\.(png|jpe?g|gif|svg|webp|pdf)$/i.test(u.pathname)) continue
    let kind: "paper" | "repo" | "post"
    let clean = url
    if (u.hostname === "arxiv.org" || u.hostname === "www.arxiv.org") {
      const id = u.pathname.match(/\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/)?.[1]
      if (!id) continue
      clean = `https://arxiv.org/abs/${id}`
      kind = "paper"
    } else if (u.hostname === "github.com") {
      const seg = u.pathname.split("/").filter(Boolean)
      if (seg.length < 2 || ["orgs", "users", "sponsors", "topics"].includes(seg[0])) continue
      clean = `https://github.com/${seg[0]}/${seg[1].replace(/\.git$/, "")}`
      kind = "repo"
    } else if (u.pathname.length > 1) kind = "post"
    else continue
    if (seen.has(clean)) continue
    seen.add(clean)
    out.push({ url: clean, kind, rank: kind === "post" ? 0 : kind === "paper" ? 1 : 2 })
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ url, kind }) => ({ url, kind }))
}

function cardSummary(md: string): string {
  const body = md.replace(/^---[\s\S]*?---/, "")
  const para = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/&(?:nbsp|ensp|emsp|thinsp|zwj|zwnj);|&#\d+;|&#x[0-9a-f]+;/gi, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim())
    .find((p) => p.length > 80 && !/^(license|citation|bibtex|@)/i.test(p))
  return (para ?? "").slice(0, 600)
}

const HF_ID = /^[\w.-]{1,96}\/[\w.-]{1,96}$/

/** Trending models or datasets from the last days, each followed to an original source it links to. */
export async function huggingFace(desk: Desk, kind: "models" | "datasets", { budget, days = 10, limit = 6 }: { budget: Budget; days?: number; limit?: number }): Promise<ScoutResult> {
  const got = await fetchJson(`https://huggingface.co/api/${kind}?sort=trendingScore&direction=-1&limit=40`, { budget })
  if (!got.ok) return { found: [], errors: [`Hugging Face ${kind}: ${got.error}`] }
  const list = Array.isArray(got.json) ? got.json.map(rec) : []
  const cutoff = Date.now() - days * DAY
  const fresh = list
    .filter((r) => HF_ID.test(str(r.id, 200)) && r.private !== true && r.disabled !== true)
    .filter((r) => {
      const created = Date.parse(str(r.createdAt, 40))
      return Number.isFinite(created) && created >= cutoff && n(r.likes) >= (kind === "models" ? 40 : 20)
    })
    .slice(0, limit)
  const found: Found[] = []
  const errors: string[] = []
  let noOrigin = 0
  for (const r of fresh) {
    const id = str(r.id, 200)
    const readme = await fetchAllowed(`https://huggingface.co/${kind === "datasets" ? "datasets/" : ""}${id}/raw/main/README.md`, { budget, accept: "text/plain", maxBytes: 400_000 })
    const md = readme.ok ? readme.text : ""
    const origins = originLinks(md)
    // A finding without an original source to read cannot become a story: the card alone is not a source.
    const origin = origins[0]
    if (!origin) {
      noOrigin++
      continue
    }
    const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string") : []
    const license = tags.find((t) => t.startsWith("license:"))?.slice(8) ?? ""
    found.push({
      url: origin.url,
      title: `${id}${kind === "datasets" ? " (dataset)" : ""}: ${cardSummary(md).slice(0, 160) || "new on the trending list"}`.slice(0, 300),
      excerpt: [cardSummary(md), origins.length > 1 ? `Also linked: ${origins.slice(1, 4).map((o) => o.url).join(" ")}` : ""].filter(Boolean).join("\n").slice(0, 1200),
      publisher: origin.kind === "repo" ? `GitHub (${origin.url.split("/").slice(3, 5).join("/")})`.slice(0, 80) : origin.kind === "paper" ? "arXiv" : new URL(origin.url).hostname.replace(/^www\./, ""),
      publishedAt: new Date(Date.parse(str(r.createdAt, 40))).toISOString(),
      scout: kind === "models" ? "hf_models" : "hf_datasets",
      desk: desk.id,
      via: "the Hugging Face API",
      internalOnly: origin.kind === "paper",
      metrics: { name: id, likes: n(r.likes), downloads: n(r.downloads), trending: n(r.trendingScore), task: str(r.pipeline_tag, 60), license, kind },
    })
  }
  return { found, errors, note: noOrigin ? `${noOrigin} trending ${kind} skipped: their cards link to no paper, repository or official post` : undefined }
}

// ─── arXiv ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function arxivSearch(desk: Desk, { budget, queries }: { budget: Budget; queries?: string[] }): Promise<ScoutResult> {
  const m = desk.methods.arxiv ?? {}
  const cats = (m.categories ?? []).slice(0, 4)
  const qs = (queries?.length ? queries : (m.queries ?? [])).slice(0, 3)
  if (!cats.length && !qs.length) return { found: [], errors: [] }
  const catPart = cats.length ? `(${cats.map((c) => `cat:${c}`).join(" OR ")})` : ""
  const asks = qs.length ? qs.map((q) => [catPart, `all:"${q.replace(/["\\]/g, "").slice(0, 100)}"`].filter(Boolean).join(" AND ")) : [catPart]
  const found: Found[] = []
  const errors: string[] = []
  for (const a of asks) {
    const got = await fetchAllowed(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(a)}&sortBy=submittedDate&sortOrder=descending&max_results=25`, { budget, accept: "application/atom+xml", timeoutMs: 20_000 })
    if (!got.ok) {
      errors.push(`arXiv "${a.slice(0, 60)}": ${got.error}`)
      continue
    }
    for (const it of parseFeed(got.text, "https://arxiv.org/", 25)) {
      const id = it.url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/)?.[1]
      if (!id) continue
      found.push({ url: `https://arxiv.org/abs/${id}`, title: it.title, excerpt: it.excerpt, publisher: "arXiv", publishedAt: it.publishedAt, scout: "arxiv_search", desk: desk.id, internalOnly: true })
    }
  }
  return { found, errors }
}

// ─── Technical front pages (discovery only) ─────────────────────────────────────────────────────────────────

/** Matches signals about AI and the tools around it, for scouts that see everything. */
export const AI_WORDS =
  /\b(ai|a\.i\.|artificial intelligence|llms?|gpt[-\w]*|claude|gemini|llama|mistral|qwen|deepseek|transformer|neural|model weights?|open[- ]weights?|inference|fine[- ]tun\w*|agents?|agentic|rag|embedding\w*|diffusion|machine learning|deep learning|openai|anthropic|deepmind|hugging ?face|cuda|gpu|tpu|nvidia|benchmark|dataset|mcp)\b/i

export function matchesDesk(text: string, desk: Desk): boolean {
  const kw = desk.methods.keywords ?? []
  if (kw.length) return kw.some((k) => text.toLowerCase().includes(k.toLowerCase()))
  return AI_WORDS.test(text)
}

export async function frontPage(desk: Desk, { budget }: { budget: Budget }): Promise<ScoutResult> {
  const min = desk.methods.hn?.minPoints ?? 150
  const got = await fetchJson(`https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60`, { budget })
  if (!got.ok) return { found: [], errors: [`front page: ${got.error}`] }
  const found: Found[] = []
  for (const raw of (rec(got.json).hits as unknown[]) ?? []) {
    const h = rec(raw)
    const url = cleanUrl(str(h.url, 1000))
    const title = str(h.title, 300)
    if (!url || !title || n(h.points) < min || !matchesDesk(title, desk)) continue
    let host = ""
    try {
      host = new URL(url).hostname.replace(/^www\./, "")
    } catch {
      continue
    }
    found.push({
      url,
      title,
      excerpt: "",
      publisher: host.startsWith("github.com") ? `GitHub (${url.split("/").slice(3, 5).join("/")})`.slice(0, 80) : host.slice(0, 80),
      publishedAt: typeof h.created_at === "string" ? h.created_at : null,
      scout: "front_page",
      desk: desk.id,
      via: "a technical front page",
      metrics: { points: n(h.points), comments: n(h.num_comments) },
    })
  }
  return { found, errors: [] }
}

// ─── Public records ─────────────────────────────────────────────────────────────────────────────────────────

export async function federalRegister(desk: Desk, { budget, days = 10, terms }: { budget: Budget; days?: number; terms?: string[] }): Promise<ScoutResult> {
  const list = (terms?.length ? terms : (desk.methods.federal?.terms ?? [])).slice(0, 3)
  const found: Found[] = []
  const errors: string[] = []
  for (const t of list) {
    const q = new URLSearchParams({ "conditions[term]": t.slice(0, 80), "conditions[publication_date][gte]": iso(Date.now() - days * DAY), order: "newest", per_page: "20" })
    for (const f of ["title", "html_url", "abstract", "publication_date", "type", "agencies"]) q.append("fields[]", f)
    const got = await fetchJson(`https://www.federalregister.gov/api/v1/documents.json?${q}`, { budget })
    if (!got.ok) {
      errors.push(`Federal Register "${t}": ${got.error}`)
      continue
    }
    for (const raw of (rec(got.json).results as unknown[]) ?? []) {
      const r = rec(raw)
      const url = cleanUrl(str(r.html_url, 500))
      const title = str(r.title, 300)
      if (!url || !title) continue
      // The term search reads the full text: keep only documents whose title or summary is about AI.
      if (!AI_WORDS.test(`${title} ${str(r.abstract, 1000)}`)) continue
      const agencies = Array.isArray(r.agencies) ? (r.agencies as unknown[]).map((a) => str(rec(a).name, 80)).filter(Boolean) : []
      found.push({
        url,
        title,
        excerpt: [str(r.abstract, 1000), str(r.type, 40) ? `Document type: ${str(r.type, 40)}` : ""].filter(Boolean).join("\n"),
        publisher: (agencies[0] || "Federal Register").slice(0, 80),
        publishedAt: str(r.publication_date, 20) ? `${str(r.publication_date, 20)}T12:00:00Z` : null,
        scout: "federal",
        desk: desk.id,
      })
    }
  }
  return { found, errors }
}

// ─── Coverage index ─────────────────────────────────────────────────────────────────────────────────────────

/** Articles about a query in the last days. GDELT asks for one request every five seconds. */
export async function gdelt(query: string, { budget, days = 2, max = 25 }: { budget: Budget; days?: number; max?: number }): Promise<{ items: { url: string; title: string; domain: string; seen: string | null }[]; error: string | null }> {
  const q = `${query.replace(/[^\w\s"'.-]/g, " ").trim().slice(0, 120)} sourcelang:english`
  const got = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=${max}&timespan=${days}d&sort=hybridrel`, { budget, timeoutMs: 15_000 })
  if (!got.ok) return { items: [], error: got.error }
  const items: { url: string; title: string; domain: string; seen: string | null }[] = []
  for (const raw of (rec(got.json).articles as unknown[]) ?? []) {
    const a = rec(raw)
    const url = cleanUrl(str(a.url, 1000))
    const title = str(a.title, 300)
    if (!url || !title) continue
    const s = str(a.seendate, 20).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    items.push({ url, title, domain: str(a.domain, 80), seen: s ? `${s[1]}-${s[2]}-${s[3]}T${s[4]}:${s[5]}:${s[6]}Z` : null })
  }
  return { items, error: null }
}

export async function gdeltScout(desk: Desk, { budget, queries }: { budget: Budget; queries?: string[] }): Promise<ScoutResult> {
  const list = (queries?.length ? queries : (desk.methods.gdelt?.queries ?? [])).slice(0, 2)
  const found: Found[] = []
  const errors: string[] = []
  for (let i = 0; i < list.length; i++) {
    if (i) await pause(5_500)
    const r = await gdelt(list[i], { budget })
    if (r.error) errors.push(`news index "${list[i]}": ${r.error}`)
    for (const it of r.items) found.push({ url: it.url, title: it.title, excerpt: "", publisher: it.domain || new URL(it.url).hostname, publishedAt: it.seen, scout: "gdelt", desk: desk.id })
  }
  return { found, errors }
}
