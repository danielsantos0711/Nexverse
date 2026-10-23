import { rest, rpc, type Member } from "@/lib/code/server"
import { isSafe } from "@/lib/live/http"
import type { ImportedFacts } from "@/lib/projects"
import { runImport } from "./create"
import { getJson, ImportError } from "./fetch"
import { readSource, type SourceType } from "./sources"

/*
 * The admin mass import: seeds Nexverse with real, current items from public APIs, each one a normal Nexverse
 * project (models, datasets, repositories, tools and papers, with their full README, facts and cover) owned by
 * the admin who runs it, with its "imported from" credit. Nothing is invented: names, cards, numbers and pictures come from the
 * source, and the numbers shown in the preview are the source's own (they are never copied into Nexverse stats).
 *
 * The flow: `preview` lists candidates and marks the ones already on Nexverse (a dry run, nothing written);
 * `item` imports one candidate and logs it in mass_imports; the admin page walks the list one item at a time,
 * so it shows progress and stops cleanly. A run is capped at RUN_MAX items; the database caps 300 a day.
 */

export const MASS_SOURCES = ["hf-models", "hf-datasets", "or-models", "gh-repos", "gh-tools", "papers"] as const
export type MassSource = (typeof MASS_SOURCES)[number]
export const isMassSource = (s: unknown): s is MassSource => typeof s === "string" && (MASS_SOURCES as readonly string[]).includes(s)

export const RUN_MAX = 25

export type MassCandidate = {
  source: MassSource
  /** The id on the source: owner/name, author/model, owner/repo, or an arXiv id. */
  ref: string
  name: string
  summary: string
  /** The source's own numbers, for the preview only. */
  metrics: { label: string; value: number }[]
  date: string | null
  /** Already on Nexverse (imported before or shared by someone): skipped. */
  exists: boolean
}

const HF = "https://huggingface.co"
const GH = "https://api.github.com"

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10)
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "")

/** Only admins run mass imports (checked again by the database on every write). */
export async function requireAdmin(m: Member): Promise<void> {
  const ok = await rpc<boolean>(m, "is_admin", {}).catch(() => false)
  if (ok !== true) throw new ImportError(403, "Only admins can run a mass import.")
}

// ─── Candidates ─────────────────────────────────────────────────────────────────────────────────────────────

type HfListed = { id: string; likes?: number; downloads?: number; trendingScore?: number; private?: boolean; gated?: unknown; disabled?: boolean; createdAt?: string; lastModified?: string; pipeline_tag?: string; tags?: string[] }

async function hfList(type: "model" | "dataset", n: number): Promise<MassCandidate[]> {
  // Trending first (what people are using this week), padded with the most liked of the week.
  const path = type === "model" ? "models" : "datasets"
  const [trending, liked] = await Promise.all([
    getJson<HfListed[]>(`${HF}/api/${path}?sort=trendingScore&direction=-1&limit=${Math.min(100, n * 2)}`, { maxBytes: 6 * 1024 * 1024 }),
    getJson<HfListed[]>(`${HF}/api/${path}?sort=likes7d&direction=-1&limit=${Math.min(100, n)}`, { maxBytes: 6 * 1024 * 1024 }).catch(() => []),
  ])
  const seen = new Set<string>()
  return [...(trending ?? []), ...(liked ?? [])]
    .filter((x) => x && typeof x.id === "string" && !x.private && !x.disabled && isSafe(x.id, (x.tags ?? []).join(" ")) && !seen.has(x.id) && (seen.add(x.id), true))
    .slice(0, n)
    .map((x) => ({
      source: type === "model" ? "hf-models" : "hf-datasets",
      ref: x.id,
      name: x.id.split("/").pop() ?? x.id,
      summary: [x.pipeline_tag?.replace(/-/g, " "), `by ${x.id.split("/")[0]}`].filter(Boolean).join(" "),
      metrics: [
        { label: "likes", value: x.likes ?? 0 },
        { label: "downloads", value: x.downloads ?? 0 },
        { label: "trending", value: x.trendingScore ?? 0 },
      ],
      date: x.createdAt ?? x.lastModified ?? null,
      exists: false,
    }))
}

type OrListed = { id: string; name?: string; description?: string; created?: number; context_length?: number }

