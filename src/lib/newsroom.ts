import { explain, isMissingSchema } from "@/lib/moderation"
import { db } from "@/lib/supabase"

/*
 * The Nexverse newsroom: original stories written from official sources, reviewed by editors before they go
 * out. This module holds the shared vocabulary (categories, statuses, settings) for the server pipeline and
 * the pages, plus what the editors' desk in /admin/newsroom reads and changes through the browser's database
 * client. Row level security decides every write: news.write for drafts, news.publish for publishing, staff
 * for sources, news.tip for tips. Nothing here is trusted because the interface hid a button.
 */

// ─── Vocabulary ─────────────────────────────────────────────────────────────────────────────────────────────

export const NEWS_CATEGORIES = [
  { id: "launch", label: "Launches", one: "Launch", blurb: "New models, products and features that shipped." },
  { id: "research", label: "Research", one: "Research", blurb: "Results and methods from labs and universities." },
  { id: "policy", label: "Policy", one: "Policy", blurb: "Rules, safety commitments and what governments decided." },
  { id: "industry", label: "Industry", one: "Industry", blurb: "Deals, partnerships, offices and the business of AI." },
  { id: "tools", label: "Tools", one: "Tools", blurb: "Releases of the frameworks and runtimes people build with." },
  { id: "rumor", label: "Rumours & leaks", one: "Rumour", blurb: "Reported but not confirmed. Always labelled, always sourced." },
] as const

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["id"]
export const isNewsCategory = (s: unknown): s is NewsCategory => typeof s === "string" && NEWS_CATEGORIES.some((c) => c.id === s)
export const categoryInfo = (id: NewsCategory) => NEWS_CATEGORIES.find((c) => c.id === id)!

export type StoryStatus = "draft" | "scheduled" | "published" | "rejected"
export const STATUS_LABELS: Record<StoryStatus, string> = { draft: "Draft", scheduled: "Scheduled", published: "Published", rejected: "Rejected" }

export type StorySource = {
  url: string
  title: string
  publisher: string
  /** A line from the source itself (a verified quote or its own summary), for the citation preview. */
  excerpt?: string
  publishedAt?: string | null
}

export type Person = { id: string; name: string; handle: string | null }

/** Where a story's cover came from. "generated" has no address: it is drawn by /api/newsroom/cover. */
export type CoverKind = "source" | "openverse" | "wikimedia" | "generated" | "editor"
export const COVER_KINDS: CoverKind[] = ["source", "openverse", "wikimedia", "generated", "editor"]

/** Who made a cover and under which licence; shown under the image. */
export type CoverCredit = { creator: string; creatorUrl: string; license: string; licenseUrl: string; landing: string; provider: string }

/** One cover the finder offered, kept so editors can swap without searching again. */
export type CoverCandidate = { url: string; kind: CoverKind; width: number | null; height: number | null; alt: string; credit: CoverCredit | null }

/** A line for the "Key facts" box, tied to the source number it comes from. */
export type KeyFact = { text: string; source: number | null }
/** Words that appear in a source, set apart in the story. */
export type PullQuote = { text: string; source: number | null }

export type Depth = "short" | "standard" | "deep"
export const DEPTHS: { id: Depth; label: string; blurb: string }[] = [
  { id: "short", label: "Short", blurb: "One pass from the collected pages: a brief of 150 to 400 words." },
  { id: "standard", label: "Standard", blurb: "Reads up to two related official pages, plans, writes 450 to 800 words, then fact-checks." },
  { id: "deep", label: "Deep", blurb: "Reads up to four related official pages, plans, writes 700 to 1,400 words in sections, then fact-checks every claim." },
]
export const isDepth = (v: unknown): v is Depth => v === "short" || v === "standard" || v === "deep"

export type Story = {
  id: string
  slug: string
  title: string
  dek: string
  body: string
  category: NewsCategory
  status: StoryStatus
  unconfirmed: boolean
  sources: StorySource[]
  cover: string | null
  coverKind: CoverKind | null
  coverCredit: CoverCredit | null
  coverAlt: string
  /** Only filled where editors read the story. */
  coverCandidates: CoverCandidate[]
  keyFacts: KeyFact[]
  pullQuote: PullQuote | null
  depth: Depth
  wordCount: number | null
  aiGenerated: boolean
  model: string | null
  writer: Person | null
  editor: Person | null
  publishedAt: string | null
  featured: boolean
  createdAt: string
  updatedAt: string
  rejectNote: string | null
}

const PEOPLE = "writer:profiles!news_stories_written_by_fkey(id, name, handle), editor:profiles!news_stories_edited_by_fkey(id, name, handle)"
/** The columns from before the long-form migration (20261019134000), for databases that do not have it yet. */
export const LEGACY_STORY_COLUMNS = `id, slug, title, dek, body, category, status, unconfirmed, sources, cover, ai_generated, model, published_at, featured, created_at, updated_at, reject_note, ${PEOPLE}`
/** The columns every story read selects, with the writer's and editor's names. */
export const STORY_COLUMNS = LEGACY_STORY_COLUMNS.replace("cover, ", "cover, cover_kind, cover_credit, cover_alt, key_facts, pull_quote, depth, word_count, ")
/** What the editors' desk reads: everything, the candidate covers included. */
export const EDIT_COLUMNS = STORY_COLUMNS.replace("cover_alt, ", "cover_alt, cover_candidates, ")

