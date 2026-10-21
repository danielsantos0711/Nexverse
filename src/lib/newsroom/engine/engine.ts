import { randomBytes } from "node:crypto"
import { AiError } from "@/lib/ai/errors"
import { hostname } from "@/lib/live/http"
import { readNewsroomSettings, type Depth, type NewsroomSettings, type SourceRow } from "@/lib/newsroom"
import { clusterSignals, type Signal } from "../cluster"
import { collectSource } from "../collect"
import type { Doc } from "../gather"
import { readPage } from "../page"
import { signalHash, urlKey } from "../parse"
import { officialSites, saveStory } from "../pipeline"
import { research } from "../research"
import { DbError, insert, isMissing, rpc, select, update, type Db } from "../rest"
import { chartFromFacts, judgeLeak, mediaFor, plan, seoFor, sensitiveHits, triage, writeUpdate, type Verdict } from "./agents"
import { Budget } from "./fetch"
import { illustrate } from "./illustrate"
import { BudgetError, Meter, researchAsk, stageAsk, usageToday, type StageContext } from "./models"
import { claim, DecisionLog, enqueue, finish, releaseLock, takeLock } from "./queue"
import { allocate, blend, scoreCluster, storyKeyOf, type EngineSignal, type Published, type Scored } from "./score"
import { arxivSearch, federalRegister, frontPage, gdelt, gdeltScout, githubReleases, githubRising, huggingFace, type Found, type ScoutResult } from "./scouts"
import { DESK_COLUMNS, evidenceRank, FALLBACK_DESKS, readEngineSettings, readEvidence, toDesk, toLead, type Desk, type DeskRow, type EngineSettings, type EvidenceItem, type EvidenceLevel, type Job, type LeadRow, type MediaItem, type TimelineEntry } from "./types"
import { checkWatcher, meaningful, toWatcher, WATCH_COLUMNS, weighLeak, type WatchRow } from "./watch"

/*
 * Server only. The research engine. pg_cron posts a tick every ten minutes (and Vercel's daily cron once more,
 * as a fallback); each tick takes the engine lock, starts a research cycle when one is due (hourly by default),
 * then works the job queue until its time, call or token budget runs out. Everything a tick does not finish
 * stays in the queue for the next one; a tick that dies leaves its jobs with a lease that expires, and the next
 * tick picks them up. A failed job is retried with backoff and ends as a dead letter the editors can see.
 *
 *   cycle        plans the hour: official sources, every desk's scouts, the leak watchers, the AI planner's
 *                extra searches (where to look, which leads to follow), then the triage
 *   collect      the official feeds and pages in the sources list
 *   scout        one desk's discovery methods, or one planned search
 *   watch        the leak watchers: new identifiers in public SDK files and pages
 *   corroborate  looks for more evidence of an early signal and weighs it (five evidence levels)
 *   triage       groups and scores what was found, asks the triage agent, decides with reasons, gives the
 *                desks their research slots by activity and priority, and spots duplicates and updates
 *   research     reads the original sources, writes, checks, illustrates, and publishes or sends to review
 *   update       writes the timeline entry when a published story develops
 *   backfill     the editors' mass import: a wider window and a fixed number of stories per chosen desk
 */

const DAY = 864e5

export type EngineContext = {
  db: Db
  settings: EngineSettings
  legacy: NewsroomSettings
  desks: Desk[]
  deskMap: Map<string, Desk>
  canPublish: boolean
  log: DecisionLog
  meter: Meter
  budget: Budget
  runId: number | null
  deadline: number
  /** True once a story went out, so the caller refreshes the public pages. */
  published: number
  drafts: number
  aiOff: boolean
}

export type TickSummary = {
  runId: number | null
  status: "ok" | "partial" | "failed" | "busy" | "paused"
  jobsDone: number
  jobsFailed: number
  aiCalls: number
  tokens: number
  costUsd: number
  published: number
  drafts: number
  note: string
  errors: { where: string; error: string }[]
}

export class EngineError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

// ─── Context ────────────────────────────────────────────────────────────────────────────────────────────────

export async function loadDesks(db: Db): Promise<Desk[]> {
  const rows = await select<DeskRow>(db, "news_desks", `select=${encodeURIComponent(DESK_COLUMNS)}&order=sort.asc`).catch(() => null)
  return rows && rows.length ? rows.map(toDesk) : FALLBACK_DESKS
}

export async function loadSettings(db: Db): Promise<{ settings: EngineSettings; legacy: NewsroomSettings }> {
  const rows = await select<{ key: string; value: unknown }>(db, "site_settings", "key=in.(newsroom,newsroom_engine)&select=key,value").catch(() => [])
  return { settings: readEngineSettings(rows.find((r) => r.key === "newsroom_engine")?.value), legacy: readNewsroomSettings(rows.find((r) => r.key === "newsroom")?.value) }
}

const brief = (d: Desk | undefined) => (d ? { label: d.label, scope: d.scope || d.blurb, audience: d.audience } : null)

// ─── Signals ────────────────────────────────────────────────────────────────────────────────────────────────

/** Stores findings as signals, one per address. Returns how many were new. */
async function storeFound(ctx: EngineContext, found: Found[]): Promise<number> {
  if (!found.length) return 0
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const f of found) {
    const hash = signalHash(f.url)
    if (seen.has(hash)) continue
    seen.add(hash)
    rows.push({
      source_id: null,
      url: f.url,
      title: f.title.slice(0, 300) || f.url.slice(0, 300),
      excerpt: f.excerpt.slice(0, 1200),
      publisher: (f.publisher || hostname(f.url)).slice(0, 80),
      internal_only: f.internalOnly === true,
      used: false,
      published_at: f.publishedAt,
      hash,
      desk: f.desk,
      scout: f.scout.slice(0, 40),
      metrics: f.metrics ?? null,
      via: f.via?.slice(0, 120) ?? null,
    })
  }
  const fresh = await insert<{ id: number }>(ctx.db, "news_signals", rows, { ignoreDuplicates: true, onConflict: "hash" })
  return fresh.length
}

// ─── Handlers ───────────────────────────────────────────────────────────────────────────────────────────────

type Outcome = { result?: Record<string, unknown>; retryInSeconds?: number }