async function orList(n: number): Promise<MassCandidate[]> {
  const list = await getJson<{ data?: OrListed[] }>("https://openrouter.ai/api/v1/models", { maxBytes: 12 * 1024 * 1024 })
  // The newest models first, one entry per model (":free" and other variants are folded into the base model).
  const seen = new Set<string>()
  const ids = new Set((list?.data ?? []).map((m) => m.id))
  // A variant stands for its model only when the plain model is listed too (some models exist only as ":free").
  const refOf = (id: string) => (ids.has(id.split(":")[0]) ? id.split(":")[0] : id)
  return (list?.data ?? [])
    .filter((m) => typeof m.id === "string" && isSafe(m.id, m.name ?? ""))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .filter((m) => {
      const base = refOf(m.id)
      if (seen.has(base)) return false
      seen.add(base)
      return true
    })
    .slice(0, n)
    .map((m) => ({
      source: "or-models",
      ref: refOf(m.id),
      name: clip(m.name, 80) || m.id,
      summary: clip(m.description, 140),
      metrics: m.context_length ? [{ label: "context", value: m.context_length }] : [],
      date: m.created ? new Date(m.created * 1000).toISOString() : null,
      exists: false,
    }))
}

type GhListed = { full_name?: string; description?: string | null; stargazers_count?: number; forks_count?: number; pushed_at?: string; created_at?: string; archived?: boolean; fork?: boolean; private?: boolean; topics?: string[] }

/** Notable repositories (well starred and pushed to this week) or tools (rising in the last 90 days). */
const GH_QUERIES: Record<"gh-repos" | "gh-tools", string[]> = {
  "gh-repos": ["llm", "ai-agents", "rag", "machine-learning", "diffusion", "deep-learning"].map((t) => `topic:${t} stars:>3000 pushed:>${day(7)}`),
  "gh-tools": ["mcp-server", "ai-tools", "ai-coding", "llm-inference", "developer-tools ai"].map((t) =>
    t.includes(" ") ? `topic:${t.split(" ")[0]} ${t.split(" ")[1]} stars:>500 pushed:>${day(7)}` : `topic:${t} stars:>300 created:>${day(90)}`
  ),
}

async function ghList(source: "gh-repos" | "gh-tools", n: number): Promise<MassCandidate[]> {
  const results = await Promise.all(
    GH_QUERIES[source].map((q) => getJson<{ items?: GhListed[] }>(`${GH}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`).catch(() => null))
  )
  if (results.every((r) => r === null)) throw new ImportError(502, "GitHub did not answer the search. Set GITHUB_TOKEN on the server for a higher limit, or try again in a minute.")
  const seen = new Set<string>()
  return results
    .flatMap((r) => r?.items ?? [])
    .filter((r) => {
      const name = r.full_name ?? ""
      if (!/^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/.test(name) || r.private || r.archived || r.fork || seen.has(name.toLowerCase())) return false
      if (!isSafe(name, r.description ?? "") || /hugging\s?face/i.test(name)) return false
      seen.add(name.toLowerCase())
      return true
    })
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, n)
    .map((r) => ({
      source,
      ref: r.full_name as string,
      name: (r.full_name as string).split("/")[1],
      summary: clip(r.description, 140),
      metrics: [
        { label: "stars", value: r.stargazers_count ?? 0 },
        { label: "forks", value: r.forks_count ?? 0 },
      ],
      date: (source === "gh-tools" ? r.created_at : r.pushed_at) ?? null,
      exists: false,
    }))
}

type DailyPaper = { paper?: { id?: string; title?: string; summary?: string; upvotes?: number; publishedAt?: string; authors?: { name?: string }[]; ai_keywords?: string[] } }

const ARXIV_ID = /^\d{4}\.\d{4,5}$/

/** The research papers the community upvoted most over the last days (arXiv ids), newest days first. */
async function paperList(n: number): Promise<MassCandidate[]> {
  const list = await getJson<DailyPaper[]>(`${HF}/api/daily_papers?limit=100`, { maxBytes: 8 * 1024 * 1024 })
  return (list ?? [])
    .map((x) => x.paper)
    .filter((p): p is NonNullable<DailyPaper["paper"]> => Boolean(p && typeof p.id === "string" && ARXIV_ID.test(p.id) && p.title && isSafe(p.title)))
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
    .slice(0, n)
    .map((p) => ({
      source: "papers",
      ref: p.id as string,
      name: clip(p.title, 120),
      summary: clip(p.summary, 140),
      metrics: [{ label: "upvotes", value: p.upvotes ?? 0 }],
      date: p.publishedAt ?? null,
      exists: false,
    }))
}

