import { isNewsCategory, type NewsCategory } from "@/lib/newsroom"

/*
 * The research engine's shared vocabulary: desks (the editorial categories, read from the database), the five
 * evidence levels, the engine's settings (frequency, limits, per-stage models, editorial rules), and the shapes
 * of jobs, leads, decisions and model use. Pure data and pure functions with no secrets and no network, so the
 * admin page (browser) and the engine (server) read the same definitions.
 */

// ─── Evidence ───────────────────────────────────────────────────────────────────────────────────────────────

/** Daniel's five levels, strongest first. */
export type EvidenceLevel = "confirmed" | "observed" | "technical" | "plausible" | "rumor"

export const EVIDENCE_LEVELS: { id: EvidenceLevel; label: string; short: string; blurb: string; rank: number }[] = [
  { id: "confirmed", label: "Officially confirmed", short: "Confirmed", blurb: "The company, lab or institution involved says so in its own words.", rank: 5 },
  { id: "observed", label: "Observed in public sources", short: "Observed", blurb: "Directly seen in a public, original source: a release, a repository, a document, a record.", rank: 4 },
  { id: "technical", label: "Sustained technical evidence", short: "Technical evidence", blurb: "Several independent technical traces point the same way, but nothing is announced.", rank: 3 },
  { id: "plausible", label: "Plausible, not confirmed", short: "Plausible", blurb: "A reasonable reading of the evidence that the people involved have not confirmed.", rank: 2 },
  { id: "rumor", label: "Rumour without enough evidence", short: "Rumour", blurb: "Claims without evidence strong enough to report. The newsroom does not publish these.", rank: 1 },
]

export const isEvidence = (v: unknown): v is EvidenceLevel => typeof v === "string" && EVIDENCE_LEVELS.some((e) => e.id === v)
export const evidenceInfo = (id: EvidenceLevel) => EVIDENCE_LEVELS.find((e) => e.id === id)!
export const evidenceRank = (id: EvidenceLevel | null | undefined) => (id ? evidenceInfo(id).rank : 0)

export type Availability = "available" | "announced" | "planned" | "unknown"
export const AVAILABILITY: { id: Availability; label: string }[] = [
  { id: "available", label: "Available now" },
  { id: "announced", label: "Announced, not yet available" },
  { id: "planned", label: "Planned" },
  { id: "unknown", label: "Availability not stated" },
]
export const isAvailability = (v: unknown): v is Availability => typeof v === "string" && AVAILABILITY.some((a) => a.id === v)

// ─── Desks ──────────────────────────────────────────────────────────────────────────────────────────────────

/** How a desk researches. Every part is optional; the scouts skip what is not set. */
export type DeskMethods = {
  github?: { rising?: boolean; topics?: string[]; queries?: string[]; watchRepos?: string[] }
  arxiv?: { categories?: string[]; queries?: string[] }
  hf?: { models?: boolean; datasets?: boolean; tasks?: string[] }
  federal?: { terms?: string[] }
  gdelt?: { queries?: string[] }
  hn?: { enabled?: boolean; minPoints?: number }
  /** Words that place a signal on this desk when a scout found it without one. */
  keywords?: string[]
  /** The desk reads the leak watchers' findings. */
  watch?: boolean
}

export type Desk = {
  id: string
  label: string
  one: string
  blurb: string
  scope: string
  audience: string
  kind: NewsCategory
  priority: number
  enabled: boolean
  hidden: boolean
  leakTrack: boolean
  autoPublish: boolean
  minScore: number
  methods: DeskMethods
  tint: string | null
  sort: number
}

export type DeskRow = {
  id: string
  label: string
  one: string
  blurb: string
  scope: string
  audience: string
  kind: string
  priority: number
  enabled: boolean
  hidden: boolean
  leak_track: boolean
  auto_publish: boolean
  min_score: number
  methods: unknown
  tint: string | null
  sort: number
}

