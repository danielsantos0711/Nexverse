import { JOBS, MODELS } from "@/lib/ai/models"
import { isConfigured } from "@/lib/ai/config"
import { isMissing, rpc, select, type Db } from "../rest"
import { loadDesks, loadSettings } from "./engine"
import { premiumKey } from "./models"
import { PREMIUM_PROVIDERS, readEvidence, toJob, toLead, type Decision, type Desk, type EngineSettings, type Job, type JobRow, type Lead, type LeadRow, type PremiumProvider } from "./types"

/*
 * Server only. Everything the "Newsroom control" page shows, read as the signed-in editor (row level security
 * applies): the queue, the leads with their evidence and reasons, the decision log, model use and cost, the
 * runs, the watchers, the sources' health, the scheduler, and which keys the server has (never the keys).
 */

export type Scheduler = {
  vault: { url: boolean; secret: boolean }
  jobs: { name: string; schedule: string; active: boolean }[]
  runs: { status: string; start: string; end: string | null; message: string }[]
  responses: { status: number | null; error: string; at: string }[]
  cronError?: string
}

export type UsageRollup = {
  stage: string
  provider: string
  model: string
  premium: boolean
  calls: number
  failed: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  avgMs: number
}

export type RunRow = {
  id: number
  trigger: string
  kind: string | null
  status: string
  drafts: number
  published: number
  jobs_done: number | null
  ai_calls: number | null
  tokens: number | null
  cost_usd: number | null
  errors: { where: string; error: string }[]
  note: string
  started_at: string
  finished_at: string | null
}

export type WatcherRow = { id: string; kind: string; label: string; target: string; publisher: string; desk: string | null; enabled: boolean; last_checked: string | null; last_changed: string | null; last_error: string | null; tokens: number }
export type SourceHealth = { id: string; label: string; kind: string; publisher: string; desk: string | null; enabled: boolean; last_checked: string | null; last_ok: boolean | null; last_count: number | null; last_error: string | null }
export type ReviewStory = { id: string; title: string; dek: string; desk: string | null; category: string; evidence: string | null; review_reason: string | null; created_at: string; sources: number; unconfirmed: boolean; cover: string | null }
export type ArticleRow = { id: string; title: string; desk: string | null; status: string; published_at: string | null; reads: number; ai_generated: boolean; evidence: string | null }

export type EngineState = {
  ready: boolean
  missing: string | null
  settings: EngineSettings
  desks: Desk[]
  jobs: Job[]
  counts: Record<string, number>
  leads: Lead[]
  decisions: Decision[]
  usage: { today: UsageRollup[]; week: UsageRollup[]; premiumTodayUsd: number; premiumMonthUsd: number; callsToday: number }
  runs: RunRow[]
  watchers: WatcherRow[]
  sources: SourceHealth[]
  review: ReviewStory[]
  articles: ArticleRow[]
  scheduler: Scheduler | null
  keys: { premium: Record<PremiumProvider, boolean>; free: string[]; service: boolean; cron: boolean; github: boolean; illustrations: boolean }
  freeModels: { id: string; label: string; provider: string; tier: number; active: boolean; notes: string }[]
  jobs_catalog: string[]
  now: string
}

const DAY = 864e5

function rollup(rows: { stage: string; provider: string; model: string; premium: boolean; tokens_in: number; tokens_out: number; cost_usd: number; ms: number; ok: boolean }[]): UsageRollup[] {
  const map = new Map<string, UsageRollup & { msSum: number }>()
  for (const r of rows) {
    const k = `${r.stage}|${r.provider}|${r.model}`
    const x = map.get(k) ?? { stage: r.stage, provider: r.provider, model: r.model, premium: r.premium, calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, avgMs: 0, msSum: 0 }
    x.calls++
    if (!r.ok) x.failed++
    x.tokensIn += r.tokens_in
    x.tokensOut += r.tokens_out
    x.costUsd += Number(r.cost_usd) || 0
    x.msSum += r.ms
    map.set(k, x)
  }
  return [...map.values()].map(({ msSum, ...x }) => ({ ...x, avgMs: x.calls ? Math.round(msSum / x.calls) : 0, costUsd: Math.round(x.costUsd * 1e6) / 1e6 })).sort((a, b) => b.calls - a.calls)
}

