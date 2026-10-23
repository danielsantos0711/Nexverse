import { hostname } from "@/lib/live/http"
import type { SourceRow } from "@/lib/newsroom"
import { collectSource } from "./collect"
import { Budget, fetchJson } from "./engine/fetch"
import { AI_WORDS, arxivSearch, federalRegister, frontPage, gdeltScout, githubReleases, githubRising, huggingFace, type Found } from "./engine/scouts"
import type { Desk } from "./engine/types"
import { getPage } from "./http"
import { pageDate, signalHash, urlKey } from "./parse"
import { insert, rpc, select, update, type Db } from "./rest"
import { clampHours, SCAN_KINDS, type ScanKind, type SourceReport, type StoredFinding } from "./scan-shared"

export { clampHours, SCAN_KINDS, SCAN_WINDOWS, type ScanKind, type SourceReport, type StoredFinding } from "./scan-shared"

/*
 * Server only. The newsroom's scan: every discovery source asked the same question, "what is new in AI in this
 * window?", with the window applied by each source itself (arXiv by submission date, GitHub by creation time,
 * the Federal Register by publication date, the news index by its timespan, feeds and official pages by the
 * date of each item, the technical front page by posting time). Findings are ranked by relevance and recency,
 * deduplicated by address and headline, and stored as signals the triage and the editors work from.
 *
 * Nothing here needs an AI key: discovery, ranking and the list in /admin/newsroom/control all run without one.
 * Writing a story from a finding (research) is what needs AI.
 */

const HOUR = 36e5
const DAY = 864e5