async function onCycle(ctx: EngineContext, job: Job): Promise<Outcome> {
  const s = ctx.settings
  const queued: string[] = []
  const q = async (kind: Parameters<typeof enqueue>[1]["kind"], o: Omit<Parameters<typeof enqueue>[1], "kind">) => {
    const id = await enqueue(ctx.db, { kind, runId: ctx.runId, ...o })
    if (id) queued.push(`${kind}${o.desk ? `:${o.desk}` : ""}`)
  }
  if (s.scouts.rss) await q("collect", { priority: 15, dedupe: "collect" })
  if (s.scouts.watch) await q("watch", { priority: 16, dedupe: "watch" })
  const active = ctx.desks.filter((d) => d.enabled)
  for (const d of active) await q("scout", { desk: d.id, priority: 20 + (5 - d.priority), dedupe: `scout:${d.id}` })

  // The planner: extra searches for a few desks each cycle, taking turns, most important desks first.
  if (s.scouts.planner && !ctx.aiOff) {
    const turn = Math.floor(Date.now() / (s.cycleMinutes * 60_000))
    const ranked = [...active].filter((d) => !d.leakTrack).sort((a, b) => b.priority - a.priority)
    const picks = ranked.length ? [ranked[turn % ranked.length], ranked[(turn + 1) % ranked.length]].filter((d, i, a) => a.indexOf(d) === i) : []
    for (const d of picks) {
      try {
        const [leads, stories] = await Promise.all([
          select<{ title: string; decision: string; score_parts: Record<string, unknown> | null }>(ctx.db, "news_leads", `desk=eq.${d.id}&order=created_at.desc&limit=20&select=title,decision,score_parts`).catch(() => []),
          select<{ title: string }>(ctx.db, "news_stories", `desk=eq.${d.id}&status=eq.published&order=published_at.desc&limit=15&select=title`).catch(() => []),
        ])
        const openQuestions = leads.flatMap((l) => (Array.isArray(l.score_parts?.questions) ? (l.score_parts.questions as string[]) : [])).slice(0, 10)
        const plans = await plan(stageAsk(stageCtx(ctx, job), "planner"), d, { recentLeads: leads.map((l) => `${l.title} (${l.decision})`), recentStories: stories.map((x) => x.title), openQuestions })
        for (const p of plans) {
          await q("scout", { desk: d.id, priority: 22, dedupe: `plan:${d.id}:${p.tool}:${p.query.toLowerCase()}`.slice(0, 200), payload: { tool: p.tool, query: p.query, why: p.why } })
          ctx.log.add({ agent: "planner", action: `search ${p.tool}`, outcome: "planned", reason: `${d.label}: "${p.query}" because ${p.why}` })
        }
        if (!plans.length) ctx.log.add({ agent: "planner", action: "plan", outcome: "nothing extra", reason: `${d.label}: the standing methods are enough this hour.` })
      } catch (err) {
        if (err instanceof BudgetError) break
        if (err instanceof AiError && err.code === "not_configured") {
          ctx.aiOff = true
          break
        }
        ctx.log.add({ agent: "planner", action: "plan", outcome: "failed", reason: `${d.label}: ${err instanceof Error ? err.message : "failed"}` })
      }
    }
  }
  await q("triage", { priority: 40, dedupe: "triage", delaySeconds: 30 })
  ctx.log.add({ agent: "planner", action: "cycle", outcome: "planned", reason: `Queued ${queued.length} jobs for ${active.length} desks.`, detail: { queued } })
  return { result: { queued } }
}

async function onCollect(ctx: EngineContext): Promise<Outcome> {
  const rows = await select<SourceRow & { desk: string | null }>(ctx.db, "news_sources", "enabled=is.true&select=*")
  let fresh = 0
  const errors: string[] = []
  const found: Found[] = []
  const queue = [...rows]
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (!ctx.budget.take()) break
        const r = await collectSource({ kind: s.kind, url: s.url, repo: s.repo, query: s.query })
        if (!r.ok) errors.push(`${s.label}: ${r.error}`)
        if (ctx.db.as === "service") await update(ctx.db, "news_sources", `id=eq.${s.id}`, { last_checked: new Date().toISOString(), last_ok: r.ok, last_count: r.items.length, last_error: r.ok ? null : r.error }).catch(() => {})
        else await rpc(ctx.db, "news_source_checked", { source: s.id, ok: r.ok, items: r.items.length, err: r.ok ? "" : r.error }).catch(() => {})
        const desk = s.desk ?? s.category_hint ?? null
        for (const it of r.items) {
          // A source's first check only takes a baseline.
          if (!s.last_checked && !it.publishedAt) continue
          found.push({ url: it.url, title: it.title, excerpt: it.excerpt, publisher: s.publisher || hostname(it.url), publishedAt: it.publishedAt, scout: s.kind, desk: ctx.deskMap.has(desk ?? "") ? desk : null, internalOnly: s.internal_only })
        }
      }
    })
  )
  fresh = await storeFound(ctx, found)
  ctx.log.add({ agent: "scout", action: "official sources", outcome: `${fresh} new`, reason: `Read ${rows.length} sources; ${found.length} recent items, ${fresh} not seen before.${errors.length ? ` ${errors.length} sources failed.` : ""}`, detail: errors.length ? { errors: errors.slice(0, 20) } : undefined })
  return { result: { sources: rows.length, fresh, errors: errors.slice(0, 20) } }
}

async function onScout(ctx: EngineContext, job: Job): Promise<Outcome> {
  const desk = job.desk ? ctx.deskMap.get(job.desk) : undefined
  if (!desk || !desk.enabled) return { result: { skipped: "desk off" } }
  const s = ctx.settings.scouts
  const days = typeof job.payload.days === "number" ? Math.min(30, Math.max(1, job.payload.days)) : 10
  const tool = typeof job.payload.tool === "string" ? job.payload.tool : null
  const query = typeof job.payload.query === "string" ? job.payload.query : ""
  const runs: { name: string; p: Promise<ScoutResult> }[] = []
  const m = desk.methods
  if (tool) {
    if (tool === "github") runs.push({ name: "github", p: githubRising(desk, { budget: ctx.budget, days, queries: [query] }) })
    if (tool === "arxiv") runs.push({ name: "arxiv", p: arxivSearch(desk, { budget: ctx.budget, queries: [query] }) })
    if (tool === "federal") runs.push({ name: "federal", p: federalRegister(desk, { budget: ctx.budget, days, terms: [query] }) })
    if (tool === "gdelt") runs.push({ name: "gdelt", p: gdeltScout(desk, { budget: ctx.budget, queries: [query] }) })
  } else {
    if (s.github && m.github && (m.github.rising || m.github.topics?.length || m.github.queries?.length)) runs.push({ name: "github", p: githubRising(desk, { budget: ctx.budget, days }) })
    if (s.github && m.github?.watchRepos?.length) runs.push({ name: "releases", p: githubReleases(desk, { budget: ctx.budget, days }) })
    if (s.hf && m.hf?.models) runs.push({ name: "hf models", p: huggingFace(desk, "models", { budget: ctx.budget, days }) })
    if (s.hf && m.hf?.datasets) runs.push({ name: "hf datasets", p: huggingFace(desk, "datasets", { budget: ctx.budget, days }) })
    if (s.arxiv && m.arxiv) runs.push({ name: "arxiv", p: arxivSearch(desk, { budget: ctx.budget }) })
    if (s.hn && m.hn?.enabled) runs.push({ name: "front page", p: frontPage(desk, { budget: ctx.budget }) })
    if (s.federal && m.federal?.terms?.length) runs.push({ name: "federal", p: federalRegister(desk, { budget: ctx.budget, days }) })
    if (s.gdelt && m.gdelt?.queries?.length) runs.push({ name: "gdelt", p: gdeltScout(desk, { budget: ctx.budget }) })
  }
  const results = await Promise.all(runs.map(async (r) => ({ name: r.name, res: await r.p.catch((err: unknown) => ({ found: [], errors: [err instanceof Error ? err.message : "failed"] }) as ScoutResult) })))
  const all = results.flatMap((r) => r.res.found)
  const fresh = await storeFound(ctx, all)
  const errors = results.flatMap((r) => r.res.errors)
  const notes = results.map((r) => r.res.note).filter(Boolean)
  ctx.log.add({
    agent: "scout",
    action: tool ? `planned ${tool} search` : `${desk.label} scouts`,
    outcome: `${fresh} new`,
    reason: `${results.map((r) => `${r.name}: ${r.res.found.length}`).join(", ") || "no methods set"}; ${fresh} not seen before.${tool ? ` Query "${query}".` : ""}${notes.length ? ` ${notes.join(" ")}` : ""}`,
    detail: errors.length ? { errors: errors.slice(0, 12) } : undefined,
  })
  return { result: { found: all.length, fresh, errors: errors.slice(0, 12) } }
}