export type StoryRow = {
  id: string
  slug: string
  title: string
  dek: string | null
  body: string | null
  category: string
  status: string
  unconfirmed: boolean
  sources: unknown
  cover: string | null
  cover_kind?: string | null
  cover_credit?: unknown
  cover_alt?: string | null
  cover_candidates?: unknown
  key_facts?: unknown
  pull_quote?: unknown
  depth?: string | null
  word_count?: number | null
  ai_generated: boolean
  model: string | null
  published_at: string | null
  featured: boolean
  created_at: string
  updated_at: string
  reject_note?: string | null
  writer?: Person | Person[] | null
  editor?: Person | Person[] | null
}

/** True when a read failed only because the long-form columns are not in the database yet. */
export const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  Boolean(e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? "")))

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "")
const httpsOr = (v: unknown) => (typeof v === "string" && /^https:\/\/\S{4,1000}$/.test(v) ? v : "")
const posInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null)

/** Sources as stored, keeping only well-formed https entries. */
export function readSources(v: unknown): StorySource[] {
  if (!Array.isArray(v)) return []
  const out: StorySource[] = []
  for (const s of v) {
    if (!s || typeof s !== "object") continue
    const r = s as Record<string, unknown>
    const url = httpsOr(r.url)
    if (!url) continue
    const src: StorySource = { url, title: str(r.title, 300), publisher: str(r.publisher, 80) }
    const excerpt = str(r.excerpt, 400)
    if (excerpt) src.excerpt = excerpt
    if (typeof r.publishedAt === "string" && Number.isFinite(Date.parse(r.publishedAt))) src.publishedAt = r.publishedAt
    out.push(src)
  }
  return out.slice(0, 12)
}

export function readCredit(v: unknown): CoverCredit | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const c: CoverCredit = {
    creator: str(r.creator, 160),
    creatorUrl: httpsOr(r.creatorUrl),
    license: str(r.license, 60),
    licenseUrl: httpsOr(r.licenseUrl),
    landing: httpsOr(r.landing),
    provider: str(r.provider, 60),
  }
  return c.creator || c.license || c.landing ? c : null
}

const isCoverKind = (v: unknown): v is CoverKind => typeof v === "string" && (COVER_KINDS as string[]).includes(v)

export function readCandidates(v: unknown): CoverCandidate[] {
  if (!Array.isArray(v)) return []
  const out: CoverCandidate[] = []
  for (const c of v) {
    if (!c || typeof c !== "object") continue
    const r = c as Record<string, unknown>
    if (!isCoverKind(r.kind)) continue
    const url = httpsOr(r.url)
    if (!url && r.kind !== "generated") continue
    out.push({ url, kind: r.kind, width: posInt(r.width), height: posInt(r.height), alt: str(r.alt, 300), credit: readCredit(r.credit) })
  }
  return out.slice(0, 24)
}

export function readKeyFacts(v: unknown): KeyFact[] {
  if (!Array.isArray(v)) return []
  return v
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : typeof f === "string" ? { text: f } : null))
    .filter((f): f is Record<string, unknown> => Boolean(f))
    .map((f) => ({ text: str(f.text, 400), source: posInt(f.source) }))
    .filter((f) => f.text.length > 0)
    .slice(0, 12)
}

export function readPullQuote(v: unknown): PullQuote | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const text = str(r.text, 400)
  return text ? { text, source: posInt(r.source) } : null
}

export function toStory(r: StoryRow): Story {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    dek: r.dek ?? "",
    body: r.body ?? "",
    category: isNewsCategory(r.category) ? r.category : "industry",
    status: (["draft", "scheduled", "published", "rejected"].includes(r.status) ? r.status : "draft") as StoryStatus,
    unconfirmed: r.unconfirmed || r.category === "rumor",
    sources: readSources(r.sources),
    cover: r.cover,
    coverKind: isCoverKind(r.cover_kind) ? r.cover_kind : null,
    coverCredit: readCredit(r.cover_credit),
    coverAlt: r.cover_alt ?? "",
    coverCandidates: readCandidates(r.cover_candidates),
    keyFacts: readKeyFacts(r.key_facts),
    pullQuote: readPullQuote(r.pull_quote),
    depth: isDepth(r.depth) ? r.depth : "short",
    wordCount: typeof r.word_count === "number" ? r.word_count : null,
    aiGenerated: r.ai_generated,
    model: r.model,
    writer: one(r.writer),
    editor: one(r.editor),
    publishedAt: r.published_at,
    featured: r.featured,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    rejectNote: r.reject_note ?? null,
  }
}

/** Words in a Markdown body, for the reading time and the length checks. */
export const countWords = (md: string) => md.replace(/[#>*_`[\]()-]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
/** Minutes to read at 230 words a minute, never less than one. */
export const readingMinutes = (s: Pick<Story, "body" | "wordCount">) => Math.max(1, Math.round((s.wordCount ?? countWords(s.body)) / 230))

export const storyHref = (s: Pick<Story, "slug">) => `/news/${s.slug}` as const

/** A readable address from a headline, with a short random tail so two stories never collide. */
export function makeSlug(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "")
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("")
  return `${base || "story"}-${tail}`
}

/** Slugs the story route accepts: lowercase letters, digits and inner hyphens. */
export const STORY_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,98})[a-z0-9]$/