/** Official feeds and pages read even when the sources table does not list them (each was checked live). */
export const BUILTIN_SOURCES: { kind: "rss" | "site"; label: string; publisher: string; url: string; query?: string; desk: string }[] = [
  { kind: "rss", label: "OpenAI News", publisher: "OpenAI", url: "https://openai.com/news/rss.xml", desk: "launch" },
  { kind: "site", label: "Anthropic newsroom", publisher: "Anthropic", url: "https://www.anthropic.com/news", query: "/news/", desk: "launch" },
  { kind: "rss", label: "Google DeepMind blog", publisher: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", desk: "research" },
  { kind: "rss", label: "Google: AI on The Keyword", publisher: "Google", url: "https://blog.google/technology/ai/rss/", desk: "launch" },
  { kind: "rss", label: "Google Research blog", publisher: "Google Research", url: "https://research.google/blog/rss/", desk: "research" },
  { kind: "site", label: "Meta AI blog", publisher: "Meta AI", url: "https://ai.meta.com/blog/", query: "/blog/", desk: "launch" },
  { kind: "rss", label: "Mistral AI news", publisher: "Mistral AI", url: "https://mistral.ai/news/rss", desk: "launch" },
  { kind: "site", label: "xAI news", publisher: "xAI", url: "https://x.ai/news", query: "/news/", desk: "launch" },
  { kind: "rss", label: "Microsoft Source: AI", publisher: "Microsoft", url: "https://news.microsoft.com/source/topics/ai/feed/", desk: "industry" },
  { kind: "rss", label: "Microsoft Research blog", publisher: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/", desk: "research" },
  { kind: "rss", label: "NVIDIA blog", publisher: "NVIDIA", url: "https://blogs.nvidia.com/feed/", desk: "industry" },
  { kind: "rss", label: "NVIDIA technical blog", publisher: "NVIDIA", url: "https://developer.nvidia.com/blog/feed", desk: "tools" },
  { kind: "rss", label: "Amazon Science", publisher: "Amazon Science", url: "https://www.amazon.science/index.rss", desk: "research" },
  { kind: "rss", label: "Apple Machine Learning Research", publisher: "Apple", url: "https://machinelearning.apple.com/rss.xml", desk: "research" },
  { kind: "rss", label: "Together AI blog", publisher: "Together AI", url: "https://www.together.ai/blog/rss.xml", desk: "tools" },
  { kind: "rss", label: "PyTorch blog", publisher: "PyTorch", url: "https://pytorch.org/blog/feed/", desk: "tools" },
  { kind: "rss", label: "Ollama blog", publisher: "Ollama", url: "https://ollama.com/blog/rss.xml", desk: "tools" },
  { kind: "rss", label: "GitHub blog: AI and ML", publisher: "GitHub", url: "https://github.blog/ai-and-ml/feed/", desk: "tools" },
]

/** The frameworks, runtimes and SDKs whose releases are news for builders. */
export const RELEASE_REPOS = [
  "vllm-project/vllm",
  "ollama/ollama",
  "ggml-org/llama.cpp",
  "pytorch/pytorch",
  "sgl-project/sglang",
  "NVIDIA/TensorRT-LLM",
  "langchain-ai/langchain",
  "run-llama/llama_index",
  "openai/openai-python",
  "openai/codex",
  "anthropics/anthropic-sdk-python",
  "anthropics/claude-code",
  "google-gemini/gemini-cli",
  "microsoft/autogen",
  "unslothai/unsloth",
  "comfyanonymous/ComfyUI",
  "modelcontextprotocol/python-sdk",
  "mlc-ai/mlc-llm",
]

const RISING_QUERIES = ["topic:llm", "topic:ai-agents", "topic:mcp", "topic:generative-ai"]

/** A desk-shaped bag of methods for the scouts, so the scan reuses them without a desk row. */
const SWEEP: Desk = {
  id: "sweep",
  label: "Scan",
  one: "Scan",
  blurb: "",
  scope: "",
  audience: "",
  kind: "industry",
  priority: 3,
  enabled: true,
  hidden: true,
  leakTrack: false,
  autoPublish: false,
  minScore: 0,
  methods: {
    github: { rising: true, queries: RISING_QUERIES, watchRepos: RELEASE_REPOS },
    arxiv: { categories: ["cs.AI", "cs.CL", "cs.LG", "cs.CV"] },
    federal: { terms: ["artificial intelligence", "machine learning"] },
    gdelt: { queries: ['"artificial intelligence" (launch OR model OR regulation)', '"AI model" OR "large language model"'] },
    hn: { enabled: true, minPoints: 80 },
    hf: { models: true },
  },
  tint: null,
  sort: 0,
}

// ─── Ranking ────────────────────────────────────────────────────────────────────────────────────────────────

const BASE: Record<ScanKind, number> = { official: 62, releases: 50, github: 40, arxiv: 34, policy: 52, frontpage: 40, coverage: 30, models: 42 }

/** Routine posts that are rarely news: tutorials, customer stories, events, hiring. */
const ROUTINE = /\b(how (?:to|we|[A-Z][\w&.-]+ (?:uses?|built|scaled))|customer stor(?:y|ies)|case stud(?:y|ies)|webinar|recap|ambassadors?|we'?re hiring|careers?|meetup|livestream|podcast|newsletter|weekly|roundup|tips|tutorial|getting started|best practices|step[- ]by[- ]step|guide to|office hours|nightly|hash updates?|trunk)\b/i
/** Words that make an AI story worth a look straight away. */
const STRONG = /\b(introducing|launch(?:es|ed)?|releas(?:e|es|ed)|announc(?:e|es|ed|ing)|open[- ]sourc(?:e|es|ed)|open[- ]weights?|now available|general availability|state[- ]of[- ]the[- ]art|sota|benchmark|acquir(?:e|es|ed)|acquisition|funding|raises?|series [a-e]|regulat\w+|executive order|ai act|lawsuit|partnership)\b/i

/** Repositories that game stars: game cheats, cracks, "top 20 tools 2026" lists. Never news. */
const SPAM = /\b(cheats?|crack(?:ed)?|keygen|aimbot|esp|wallhack|unlocker|injector|spoofer|executor|mod menu|free (?:download|robux|v-?bucks)|activator|loader|top \d+ .{0,40}20\d\d|optimizer tools?)\b|-resp\b|rpocket/i

const kindOf = (scout: string): ScanKind =>
  scout === "rss" || scout === "site" || scout === "official" ? "official"
  : scout === "github_releases" ? "releases"
  : scout === "github_rising" ? "github"
  : scout === "arxiv_search" || scout === "arxiv_query" ? "arxiv"
  : scout === "federal" ? "policy"
  : scout === "front_page" ? "frontpage"
  : scout === "gdelt" ? "coverage"
  : scout === "hf_models" || scout === "hf_datasets" ? "models"
  : "official"

const log10 = (n: number) => (n > 0 ? Math.log10(n) : 0)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** Relevance (what kind of source, how AI it is, how big) plus recency within the window, 0 to 100. */
export function rankFinding(f: Pick<Found, "title" | "excerpt" | "publishedAt" | "scout" | "metrics">, hours: number, now = Date.now()): number {
  const kind = kindOf(f.scout)
  const text = `${f.title} ${f.excerpt}`.slice(0, 1600)
  let score = BASE[kind]
  const ai = AI_WORDS.test(text)
  if (ai) score += 8
  else if (kind === "official" || kind === "frontpage" || kind === "coverage") score -= 22
  if (STRONG.test(f.title)) score += 10
  if (ROUTINE.test(f.title)) score -= 18
  const m = f.metrics ?? {}
  if (kind === "github") score += Math.min(24, log10(num(m.stars)) * 7) + Math.min(8, log10(num(m.starsPerDay)) * 4)
  if (kind === "frontpage") score += Math.min(22, log10(num(m.points)) * 8)
  if (kind === "models") score += Math.min(18, log10(num(m.likes)) * 7)
  if (kind === "arxiv") score += Math.min(26, num(m.upvotes) * 1.2)
  if (kind === "releases" && /\b(v?\d+\.0(\.0)?|major)\b/i.test(f.title)) score += 8
  // A record or a release that does not name AI in its own headline is rarely an AI story.
  if (kind === "policy" && !AI_WORDS.test(f.title)) score -= 24
  // Recency: fresh items lead; undated ones sit in the middle.
  const t = f.publishedAt ? Date.parse(f.publishedAt) : NaN
  const age = Number.isFinite(t) ? Math.max(0, now - t) : (hours * HOUR) / 2
  score += 16 * (1 - Math.min(1, age / (hours * HOUR)))
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** The desk a finding belongs to, by its source and words, when a desk with that id exists. */
export function deskFor(f: Pick<Found, "title" | "excerpt" | "scout" | "desk">, desks: Set<string>): string | null {
  const has = (d: string) => (desks.has(d) ? d : null)
  if (f.desk && desks.has(f.desk)) return f.desk
  const text = `${f.title} ${f.excerpt}`
  const kind = kindOf(f.scout)
  if (kind === "policy" || /\b(regulat\w+|policy|executive order|ai act|legislat\w+|senate|congress|commission|lawmakers?|ban)\b/i.test(text)) return has("policy") ?? has("industry")
  if (kind === "arxiv") return has("research")
  if (kind === "github") return has("open-source") ?? has("tools")
  if (kind === "releases") return has("tools")
  if (kind === "models") return has("models") ?? has("launch")
  if (/\b(acquir\w+|acquisition|funding|raises?|valuation|ipo|revenue|partnership|deal|data cent(?:er|re)s?)\b/i.test(text)) return has("industry")
  if (/\b(introducing|launch\w*|now available|releas\w+|new model|open[- ]weights?)\b/i.test(text)) return has("launch")
  if (/\b(paper|research|study|benchmark|we propose)\b/i.test(text)) return has("research")
  return has("industry")
}

// ─── Undated official pages ─────────────────────────────────────────────────────────────────────────────────

/**
 * Official news pages without dates on their cards: each article's own page says when it was published. A page
 * lists its newest stories first, so the articles are read in order and the reading stops at the second one
 * older than the window; whatever is left undated after that sits further down the list and is older still.
 */
async function dateListing(items: Found[], since: number, limit: number, tooLate: () => boolean): Promise<Found[]> {
  const out: Found[] = []
  let older = 0
  let read = 0
  for (const it of items) {
    if (it.publishedAt) {
      out.push(it)
      continue
    }
    if (older >= 2 || read >= limit || tooLate()) continue
    read++
    const got = await getPage(it.url, 8_000)
    const d = got.ok ? pageDate(got.text) : null
    if (!d) continue
    it.publishedAt = d
    if (Date.parse(d) < since) older++
    out.push(it)
  }
  return out
}

// ─── The scan ───────────────────────────────────────────────────────────────────────────────────────────────


export type Finding = Found & { score: number; kind: ScanKind; hash: string }

export type ScanResult = {
  hours: number
  since: string
  findings: Finding[]
  sources: SourceReport[]
  stored: number
  ms: number
  notes: string[]
}

export type ScanOptions = {
  /** Where findings are stored and the sources table is read. Without it the scan is a dry run. */
  db?: Db | null
  hours: number
  kinds?: ScanKind[]
  /** The desk ids findings may be placed on. */
  desks?: Set<string>
  budget?: Budget
  /** Stop starting new requests after this time (ms since epoch). */
  deadline?: number
}

type SourceLike = { id?: string; kind: SourceRow["kind"]; label: string; publisher: string; url: string | null; repo: string | null; query: string | null; desk: string | null; internal_only: boolean }

/** Asks every source for the window and returns the ranked, deduplicated findings. Never throws for one source. */
export async function scan(o: ScanOptions): Promise<ScanResult> {
  const started = Date.now()
  const hours = clampHours(o.hours)
  const days = hours / 24
  const since = started - hours * HOUR
  const want = new Set<ScanKind>(o.kinds?.length ? o.kinds : SCAN_KINDS.map((k) => k.id))
  const budget = o.budget ?? new Budget(140)
  const desks = o.desks ?? new Set(["launch", "research", "policy", "industry", "tools", "open-source", "models"])
  const reports: SourceReport[] = []
  const notes: string[] = []
  const all: Found[] = []
  const tooLate = () => o.deadline !== undefined && Date.now() > o.deadline

  const tasks: Promise<void>[] = []

  if (want.has("official")) {
    tasks.push(
      (async () => {
        const rows = o.db ? await select<SourceRow & { desk: string | null }>(o.db, "news_sources", "enabled=is.true&select=*").catch(() => []) : []
        const list: SourceLike[] = rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, publisher: r.publisher, url: r.url, repo: r.repo, query: r.query, desk: r.desk ?? r.category_hint, internal_only: r.internal_only }))
        const have = new Set(list.map((s) => (s.url ? urlKey(s.url) : `${s.kind}:${s.repo ?? s.query}`)))
        for (const b of BUILTIN_SOURCES) if (!have.has(urlKey(b.url))) list.push({ kind: b.kind, label: b.label, publisher: b.publisher, url: b.url, repo: null, query: b.query ?? null, desk: b.desk, internal_only: false })
        // arXiv and releases have their own scans with the window applied at the source.
        const feeds = list.filter((s) => s.kind === "rss" || s.kind === "site")
        const queue = [...feeds]
        let ok = 0
        let count = 0
        const failed: string[] = []
        const items: Found[] = []
        await Promise.all(
          Array.from({ length: 6 }, async () => {
            for (let s = queue.shift(); s; s = queue.shift()) {
              if (tooLate()) break
              const r = await collectSource({ kind: s.kind, url: s.url, repo: s.repo, query: s.query }, { maxAgeMs: hours * HOUR, max: hours > 168 ? 40 : 25 })
              // The sources list shows whether each one answered at its last check.
              if (o.db && s.id) {
                const sid = s.id
                if (o.db.as === "service") await update(o.db, "news_sources", `id=eq.${sid}`, { last_checked: new Date().toISOString(), last_ok: r.ok, last_count: r.items.length, last_error: r.ok ? null : r.error }).catch(() => {})
                else await rpc(o.db, "news_source_checked", { source: sid, ok: r.ok, items: r.items.length, err: r.ok ? "" : r.error }).catch(() => {})
              }
              if (!r.ok) {
                failed.push(`${s.label}: ${r.error}`)
                continue
              }
              ok++
              let got: Found[] = r.items.map((it) => ({ url: it.url, title: it.title, excerpt: it.excerpt, publisher: s.publisher || hostname(it.url), publishedAt: it.publishedAt, scout: s.kind, desk: s.desk, internalOnly: s.internal_only }))
              if (got.some((g) => !g.publishedAt)) {
                // Dates the newsroom already knows first, then the article pages.
                if (o.db) {
                  const hashes = got.filter((g) => !g.publishedAt).map((g) => signalHash(g.url)).slice(0, 80)
                  const knownRows = await select<{ hash: string; published_at: string | null }>(o.db, "news_signals", `hash=in.(${hashes.join(",")})&select=hash,published_at`).catch(() => [])
                  const byHash = new Map(knownRows.map((k) => [k.hash, k.published_at]))
                  for (const g of got) if (!g.publishedAt && byHash.get(signalHash(g.url))) g.publishedAt = byHash.get(signalHash(g.url)) ?? null
                }
                got = await dateListing(got, since, hours > 168 ? 14 : 8, tooLate)
              }
              items.push(...got)
            }
          })
        )
        for (const it of items) {
          const t = it.publishedAt ? Date.parse(it.publishedAt) : NaN
          if (!Number.isFinite(t) || t < since) continue
          all.push(it)
          count++
        }
        reports.push({ kind: "official", label: `Official blogs (${ok} of ${feeds.length} answered)`, ok: ok > 0, count, error: failed.length ? failed.slice(0, 6).join("; ") : undefined })
      })()
    )
  }

  const scout = (kind: ScanKind, label: string, run: () => Promise<{ found: Found[]; errors: string[]; note?: string }>) =>
    tasks.push(
      run()
        .then((r) => {
          const fresh = r.found.filter((f) => !f.publishedAt || Date.parse(f.publishedAt) >= since)
          all.push(...fresh)
          reports.push({ kind, label, ok: r.errors.length === 0 || fresh.length > 0, count: fresh.length, error: r.errors.length ? r.errors.slice(0, 3).join("; ") : undefined })
          if (r.note) notes.push(r.note)
        })
        .catch((err: unknown) => {
          reports.push({ kind, label, ok: false, count: 0, error: err instanceof Error ? err.message : "failed" })
        })
    )

  if (want.has("releases")) scout("releases", "Framework releases", () => githubReleases(SWEEP, { budget, days }))
  if (want.has("github")) scout("github", "New repositories", () => githubRising(SWEEP, { budget, days }))
  if (want.has("arxiv"))
    scout("arxiv", "arXiv papers", async () => {
      const [papers, upvoted] = await Promise.all([arxivSearch(SWEEP, { budget, days, max: hours <= 48 ? 60 : 100 }), dailyPapers(budget)])
      // Papers the research community upvoted rank higher; the list itself is only a signal, never cited.
      for (const p of papers.found) {
        const id = p.url.match(/abs\/(\d{4}\.\d{4,5})/)?.[1]
        const up = id ? upvoted.get(id) : undefined
        if (up) p.metrics = { ...(p.metrics ?? {}), upvotes: up }
      }
      return papers
    })
  if (want.has("policy")) scout("policy", "Federal Register", () => federalRegister(SWEEP, { budget, days: Math.max(1, days) }))
  if (want.has("frontpage")) scout("frontpage", "Technical front page", () => frontPage(SWEEP, { budget, days }))
  if (want.has("coverage")) scout("coverage", "News index (GDELT)", () => gdeltScout(SWEEP, { budget, days: Math.min(90, days) }))
  if (want.has("models")) scout("models", "New models", () => huggingFace(SWEEP, "models", { budget, days: Math.max(1, days), limit: hours <= 48 ? 6 : 10 }))

  await Promise.all(tasks)

  // New repositories must be about AI, and not star-farmed spam.
  for (let i = all.length - 1; i >= 0; i--) {
    const f = all[i]
    if (f.scout === "github_rising" && (SPAM.test(`${f.title} ${f.excerpt}`) || !AI_WORDS.test(`${f.title} ${f.excerpt}`))) all.splice(i, 1)
  }

  // Rank, then keep one finding per address and per headline.
  const ranked: Finding[] = all
    .filter((f) => f.url && f.title)
    .map((f) => ({ ...f, desk: deskFor(f, desks), score: rankFinding(f, hours, started), kind: kindOf(f.scout), hash: signalHash(f.url) }))
    .sort((a, b) => b.score - a.score)
  const seenUrl = new Set<string>()
  const seenTitle = new Set<string>()
  const findings: Finding[] = []
  for (const f of ranked) {
    const t = f.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80)
    if (seenUrl.has(f.hash) || (t.length > 20 && seenTitle.has(t))) continue
    seenUrl.add(f.hash)
    seenTitle.add(t)
    findings.push(f)
  }
  // One publisher should not fill the list: each further item from the same one ranks a little lower.
  const perPublisher = new Map<string, number>()
  for (const f of findings) {
    const k = f.publisher.toLowerCase()
    const n = perPublisher.get(k) ?? 0
    perPublisher.set(k, n + 1)
    f.score = Math.max(0, f.score - Math.min(20, n * 3))
  }
  findings.sort((a, b) => b.score - a.score)

  let stored = 0
  if (o.db && findings.length) {
    const rows = findings.map((f) => ({
      source_id: null,
      url: f.url,
      title: f.title.slice(0, 300),
      excerpt: (f.excerpt ?? "").slice(0, 1200),
      publisher: (f.publisher || hostname(f.url)).slice(0, 80),
      internal_only: f.internalOnly === true,
      used: false,
      published_at: f.publishedAt,
      hash: f.hash,
      desk: f.desk,
      scout: f.scout.slice(0, 40),
      metrics: { ...(f.metrics ?? {}), score: f.score },
      via: f.via?.slice(0, 120) ?? null,
    }))
    for (let i = 0; i < rows.length; i += 100) {
      const fresh = await insert<{ id: number }>(o.db, "news_signals", rows.slice(i, i + 100), { ignoreDuplicates: true, onConflict: "hash" }).catch((err: unknown) => {
        notes.push(`Storing findings failed: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`)
        return []
      })
      stored += fresh.length
    }
  }
  reports.sort((a, b) => SCAN_KINDS.findIndex((k) => k.id === a.kind) - SCAN_KINDS.findIndex((k) => k.id === b.kind))
  return { hours, since: new Date(since).toISOString(), findings, sources: reports, stored, ms: Date.now() - started, notes }
}