async function onWatch(ctx: EngineContext): Promise<Outcome> {
  const rows = await select<WatchRow>(ctx.db, "news_watch", `enabled=is.true&select=${encodeURIComponent(WATCH_COLUMNS)}`)
  let observations = 0
  for (const w of rows.map(toWatcher)) {
    const r = await checkWatcher(w, ctx.budget)
    const now = new Date().toISOString()
    if (!r.ok) {
      await update(ctx.db, "news_watch", `id=eq.${w.id}`, { last_checked: now, last_error: r.error.slice(0, 300) }).catch(() => {})
      continue
    }
    await update(ctx.db, "news_watch", `id=eq.${w.id}`, { last_checked: now, last_error: null, last_hash: r.hash, last_tokens: r.tokens.slice(0, 3000), ...(r.changed ? { last_changed: now } : {}) }).catch(() => {})
    if (r.baseline || !r.added.length) continue
    const fresh = meaningful(r.added, w.lastTokens).slice(0, 5)
    for (const t of fresh) {
      const key = `leak ${t}`.slice(0, 200)
      const known = await select<{ id: number }>(ctx.db, "news_leads", `story_key=eq.${encodeURIComponent(key)}&created_at=gte.${new Date(Date.now() - 60 * DAY).toISOString()}&select=id&limit=1`).catch(() => [])
      if (known.length) continue
      const evidence: EvidenceItem[] = [{ url: r.url, kind: "official-file", note: `"${t}" appeared in ${w.label} (${w.publisher}) between two checks.`, observedAt: now }]
      const rowsIn = await insert<{ id: number }>(ctx.db, "news_leads", {
        desk: w.desk ?? "rumor",
        track: "leak",
        scout: "watch",
        title: `New identifier “${t}” in ${w.label}`.slice(0, 300),
        url: r.url,
        summary: `The watcher saw “${t}” for the first time in a public file of ${w.publisher || "the vendor"}. One mention is a lead, not a story: the engine now looks for more evidence.`,
        publisher: w.publisher.slice(0, 120),
        evidence_level: "observed",
        leak_confidence: 30,
        score: 0,
        evidence,
        story_key: key,
        decision: "new",
        reason: "Observed once. Looking for more evidence before anyone writes about it.",
        run_id: ctx.runId,
      })
      const leadId = rowsIn[0]?.id
      if (leadId) await enqueue(ctx.db, { kind: "corroborate", payload: { lead: leadId, round: 1 }, priority: 30, dedupe: `corroborate:${leadId}`, runId: ctx.runId })
      observations++
      ctx.log.add({ agent: "leaks", action: "observation", outcome: "new lead", reason: `“${t}” is new in ${w.label}.`, leadId })
    }
  }
  ctx.log.add({ agent: "leaks", action: "watchers", outcome: `${observations} new`, reason: `Checked ${rows.length} watchers; ${observations} new identifiers.` })
  return { result: { watchers: rows.length, observations } }
}

async function onCorroborate(ctx: EngineContext, job: Job): Promise<Outcome> {
  const id = Number(job.payload.lead)
  const round = Number(job.payload.round) || 1
  const rows = await select<LeadRow>(ctx.db, "news_leads", `id=eq.${id}&select=*`)
  const lead = rows[0] ? toLead(rows[0]) : null
  if (!lead || !lead.storyKey?.startsWith("leak ")) return { result: { skipped: "no such leak lead" } }
  const ident = lead.storyKey.slice(5)
  const evidence = [...lead.evidence]
  const add = (e: EvidenceItem) => {
    if (!evidence.some((x) => urlKey(x.url) === urlKey(e.url))) evidence.push(e)
  }
  // Other official files that know the identifier.
  const watchers = await select<WatchRow>(ctx.db, "news_watch", `enabled=is.true&select=${encodeURIComponent(WATCH_COLUMNS)}`).catch(() => [])
  for (const w of watchers) {
    if ((w.last_tokens ?? []).includes(ident) && !evidence.some((e) => e.note.includes(w.label))) {
      const t = w.kind === "file" ? `https://github.com/${w.target.split(":")[0]}` : w.target
      add({ url: t, kind: "official-file", note: `Also in ${w.label} (${w.publisher}).` })
    }
  }
  // An official announcement among the signals the newsroom already read.
  const word = encodeURIComponent(`*${ident.replace(/[*,()]/g, "")}*`)
  const official = await select<{ url: string; title: string; publisher: string; scout: string | null; source_id: string | null }>(ctx.db, "news_signals", `or=(title.ilike.${word},excerpt.ilike.${word})&created_at=gte.${new Date(Date.now() - 30 * DAY).toISOString()}&select=url,title,publisher,scout,source_id&limit=20`).catch(() => [])
  const announced = official.some((s) => s.source_id !== null && !/arxiv/i.test(s.publisher))
  for (const s of official) add({ url: s.url, kind: s.source_id ? "official-post" : "repository", note: `${s.publisher}: ${s.title.slice(0, 200)}` })
  // Credible coverage, from the news index (one request; it asks for gaps between requests).
  if (ctx.settings.scouts.gdelt) {
    const g = await gdelt(`"${ident}"`, { budget: ctx.budget, days: 7, max: 10 })
    for (const it of g.items.slice(0, 5)) add({ url: it.url, kind: "coverage", note: `${it.domain}: ${it.title.slice(0, 200)}` })
  }
  const officialHits = evidence.filter((e) => e.kind === "official-file" || e.kind === "official-post")
  const weighed = weighLeak({ officialHits, independentHits: evidence.filter((e) => e.kind === "repository" || e.kind === "coverage"), announced })
  let reason = `${officialHits.length} official trace${officialHits.length === 1 ? "" : "s"}, ${evidence.length - officialHits.length} other; level ${weighed.level}, confidence ${weighed.confidence}.`
  let decision: LeadRow["decision"] = "new"
  let judgement: Awaited<ReturnType<typeof judgeLeak>> | null = null
  if (!ctx.aiOff) {
    try {
      judgement = await judgeLeak(stageAsk(stageCtx(ctx, job), "triage"), { identifier: ident, watcher: lead.title, publisher: lead.publisher, evidence, level: weighed.level, confidence: weighed.confidence })
    } catch (err) {
      if (err instanceof BudgetError) return { retryInSeconds: 900 }
      if (err instanceof AiError && err.code === "not_configured") ctx.aiOff = true
    }
  }
  const impact = judgement?.impact ?? 0
  if (weighed.level === "confirmed") {
    decision = "accepted"
    reason = `Officially announced: this is news, not a leak. ${reason}`
  } else if (judgement && judgement.research && evidenceRank(weighed.level) >= evidenceRank("observed") && !weighed.isolated && impact >= 60 && weighed.confidence >= ctx.settings.rules.leakMinConfidence) {
    decision = "accepted"
    reason = `High impact (${impact}) with ${weighed.level} evidence. ${judgement.assessment} It will be researched and reviewed by an editor before anything is published.`
  } else if (round >= 4) {
    decision = "rejected"
    reason = `${weighed.isolated ? "Still an isolated reference after four checks." : "Evidence not strong enough to report."} ${judgement ? `Other explanations: ${judgement.alternatives.join("; ")}.` : ""} ${reason}`
  } else {
    reason = `${weighed.isolated ? "Isolated so far; checking again in six hours." : "Not strong enough yet; checking again in six hours."} ${judgement ? `Other explanations: ${judgement.alternatives.join("; ")}.` : ""} ${reason}`
  }
  await update(ctx.db, "news_leads", `id=eq.${id}`, {
    evidence: evidence.slice(0, 40),
    evidence_level: weighed.level,
    leak_confidence: weighed.confidence,
    score: Math.round(impact * 0.6 + weighed.confidence * 0.4),
    score_parts: { impact, confidence: weighed.confidence, round, ...(judgement ? { alternatives: judgement.alternatives.join(" | ").slice(0, 900) } : {}) },
    decision,
    reason: reason.slice(0, 800),
    track: weighed.level === "confirmed" ? "news" : "leak",
    title: judgement?.title && decision === "accepted" ? judgement.title.slice(0, 300) : lead.title,
    decided_at: decision === "new" ? null : new Date().toISOString(),
  })
  ctx.log.add({ agent: "leaks", action: "corroborate", outcome: decision, reason, leadId: id, detail: { evidence: evidence.length, level: weighed.level, confidence: weighed.confidence } })
  if (decision === "accepted") await enqueue(ctx.db, { kind: "research", payload: { lead: id }, priority: 55, dedupe: `research:${id}`, runId: ctx.runId })
  else if (decision === "new") await enqueue(ctx.db, { kind: "corroborate", payload: { lead: id, round: round + 1 }, priority: 35, delaySeconds: 6 * 3600, dedupe: `corroborate:${id}:${round + 1}`, runId: ctx.runId })
  return { result: { decision, level: weighed.level, confidence: weighed.confidence } }
}