// ─── Settings (site_settings key "newsroom") ────────────────────────────────────────────────────────────────

export type Tone = "neutral" | "explainer" | "technical" | "briefing"
export const TONES: { id: Tone; label: string; blurb: string }[] = [
  { id: "neutral", label: "Neutral news", blurb: "Plain, factual reporting. Who did what, and what it means." },
  { id: "explainer", label: "Explainer", blurb: "Takes time to explain the background and the terms for newcomers." },
  { id: "technical", label: "Technical", blurb: "For engineers: architecture, numbers, APIs and trade-offs up front." },
  { id: "briefing", label: "Briefing", blurb: "Tight and scannable: short paragraphs, more lists, fewer words." },
]
export const isTone = (v: unknown): v is Tone => TONES.some((t) => t.id === v)

/** Where covers may come from, tried in the editors' order; a generated cover always closes the list. */
export type CoverSource = "source" | "free" | "generated"
export const COVER_SOURCES: { id: CoverSource; label: string; blurb: string }[] = [
  { id: "source", label: "The source's own image", blurb: "The image the publisher set for sharing (og:image) or the article's first large picture." },
  { id: "free", label: "A free-licensed photo", blurb: "Openverse and Wikimedia Commons, with the creator and licence credited under the image." },
  { id: "generated", label: "A Nexverse cover", blurb: "Drawn by the site: the headline over a star field, with the N mark." },
]

export type CategorySetting = { id: NewsCategory; label: string; one: string; blurb: string; hidden: boolean }

export type NewsroomSettings = {
  /** Publish AI drafts of these categories without review. Rumours are always reviewed. */
  autoPublish: Record<Exclude<NewsCategory, "rumor">, boolean>
  /** Auto-publish only stories whose second-pass fact check ran and passed. */
  autoPublishNeedsCheck: boolean
  /** At most this many AI-written stories a day (UTC), drafts included. */
  dailyCap: number
  /** At most this many stories per collection run. */
  perRun: number
  /** Stop the daily collection without removing the cron. */
  paused: boolean
  /** Days of the week (0 = Sunday, UTC) the daily run writes on. Collect now works any day. */
  days: number[]
  /** How researched the AI's stories are. */
  depth: Depth
  /** The length the writer aims for, in words. Clamped to what the depth allows. */
  targetWords: number
  /** Stories per run written at the chosen depth; the rest of the run is written short. Saves free AI quota. */
  deepPerRun: number
  /** Related official pages read besides the main one (deep and standard). */
  relatedSources: number
  /** Run the second pass that checks every claim against the pages and removes what they do not support. */
  factCheck: boolean
  /** The section headings a standard or deep story follows, in order. */
  sections: string[]
  tone: Tone
  /** A house-style note for the writer, in the editors' words. */
  styleNote: string
  /** The six categories in display order, with the names and descriptions readers see. */
  categories: CategorySetting[]
  cover: {
    order: CoverSource[]
    /** Smallest width (px) a found image needs; 1000 or more looks sharp in the article hero. */
    minWidth: number
    /** Prefer wide images (16:9 to 2:1) over square or tall ones. */
    preferWide: boolean
  }
}

/** Length bands per depth, in words. */
export const DEPTH_WORDS: Record<Depth, { min: number; max: number; target: number }> = {
  short: { min: 150, max: 450, target: 300 },
  standard: { min: 400, max: 900, target: 650 },
  deep: { min: 700, max: 1600, target: 1000 },
}

export const DEFAULT_SECTIONS = ["What happened", "Why it matters", "How it works", "What changes for builders", "Open questions"]

export const NEWSROOM_DEFAULTS: NewsroomSettings = {
  autoPublish: { launch: false, research: false, policy: false, industry: false, tools: false },
  autoPublishNeedsCheck: true,
  dailyCap: 6,
  perRun: 3,
  paused: false,
  days: [0, 1, 2, 3, 4, 5, 6],
  depth: "deep",
  targetWords: DEPTH_WORDS.deep.target,
  deepPerRun: 1,
  relatedSources: 4,
  factCheck: true,
  sections: DEFAULT_SECTIONS,
  tone: "neutral",
  styleNote: "",
  categories: NEWS_CATEGORIES.map((c) => ({ id: c.id, label: c.label, one: c.one, blurb: c.blurb, hidden: false })),
  cover: { order: ["source", "free", "generated"], minWidth: 1000, preferWide: true },
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "")