/** Marks the candidates that are already on Nexverse, by their source id, link or paper address. */
async function markExisting(m: Member, source: MassSource, list: MassCandidate[]): Promise<MassCandidate[]> {
  if (!list.length) return list
  const quoted = (xs: string[]) => xs.map((x) => `"${x.replace(/"/g, "")}"`).join(",")
  const have = new Set<string>()
  if (source === "gh-repos" || source === "gh-tools") {
    // A full page for the repository (round 12) is what counts; an older shared link is turned into one by "Refresh".
    const urls = list.map((c) => `https://github.com/${c.ref}`)
    const rows = await rest<{ repo_url: string }[]>(m, `projects?repo_url=in.(${encodeURIComponent(quoted(urls))})&select=repo_url`).catch(() => [])
    for (const r of rows) have.add(r.repo_url.replace("https://github.com/", "").replace(/\/$/, "").toLowerCase())
  } else if (source === "papers") {
    const urls = list.map((c) => `https://arxiv.org/abs/${c.ref}`)
    const rows = await rest<{ paper_url: string }[]>(m, `projects?paper_url=in.(${encodeURIComponent(quoted(urls))})&select=paper_url`).catch(() => [])
    for (const r of rows) have.add(r.paper_url.replace("https://arxiv.org/abs/", "").toLowerCase())
  } else {
    const site = source === "or-models" ? "openrouter" : "huggingface"
    const rows = await rest<{ source: { ref?: string } | null }[]>(m, `projects?source->>site=eq.${site}&source->>ref=in.(${encodeURIComponent(quoted(list.map((c) => c.ref)))})&select=source`).catch(() => [])
    for (const r of rows) if (r.source?.ref) have.add(r.source.ref.toLowerCase())
  }
  // Anything a mass import already made a page for is skipped too.
  const logged = await rest<{ ref: string }[]>(m, `mass_imports?status=eq.created&project_id=not.is.null&ref=in.(${encodeURIComponent(quoted(list.map((c) => c.ref)))})&select=ref`).catch(() => [])
  for (const r of logged) have.add(r.ref.toLowerCase())
  return list.map((c) => ({ ...c, exists: have.has(c.ref.toLowerCase()) }))
}

export async function listCandidates(m: Member, source: MassSource, limit: number): Promise<MassCandidate[]> {
  const n = Math.min(60, Math.max(1, Math.floor(limit)))
  const list =
    source === "hf-models" ? await hfList("model", n)
    : source === "hf-datasets" ? await hfList("dataset", n)
    : source === "or-models" ? await orList(n)
    : source === "papers" ? await paperList(n)
    : await ghList(source, n)
  return markExisting(m, source, list)
}

// ─── Importing one candidate ────────────────────────────────────────────────────────────────────────────────

type Logged = { status: "created" | "skipped" | "failed"; href?: string; note?: string; cover?: string | null }

async function log(m: Member, runId: string, source: MassSource, ref: string, out: Logged, ids: { project?: string; share?: string } = {}) {
  const site = source.startsWith("hf") || source === "papers" ? (source === "papers" ? "arxiv" : "huggingface") : source === "or-models" ? "openrouter" : "github"
  const item_type = source === "hf-datasets" ? "dataset" : source === "gh-repos" ? "repo" : source === "gh-tools" ? "tool" : source === "papers" ? "paper" : "model"
  await rest(m, "mass_imports", {
    method: "POST",
    prefer: "return=minimal",
    body: { run_id: runId, site, item_type, ref: ref.slice(0, 200), status: out.status, project_id: ids.project ?? null, share_id: ids.share ?? null, note: (out.note ?? "").slice(0, 300) },
  })
}

/** Imports one candidate as the admin and logs it. Never throws for a problem with the item itself. */
export async function importCandidate(m: Member, runId: string, source: MassSource, ref: string): Promise<Logged> {
  const [existing] = await markExisting(m, source, [{ source, ref, name: ref, summary: "", metrics: [], date: null, exists: false }])
  if (existing.exists) {
    const out: Logged = { status: "skipped", note: "Already on Nexverse." }
    await log(m, runId, source, ref, out).catch(() => null)
    return out
  }
  try {
    const r = await runImport(m, { site: siteOf(source), type: typeOf(source), id: ref, publish: true, copyFiles: true }, { curated: true })
    const out: Logged = { status: "created", href: r.href, cover: r.cover ?? null, note: r.cover ? `Cover from the ${r.cover}` : "No usable picture at the source" }
    await log(m, runId, source, ref, out, { project: r.id })
    return out
  } catch (e) {
    const msg = ((e as Error)?.message ?? "Failed.").slice(0, 200)
    // The daily cap ends the run: say so plainly.
    if (/capped at 300|up to 20 projects a day/i.test(msg)) throw new ImportError(429, msg)
    const out: Logged = { status: "failed", note: msg }
    await log(m, runId, source, ref, out).catch(() => null)
    return out
  }
}