/** arXiv ids the research community upvoted in recent days, with their votes. Discovery only. */
async function dailyPapers(budget: Budget): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const got = await fetchJson("https://huggingface.co/api/daily_papers?limit=100", { budget })
  if (!got.ok || !Array.isArray(got.json)) return out
  for (const raw of got.json as { paper?: { id?: unknown; upvotes?: unknown } }[]) {
    const id = raw?.paper?.id
    if (typeof id === "string" && /^\d{4}\.\d{4,5}$/.test(id)) out.set(id, typeof raw.paper?.upvotes === "number" ? raw.paper.upvotes : 0)
  }
  return out
}

// ─── Reading findings back ──────────────────────────────────────────────────────────────────────────────────


type SignalRow = { id: number; url: string; title: string; excerpt: string; publisher: string; published_at: string | null; created_at: string; scout: string | null; desk: string | null; metrics: Record<string, number | string> | null; used: boolean; story_id: string | null; internal_only: boolean; via: string | null; source: { kind: string } | null }

/** The signals in a window, best first: what the scan and the scouts found, with whether a story came of it. */
export async function readFindings(db: Db, { hours, limit = 200 }: { hours: number; limit?: number }): Promise<StoredFinding[]> {
  const h = clampHours(hours)
  const since = new Date(Date.now() - h * HOUR).toISOString()
  const rows = await select<SignalRow>(
    db,
    "news_signals",
    `or=${encodeURIComponent(`(published_at.gte.${since},and(published_at.is.null,created_at.gte.${since}))`)}&order=created_at.desc&limit=800&select=id,url,title,excerpt,publisher,published_at,created_at,scout,desk,metrics,used,story_id,internal_only,via,source:news_sources(kind)`
  )
  const now = Date.now()
  const list = rows.map((r) => {
    const scout = r.scout ?? r.source?.kind ?? "rss"
    const f = { title: r.title, excerpt: r.excerpt, publishedAt: r.published_at, scout, metrics: r.metrics ?? undefined }
    return {
      id: r.id,
      url: r.url,
      title: r.title,
      excerpt: r.excerpt,
      publisher: r.publisher,
      publishedAt: r.published_at,
      foundAt: r.created_at,
      scout,
      kind: kindOf(scout),
      desk: r.desk,
      score: rankFinding(f, h, now),
      used: r.used,
      storyId: r.story_id,
      leadId: null as number | null,
      internalOnly: r.internal_only,
      via: r.via,
    }
  })
  // The lead each signal went into, so the page can say what happened to it.
  const ids = list.map((l) => l.id)
  if (ids.length) {
    const leads = await select<{ id: number; signal_ids: number[] }>(db, "news_leads", `created_at=gte.${new Date(now - Math.max(h * HOUR, 7 * DAY)).toISOString()}&select=id,signal_ids&order=created_at.desc&limit=600`).catch(() => [])
    const byId = new Map<number, number>()
    for (const l of leads) for (const s of l.signal_ids ?? []) if (!byId.has(s)) byId.set(s, l.id)
    for (const f of list) f.leadId = byId.get(f.id) ?? null
  }
  return list.sort((a, b) => b.score - a.score).slice(0, Math.min(400, limit))
}