type CandidateRow = {
  id: number
  hash: string
  url: string
  title: string
  excerpt: string
  publisher: string
  published_at: string | null
  internal_only: boolean
  created_at: string
  desk: string | null
  scout: string | null
  metrics: Record<string, number | string> | null
  via: string | null
  source: { kind: Signal["kind"]; category_hint: string | null; desk: string | null } | null
}

async function publishedStories(db: Db): Promise<Published[]> {
  const rows = await select<{ id: string; title: string; story_key: string | null; sources: { url: string }[] | null; published_at: string | null; desk: string | null; status: string }>(
    db,
    "news_stories",
    `status=in.(published,scheduled,draft)&created_at=gte.${new Date(Date.now() - 60 * DAY).toISOString()}&order=created_at.desc&limit=400&select=id,title,story_key,sources,published_at,desk,status`
  ).catch(() => [])
  return rows.map((r) => ({ id: r.id, title: r.title, storyKey: r.story_key, sources: (r.sources ?? []).map((s) => s.url).filter(Boolean), publishedAt: r.published_at, desk: r.desk, status: r.status }))
}

async function onTriage(ctx: EngineContext, job: Job): Promise<Outcome> {
  const days = typeof job.payload.days === "number" ? Math.min(30, Math.max(1, job.payload.days)) : 4
  const backfill = job.payload.backfill === true
  const onlyDesks = Array.isArray(job.payload.desks) ? new Set((job.payload.desks as unknown[]).filter((x): x is string => typeof x === "string")) : null
  const since = new Date(Date.now() - days * DAY).toISOString()
  const cands = await select<CandidateRow>(
    ctx.db,
    "news_signals",
    `used=is.false&created_at=gte.${since}&order=created_at.desc&limit=400&select=id,hash,url,title,excerpt,publisher,published_at,internal_only,created_at,desk,scout,metrics,via,source:news_sources(kind,category_hint,desk)`
  )
  const signals: EngineSignal[] = cands.map((c) => ({
    id: c.id,
    hash: c.hash,
    url: c.url,
    title: c.title,
    excerpt: c.excerpt,
    publisher: c.publisher,
    publishedAt: c.published_at,
    internalOnly: c.internal_only,
    categoryHint: null,
    kind: c.source?.kind ?? "site",
    desk: c.desk ?? c.source?.desk ?? c.source?.category_hint ?? null,
    scout: c.scout ?? c.source?.kind ?? "rss",
    metrics: c.metrics,
    via: c.via,
  }))
  const byHash = new Map(signals.map((s) => [s.hash, s]))
  const published = await publishedStories(ctx.db)
  const scored = clusterSignals(signals)
    .map((c) => scoreCluster(c, c.signals.map((s) => byHash.get(s.hash)!).filter(Boolean), ctx.deskMap, published))
    .filter((s) => !onlyDesks || (s.desk && onlyDesks.has(s.desk)))
    .sort((a, b) => b.score - a.score)

  // The best candidates go to the triage agent; the long tail is set aside once it is two days old.
  const top = scored.slice(0, backfill ? 30 : 24)
  const tail = scored.slice(top.length)
  const stale = tail.filter((s) => s.signals.every((x) => Date.now() - Date.parse(cands.find((c) => c.hash === x.hash)?.created_at ?? "") > 2 * DAY))
  const staleIds = stale.flatMap((s) => s.signals.map((x) => x.id).filter((n): n is number => typeof n === "number"))
  if (staleIds.length) await update(ctx.db, "news_signals", `id=in.(${staleIds.slice(0, 300).join(",")})`, { used: true }).catch(() => {})

  const verdicts = new Map<number, Verdict>()
  let aiNote = ""
  if (!ctx.aiOff) {
    const enabled = ctx.desks.filter((d) => d.enabled && !d.leakTrack)
    for (let i = 0; i < top.length; i += 8) {
      try {
        const vs = await triage(stageAsk(stageCtx(ctx, job), "triage"), top.slice(i, i + 8), enabled)
        for (const v of vs) verdicts.set(i + v.index, { ...v, index: i + v.index })
      } catch (err) {
        if (err instanceof AiError && err.code === "not_configured") {
          ctx.aiOff = true
          break
        }
        if (err instanceof BudgetError) {
          aiNote = "The triage agent ran out of this tick's budget; the rest were judged by score alone."
          break
        }
        aiNote = `The triage agent failed on one batch (${err instanceof Error ? err.message.slice(0, 120) : "error"}); those were judged by score alone.`
      }
    }
  }
  if (ctx.aiOff) aiNote = "AI is not switched on, so candidates were judged by score alone and wait for AI to be researched."

  const today = new Date().toISOString().slice(0, 10)
  const writtenToday = (await select<{ id: string }>(ctx.db, "news_stories", `ai_generated=is.true&created_at=gte.${today}T00:00:00Z&select=id`).catch(() => [])).length
  const roomToday = Math.max(0, ctx.settings.rules.maxPerDay - writtenToday)

  const accepted: { s: Scored; leadId: number; score: number; desk: string }[] = []
  let rejected = 0
  for (let i = 0; i < top.length; i++) {
    const s = top[i]
    const v = verdicts.get(i) ?? null
    const desk = v?.desk ?? s.desk ?? ctx.desks.find((d) => d.kind === "industry")?.id ?? null
    const d = desk ? ctx.deskMap.get(desk) : undefined
    const score = blend(s.score, v ? { impact: v.impact, originality: v.originality } : null)
    const bar = d?.minScore ?? 65
    let decision: LeadRow["decision"]
    let reason: string
    if (s.match?.kind === "duplicate") {
      decision = "duplicate"
      reason = `Already covered in “${s.match.title}” (similarity ${s.match.similarity}), with no new sources.`
    } else if (v?.decision === "update" || (s.match?.kind === "update" && (!v || v.decision !== "skip"))) {
      decision = "update"
      reason = `Develops “${s.match?.title}” with ${s.match?.newSources.length ?? 0} new source(s). ${v?.reason ?? ""}`.trim()
    } else if (v && v.decision === "skip") {
      decision = "rejected"
      reason = v.reason
    } else if (v && v.evidence === "rumor") {
      decision = "rejected"
      reason = `Rumour without enough evidence. ${v.reason}`
    } else if (!d || !d.enabled) {
      decision = "rejected"
      reason = "No enabled desk covers it."
    } else if (score < bar) {
      decision = "rejected"
      reason = `Below the ${d.label} desk's bar (score ${score}, needs ${bar}).${v ? ` ${v.reason}` : ""}`
    } else {
      decision = "accepted"
      reason = v ? v.reason : `Score ${score} passes the ${d.label} desk's bar of ${bar} (judged without AI).`
    }
    const primary = s.signals[0]
    const leadRow = {
      desk,
      track: "news",
      scout: [...new Set(s.signals.map((x) => x.scout))].join(",").slice(0, 40),
      title: (v?.title || primary.title).slice(0, 300),
      url: primary.url,
      summary: s.signals.map((x) => x.excerpt).find(Boolean)?.slice(0, 2000) ?? "",
      publisher: [...new Set(s.signals.map((x) => x.publisher))].slice(0, 3).join(", ").slice(0, 120),
      published_at: primary.publishedAt,
      evidence_level: v?.evidence ?? (s.signals.some((x) => x.scout === "rss" || x.scout === "site" || x.scout === "federal") ? "confirmed" : "observed"),
      availability: v?.availability ?? null,
      score,
      score_parts: { ...s.parts, base: s.score, ...(v ? { impact: v.impact, originality: v.originality, sensitive: v.sensitive ? 1 : 0 } : {}), ...(s.flags.length ? { flags: s.flags.join("; ").slice(0, 300) } : {}) },
      evidence: s.signals.slice(0, 12).map((x) => ({ url: x.url, kind: x.via ? "discovery" : x.scout, note: `${x.publisher}: ${x.title.slice(0, 200)}${x.via ? ` (found through ${x.via}; not cited)` : ""}` })),
      signal_ids: s.signals.map((x) => x.id).filter((n): n is number => typeof n === "number").slice(0, 40),
      story_key: s.storyKey,
      match_story: s.match?.id ?? null,
      decision,
      reason: reason.slice(0, 800),
      model: v ? "triage" : null,
      run_id: ctx.runId,
      decided_at: new Date().toISOString(),
      proposal: decision === "update" ? { newSources: s.match?.newSources.slice(0, 6) ?? [] } : null,
    }
    const ins = await insert<{ id: number }>(ctx.db, "news_leads", leadRow).catch((err: unknown) => {
      console.warn("[newsroom] lead:", err instanceof Error ? err.message : err)
      return [] as { id: number }[]
    })
    const leadId = ins[0]?.id
    const ids = leadRow.signal_ids
    if (ids.length) await update(ctx.db, "news_signals", `id=in.(${ids.join(",")})`, { used: true }).catch(() => {})
    if (!leadId) continue
    ctx.log.add({ agent: "triage", action: "judge", outcome: decision, reason: `${leadRow.title.slice(0, 120)}: ${reason}`.slice(0, 1200), leadId, detail: { score, parts: leadRow.score_parts } })
    if (decision === "accepted" && desk) accepted.push({ s, leadId, score, desk })
    else if (decision === "update" && s.match) await enqueue(ctx.db, { kind: "update", payload: { lead: leadId }, priority: 45, dedupe: `update:${leadId}`, runId: ctx.runId })
    else rejected++
  }

  // Research slots: shared by activity and priority, or a fixed number per desk for a backfill.
  const perDesk = backfill ? new Map([...new Set(accepted.map((a) => a.desk))].map((d) => [d, Number(job.payload.perDesk) || ctx.settings.backfill.perDesk])) : allocate(ctx.settings.limits.researchPerCycle, accepted.map((a) => ({ desk: a.desk, score: a.score })), ctx.deskMap)
  const used = new Map<string, number>()
  let queued = 0
  for (const a of accepted.sort((x, y) => y.score - x.score)) {
    const slots = perDesk.get(a.desk) ?? 0
    const taken = used.get(a.desk) ?? 0
    const fits = taken < slots && (backfill || queued < roomToday)
    const delay = fits ? 0 : 3600
    await enqueue(ctx.db, { kind: "research", desk: a.desk, payload: { lead: a.leadId, backfill }, priority: Math.round(50 + (100 - a.score) / 5), delaySeconds: delay, dedupe: `research:${a.leadId}`, runId: ctx.runId })
    await update(ctx.db, "news_leads", `id=eq.${a.leadId}`, { decision: "queued", reason: fits ? undefined : `Accepted; waits for a research slot (${!backfill && queued >= roomToday ? "today's ceiling of AI stories is reached" : "the desk's slots this cycle are taken"}).` }).catch(() => {})
    if (fits) {
      used.set(a.desk, taken + 1)
      queued++
    }
  }
  const note = `${scored.length} candidates from ${signals.length} signals; ${top.length} judged, ${accepted.length} accepted (${queued} researched now), ${rejected} set aside.${aiNote ? ` ${aiNote}` : ""}`
  ctx.log.add({ agent: "triage", action: "triage", outcome: `${accepted.length} accepted`, reason: note, detail: { slots: Object.fromEntries(perDesk) } })
  return { result: { candidates: scored.length, judged: top.length, accepted: accepted.length, queued, note } }
}