/** One moderation log line per run, when it starts and when it ends. */
export async function logRun(m: Member, runId: string, source: MassSource, note: string) {
  await rpc(m, "log_moderation", { action: "mass_import", target_kind: "import", target_id: runId, note: `${source}: ${note}`.slice(0, 500) }).catch(() => null)
}

// ─── Older shared links ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Earlier mass imports shared GitHub repositories and tools as bare links. Each becomes a full page now (README,
 * languages, release, files, cover), and the old link is removed so the item is not listed twice. Up to `limit`
 * a call; answers how many are left.
 */
export async function convertShares(m: Member, limit = 3): Promise<{ done: { ref: string; ok: boolean; href?: string; note?: string }[]; remaining: number }> {
  const rows = await rest<{ ref: string; item_type: string; share_id: string }[]>(m, `mass_imports?share_id=not.is.null&status=eq.created&item_type=in.(repo,tool)&select=ref,item_type,share_id&order=created_at.asc&limit=200`).catch(() => [])
  // Still listed as a link (not removed yet), and no page for it yet.
  const shares = rows.length ? await rest<{ id: string }[]>(m, `submissions?id=in.(${rows.map((r) => r.share_id).join(",")})&select=id`).catch(() => []) : []
  const live = new Set(shares.map((x) => x.id))
  const todo = rows.filter((r) => live.has(r.share_id))
  const done: { ref: string; ok: boolean; href?: string; note?: string }[] = []
  for (const r of todo.slice(0, Math.min(5, Math.max(1, limit)))) {
    const source: MassSource = r.item_type === "tool" ? "gh-tools" : "gh-repos"
    const runId = crypto.randomUUID()
    const out = await importCandidate(m, runId, source, r.ref).catch((e: unknown) => ({ status: "failed" as const, note: (e as Error)?.message ?? "Failed." }))
    if (out.status === "created" || out.status === "skipped") {
      await rest(m, `submissions?id=eq.${r.share_id}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => null)
      done.push({ ref: r.ref, ok: true, href: out.href })
    } else done.push({ ref: r.ref, ok: false, note: out.note })
  }
  return { done, remaining: Math.max(0, todo.length - done.filter((d) => d.ok).length) }
}

// ─── Dry run of one item ────────────────────────────────────────────────────────────────────────────────────

export type Inspection = {
  name: string
  summary: string
  kind: string
  license: string
  tags: string[]
  langs: string[]
  readmeChars: number
  readmeStart: string
  facts: { label: string; value: string }[]
  imported: ImportedFacts | null
  specKeys: string[]
  covers: number
}

const siteOf = (source: MassSource) => (source === "or-models" ? "openrouter" : source === "gh-repos" || source === "gh-tools" ? "github" : source === "papers" ? "arxiv" : "huggingface")
const typeOf = (source: MassSource): SourceType => (source === "hf-datasets" ? "dataset" : source === "gh-repos" ? "repo" : source === "gh-tools" ? "tool" : source === "papers" ? "paper" : "model")

/** Reads one candidate from its source and answers what its page would hold. Writes nothing. */
export async function inspectCandidate(source: MassSource, ref: string): Promise<Inspection> {
  const d = await readSource(siteOf(source), typeOf(source), ref)
  const covers = await d.covers().catch(() => [])
  const specKeys = [...Object.keys(d.specs.model ?? {}), ...Object.keys(d.specs.dataset ?? {})]
  return {
    name: d.name,
    summary: d.summary,
    kind: d.projectType,
    license: d.license,
    tags: d.tags,
    langs: d.langs,
    readmeChars: d.readme.length,
    readmeStart: d.readme.slice(0, 280),
    facts: d.facts,
    imported: d.specs.imported ?? null,
    specKeys,
    covers: covers.length,
  }
}
