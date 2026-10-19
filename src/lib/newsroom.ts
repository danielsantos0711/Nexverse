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

export type StorySource = { url: string; title: string; publisher: string }

export type Person = { id: string; name: string; handle: string | null }

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

/** The columns every story read selects, with the writer's and editor's names. */
export const STORY_COLUMNS =
  "id, slug, title, dek, body, category, status, unconfirmed, sources, cover, ai_generated, model, published_at, featured, created_at, updated_at, reject_note, writer:profiles!news_stories_written_by_fkey(id, name, handle), editor:profiles!news_stories_edited_by_fkey(id, name, handle)"

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

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** Sources as stored, keeping only well-formed https entries. */
export function readSources(v: unknown): StorySource[] {
  if (!Array.isArray(v)) return []
  const out: StorySource[] = []
  for (const s of v) {
    if (!s || typeof s !== "object") continue
    const r = s as Record<string, unknown>
    const url = typeof r.url === "string" && /^https:\/\/\S+$/.test(r.url) ? r.url : ""
    if (!url) continue
    out.push({ url, title: typeof r.title === "string" ? r.title.slice(0, 300) : "", publisher: typeof r.publisher === "string" ? r.publisher.slice(0, 80) : "" })
  }
  return out.slice(0, 12)
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

export type NewsroomSettings = {
  /** Publish AI drafts of these categories without review. Rumours are always reviewed. */
  autoPublish: Record<Exclude<NewsCategory, "rumor">, boolean>
  /** At most this many AI-written stories a day (UTC), drafts included. */
  dailyCap: number
  /** At most this many stories per collection run. */
  perRun: number
  /** Stop the daily collection without removing the cron. */
  paused: boolean
}

export const NEWSROOM_DEFAULTS: NewsroomSettings = {
  autoPublish: { launch: false, research: false, policy: false, industry: false, tools: false },
  dailyCap: 6,
  perRun: 3,
  paused: false,
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

/** Settings as saved, merged over the defaults so missing or odd fields fall back safely. */
export function readNewsroomSettings(v: unknown): NewsroomSettings {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const ap = (r.autoPublish && typeof r.autoPublish === "object" ? r.autoPublish : {}) as Record<string, unknown>
  const autoPublish = { ...NEWSROOM_DEFAULTS.autoPublish }
  for (const k of Object.keys(autoPublish) as (keyof typeof autoPublish)[]) autoPublish[k] = ap[k] === true
  return {
    autoPublish,
    dailyCap: clampInt(r.dailyCap, 0, 30, NEWSROOM_DEFAULTS.dailyCap),
    perRun: clampInt(r.perRun, 1, 6, NEWSROOM_DEFAULTS.perRun),
    paused: r.paused === true,
  }
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
  let q = c.from("news_stories").select(STORY_COLUMNS).eq("status", status).limit(limit)
  q = status === "draft" || status === "rejected" ? q.order("created_at", { ascending: false }) : q.order("published_at", { ascending: false })
  const { data, error } = await q
  if (error) return { stories: [], error: newsError(error) }
  return { stories: (data as unknown as StoryRow[]).map(toStory), error: null }
}

export async function getStoryForEdit(id: string): Promise<Story | null> {
  const { data, error } = await client().from("news_stories").select(STORY_COLUMNS).eq("id", id).maybeSingle()
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
  if (!d.sources.length) e.sources = "Every story cites at least one source."
  else if (d.sources.some((s) => !HTTPS.test(s.url))) e.sources = "Each source needs a full https:// address."
  else if (d.sources.length > 12) e.sources = "Twelve sources at most."
  return e
}

function draftRow(d: StoryDraft) {
  return {
    title: d.title.trim(),
    dek: d.dek.trim(),
    body: d.body.trim(),
    category: d.category,
    unconfirmed: d.category === "rumor" ? true : d.unconfirmed,
    cover: d.cover.trim() || null,
    sources: d.sources.map((s) => ({ url: s.url.trim(), title: s.title.trim().slice(0, 300), publisher: s.publisher.trim().slice(0, 80) })),
  }
}

/** A story an editor writes by hand. It starts as a draft. */
export async function createStory(d: StoryDraft): Promise<Story> {
  const { data, error } = await client()
    .from("news_stories")
    .insert({ ...draftRow(d), slug: makeSlug(d.title), status: "draft", ai_generated: false })
    .select(STORY_COLUMNS)
    .single()
  if (error) throw new Error(newsError(error))
  const s = toStory(data as unknown as StoryRow)
  await log("news_create", "news_story", s.id, s.title)
  return s
}

export async function updateStory(id: string, d: StoryDraft): Promise<Story> {
  const { data, error } = await client().from("news_stories").update(draftRow(d)).eq("id", id).select(STORY_COLUMNS).single()
  if (error) throw new Error(newsError(error))
  const s = toStory(data as unknown as StoryRow)
  await log("news_edit", "news_story", id, s.title)
  return s
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
  const { data, error } = await client().from("news_stories").update(patch).eq("id", id).select(STORY_COLUMNS).single()
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
  await log("news_settings", "site_settings", "newsroom", `auto-publish: ${Object.entries(s.autoPublish).filter(([, on]) => on).map(([k]) => k).join(", ") || "none"}; cap ${s.dailyCap}/day`)
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
  aiReady: boolean
  note: string
  errors: Run["errors"]
}

/** "Collect now": the same pipeline as the daily cron, run with this editor's session. */
export const collectNow = () => api<RunSummary>("/api/newsroom/run")

/** Fetch an official page (a tip, a link the editor found) and have the free AI draft a story from it. */
export const draftFromLink = (url: string, note: string, tipId?: string) => api<{ story: { id: string; slug: string; title: string } }>("/api/newsroom/draft", { url, note, tipId })

/** Fetch one source now and show what it would give, without saving anything. */
export const testSource = (id: string) => api<{ ok: boolean; count: number; sample: { title: string; url: string; publishedAt: string | null }[]; error: string | null }>("/api/newsroom/test-source", { id })

/** After a publish or an edit: refresh the public pages now instead of within the minute. */
export function refreshPublicNews() {
  void api("/api/newsroom/revalidate").catch(() => {})
}