function signalFromLead(e: EvidenceItem, publisher: string): Signal {
  return { hash: signalHash(e.url), url: e.url, title: e.note.replace(/^[^:]+:\s*/, ""), excerpt: "", publisher, publishedAt: null, internalOnly: /arxiv\.org/.test(e.url), categoryHint: null, kind: "site" }
}

const sourcesOf = (rows: { url: string; title: string; excerpt: string; publisher: string; published_at: string | null; internal_only: boolean; scout: string | null; via: string | null; metrics: Record<string, number | string> | null }[]): (Signal & { metrics: Record<string, number | string> | null; via: string | null })[] =>
  rows.map((r) => ({ hash: signalHash(r.url), url: r.url, title: r.title, excerpt: r.excerpt, publisher: r.publisher, publishedAt: r.published_at, internalOnly: r.internal_only, categoryHint: null, kind: r.scout === "github_releases" ? "github_releases" : "site", metrics: r.metrics, via: r.via }))

async function onResearch(ctx: EngineContext, job: Job): Promise<Outcome> {
  const id = Number(job.payload.lead)
  const rows = await select<LeadRow>(ctx.db, "news_leads", `id=eq.${id}&select=*`)
  const lead = rows[0] ? toLead(rows[0]) : null
  if (!lead) return { result: { skipped: "no such lead" } }
  if (lead.storyId) return { result: { skipped: "already written" } }
  if (ctx.aiOff) return { retryInSeconds: 6 * 3600, result: { waiting: "AI is not switched on" } }
  const desk = (lead.desk && ctx.deskMap.get(lead.desk)) || ctx.desks[0]
  const leak = lead.track === "leak"

  // The material: the lead's signals (never the discovery platforms themselves), or its evidence for a leak.
  const sig = lead.signalIds.length
    ? await select<{ url: string; title: string; excerpt: string; publisher: string; published_at: string | null; internal_only: boolean; scout: string | null; via: string | null; metrics: Record<string, number | string> | null }>(
        ctx.db,
        "news_signals",
        `id=in.(${lead.signalIds.join(",")})&select=url,title,excerpt,publisher,published_at,internal_only,scout,via,metrics`
      )
    : []
  let material = sourcesOf(sig)
  if (!material.length) material = lead.evidence.filter((e) => e.kind !== "coverage" && e.kind !== "discovery").map((e) => ({ ...signalFromLead(e, lead.publisher), metrics: null, via: null }))
  if (!material.length && lead.url) material = [{ ...signalFromLead({ url: lead.url, kind: "source", note: lead.title }, lead.publisher), metrics: null, via: null }]
  // Primary: an official post over a repository over a paper over coverage.
  const rank = (s: Signal) => (s.internalOnly ? 2 : 0) + (s.kind === "github_releases" ? 1 : 0)
  material.sort((a, b) => rank(a) - rank(b))
  const [primary, ...rest] = material
  if (!primary) {
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "failed", reason: "No original source to read." })
    return { result: { failed: "no source" } }
  }

  await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "researching" }).catch(() => {})
  const depth: Depth = lead.score >= 80 || leak ? ctx.legacy.depth : lead.score >= 68 ? (ctx.legacy.depth === "short" ? "short" : "standard") : "short"
  const note = [
    lead.reason ? `Why the editors want this story: ${lead.reason}` : "",
    leak
      ? `This is an early signal found in public, original sources, not an announcement. Report only what the sources show, as observed facts ("the file lists", "the documentation names"). Present nothing as confirmed. Include the other explanations the evidence allows. Category "rumor", unconfirmed true.`
      : "",
    lead.availability && lead.availability !== "unknown" ? `The triage desk judged it ${lead.availability === "available" ? "available now" : lead.availability}; state clearly whether readers can use it today, only according to the sources.` : "State clearly whether what is described is available now, only announced, or planned, as the sources say.",
    lead.scoreParts.alternatives ? `Other explanations to weigh: ${String(lead.scoreParts.alternatives)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  const sCtx = stageCtx(ctx, job)
  const res = await research({
    db: ctx.db,
    primary,
    cluster: rest,
    settings: ctx.legacy,
    depth,
    ask: researchAsk(sCtx),
    note,
    officialSites: await officialSites(ctx.db),
    deadline: Math.min(ctx.deadline, Date.now() + 200_000),
    desk: brief(desk),
  }).catch((err: unknown) => {
    if (err instanceof AiError) throw err
    return { ok: false as const, reason: err instanceof Error ? err.message.slice(0, 200) : "research failed" }
  })
  if (!res.ok) {
    const skipped = "skipped" in res && res.skipped
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: skipped ? "rejected" : "failed", reason: (skipped ? `The researcher passed: ${res.reason}` : `Research did not pass the checks: ${res.reason}`).slice(0, 800), decided_at: new Date().toISOString() })
    ctx.log.add({ agent: "researcher", action: "research", outcome: skipped ? "passed" : "failed", reason: res.reason, leadId: id })
    return { result: { failed: res.reason } }
  }
  const story = res.story
  ctx.log.add({ agent: "researcher", action: "research", outcome: `${story.report.verified} facts`, reason: story.report.steps.join("; ").slice(0, 1000), leadId: id, detail: { sources: story.sources.length, depth: story.depth, model: res.model } })
  ctx.log.add({
    agent: "checker",
    action: "fact check",
    outcome: story.report.checked ? "checked" : "not checked",
    reason: story.report.checked ? `${story.report.removed.length} sentences removed, ${story.report.unconfirmed.length} claims marked unconfirmed.` : story.report.note || "The second pass did not run.",
    leadId: id,
  })

  // The editor: charts from verified numbers, media from the sources, SEO, sensitivity, the publishing rules.
  const media = await mediaFor({ db: ctx.db, docs: res.docs, coverUrl: story.cover.url || null, metrics: material.map((m) => m.metrics).filter((m): m is Record<string, number | string> => Boolean(m)), budget: ctx.budget }).catch((): MediaItem[] => [])
  if (Date.now() < ctx.deadline - 25_000) {
    const chart = await chartFromFacts(stageAsk(sCtx, "editor"), res.facts).catch(() => null)
    if (chart) media.unshift(chart)
  }
  const rules = ctx.settings.rules
  const evidence: EvidenceLevel = leak ? (lead.evidenceLevel ?? "observed") : (lead.evidenceLevel ?? "observed")
  const publishers = new Set(story.sources.map((s) => s.publisher.toLowerCase()))
  const hits = sensitiveHits(`${story.title} ${story.dek} ${story.body}`, rules.sensitive)
  const review: string[] = []
  if (!ctx.canPublish) review.push("this run cannot publish (an editor without the publish right started it)")
  if (!rules.autoPublish) review.push("auto-publishing is switched off")
  if (!desk.autoPublish) review.push(`the ${desk.label} desk does not auto-publish`)
  if (leak || desk.leakTrack || story.category === "rumor" || story.unconfirmed) review.push("unconfirmed or leak: always reviewed")
  if (evidenceRank(evidence) < evidenceRank(rules.minEvidence)) review.push(`evidence is ${evidence}, below ${rules.minEvidence}`)
  if (rules.requireFactCheck && !story.report.checked) review.push("the fact check did not run")
  if (publishers.size < rules.minSources) review.push(`${publishers.size} independent source${publishers.size === 1 ? "" : "s"}, ${rules.minSources} needed`)
  if (lead.score < rules.minScore) review.push(`score ${lead.score} is below ${rules.minScore}`)
  if (hits.length) review.push(`sensitive subject (${hits.join(", ")})`)
  if (Number(lead.scoreParts.sensitive) === 1) review.push("the triage agent flagged it as sensitive")
  const status = review.length ? "draft" : "published"

  // An AI illustration only when no real image was found and the editors switched it on; always labelled.
  let coverAi = false
  if (ctx.settings.illustrations && story.cover.kind === "generated") {
    const ill = await illustrate(ctx.db, { title: story.title, dek: story.dek, desk: desk.label }).catch(() => null)
    if (ill) {
      story.cover = { url: ill.url, kind: "generated", width: 1280, height: 720, alt: `AI-generated illustration for “${story.title}”. Not a photo of the event.`, credit: null }
      coverAi = true
      ctx.log.add({ agent: "illustrator", action: "illustration", outcome: "made", reason: `No official or free-licensed image fit; generated with ${ill.model} and labelled as an illustration.`, leadId: id })
    }
  }

  const saved = await saveStory(ctx.db, story, { model: res.model, status, hashes: material.map((m) => m.hash) })
  const now = new Date().toISOString()
  const timeline: TimelineEntry[] = [{ at: now, kind: "published", title: status === "published" ? "Published" : "Written, waiting for an editor", note: "", sources: [] }]
  await update(ctx.db, "news_stories", `id=eq.${saved.id}`, {
    desk: desk.id,
    evidence,
    leak_confidence: leak ? lead.leakConfidence : null,
    impact: Number(lead.scoreParts.impact) || lead.score,
    availability: lead.availability,
    seo: seoFor(story.title, story.dek, lead.storyKey ?? storyKeyOf(story.title), desk),
    media,
    timeline,
    story_key: lead.storyKey ?? storyKeyOf(story.title),
    review_reason: review.length ? review.join("; ").slice(0, 600) : null,
    cover_ai: coverAi,
    ...(coverAi ? { cover: story.cover.url } : {}),
  }).catch((err: unknown) => console.warn("[newsroom] story extras:", err instanceof Error ? err.message : err))
  if (lead.signalIds.length) await update(ctx.db, "news_signals", `id=in.(${lead.signalIds.join(",")})`, { used: true, story_id: saved.id }).catch(() => {})
  await update(ctx.db, "news_leads", `id=eq.${id}`, {
    decision: status === "published" ? "published" : "review",
    story_id: saved.id,
    model: res.model.slice(0, 200),
    score_parts: { ...lead.scoreParts, questions: res.openQuestions.slice(0, 4) as unknown as string },
    reason: (status === "published" ? `Published automatically: every rule passed. ${lead.reason}` : `Waiting for an editor: ${review.join("; ")}.`).slice(0, 800),
    decided_at: now,
  })
  ctx.log.add({ agent: status === "published" ? "publisher" : "editor", action: status === "published" ? "publish" : "send to review", outcome: status, reason: status === "published" ? "Every auto-publish rule passed." : review.join("; "), leadId: id, storyId: saved.id, detail: { media: media.map((m) => m.type), evidence, title: saved.title } })
  if (status === "published") ctx.published++
  else ctx.drafts++
  return { result: { story: saved.id, status, title: saved.title } }
}

async function onUpdate(ctx: EngineContext, job: Job): Promise<Outcome> {
  const id = Number(job.payload.lead)
  const rows = await select<LeadRow>(ctx.db, "news_leads", `id=eq.${id}&select=*`)
  const lead = rows[0] ? toLead(rows[0]) : null
  if (!lead?.matchStory) return { result: { skipped: "no story to update" } }
  if (ctx.aiOff) return { retryInSeconds: 6 * 3600 }
  const stories = await select<{ id: string; title: string; dek: string; body: string; sources: { url: string; title: string; publisher: string }[]; timeline: unknown; status: string }>(ctx.db, "news_stories", `id=eq.${lead.matchStory}&select=id,title,dek,body,sources,timeline,status`)
  const story = stories[0]
  if (!story) return { result: { skipped: "the story is gone" } }
  const have = new Set(story.sources.map((s) => urlKey(s.url)))
  const urls = (Array.isArray(lead.proposal?.newSources) ? (lead.proposal.newSources as string[]) : lead.evidence.map((e) => e.url)).filter((u) => !have.has(urlKey(u))).slice(0, 3)
  const docs: Doc[] = []
  for (const u of urls) {
    const r = await readPage(u, { db: ctx.db, timeoutMs: 9_000 })
    if (!r.ok || r.page.text.length < 200) continue
    docs.push({ n: story.sources.length + docs.length + 1, url: r.page.url, title: r.page.title || u, publisher: r.page.siteName || hostname(u), publishedAt: r.page.publishedAt, role: "related", description: r.page.description, text: r.page.text, internalOnly: false, images: r.page.images })
  }
  if (!docs.length || story.sources.length + docs.length > 12) {
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "rejected", reason: docs.length ? "The story already cites twelve sources." : "The new pages could not be read." })
    return { result: { skipped: "no readable new pages" } }
  }
  const w = await writeUpdate(stageAsk(stageCtx(ctx, job), "update"), { title: story.title, dek: story.dek, body: story.body, sourceCount: story.sources.length }, docs)
  if (!w.ok) {
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "duplicate", reason: `No update written: ${w.reason}`.slice(0, 800), decided_at: new Date().toISOString() })
    ctx.log.add({ agent: "updater", action: "update", outcome: "no change", reason: w.reason, leadId: id, storyId: story.id })
    return { result: { skipped: w.reason } }
  }
  const at = new Date().toISOString()
  const entry: TimelineEntry = { at, kind: "update", title: w.update.title, note: w.update.note, sources: w.update.sources }
  const newSources = docs.map((d) => ({ url: d.url, title: d.title.slice(0, 300), publisher: d.publisher.slice(0, 80), excerpt: (d.description || d.text.slice(0, 300)).slice(0, 400), publishedAt: d.publishedAt }))
  const hits = sensitiveHits(`${w.update.title} ${w.update.note}`, ctx.settings.rules.sensitive)
  const apply = ctx.canPublish && ctx.settings.rules.autoUpdate && story.status === "published" && evidenceRank(w.update.evidence) >= evidenceRank("observed") && !hits.length
  const proposal = { entry, sources: newSources }
  if (apply) {
    const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(at))
    const body = `## Update, ${date}\n\n**${w.update.title}.** ${w.update.note}\n\n${story.body}`.slice(0, 20000)
    await update(ctx.db, "news_stories", `id=eq.${story.id}`, { body, sources: [...story.sources, ...newSources].slice(0, 12), timeline: [...(Array.isArray(story.timeline) ? story.timeline : []), entry].slice(-40), edit_reason: `update: ${w.update.title}`.slice(0, 300) })
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "published", story_id: story.id, proposal, reason: `Update applied: ${w.update.reason}`.slice(0, 800), decided_at: at })
    ctx.published++
  } else {
    await update(ctx.db, "news_leads", `id=eq.${id}`, { decision: "review", story_id: story.id, proposal, reason: `Update waiting for an editor${hits.length ? ` (sensitive: ${hits.join(", ")})` : ""}: ${w.update.reason}`.slice(0, 800), decided_at: at })
  }
  ctx.log.add({ agent: "updater", action: "update", outcome: apply ? "applied" : "to review", reason: `${w.update.title}: ${w.update.reason}`, leadId: id, storyId: story.id })
  return { result: { applied: apply } }
}