/** Settings as saved, merged over the defaults so missing or odd fields fall back safely. */
export function readNewsroomSettings(v: unknown): NewsroomSettings {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const ap = (r.autoPublish && typeof r.autoPublish === "object" ? r.autoPublish : {}) as Record<string, unknown>
  const autoPublish = { ...NEWSROOM_DEFAULTS.autoPublish }
  for (const k of Object.keys(autoPublish) as (keyof typeof autoPublish)[]) autoPublish[k] = ap[k] === true
  const depth = isDepth(r.depth) ? r.depth : NEWSROOM_DEFAULTS.depth
  const band = DEPTH_WORDS[depth]
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : NEWSROOM_DEFAULTS.days
  const sections = Array.isArray(r.sections) ? r.sections.map((x) => line(x, 60)).filter(Boolean).slice(0, 8) : []
  // Categories: the six ids are fixed (the database knows them); names, descriptions, order and visibility are the editors'.
  const saved = Array.isArray(r.categories) ? (r.categories as unknown[]) : []
  const categories: CategorySetting[] = []
  for (const c of saved) {
    if (!c || typeof c !== "object") continue
    const o = c as Record<string, unknown>
    if (!isNewsCategory(o.id) || categories.some((x) => x.id === o.id)) continue
    const base = categoryInfo(o.id)
    categories.push({ id: o.id, label: line(o.label, 40) || base.label, one: line(o.one, 30) || base.one, blurb: line(o.blurb, 200) || base.blurb, hidden: o.hidden === true })
  }
  for (const c of NEWSROOM_DEFAULTS.categories) if (!categories.some((x) => x.id === c.id)) categories.push({ ...c })
  const cv = (r.cover && typeof r.cover === "object" ? r.cover : {}) as Record<string, unknown>
  const order = Array.isArray(cv.order) ? [...new Set(cv.order.filter((x): x is CoverSource => COVER_SOURCES.some((c) => c.id === x)))] : NEWSROOM_DEFAULTS.cover.order
  // The generated cover is always the last resort, so a story never goes out without one.
  const coverOrder = [...order.filter((x) => x !== "generated"), "generated" as const]
  return {
    autoPublish,
    autoPublishNeedsCheck: r.autoPublishNeedsCheck !== false,
    dailyCap: clampInt(r.dailyCap, 0, 30, NEWSROOM_DEFAULTS.dailyCap),
    perRun: clampInt(r.perRun, 1, 6, NEWSROOM_DEFAULTS.perRun),
    paused: r.paused === true,
    days,
    depth,
    targetWords: clampInt(r.targetWords, band.min, band.max, band.target),
    deepPerRun: clampInt(r.deepPerRun, 0, 3, NEWSROOM_DEFAULTS.deepPerRun),
    relatedSources: clampInt(r.relatedSources, 0, 4, NEWSROOM_DEFAULTS.relatedSources),
    factCheck: r.factCheck !== false,
    sections: sections.length >= 2 ? sections : DEFAULT_SECTIONS,
    tone: isTone(r.tone) ? r.tone : NEWSROOM_DEFAULTS.tone,
    styleNote: typeof r.styleNote === "string" ? r.styleNote.replace(/\u0000/g, "").trim().slice(0, 400) : "",
    categories,
    cover: { order: coverOrder, minWidth: clampInt(cv.minWidth, 400, 2400, NEWSROOM_DEFAULTS.cover.minWidth), preferWide: cv.preferWide !== false },
  }
}

/** The readers' names for each category, after the editors' changes. */
export type CategoryNames = Record<NewsCategory, { label: string; one: string; blurb: string; hidden: boolean }>
export function categoryNames(s: Pick<NewsroomSettings, "categories">): CategoryNames {
  const out = {} as CategoryNames
  for (const c of s.categories) out[c.id] = { label: c.label, one: c.one, blurb: c.blurb, hidden: c.hidden }
  return out
}

// ─── Sources, tips and runs ─────────────────────────────────────────────────────────────────────────────────

export type SourceKind = "rss" | "github_releases" | "arxiv_query" | "site"
export const SOURCE_KINDS: { id: SourceKind; label: string; blurb: string }[] = [
  { id: "rss", label: "RSS or Atom feed", blurb: "An official blog or changelog feed." },
  { id: "github_releases", label: "GitHub releases", blurb: "New releases of one repository." },
  { id: "site", label: "News page", blurb: "An official news page without a feed: article links under a path." },
  { id: "arxiv_query", label: "arXiv category", blurb: "New papers in one category. Internal signal only." },
]

export type NewsSource = {
  id: string
  kind: SourceKind
  label: string
  publisher: string
  url: string | null
  repo: string | null
  query: string | null
  categoryHint: NewsCategory | null
  internalOnly: boolean
  enabled: boolean
  lastChecked: string | null
  lastOk: boolean | null
  lastError: string | null
  lastCount: number | null
}

export const SOURCE_COLUMNS = "id, kind, label, publisher, url, repo, query, category_hint, internal_only, enabled, last_checked, last_ok, last_error, last_count"

export type SourceRow = {
  id: string
  kind: SourceKind
  label: string
  publisher: string
  url: string | null
  repo: string | null
  query: string | null
  category_hint: string | null
  internal_only: boolean
  enabled: boolean
  last_checked: string | null
  last_ok: boolean | null
  last_error: string | null
  last_count: number | null
}

export const toSource = (r: SourceRow): NewsSource => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  publisher: r.publisher,
  url: r.url,
  repo: r.repo,
  query: r.query,
  categoryHint: isNewsCategory(r.category_hint) ? r.category_hint : null,
  internalOnly: r.internal_only,
  enabled: r.enabled,
  lastChecked: r.last_checked,
  lastOk: r.last_ok,
  lastError: r.last_error,
  lastCount: r.last_count,
})

/** Where a source lives, for people: the feed, the repository or the arXiv listing. */
export function sourceAddress(s: Pick<NewsSource, "kind" | "url" | "repo" | "query">): string {
  if (s.kind === "github_releases") return `https://github.com/${s.repo}/releases`
  if (s.kind === "arxiv_query") return `https://arxiv.org/list/${s.query}/new`
  return s.url ?? ""
}