export const DESK_COLUMNS = "id, label, one, blurb, scope, audience, kind, priority, enabled, hidden, leak_track, auto_publish, min_score, methods, tint, sort"

const strs = (v: unknown, max: number, each: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, each)).filter(Boolean))].slice(0, max) : []

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Methods as stored, kept to safe shapes and sizes. */
export function readMethods(v: unknown): DeskMethods {
  const r = obj(v)
  const out: DeskMethods = {}
  const gh = obj(r.github)
  if (Object.keys(gh).length)
    out.github = {
      rising: gh.rising === true,
      topics: strs(gh.topics, 12, 50).filter((t) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)),
      queries: strs(gh.queries, 8, 120),
      watchRepos: strs(gh.watchRepos, 20, 140).filter((t) => /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(t)),
    }
  const ax = obj(r.arxiv)
  if (Object.keys(ax).length)
    out.arxiv = { categories: strs(ax.categories, 8, 20).filter((c) => /^[a-z-]{2,12}(\.[A-Za-z-]{2,6})?$/.test(c)), queries: strs(ax.queries, 8, 120) }
  const hf = obj(r.hf)
  if (Object.keys(hf).length) out.hf = { models: hf.models === true, datasets: hf.datasets === true, tasks: strs(hf.tasks, 8, 40) }
  const fed = obj(r.federal)
  if (Object.keys(fed).length) out.federal = { terms: strs(fed.terms, 6, 80) }
  const gd = obj(r.gdelt)
  if (Object.keys(gd).length) out.gdelt = { queries: strs(gd.queries, 6, 120) }
  const hn = obj(r.hn)
  if (Object.keys(hn).length) out.hn = { enabled: hn.enabled === true, minPoints: typeof hn.minPoints === "number" ? Math.min(2000, Math.max(20, Math.round(hn.minPoints))) : 150 }
  const kw = strs(r.keywords, 40, 40)
  if (kw.length) out.keywords = kw
  if (r.watch === true) out.watch = true
  return out
}

export function toDesk(r: DeskRow): Desk {
  return {
    id: r.id,
    label: r.label,
    one: r.one || r.label,
    blurb: r.blurb,
    scope: r.scope,
    audience: r.audience || "readers of Nexverse",
    kind: isNewsCategory(r.kind) ? r.kind : "industry",
    priority: r.priority,
    enabled: r.enabled,
    hidden: r.hidden,
    leakTrack: r.leak_track,
    autoPublish: r.auto_publish,
    minScore: r.min_score,
    methods: readMethods(r.methods),
    tint: r.tint,
    sort: r.sort,
  }
}

/** The database row for a desk an editor saved. */
export function deskRow(d: Desk): DeskRow {
  return {
    id: d.id,
    label: d.label.trim().slice(0, 40),
    one: d.one.trim().slice(0, 30),
    blurb: d.blurb.trim().slice(0, 240),
    scope: d.scope.trim().slice(0, 2000),
    audience: d.audience.trim().slice(0, 200),
    kind: d.kind,
    priority: Math.min(5, Math.max(0, Math.round(d.priority))),
    enabled: d.enabled,
    hidden: d.hidden,
    leak_track: d.leakTrack,
    auto_publish: d.autoPublish && !d.leakTrack,
    min_score: Math.min(100, Math.max(0, Math.round(d.minScore))),
    methods: readMethods(d.methods),
    tint: d.tint && /^#[0-9a-f]{6}$/.test(d.tint) ? d.tint : null,
    sort: Math.round(d.sort),
  }
}

export const DESK_ID = /^[a-z][a-z0-9-]{1,30}$/