async function onBackfill(ctx: EngineContext, job: Job): Promise<Outcome> {
  const wanted = Array.isArray(job.payload.desks) ? (job.payload.desks as string[]).filter((d) => ctx.deskMap.get(d)?.enabled) : ctx.desks.filter((d) => d.enabled && !d.leakTrack).map((d) => d.id)
  const days = Math.min(30, Math.max(1, Number(job.payload.days) || ctx.settings.backfill.days))
  const perDesk = Math.min(6, Math.max(1, Number(job.payload.perDesk) || ctx.settings.backfill.perDesk))
  if (ctx.settings.scouts.rss) await enqueue(ctx.db, { kind: "collect", priority: 12, dedupe: "collect", runId: ctx.runId })
  for (const d of wanted) await enqueue(ctx.db, { kind: "scout", desk: d, payload: { days }, priority: 18, dedupe: `scout:${d}:backfill`, runId: ctx.runId })
  await enqueue(ctx.db, { kind: "triage", payload: { days, backfill: true, perDesk, desks: wanted }, priority: 38, delaySeconds: 20, dedupe: "triage:backfill", runId: ctx.runId })
  ctx.log.add({ agent: "planner", action: "backfill", outcome: "planned", reason: `Backfill of ${wanted.length} desks over the last ${days} days, up to ${perDesk} stories each.` })
  return { result: { desks: wanted, days, perDesk } }
}