export async function engineState(db: Db): Promise<EngineState> {
  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const month = `${today.slice(0, 7)}-01`
  const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
  let missing: string | null = null
  const probe = await select<{ id: number }>(db, "news_jobs", "select=id&limit=1").catch((err: unknown) => {
    if (isMissing(err)) missing = "Migration 20261021100000_newsroom_engine.sql is not applied yet: the engine's tables do not exist."
    return []
  })
  void probe
  const [{ settings }, desks] = await Promise.all([loadSettings(db), loadDesks(db)])
  const [active, recentJobs, leads, decisions, usageWeek, usageMonth, runs, watchers, sources, review, articles, scheduler] = await Promise.all([
    safe(select<JobRow>(db, "news_jobs", "status=in.(queued,running)&order=priority.asc,run_after.asc&limit=80&select=*"), []),
    safe(select<JobRow>(db, "news_jobs", `status=in.(done,failed,dead,cancelled)&finished_at=gte.${new Date(now - 2 * DAY).toISOString()}&order=finished_at.desc&limit=80&select=*`), []),
    safe(select<LeadRow>(db, "news_leads", "order=created_at.desc&limit=150&select=*"), []),
    safe(select<Record<string, unknown>>(db, "news_decisions", "order=created_at.desc&limit=200&select=*"), []),
    safe(select<{ stage: string; provider: string; model: string; premium: boolean; tokens_in: number; tokens_out: number; cost_usd: number; ms: number; ok: boolean; created_at: string }>(db, "news_usage", `created_at=gte.${new Date(now - 7 * DAY).toISOString()}&order=created_at.desc&limit=5000&select=stage,provider,model,premium,tokens_in,tokens_out,cost_usd,ms,ok,created_at`), []),
    safe(select<{ cost_usd: number }>(db, "news_usage", `premium=is.true&created_at=gte.${month}T00:00:00Z&select=cost_usd&limit=10000`), []),
    safe(select<RunRow>(db, "news_runs", "order=started_at.desc&limit=40&select=id,trigger,kind,status,drafts,published,jobs_done,ai_calls,tokens,cost_usd,errors,note,started_at,finished_at"), []),
    safe(select<WatcherRow & { last_tokens: string[] | null }>(db, "news_watch", "order=id.asc&select=id,kind,label,target,publisher,desk,enabled,last_checked,last_changed,last_error,last_tokens"), []),
    safe(select<SourceHealth>(db, "news_sources", "order=label.asc&select=id,label,kind,publisher,desk,enabled,last_checked,last_ok,last_count,last_error"), []),
    safe(select<Omit<ReviewStory, "sources"> & { sources: unknown[] | null }>(db, "news_stories", "status=eq.draft&ai_generated=is.true&order=created_at.desc&limit=40&select=id,title,dek,desk,category,evidence,review_reason,created_at,sources,unconfirmed,cover"), []),
    safe(select<ArticleRow>(db, "news_stories", "order=created_at.desc&limit=60&select=id,title,desk,status,published_at,reads,ai_generated,evidence"), []),
    safe(rpc<Scheduler>(db, "news_engine_scheduler"), null),
  ])
  const todayRows = usageWeek.filter((u) => u.created_at >= `${today}T00:00:00`)
  const all = [...active, ...recentJobs].map(toJob)
  const counts: Record<string, number> = {}
  for (const j of all) counts[j.status] = (counts[j.status] ?? 0) + 1
  const on = new Set(MODELS.filter((m) => !m.premium && isConfigured(m.provider)).map((m) => m.id))
  return {
    ready: !missing,
    missing,
    settings,
    desks,
    jobs: all,
    counts,
    leads: leads.map(toLead),
    decisions: decisions.map((d) => ({
      id: Number(d.id),
      runId: (d.run_id as number | null) ?? null,
      jobId: (d.job_id as number | null) ?? null,
      leadId: (d.lead_id as number | null) ?? null,
      storyId: (d.story_id as string | null) ?? null,
      agent: d.agent as Decision["agent"],
      action: String(d.action ?? ""),
      outcome: String(d.outcome ?? ""),
      reason: String(d.reason ?? ""),
      detail: (d.detail as Record<string, unknown> | null) ?? null,
      createdAt: String(d.created_at ?? ""),
    })),
    usage: {
      today: rollup(todayRows),
      week: rollup(usageWeek),
      premiumTodayUsd: Math.round(todayRows.filter((u) => u.premium).reduce((a, u) => a + (Number(u.cost_usd) || 0), 0) * 1e4) / 1e4,
      premiumMonthUsd: Math.round(usageMonth.reduce((a, u) => a + (Number(u.cost_usd) || 0), 0) * 1e4) / 1e4,
      callsToday: todayRows.length,
    },
    runs: runs.map((r) => ({ ...r, errors: Array.isArray(r.errors) ? r.errors : [] })),
    watchers: watchers.map(({ last_tokens, ...w }) => ({ ...w, tokens: last_tokens?.length ?? 0 })),
    sources,
    review: review.map((r) => ({ ...r, sources: Array.isArray(r.sources) ? r.sources.length : 0 })),
    articles,
    scheduler,
    keys: {
      premium: Object.fromEntries(PREMIUM_PROVIDERS.map((p) => [p.id, premiumKey(p.id) !== null])) as Record<PremiumProvider, boolean>,
      free: [...new Set(MODELS.filter((m) => !m.premium && isConfigured(m.provider)).map((m) => m.provider))],
      service: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      cron: (process.env.CRON_SECRET?.trim().length ?? 0) >= 16,
      github: Boolean(process.env.GITHUB_TOKEN?.trim()),
      illustrations: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim()),
    },
    freeModels: MODELS.filter((m) => !m.premium).map((m) => ({ id: m.id, label: m.label, provider: m.provider, tier: m.tier, active: on.has(m.id), notes: m.notes })),
    jobs_catalog: JOBS.map((j) => j.id),
    now: new Date().toISOString(),
  }
}

export { readEvidence }