/** The desks when the database does not have them yet: the six categories, as the stories table knows them. */
export const FALLBACK_DESKS: Desk[] = (
  [
    ["launch", "Launches", "Launch", "New models, products and features that shipped.", "#8fb4ff"],
    ["research", "Research", "Research", "Results and methods from labs and universities.", "#9fe3cf"],
    ["policy", "Policy", "Policy", "Rules, safety commitments and what governments decided.", "#d8c59e"],
    ["industry", "Industry", "Industry", "Deals, partnerships, offices and the business of AI.", "#d3b4ff"],
    ["tools", "Tools", "Tools", "Releases of the frameworks and runtimes people build with.", "#e9c79a"],
    ["rumor", "Leaks & early signals", "Leak", "Reported or spotted early, not confirmed. Always labelled, always sourced.", "#f0a3a3"],
  ] as const
).map(([id, label, one, blurb, tint], i) => ({
  id,
  label,
  one,
  blurb,
  scope: blurb,
  audience: "people who build with AI",
  kind: id,
  priority: 3,
  enabled: true,
  hidden: false,
  leakTrack: id === "rumor",
  autoPublish: false,
  minScore: 65,
  methods: {},
  tint,
  sort: (i + 1) * 10,
}))

// ─── Stages and models ──────────────────────────────────────────────────────────────────────────────────────

/** The engine's model steps. Each can use its own model. */
export type Stage = "planner" | "triage" | "research" | "write" | "factcheck" | "update" | "editor"

export const STAGES: { id: Stage; label: string; blurb: string; hard: boolean; job: string }[] = [
  { id: "planner", label: "Planner", blurb: "Decides where each desk investigates next: which searches to run, which leads to follow.", hard: false, job: "research" },
  { id: "triage", label: "Triage", blurb: "Judges every discovery: impact, originality, announced or available, duplicate or update, and why.", hard: false, job: "triage" },
  { id: "research", label: "Research", blurb: "Reads the original sources and lists verified facts with the exact passages behind them.", hard: true, job: "research" },
  { id: "write", label: "Writer", blurb: "Writes the article from the verified facts only, with citations.", hard: true, job: "news" },
  { id: "factcheck", label: "Fact check", blurb: "Second pass: removes every sentence the sources do not support.", hard: true, job: "factcheck" },
  { id: "update", label: "Updates", blurb: "Writes the timeline entry when a published story develops.", hard: true, job: "news" },
  { id: "editor", label: "Editor", blurb: "Sensitivity check, SEO, and charts built from verified numbers.", hard: false, job: "editor" },
]

export const isStage = (v: unknown): v is Stage => typeof v === "string" && STAGES.some((s) => s.id === v)

export type PremiumProvider = "anthropic" | "openrouter"

/** Optional paid models. Off unless an admin switches a stage on and the server has the provider's key. */
export const PREMIUM_PROVIDERS: { id: PremiumProvider; label: string; env: string; signup: string; blurb: string }[] = [
  {
    id: "anthropic",
    label: "Anthropic (paid)",
    env: "ANTHROPIC_API_KEY",
    signup: "https://platform.claude.com/settings/keys",
    blurb: "Claude models billed per token to the key's account. Prices below are Anthropic's list prices per million tokens.",
  },
  {
    id: "openrouter",
    label: "OpenRouter paid models",
    env: "NEWSROOM_OPENROUTER_PAID_KEY",
    signup: "https://openrouter.ai/settings/keys",
    blurb: "Any paid model on OpenRouter, billed to the key's credits. Uses its own key, separate from the free OPENROUTER_API_KEY.",
  },
]

export type PremiumModel = { id: string; label: string; inUsd: number; outUsd: number; notes: string }

/** Anthropic's current models and list prices in US dollars per million tokens (input, output), October 2026. */
export const ANTHROPIC_MODELS: PremiumModel[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", inUsd: 4, outUsd: 20, notes: "Anthropic's default top model: research, writing, fact checks." },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", inUsd: 10, outUsd: 50, notes: "The most capable widely released Claude. For the hardest investigations." },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inUsd: 2, outUsd: 10, notes: "Fast and strong: triage, planning, updates." },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", inUsd: 0.1, outUsd: 0.5, notes: "Cheapest: SEO lines, sensitivity checks, classification." },
]