const stageCtx = (ctx: EngineContext, job: Job): StageContext => ({ db: ctx.db, settings: ctx.settings, meter: ctx.meter, runId: ctx.runId, jobId: job.id })

const HANDLERS: Record<Job["kind"], (ctx: EngineContext, job: Job) => Promise<Outcome>> = {
  cycle: onCycle,
  collect: (ctx) => onCollect(ctx),
  scout: onScout,
  watch: (ctx) => onWatch(ctx),
  corroborate: onCorroborate,
  triage: onTriage,
  research: onResearch,
  update: onUpdate,
  backfill: onBackfill,
}

/** Seconds a job may need: research reads and writes for minutes, the rest is quick. */
const NEEDS: Partial<Record<Job["kind"], number>> = { research: 170, update: 60, triage: 60, scout: 40, collect: 60, watch: 40, corroborate: 40 }

// ─── The tick ───────────────────────────────────────────────────────────────────────────────────────────────

export type TickOptions = {
  db: Db
  trigger: "cron" | "manual"
  canPublish: boolean
  /** Stop starting jobs after this time (ms since epoch). */
  deadline?: number
  /** Queue a backfill before working. */
  backfill?: { desks?: string[]; days?: number; perDesk?: number }
  /** Start a research cycle now, even if one ran recently ("Run now"). */
  forceCycle?: boolean
}