export type TipStatus = "new" | "used" | "dismissed"
export type Tip = { id: string; url: string | null; note: string; status: TipStatus; createdAt: string; member: Person | null; storyId: string | null }

export type Run = {
  id: number
  trigger: "cron" | "manual"
  status: "running" | "ok" | "partial" | "failed"
  sourcesChecked: number
  signalsNew: number
  drafts: number
  published: number
  rejected: number
  errors: { where: string; error: string }[]
  note: string
  startedAt: string
  finishedAt: string | null
  actor: Person | null
}

// ─── The editors' desk (browser) ────────────────────────────────────────────────────────────────────────────

function client() {
  const c = db()
  if (!c) throw new Error("The newsroom needs the database.")
  return c
}

type Failure = { code: string; message: string } | null

function newsError(error: Failure, fallback?: string) {
  if (error && isMissingSchema(error)) return "The newsroom is not set up on this database yet. The newsroom migration needs to be applied."
  return explain(error, fallback)
}

/** Writes one line to the moderation log. A missing log never blocks the action it describes. */
async function log(action: string, targetKind: string, targetId: string, note = "") {
  const { error } = await client().rpc("news_log", { action, target_kind: targetKind, target_id: targetId, note: note.slice(0, 500) })
  if (error) console.warn("[newsroom] log:", error.message)
}

export type QueueFilter = "draft" | "scheduled" | "published" | "rejected"

export async function listStories(status: QueueFilter, limit = 60): Promise<{ stories: Story[]; error: string | null }> {
  const c = db()
  if (!c) return { stories: [], error: null }
  const run = (cols: string) => {
    const q = c.from("news_stories").select(cols).eq("status", status).limit(limit)
    return status === "draft" || status === "rejected" ? q.order("created_at", { ascending: false }) : q.order("published_at", { ascending: false })
  }
  let { data, error } = await run(EDIT_COLUMNS)
  if (error && isMissingColumn(error)) ({ data, error } = await run(LEGACY_STORY_COLUMNS))
  if (error) return { stories: [], error: newsError(error) }
  return { stories: (data as unknown as StoryRow[]).map(toStory), error: null }
}

export async function getStoryForEdit(id: string): Promise<Story | null> {
  const read = (cols: string) => client().from("news_stories").select(cols).eq("id", id).maybeSingle()
  let { data, error } = await read(EDIT_COLUMNS)
  if (error && isMissingColumn(error)) ({ data, error } = await read(LEGACY_STORY_COLUMNS))
  if (error) throw new Error(newsError(error))
  return data ? toStory(data as unknown as StoryRow) : null
}

export type StoryDraft = {
  title: string
  dek: string
  body: string
  category: NewsCategory
  unconfirmed: boolean
  cover: string
  coverKind: CoverKind | null
  coverCredit: CoverCredit | null
  coverAlt: string
  keyFacts: KeyFact[]
  pullQuote: PullQuote | null
  sources: StorySource[]
}

export type DraftErrors = Partial<Record<keyof StoryDraft | "form", string>>

const HTTPS = /^https:\/\/[^\s]{4,600}$/

/** The same limits the database enforces, as sentences next to the fields. */
export function checkDraft(d: StoryDraft): DraftErrors {
  const e: DraftErrors = {}
  const title = d.title.trim()
  if (title.length < 8) e.title = "Write a headline of at least 8 characters."
  else if (title.length > 140) e.title = "Keep the headline under 140 characters."
  if (d.dek.trim().length > 320) e.dek = "Keep the summary under 320 characters."
  if (d.body.trim().length < 80) e.body = "Write at least a short paragraph (80 characters)."
  else if (d.body.length > 20000) e.body = "The story is too long (20,000 characters at most)."
  if (d.cover.trim() && !HTTPS.test(d.cover.trim())) e.cover = "Use a full https:// image address, or leave it empty."
  else if (d.coverAlt.length > 300) e.cover = "Keep the image description under 300 characters."
  if (!d.sources.length) e.sources = "Every story cites at least one source."
  else if (d.sources.some((s) => !HTTPS.test(s.url))) e.sources = "Each source needs a full https:// address."
  else if (d.sources.length > 12) e.sources = "Twelve sources at most."
  if (d.keyFacts.length > 12) e.keyFacts = "Twelve key facts at most."
  else if (d.keyFacts.some((f) => f.source !== null && (f.source < 1 || f.source > d.sources.length))) e.keyFacts = "A key fact points to a source number that is not in the list."
  if (d.pullQuote && d.pullQuote.text.length > 400) e.pullQuote = "Keep the pull quote under 400 characters."
  return e
}

/** The pre-migration columns, and the long-form ones on top. */
function draftRow(d: StoryDraft, legacy = false) {
  const cover = d.cover.trim()
  const base = {
    title: d.title.trim(),
    dek: d.dek.trim(),
    body: d.body.trim(),
    category: d.category,
    unconfirmed: d.category === "rumor" ? true : d.unconfirmed,
    cover: cover || null,
    sources: d.sources.map((s) => {
      const out: Record<string, unknown> = { url: s.url.trim(), title: s.title.trim().slice(0, 300), publisher: s.publisher.trim().slice(0, 80) }
      if (s.excerpt) out.excerpt = s.excerpt.slice(0, 400)
      if (s.publishedAt) out.publishedAt = s.publishedAt
      return out
    }),
  }
  if (legacy) return base
  return {
    ...base,
    cover_kind: cover ? (d.coverKind && d.coverKind !== "generated" ? d.coverKind : "editor") : d.coverKind === "generated" ? "generated" : null,
    cover_credit: cover ? d.coverCredit : null,
    cover_alt: d.coverAlt.trim().slice(0, 300) || null,
    key_facts: d.keyFacts.filter((f) => f.text.trim()).map((f) => ({ text: f.text.trim().slice(0, 400), source: f.source })),
    pull_quote: d.pullQuote && d.pullQuote.text.trim() ? { text: d.pullQuote.text.trim().slice(0, 400), source: d.pullQuote.source } : null,
    word_count: countWords(d.body),
  }
}