/** What a stage would use when its premium slot is switched on and no model is picked. */
export const PREMIUM_DEFAULT: Record<Stage, string> = {
  planner: "claude-sonnet-5-5",
  triage: "claude-sonnet-5-5",
  research: "claude-opus-5-5",
  write: "claude-opus-5-5",
  factcheck: "claude-opus-5-5",
  update: "claude-opus-5-5",
  editor: "claude-haiku-5-5",
}

export type StageModel = {
  /** "auto" (the free router's order for the stage's job) or one free catalogue id ("gemini:gemini-3.8-flash"). */
  model: string
  premium: { enabled: boolean; provider: PremiumProvider; model: string }
}

// ─── Settings (site_settings key "newsroom_engine") ─────────────────────────────────────────────────────────

export type ScoutId = "rss" | "github" | "hf" | "arxiv" | "hn" | "federal" | "gdelt" | "watch" | "planner"

export const SCOUTS: { id: ScoutId; label: string; blurb: string; sourceOnly?: boolean }[] = [
  { id: "rss", label: "Official feeds and pages", blurb: "The sources list: vendor blogs, changelogs, release feeds and news pages." },
  { id: "github", label: "GitHub", blurb: "New and fast-rising repositories, releases and commits of watched repositories." },
  { id: "hf", label: "Hugging Face API", blurb: "New and trending models and datasets. Used to discover; stories cite the paper, repository or official post instead.", sourceOnly: true },
  { id: "arxiv", label: "arXiv", blurb: "New papers in the desks' categories and searches." },
  { id: "hn", label: "Technical front pages", blurb: "What engineers are reading (Hacker News front page, through its public API). Discovery only: never linked or cited.", sourceOnly: true },
  { id: "federal", label: "Public records", blurb: "The US Federal Register: rules, notices and executive documents." },
  { id: "gdelt", label: "News index (GDELT)", blurb: "Credible coverage worldwide, to corroborate leads and find the original source." },
  { id: "watch", label: "Leak and change watchers", blurb: "Public SDK files and pages, compared snapshot to snapshot for new identifiers." },
  { id: "planner", label: "AI planner", blurb: "An AI agent picks extra searches per desk from what it learned in earlier cycles." },
]

export type EngineRules = {
  /** Master switch for publishing without review. Each desk must also allow it. */
  autoPublish: boolean
  /** Auto-publish only at this evidence level or stronger. */
  minEvidence: Extract<EvidenceLevel, "confirmed" | "observed">
  requireFactCheck: boolean
  /** Independent sources an auto-published story needs. */
  minSources: number
  /** The score a story needs to go out without review. */
  minScore: number
  /** A leak is highlighted only with high impact and at least this confidence (it is still reviewed). */
  leakMinConfidence: number
  /** Words that always send a story to review (sensitive subjects). */
  sensitive: string[]
  /** Apply updates to published stories automatically when they rest on confirmed or observed evidence. */
  autoUpdate: boolean
  /** At most this many AI stories a day, drafts included. A ceiling against runaway spending, not a quota. */
  maxPerDay: number
}

export type EngineLimits = {
  /** Wall time one tick may use, in seconds (the function's limit is 300). */
  tickSeconds: number
  aiCallsPerTick: number
  /** Estimated tokens (input and output) one tick may use. */
  tokensPerTick: number
  fetchesPerTick: number
  /** Stories researched per cycle, shared between desks by activity and priority. */
  researchPerCycle: number
  aiCallsPerDay: number
}

export type EngineSettings = {
  paused: boolean
  /** A research cycle starts every this many minutes (the scheduler ticks every ten). */
  cycleMinutes: number
  limits: EngineLimits
  rules: EngineRules
  stages: Record<Stage, StageModel>
  premium: { dailyUsd: number; monthlyUsd: number }
  scouts: Record<ScoutId, boolean>
  backfill: { days: number; perDesk: number }
  illustrations: boolean
}