export async function tick(o: TickOptions): Promise<TickSummary> {
  const { db } = o
  const started = Date.now()
  const { settings, legacy } = await loadSettings(db)
  const summary: TickSummary = { runId: null, status: "ok", jobsDone: 0, jobsFailed: 0, aiCalls: 0, tokens: 0, costUsd: 0, published: 0, drafts: 0, note: "", errors: [] }
  if (settings.paused && o.trigger === "cron" && !o.backfill) return { ...summary, status: "paused", note: "The research engine is paused in its settings." }
  const deadline = Math.min(o.deadline ?? started + settings.limits.tickSeconds * 1000, started + settings.limits.tickSeconds * 1000)
  const holder = `tick-${randomBytes(6).toString("hex")}`
  let locked = false
  try {
    locked = await takeLock(db, "engine", holder, Math.ceil((deadline - started) / 1000) + 90)
  } catch (err) {
    if (isMissing(err)) throw new EngineError("The research engine is not set up on this database yet: migration 20261021100000_newsroom_engine.sql needs to be applied.", 503)
    throw err
  }
  if (!locked) return { ...summary, status: "busy", note: "Another tick is working right now; this one stepped aside." }

  let runId: number | null = null
  try {
    const rows = await insert<{ id: number }>(db, "news_runs", { trigger: o.trigger, kind: o.backfill ? "backfill" : "engine" })
    runId = rows[0]?.id ?? null
  } catch (err) {
    if (!(err instanceof DbError && err.code === "P0001")) console.warn("[newsroom] run row:", err instanceof Error ? err.message : err)
  }
  summary.runId = runId
  const desks = await loadDesks(db)
  const ctx: EngineContext = {
    db,
    settings,
    legacy,
    desks,
    deskMap: new Map(desks.map((d) => [d.id, d])),
    canPublish: o.canPublish,
    log: new DecisionLog(db, runId),
    meter: new Meter(settings, await usageToday(db)),
    budget: new Budget(settings.limits.fetchesPerTick),
    runId,
    deadline,
    published: 0,
    drafts: 0,
    aiOff: false,
  }

  try {
    if (o.backfill) await enqueue(db, { kind: "backfill", payload: { desks: o.backfill.desks ?? null, days: o.backfill.days ?? settings.backfill.days, perDesk: o.backfill.perDesk ?? settings.backfill.perDesk }, priority: 4, dedupe: "backfill", runId })
    // A cycle when one is due.
    const last = await select<{ created_at: string }>(db, "news_jobs", "kind=eq.cycle&order=created_at.desc&limit=1&select=created_at").catch(() => [])
    const due = !settings.paused && (o.forceCycle || !last[0] || Date.now() - Date.parse(last[0].created_at) >= settings.cycleMinutes * 60_000 - 60_000)
    if (due) await enqueue(db, { kind: "cycle", priority: 5, dedupe: "cycle", runId })

    // Work the queue until the time, calls or tokens run out.
    while (Date.now() < deadline - 15_000) {
      const left = (deadline - Date.now()) / 1000
      const kinds = (Object.keys(HANDLERS) as Job["kind"][]).filter((k) => (NEEDS[k] ?? 20) <= left)
      if (!kinds.length) break
      const aiLeft = ctx.meter.calls < settings.limits.aiCallsPerTick && ctx.meter.tokens < settings.limits.tokensPerTick
      const allowed = aiLeft ? kinds : kinds.filter((k) => !["research", "update", "triage", "corroborate"].includes(k))
      const [job] = await claim(db, holder, { n: 1, leaseSeconds: Math.ceil(left) + 60, kinds: allowed })
      if (!job) break
      ctx.log.jobId = job.id
      try {
        const out = await HANDLERS[job.kind](ctx, job)
        await finish(db, job.id, { ok: !out.retryInSeconds, result: out.result, retryInSeconds: out.retryInSeconds })
        summary.jobsDone++
      } catch (err) {
        const budget = err instanceof BudgetError || (err instanceof AiError && err.code === "rate_limited")
        const aiOff = err instanceof AiError && err.code === "not_configured"
        if (aiOff) ctx.aiOff = true
        const message = err instanceof Error ? err.message.slice(0, 500) : "failed"
        await finish(db, job.id, budget || aiOff ? { ok: false, retryInSeconds: aiOff ? 6 * 3600 : 1200, result: { waiting: message } } : { ok: false, error: message }).catch(() => {})
        if (!budget && !aiOff) {
          summary.jobsFailed++
          summary.errors.push({ where: `${job.kind} #${job.id}`, error: message })
          ctx.log.add({ agent: "system", action: `job ${job.kind}`, outcome: "failed", reason: message })
        }
        if (budget) break
      }
    }
    summary.note = [
      ctx.aiOff ? "AI is not switched on for this site, so discovery and scoring ran and research waits." : "",
      ctx.meter.calls >= settings.limits.aiCallsPerTick ? "The tick's AI call limit was reached." : "",
      Date.now() >= deadline - 15_000 ? "The tick's time ran out; the queue continues next tick." : "",
    ]
      .filter(Boolean)
      .join(" ")
  } catch (err) {
    summary.status = "failed"
    summary.note = err instanceof Error ? err.message.slice(0, 300) : "The tick failed."
  } finally {
    ctx.log.jobId = null
    await ctx.log.flush()
    await releaseLock(db, "engine", holder)
    summary.aiCalls = ctx.meter.calls
    summary.tokens = ctx.meter.tokens
    summary.costUsd = Math.round(ctx.meter.costUsd * 1e6) / 1e6
    summary.published = ctx.published
    summary.drafts = ctx.drafts
    if (summary.status !== "failed" && summary.jobsFailed) summary.status = "partial"
    if (runId)
      await update(db, "news_runs", `id=eq.${runId}`, {
        status: summary.status === "busy" || summary.status === "paused" ? "ok" : summary.status,
        drafts: summary.drafts,
        published: summary.published,
        rejected: summary.jobsFailed,
        jobs_done: summary.jobsDone,
        ai_calls: summary.aiCalls,
        tokens: summary.tokens,
        cost_usd: summary.costUsd,
        errors: summary.errors.slice(0, 30),
        note: summary.note.slice(0, 500),
        finished_at: new Date().toISOString(),
        detail: { fetches: ctx.budget.fetches, premiumCalls: ctx.meter.premiumCalls },
      }).catch(() => {})
  }
  return summary
}

export { readEvidence }