/** A story an editor writes by hand. It starts as a draft. */
export async function createStory(d: StoryDraft): Promise<Story> {
  const write = (legacy: boolean) =>
    client()
      .from("news_stories")
      .insert({ ...draftRow(d, legacy), slug: makeSlug(d.title), status: "draft", ai_generated: false })
      .select(legacy ? LEGACY_STORY_COLUMNS : EDIT_COLUMNS)
      .single()
  let { data, error } = await write(false)
  if (error && isMissingColumn(error)) ({ data, error } = await write(true))
  if (error) throw new Error(newsError(error))
  const s = toStory(data as unknown as StoryRow)
  await log("news_create", "news_story", s.id, s.title)
  return s
}

export async function updateStory(id: string, d: StoryDraft): Promise<Story> {
  const write = (legacy: boolean) =>
    client()
      .from("news_stories")
      .update(draftRow(d, legacy))
      .eq("id", id)
      .select(legacy ? LEGACY_STORY_COLUMNS : EDIT_COLUMNS)
      .single()
  let { data, error } = await write(false)
  if (error && isMissingColumn(error)) ({ data, error } = await write(true))
  if (error) throw new Error(newsError(error))
  const s = toStory(data as unknown as StoryRow)
  await log("news_edit", "news_story", id, s.title)
  return s
}

/** Swap a story's cover for one of its candidates (or the generated one), with its credit and description. */
export async function setStoryCover(story: Pick<Story, "id" | "title">, c: { url: string; kind: CoverKind; credit: CoverCredit | null; alt: string }) {
  const { error } = await client()
    .from("news_stories")
    .update({ cover: c.kind === "generated" ? null : c.url, cover_kind: c.kind, cover_credit: c.kind === "generated" ? null : c.credit, cover_alt: c.alt.slice(0, 300) || null })
    .eq("id", story.id)
  if (error) throw new Error(isMissingColumn(error) ? "Cover choices need the newsroom update (migration 20261019134000) to be applied." : newsError(error))
  await log("news_cover", "news_story", story.id, `${c.kind}: ${c.url || "generated"}`.slice(0, 300))
}

/** Keep the covers a search found with the story, so the gallery shows them next time. */
export async function saveCoverCandidates(id: string, candidates: CoverCandidate[]) {
  const { error } = await client().from("news_stories").update({ cover_candidates: candidates.slice(0, 24) }).eq("id", id)
  if (error && !isMissingColumn(error)) throw new Error(newsError(error))
}

export type FactCheck = {
  verified: number
  dropped: { claim: string; why: string }[]
  removed: { text: string; why: string }[]
  unconfirmed: string[]
  steps: string[]
  sources: number
  checked: boolean
  note: string
}

/** The second-pass fact check of an AI story, for its editor. Null when there is none (hand-written, or older). */
export async function loadFactCheck(storyId: string): Promise<{ report: FactCheck; model: string | null } | null> {
  const c = db()
  if (!c) return null
  const { data, error } = await c.from("news_checks").select("report, model").eq("story_id", storyId).maybeSingle()
  if (error || !data) return null
  const r = (data as { report: Record<string, unknown>; model: string | null }).report ?? {}
  const list = <T,>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] =>
    Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? f(x as Record<string, unknown>) : typeof x === "string" ? f({ text: x, claim: x }) : null)).filter((x): x is T => x !== null).slice(0, 40) : []
  return {
    model: (data as { model: string | null }).model,
    report: {
      verified: typeof r.verified === "number" ? r.verified : 0,
      dropped: list(r.dropped, (x) => (typeof x.claim === "string" ? { claim: x.claim, why: String(x.why ?? "") } : null)),
      removed: list(r.removed, (x) => (typeof x.text === "string" ? { text: x.text, why: String(x.why ?? "") } : null)),
      unconfirmed: list(r.unconfirmed, (x) => (typeof x.text === "string" ? x.text : null)),
      steps: Array.isArray(r.steps) ? r.steps.filter((x): x is string => typeof x === "string") : [],
      sources: typeof r.sources === "number" ? r.sources : 0,
      checked: r.checked === true,
      note: typeof r.note === "string" ? r.note : "",
    },
  }
}