export const DEFAULT_SENSITIVE = ["election", "vote", "health", "medical", "patient", "lawsuit", "sued", "arrest", "death", "died", "killed", "weapon", "military", "child", "minor", "suicide", "self-harm", "layoff", "fraud", "hack", "breach", "leak of personal"]

export const ENGINE_DEFAULTS: EngineSettings = {
  paused: false,
  cycleMinutes: 60,
  limits: { tickSeconds: 240, aiCallsPerTick: 24, tokensPerTick: 600_000, fetchesPerTick: 160, researchPerCycle: 3, aiCallsPerDay: 300 },
  rules: { autoPublish: true, minEvidence: "observed", requireFactCheck: true, minSources: 2, minScore: 72, leakMinConfidence: 70, sensitive: DEFAULT_SENSITIVE, autoUpdate: true, maxPerDay: 12 },
  stages: Object.fromEntries(STAGES.map((s) => [s.id, { model: "auto", premium: { enabled: false, provider: "anthropic", model: PREMIUM_DEFAULT[s.id] } }])) as Record<Stage, StageModel>,
  premium: { dailyUsd: 2, monthlyUsd: 30 },
  scouts: { rss: true, github: true, hf: true, arxiv: true, hn: true, federal: true, gdelt: true, watch: true, planner: true },
  backfill: { days: 7, perDesk: 2 },
  illustrations: false,
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(clamp(v, min, max, fallback))

const FREE_MODEL = /^[a-z]+:[\w./:@-]{2,120}$/
const PREMIUM_MODEL = /^[\w./:@-]{2,120}$/

/** Settings as saved, merged over the defaults; anything odd falls back safely. */
export function readEngineSettings(v: unknown): EngineSettings {
  const r = obj(v)
  const l = obj(r.limits)
  const ru = obj(r.rules)
  const st = obj(r.stages)
  const pr = obj(r.premium)
  const sc = obj(r.scouts)
  const bf = obj(r.backfill)
  const d = ENGINE_DEFAULTS
  const stages = {} as Record<Stage, StageModel>
  for (const s of STAGES) {
    const x = obj(st[s.id])
    const p = obj(x.premium)
    const provider: PremiumProvider = p.provider === "openrouter" ? "openrouter" : "anthropic"
    const model = typeof p.model === "string" && PREMIUM_MODEL.test(p.model) ? p.model : PREMIUM_DEFAULT[s.id]
    stages[s.id] = {
      model: typeof x.model === "string" && (x.model === "auto" || FREE_MODEL.test(x.model)) ? x.model : "auto",
      premium: { enabled: p.enabled === true, provider, model: provider === "anthropic" && !ANTHROPIC_MODELS.some((m) => m.id === model) ? PREMIUM_DEFAULT[s.id] : model },
    }
  }
  const scouts = { ...d.scouts }
  for (const k of Object.keys(scouts) as ScoutId[]) if (typeof sc[k] === "boolean") scouts[k] = sc[k] as boolean
  const sensitive = Array.isArray(ru.sensitive) ? strs(ru.sensitive, 60, 40).map((x) => x.toLowerCase()) : d.rules.sensitive
  return {
    paused: r.paused === true,
    cycleMinutes: int(r.cycleMinutes, 15, 1440, d.cycleMinutes),
    limits: {
      tickSeconds: int(l.tickSeconds, 60, 280, d.limits.tickSeconds),
      aiCallsPerTick: int(l.aiCallsPerTick, 0, 80, d.limits.aiCallsPerTick),
      tokensPerTick: int(l.tokensPerTick, 20_000, 3_000_000, d.limits.tokensPerTick),
      fetchesPerTick: int(l.fetchesPerTick, 10, 500, d.limits.fetchesPerTick),
      researchPerCycle: int(l.researchPerCycle, 0, 12, d.limits.researchPerCycle),
      aiCallsPerDay: int(l.aiCallsPerDay, 0, 3000, d.limits.aiCallsPerDay),
    },
    rules: {
      autoPublish: ru.autoPublish !== false,
      minEvidence: ru.minEvidence === "confirmed" ? "confirmed" : "observed",
      requireFactCheck: ru.requireFactCheck !== false,
      minSources: int(ru.minSources, 1, 6, d.rules.minSources),
      minScore: int(ru.minScore, 0, 100, d.rules.minScore),
      leakMinConfidence: int(ru.leakMinConfidence, 0, 100, d.rules.leakMinConfidence),
      sensitive,
      autoUpdate: ru.autoUpdate !== false,
      maxPerDay: int(ru.maxPerDay, 0, 60, d.rules.maxPerDay),
    },
    stages,
    premium: { dailyUsd: clamp(pr.dailyUsd, 0, 500, d.premium.dailyUsd), monthlyUsd: clamp(pr.monthlyUsd, 0, 5000, d.premium.monthlyUsd) },
    scouts,
    backfill: { days: int(bf.days, 1, 90, d.backfill.days), perDesk: int(bf.perDesk, 1, 6, d.backfill.perDesk) },
    illustrations: r.illustrations === true,
  }
}

/** Price of one call in US dollars, from list prices per million tokens. */
export const callCost = (m: Pick<PremiumModel, "inUsd" | "outUsd">, tokensIn: number, tokensOut: number) => (tokensIn * m.inUsd + tokensOut * m.outUsd) / 1_000_000

// ─── Jobs, leads, decisions ─────────────────────────────────────────────────────────────────────────────────

export type JobKind = "cycle" | "collect" | "scout" | "watch" | "triage" | "research" | "update" | "corroborate" | "backfill"
export type JobStatus = "queued" | "running" | "done" | "failed" | "dead" | "cancelled"

export const JOB_LABELS: Record<JobKind, string> = {
  cycle: "Research cycle",
  collect: "Read official sources",
  scout: "Scout",
  watch: "Leak watchers",
  triage: "Triage",
  research: "Research and write",
  update: "Update a story",
  corroborate: "Corroborate a leak",
  backfill: "Backfill",
}

export type Job = {
  id: number
  kind: JobKind
  desk: string | null
  payload: Record<string, unknown>
  status: JobStatus
  priority: number
  attempts: number
  maxAttempts: number
  runAfter: string
  lockedBy: string | null
  lockedUntil: string | null
  lastError: string | null
  result: Record<string, unknown> | null
  runId: number | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type JobRow = {
  id: number
  kind: JobKind
  desk: string | null
  payload: Record<string, unknown> | null
  status: JobStatus
  priority: number
  attempts: number
  max_attempts: number
  run_after: string
  locked_by: string | null
  locked_until: string | null
  last_error: string | null
  result: Record<string, unknown> | null
  run_id: number | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export const toJob = (r: JobRow): Job => ({
  id: r.id,
  kind: r.kind,
  desk: r.desk,
  payload: r.payload ?? {},
  status: r.status,
  priority: r.priority,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  runAfter: r.run_after,
  lockedBy: r.locked_by,
  lockedUntil: r.locked_until,
  lastError: r.last_error,
  result: r.result,
  runId: r.run_id,
  createdAt: r.created_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
})

export type LeadDecision = "new" | "queued" | "researching" | "review" | "accepted" | "published" | "rejected" | "duplicate" | "update" | "failed"

export const LEAD_LABELS: Record<LeadDecision, string> = {
  new: "New",
  queued: "Queued for research",
  researching: "Researching",
  review: "Waiting for review",
  accepted: "Accepted",
  published: "Published",
  rejected: "Rejected",
  duplicate: "Already covered",
  update: "Update to a story",
  failed: "Research failed",
}

export type EvidenceItem = { url: string; kind: string; note: string; quote?: string; observedAt?: string }

export type Lead = {
  id: number
  desk: string | null
  track: "news" | "leak"
  scout: string
  title: string
  url: string | null
  summary: string
  publisher: string
  publishedAt: string | null
  evidenceLevel: EvidenceLevel | null
  leakConfidence: number | null
  availability: Availability | null
  score: number
  scoreParts: Record<string, number | string>
  evidence: EvidenceItem[]
  signalIds: number[]
  storyKey: string | null
  matchStory: string | null
  decision: LeadDecision
  reason: string
  storyId: string | null
  model: string | null
  proposal: Record<string, unknown> | null
  createdAt: string
  decidedAt: string | null
}

export type LeadRow = {
  id: number
  desk: string | null
  track: "news" | "leak"
  scout: string
  title: string
  url: string | null
  summary: string
  publisher: string
  published_at: string | null
  evidence_level: string | null
  leak_confidence: number | null
  availability: string | null
  score: number
  score_parts: Record<string, number | string> | null
  evidence: unknown
  signal_ids: number[] | null
  story_key: string | null
  match_story: string | null
  decision: LeadDecision
  reason: string
  story_id: string | null
  model: string | null
  proposal: Record<string, unknown> | null
  created_at: string
  decided_at: string | null
}

export function readEvidence(v: unknown): EvidenceItem[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => obj(x))
    .filter((x) => typeof x.url === "string" && /^https:\/\//.test(x.url))
    .map((x) => ({
      url: String(x.url).slice(0, 1000),
      kind: typeof x.kind === "string" ? x.kind.slice(0, 40) : "source",
      note: typeof x.note === "string" ? x.note.slice(0, 400) : "",
      quote: typeof x.quote === "string" ? x.quote.slice(0, 500) : undefined,
      observedAt: typeof x.observedAt === "string" ? x.observedAt : undefined,
    }))
    .slice(0, 40)
}

export const toLead = (r: LeadRow): Lead => ({
  id: r.id,
  desk: r.desk,
  track: r.track,
  scout: r.scout,
  title: r.title,
  url: r.url,
  summary: r.summary,
  publisher: r.publisher,
  publishedAt: r.published_at,
  evidenceLevel: isEvidence(r.evidence_level) ? r.evidence_level : null,
  leakConfidence: r.leak_confidence,
  availability: isAvailability(r.availability) ? r.availability : null,
  score: r.score,
  scoreParts: r.score_parts ?? {},
  evidence: readEvidence(r.evidence),
  signalIds: r.signal_ids ?? [],
  storyKey: r.story_key,
  matchStory: r.match_story,
  decision: r.decision,
  reason: r.reason,
  storyId: r.story_id,
  model: r.model,
  proposal: r.proposal,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
})

export type Agent = "planner" | "scout" | "triage" | "researcher" | "writer" | "checker" | "editor" | "publisher" | "updater" | "leaks" | "illustrator" | "system" | "human"

export type Decision = {
  id: number
  runId: number | null
  jobId: number | null
  leadId: number | null
  storyId: string | null
  agent: Agent
  action: string
  outcome: string
  reason: string
  detail: Record<string, unknown> | null
  createdAt: string
}

export type Usage = {
  stage: string
  provider: string
  model: string
  premium: boolean
  tokensIn: number
  tokensOut: number
  measured: boolean
  costUsd: number
  ms: number
  ok: boolean
  createdAt: string
}

// ─── Story extras (the engine's columns on news_stories) ────────────────────────────────────────────────────

export type TimelineEntry = { at: string; kind: "published" | "update" | "correction"; title: string; note: string; sources: number[] }

export type MediaItem =
  | { type: "video"; provider: "youtube" | "vimeo"; id: string; title: string; source: number | null }
  | { type: "image"; url: string; alt: string; credit: string; source: number | null }
  | { type: "repo"; repo: string; description: string; stars: number | null; forks: number | null; language: string; license: string; pushedAt: string | null }
  | { type: "model"; name: string; task: string; downloads: number | null; likes: number | null; license: string; via: string }
  | { type: "chart"; title: string; unit: string; items: { label: string; value: number; source: number | null }[] }

export type Seo = { title: string; description: string; keywords: string[] }

export type StoryExtras = {
  desk: string | null
  evidence: EvidenceLevel | null
  leakConfidence: number | null
  impact: number | null
  availability: Availability | null
  seo: Seo | null
  media: MediaItem[]
  timeline: TimelineEntry[]
  coverAi: boolean
  reads: number
}

export const EXTRA_COLUMNS = "desk, evidence, leak_confidence, impact, availability, seo, media, timeline, cover_ai, reads"

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "")

export function readTimeline(v: unknown): TimelineEntry[] {
  if (!Array.isArray(v)) return []
  return v
    .map(obj)
    .filter((x) => typeof x.at === "string" && Number.isFinite(Date.parse(x.at as string)))
    .map((x) => ({
      at: x.at as string,
      kind: (x.kind === "update" || x.kind === "correction" ? x.kind : "published") as TimelineEntry["kind"],
      title: txt(x.title, 200),
      note: txt(x.note, 1500),
      sources: Array.isArray(x.sources) ? x.sources.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= 12).slice(0, 6) : [],
    }))
    .slice(0, 40)
}

export function readMedia(v: unknown): MediaItem[] {
  if (!Array.isArray(v)) return []
  const out: MediaItem[] = []
  for (const raw of v) {
    const x = obj(raw)
    const source = num(x.source)
    if (x.type === "video" && (x.provider === "youtube" || x.provider === "vimeo") && typeof x.id === "string" && /^[\w-]{6,20}$/.test(x.id)) out.push({ type: "video", provider: x.provider, id: x.id, title: txt(x.title, 200), source })
    else if (x.type === "image" && typeof x.url === "string" && /^https:\/\/\S{4,1000}$/.test(x.url)) out.push({ type: "image", url: x.url, alt: txt(x.alt, 300), credit: txt(x.credit, 160), source })
    else if (x.type === "repo" && typeof x.repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(x.repo))
      out.push({ type: "repo", repo: x.repo, description: txt(x.description, 300), stars: num(x.stars), forks: num(x.forks), language: txt(x.language, 40), license: txt(x.license, 60), pushedAt: typeof x.pushedAt === "string" ? x.pushedAt : null })
    else if (x.type === "model" && typeof x.name === "string")
      out.push({ type: "model", name: txt(x.name, 120), task: txt(x.task, 60), downloads: num(x.downloads), likes: num(x.likes), license: txt(x.license, 60), via: txt(x.via, 60) })
    else if (x.type === "chart" && Array.isArray(x.items)) {
      const items = x.items
        .map(obj)
        .filter((i) => typeof i.label === "string" && typeof i.value === "number" && Number.isFinite(i.value))
        .map((i) => ({ label: txt(i.label, 60), value: i.value as number, source: num(i.source) }))
        .slice(0, 10)
      if (items.length >= 2) out.push({ type: "chart", title: txt(x.title, 160), unit: txt(x.unit, 30), items })
    }
  }
  return out.slice(0, 12)
}

export function readSeo(v: unknown): Seo | null {
  const x = obj(v)
  const title = txt(x.title, 70)
  const description = txt(x.description, 170)
  if (!title && !description) return null
  return { title, description, keywords: strs(x.keywords, 10, 40) }
}

export function readExtras(r: Record<string, unknown>): StoryExtras {
  return {
    desk: typeof r.desk === "string" ? r.desk : null,
    evidence: isEvidence(r.evidence) ? r.evidence : null,
    leakConfidence: num(r.leak_confidence),
    impact: num(r.impact),
    availability: isAvailability(r.availability) ? r.availability : null,
    seo: readSeo(r.seo),
    media: readMedia(r.media),
    timeline: readTimeline(r.timeline),
    coverAi: r.cover_ai === true,
    reads: num(r.reads) ?? 0,
  }
}

export const NO_EXTRAS: StoryExtras = { desk: null, evidence: null, leakConfidence: null, impact: null, availability: null, seo: null, media: [], timeline: [], coverAi: false, reads: 0 }