/** Publish now, schedule for later, send back to drafts, or reject with a note. */
export async function setStoryStatus(id: string, status: StoryStatus, { at, note = "" }: { at?: string; note?: string } = {}): Promise<Story> {
  const patch: Record<string, unknown> = { status }
  if (status === "published") patch.published_at = new Date().toISOString()
  if (status === "scheduled") {
    if (!at || !Number.isFinite(Date.parse(at))) throw new Error("Pick a date and time to publish.")
    patch.published_at = new Date(at).toISOString()
  }
  if (status === "draft") patch.published_at = null
  if (status === "rejected") {
    patch.reject_note = note.trim().slice(0, 300) || null
    patch.featured = false
  }
  const write = (cols: string) => client().from("news_stories").update(patch).eq("id", id).select(cols).single()
  let { data, error } = await write(EDIT_COLUMNS)
  if (error && isMissingColumn(error)) ({ data, error } = await write(LEGACY_STORY_COLUMNS))
  if (error) throw new Error(newsError(error))
  const s = toStory(data as unknown as StoryRow)
  const action = status === "published" ? "news_publish" : status === "scheduled" ? "news_schedule" : status === "rejected" ? "news_reject" : "news_unpublish"
  await log(action, "news_story", id, status === "rejected" ? note : status === "scheduled" ? `for ${patch.published_at}` : s.title)
  return s
}

/** One featured story leads /news ("Nexverse Exclusive"). */
export async function setFeatured(id: string, featured: boolean) {
  const { error } = await client().from("news_stories").update({ featured }).eq("id", id)
  if (error) throw new Error(newsError(error))
  await log(featured ? "news_feature" : "news_unfeature", "news_story", id)
}

export async function deleteStory(id: string, title: string) {
  const { error } = await client().from("news_stories").delete().eq("id", id)
  if (error) throw new Error(newsError(error))
  await log("news_delete", "news_story", id, title)
}

export async function listSources(): Promise<{ sources: NewsSource[]; error: string | null }> {
  const c = db()
  if (!c) return { sources: [], error: null }
  const { data, error } = await c.from("news_sources").select(SOURCE_COLUMNS).order("kind").order("label")
  if (error) return { sources: [], error: newsError(error) }
  return { sources: (data as SourceRow[]).map(toSource), error: null }
}

export type NewSource = { kind: SourceKind; label: string; publisher: string; url: string; repo: string; query: string; categoryHint: NewsCategory | null }

export function checkSource(s: NewSource): Partial<Record<keyof NewSource, string>> {
  const e: Partial<Record<keyof NewSource, string>> = {}
  if (s.label.trim().length < 2) e.label = "Give the source a name."
  if ((s.kind === "rss" || s.kind === "site") && !HTTPS.test(s.url.trim())) e.url = "Use the full https:// address."
  if (s.kind === "github_releases" && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(s.repo.trim())) e.repo = "Write it as owner/name, for example ollama/ollama."
  if (s.kind === "site" && !/^\/[\w./-]{1,100}$/.test(s.query.trim())) e.query = "The path article links start with, for example /news/."
  if (s.kind === "arxiv_query" && !/^[a-z-]{2,12}(\.[A-Za-z-]{2,6})?$/.test(s.query.trim())) e.query = "An arXiv category such as cs.CL."
  return e
}

export async function addSource(s: NewSource): Promise<NewsSource> {
  const row = {
    kind: s.kind,
    label: s.label.trim(),
    publisher: s.publisher.trim(),
    url: s.kind === "rss" || s.kind === "site" ? s.url.trim() : null,
    repo: s.kind === "github_releases" ? s.repo.trim() : null,
    query: s.kind === "site" || s.kind === "arxiv_query" ? s.query.trim() : null,
    category_hint: s.categoryHint,
    internal_only: s.kind === "arxiv_query",
  }
  const { data, error } = await client().from("news_sources").insert(row).select(SOURCE_COLUMNS).single()
  if (error) throw new Error(newsError(error))
  const out = toSource(data as SourceRow)
  await log("news_source_add", "news_source", out.id, out.label)
  return out
}

export async function setSourceEnabled(id: string, enabled: boolean, label: string) {
  const { error } = await client().from("news_sources").update({ enabled }).eq("id", id)
  if (error) throw new Error(newsError(error))
  await log(enabled ? "news_source_on" : "news_source_off", "news_source", id, label)
}

export async function removeSource(id: string, label: string) {
  const { error } = await client().from("news_sources").delete().eq("id", id)
  if (error) throw new Error(newsError(error))
  await log("news_source_remove", "news_source", id, label)
}

type TipRow = { id: string; url: string | null; note: string; status: TipStatus; created_at: string; story_id: string | null; member: Person | Person[] | null }

export async function listTips(status: TipStatus, limit = 60): Promise<{ tips: Tip[]; error: string | null }> {
  const c = db()
  if (!c) return { tips: [], error: null }
  const { data, error } = await c
    .from("news_tips")
    .select("id, url, note, status, created_at, story_id, member:profiles!news_tips_member_id_fkey(id, name, handle)")
    .eq("status", status)
    .order("created_at", { ascending: status === "new" })
    .limit(limit)
  if (error) return { tips: [], error: newsError(error) }
  return {
    tips: (data as unknown as TipRow[]).map((r) => ({ id: r.id, url: r.url, note: r.note, status: r.status, createdAt: r.created_at, storyId: r.story_id, member: one(r.member) })),
    error: null,
  }
}

export async function setTipStatus(id: string, status: TipStatus, by: string, storyId?: string) {
  const patch: Record<string, unknown> = { status, handled_by: status === "new" ? null : by, handled_at: status === "new" ? null : new Date().toISOString() }
  if (storyId) patch.story_id = storyId
  const { error } = await client().from("news_tips").update(patch).eq("id", id)
  if (error) throw new Error(newsError(error))
  await log(status === "dismissed" ? "news_tip_dismiss" : status === "used" ? "news_tip_use" : "news_tip_reopen", "news_tip", id)
}

/** A member's tip. Needs news.tip; the database also limits tips to ten a day. */
export async function sendTip({ url, note }: { url: string; note: string }) {
  const c = client()
  const { data } = await c.auth.getSession()
  if (!data.session) throw new Error("Sign in to send a tip.")
  const link = url.trim()
  if (link && !HTTPS.test(link)) throw new Error("Use a full https:// link, or leave the link empty.")
  if (note.trim().length < 10) throw new Error("Tell the editors a little more (at least 10 characters).")
  const { error } = await c.from("news_tips").insert({ url: link || null, note: note.trim().slice(0, 2000), member_id: data.session.user.id })
  if (error) throw new Error(newsError(error))
}

type RunRow = {
  id: number
  trigger: Run["trigger"]
  status: Run["status"]
  sources_checked: number
  signals_new: number
  drafts: number
  published: number
  rejected: number
  errors: unknown
  note: string
  started_at: string
  finished_at: string | null
  actor: Person | Person[] | null
}

export async function listRuns(limit = 12): Promise<{ runs: Run[]; error: string | null }> {
  const c = db()
  if (!c) return { runs: [], error: null }
  const { data, error } = await c
    .from("news_runs")
    .select("id, trigger, status, sources_checked, signals_new, drafts, published, rejected, errors, note, started_at, finished_at, actor:profiles!news_runs_actor_id_fkey(id, name, handle)")
    .order("started_at", { ascending: false })
    .limit(limit)
  if (error) return { runs: [], error: newsError(error) }
  return {
    runs: (data as unknown as RunRow[]).map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      sourcesChecked: r.sources_checked,
      signalsNew: r.signals_new,
      drafts: r.drafts,
      published: r.published,
      rejected: r.rejected,
      errors: Array.isArray(r.errors) ? (r.errors as Run["errors"]).slice(0, 30) : [],
      note: r.note,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      actor: one(r.actor),
    })),
    error: null,
  }
}

export async function loadNewsroomSettings(): Promise<NewsroomSettings> {
  const c = db()
  if (!c) return NEWSROOM_DEFAULTS
  const { data } = await c.from("site_settings").select("value").eq("key", "newsroom").maybeSingle()
  return readNewsroomSettings((data as { value?: unknown } | null)?.value)
}

export async function saveNewsroomSettings(s: NewsroomSettings) {
  const { error } = await client().from("site_settings").upsert({ key: "newsroom", value: readNewsroomSettings(s) })
  if (error) throw new Error(newsError(error))
  await log("news_settings", "site_settings", "newsroom", `depth ${s.depth} (~${s.targetWords} words, ${s.deepPerRun}/run); tone ${s.tone}; auto-publish: ${Object.entries(s.autoPublish).filter(([, on]) => on).map(([k]) => k).join(", ") || "none"}; cap ${s.dailyCap}/day; covers ${s.cover.order.join(" > ")}`)
}

// ─── Server routes, called with the editor's own session ────────────────────────────────────────────────────

export class NewsroomApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function api<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await client().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new NewsroomApiError("Sign in again to use the newsroom.", 401)
  let res: Response
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: "no-store" })
  } catch {
    throw new NewsroomApiError("Could not reach the server. Check your connection and try again.", 0)
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) throw new NewsroomApiError(json?.error?.message ?? `The server answered ${res.status}.`, res.status)
  return json as T
}

export type RunSummary = {
  runId: number | null
  status: Run["status"]
  sourcesChecked: number
  signalsNew: number
  drafts: number
  published: number
  rejected: number
  /** Stories written at standard or deep depth. */
  deep: number
  aiReady: boolean
  note: string
  errors: Run["errors"]
}

/** "Collect now": the same pipeline as the daily cron, run with this editor's session. */
export const collectNow = () => api<RunSummary>("/api/newsroom/run")

export type DraftResult = { story: { id: string; slug: string; title: string }; depth: Depth; words: number; checked: boolean; note: string }

/**
 * Fetch an official page (a tip, a link the editor found), research it with the related official pages it
 * points to, and have the free AI write a story at the chosen depth. Always a draft.
 */
export const draftFromLink = (url: string, note: string, { tipId, depth }: { tipId?: string; depth?: Depth } = {}) =>
  api<DraftResult>("/api/newsroom/draft", { url, note, tipId, depth })

/** Research an existing draft again from its sources and rewrite it in place, at the chosen depth. */
export const rewriteStory = (storyId: string, depth: Depth, note = "") => api<DraftResult>("/api/newsroom/draft", { storyId, depth, note })

/** Covers for a story: the source pages' images, free-licensed photos for a search, and the generated cover. */
export const searchCovers = (storyId: string, query: string) => api<{ candidates: CoverCandidate[]; query: string; errors: string[] }>("/api/newsroom/covers", { storyId, query })

/** Fetch one source now and show what it would give, without saving anything. */
export const testSource = (id: string) => api<{ ok: boolean; count: number; sample: { title: string; url: string; publishedAt: string | null }[]; error: string | null }>("/api/newsroom/test-source", { id })

/** After a publish or an edit: refresh the public pages now instead of within the minute. */
export function refreshPublicNews() {
  void api("/api/newsroom/revalidate").catch(() => {})
}
