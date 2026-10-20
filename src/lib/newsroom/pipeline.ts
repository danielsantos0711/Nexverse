import { AiError } from "@/lib/ai/errors"
import { askJson } from "@/lib/ai/llm"
import { hostname } from "@/lib/live/http"
import { isDepth, makeSlug, readNewsroomSettings, toSource, type Depth, type NewsroomSettings, type NewsSource, type RunSummary, type SourceRow } from "@/lib/newsroom"
import { clusterSignals, pickClusters, type Cluster, type Signal } from "./cluster"
import { collectSource } from "./collect"
import { siteOf } from "./gather"
import { signalHash } from "./parse"
import { research, type AskFn, type Researched } from "./research"
import { DbError, insert, isMissing, rpc, select, update, upsert, type Db } from "./rest"

/*
 * Server only. One newsroom run: collect every enabled source, store new signals (deduplicated by address),
 * group the fresh ones, and research and write up to the day's allowance of stories. The first stories of a
 * run (the editors' "deep stories per run") are researched at the chosen depth: several official pages read,
 * a brief of verified facts, the story in sections with citations, a second fact-check pass and the best
 * cover; the rest of the run is written short, to stay inside the free AI quota. Stories go to the editors'
 * queue as drafts, or straight out when the editors switched auto-publish on for that category (never for
 * rumours, and by default only when the fact check passed) and the caller may publish.
 * Used by the daily cron (service role) and by "Collect now" (the editor's own session).
 */

export type { AskFn } from "./research"
export { pagePublished } from "./page"

export type RunOptions = {
  db: Db
  trigger: "cron" | "manual"
  /** Whether stories may be published without review (service role, or an editor with news.publish). */
  canPublish: boolean
  /** The model call; tests pass a stand-in. */
  ask?: AskFn
  /** Stop starting new work after this time (ms since epoch). */
  deadline?: number
}

export class RunError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

const DAY = 864e5

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

/** Site → publisher for every source the newsroom reads, so links between vendors' official pages count. */
export async function officialSites(db: Db): Promise<Map<string, string>> {
  const rows = await select<{ kind: string; url: string | null; publisher: string }>(db, "news_sources", "enabled=is.true&select=kind,url,publisher").catch(() => [])
  const out = new Map<string, string>()
  for (const r of rows) {
    if ((r.kind !== "rss" && r.kind !== "site") || !r.url) continue
    const site = siteOf(hostname(r.url))
    if (site && !out.has(site)) out.set(site, r.publisher || site)
  }
  return out
}

/** The row for a researched story, with the long-form columns unless the database does not have them yet. */
function storyRow(s: Researched, model: string, legacy: boolean) {
  const base = {
    title: s.title,
    dek: s.dek,
    body: s.body,
    category: s.category,
    unconfirmed: s.unconfirmed,
    sources: s.sources,
    cover: s.cover.kind === "generated" ? null : s.cover.url || null,
    model: model.slice(0, 120),
  }
  if (legacy) return base
  return {
    ...base,
    cover_kind: s.cover.kind,
    cover_credit: s.cover.kind === "generated" ? null : s.cover.credit,
    cover_alt: s.cover.alt.slice(0, 300) || null,
    cover_candidates: s.candidates.slice(0, 24),
    key_facts: s.keyFacts,
    pull_quote: s.pullQuote,
    depth: s.depth,
    word_count: s.words,
  }
}

const missingColumn = (err: unknown) => err instanceof DbError && (err.code === "42703" || err.code === "PGRST204")

/** Insert a new story, or rewrite one in place (`replace`), then keep its fact-check report. */
export async function saveStory(
  db: Db,
  s: Researched,
  { model, status, hashes, replace }: { model: string; status: "draft" | "published"; hashes: string[]; replace?: string }
): Promise<{ id: string; slug: string; title: string }> {
  const write = async (legacy: boolean) => {
    const row = storyRow(s, model, legacy)
    if (replace) return update<{ id: string; slug: string; title: string }>(db, "news_stories", `id=eq.${replace}&select=id,slug,title`, { ...row, status: "draft", reject_note: null })
    return insert<{ id: string; slug: string; title: string }>(db, "news_stories", {
      ...row,
      slug: makeSlug(s.title),
      ai_generated: true,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      signal_hashes: hashes.slice(0, 20),
    })
  }
  let rows: { id: string; slug: string; title: string }[]
  try {
    rows = await write(false)
  } catch (err) {
    if (!missingColumn(err)) throw err
    rows = await write(true)
  }
  const saved = rows[0]
  if (!saved) throw new RunError("The story could not be saved.", 500)
  await upsert(db, "news_checks", { story_id: saved.id, report: s.report, model: model.slice(0, 200), updated_at: new Date().toISOString() }).catch(() => {})
  return saved
}

/** Which depth the n-th story of a run is written at. */
export const depthFor = (settings: NewsroomSettings, index: number): Depth => (index < settings.deepPerRun ? settings.depth : "short")

type CandidateRow = {
  id: number
  hash: string
  url: string
  title: string
  excerpt: string
  publisher: string
  published_at: string | null
  internal_only: boolean
  source: { kind: Signal["kind"]; category_hint: string | null } | null
}

export async function runNewsroom(o: RunOptions): Promise<RunSummary> {
  const { db, trigger } = o
  const ask: AskFn = o.ask ?? ((req) => askJson(req))
  const deadline = o.deadline ?? Date.now() + 240_000

  // Settings: auto-publish, the daily cap, and the pause switch.
  const settingsRows = await select<{ value: unknown }>(db, "site_settings", "key=eq.newsroom&select=value").catch(() => [])
  const settings = readNewsroomSettings(settingsRows[0]?.value)
  if (trigger === "cron" && settings.paused) {
    return { runId: null, status: "ok", sourcesChecked: 0, signalsNew: 0, drafts: 0, published: 0, rejected: 0, deep: 0, aiReady: true, note: "The newsroom is paused in its settings.", errors: [] }
  }

  // The run row; its insert trigger refuses a second run within five minutes.
  let runId: number
  try {
    const rows = await insert<{ id: number }>(db, "news_runs", { trigger })
    runId = rows[0].id
  } catch (err) {
    if (isMissing(err)) throw new RunError("The newsroom is not set up on this database yet. The newsroom migration needs to be applied.", 503)
    if (err instanceof DbError && err.code === "P0001") throw new RunError(err.message, 429)
    throw new RunError(err instanceof DbError && err.status === 403 ? "Your account cannot run the newsroom." : "The run could not start. Try again in a moment.", err instanceof DbError ? err.status : 500)
  }

  const errors: RunSummary["errors"] = []
  const summary: RunSummary = { runId, status: "ok", sourcesChecked: 0, signalsNew: 0, drafts: 0, published: 0, rejected: 0, deep: 0, aiReady: true, note: "", errors }

  try {
    // 1. Collect.
    const sources = (await select<SourceRow>(db, "news_sources", "enabled=is.true&select=*")).map(toSource)
    const collected = await pool(sources, 5, async (s: NewsSource) => ({ s, r: await collectSource(s) }))
    summary.sourcesChecked = collected.length
    const rows: Record<string, unknown>[] = []
    const seen = new Set<string>()
    for (const { s, r } of collected) {
      if (!r.ok) errors.push({ where: s.label, error: r.error })
      const err = r.ok ? "" : r.error
      if (db.as === "service") await update(db, "news_sources", `id=eq.${s.id}`, { last_checked: new Date().toISOString(), last_ok: r.ok, last_count: r.items.length, last_error: err || null }).catch(() => {})
      else await rpc(db, "news_source_checked", { source: s.id, ok: r.ok, items: r.items.length, err }).catch(() => {})
      for (const it of r.items) {
        const hash = signalHash(it.url)
        if (seen.has(hash)) continue
        seen.add(hash)
        rows.push({
          source_id: s.id,
          url: it.url,
          title: it.title,
          excerpt: it.excerpt,
          publisher: (s.publisher || hostname(it.url)).slice(0, 80),
          internal_only: s.internalOnly,
          // The first check of a source only takes a baseline: what it already lists is not news any more.
          used: !s.lastChecked && !it.publishedAt,
          published_at: it.publishedAt,
          hash,
        })
      }
    }
    if (rows.length) {
      const fresh = await insert<{ id: number }>(db, "news_signals", rows, { ignoreDuplicates: true, onConflict: "hash" })
      summary.signalsNew = fresh.length
    }

    // 2. How many stories today still allows (the daily run writes only on the editors' days).
    if (trigger === "cron" && !settings.days.includes(new Date().getUTCDay())) {
      summary.note = "Today is not a writing day in the newsroom's schedule; signals were collected."
      return summary
    }
    const today = new Date().toISOString().slice(0, 10)
    const written = await select<{ id: string }>(db, "news_stories", `ai_generated=is.true&created_at=gte.${today}T00:00:00Z&select=id`)
    const room = Math.max(0, Math.min(settings.perRun, settings.dailyCap - written.length))
    if (!room) {
      summary.note = settings.dailyCap ? `Today's limit of ${settings.dailyCap} AI stories is reached; signals were collected for tomorrow.` : "AI writing is switched off (daily limit 0); signals were collected."
      return summary
    }

    // 3. Group the fresh, unused signals and write the best groups up.
    const since = new Date(Date.now() - 3 * DAY).toISOString()
    const cands = await select<CandidateRow>(
      db,
      "news_signals",
      `used=is.false&created_at=gte.${since}&order=created_at.desc&limit=250&select=id,hash,url,title,excerpt,publisher,published_at,internal_only,source:news_sources(kind,category_hint)`
    )
    const signals: Signal[] = cands.map((c) => ({
      id: c.id,
      hash: c.hash,
      url: c.url,
      title: c.title,
      excerpt: c.excerpt,
      publisher: c.publisher,
      publishedAt: c.published_at,
      internalOnly: c.internal_only,
      categoryHint: (c.source?.category_hint as Signal["categoryHint"]) ?? null,
      kind: c.source?.kind ?? "rss",
    }))
    const clusters = pickClusters(clusterSignals(signals), room * 2)
    const sites = await officialSites(db)
    let index = 0
    for (const c of clusters) {
      if (summary.drafts + summary.published >= room) break
      if (Date.now() > deadline) {
        summary.note = "Stopped early to stay within the time limit; the rest waits for the next run."
        break
      }
      const depth = depthFor(settings, index++)
      const outcome = await writeCluster(db, c, { ask, settings, depth, canPublish: o.canPublish, sites, deadline }).catch((err: unknown) => {
        if (err instanceof AiError) throw err
        return { ok: false as const, reason: err instanceof Error ? err.message : "could not save" }
      })
      if (outcome.ok) {
        if (outcome.status === "published") summary.published++
        else summary.drafts++
        if (outcome.depth !== "short") summary.deep++
      } else {
        summary.rejected++
        errors.push({ where: c.signals[0].title.slice(0, 80), error: `story not saved: ${outcome.reason}` })
      }
    }
    if (!summary.note) summary.note = clusters.length ? "" : "No fresh signals to write about."
  } catch (err) {
    if (err instanceof AiError && err.code === "rate_limited") {
      summary.note = `${err.message} Signals were collected and wait for the next run.`
    } else if (err instanceof AiError) {
      summary.aiReady = false
      summary.note = "AI is not switched on for this site yet, so no stories were written. Signals were collected and wait in the queue."
    } else {
      summary.status = "failed"
      summary.note = err instanceof Error ? err.message.slice(0, 300) : "The run failed."
    }
  } finally {
    if (summary.status !== "failed" && errors.length) summary.status = "partial"
    const finished = {
      status: summary.status,
      sources_checked: summary.sourcesChecked,
      signals_new: summary.signalsNew,
      drafts: summary.drafts,
      published: summary.published,
      rejected: summary.rejected,
      errors: errors.slice(0, 30).map((e) => ({ where: e.where.slice(0, 120), error: e.error.slice(0, 300) })),
      note: summary.note.slice(0, 500),
      finished_at: new Date().toISOString(),
    }
    await update(db, "news_runs", `id=eq.${runId}`, { ...finished, deep: summary.deep }).catch(() => update(db, "news_runs", `id=eq.${runId}`, finished).catch(() => {}))
  }
  return summary
}

async function writeCluster(
  db: Db,
  c: Cluster,
  o: { ask: AskFn; settings: NewsroomSettings; depth: Depth; canPublish: boolean; sites: Map<string, string>; deadline: number }
): Promise<{ ok: true; status: "draft" | "published"; depth: Depth } | { ok: false; reason: string }> {
  const ids = c.signals.map((s) => s.id).filter((n): n is number => typeof n === "number")
  const done = (storyId: string | null) => (ids.length ? update(db, "news_signals", `id=in.(${ids.join(",")})`, { used: true, story_id: storyId }).catch(() => {}) : Promise.resolve())
  // The main page is the cluster's best-known publisher's (a vendor post over a release over an arXiv listing).
  const ordered = [...c.signals].sort((a, b) => Number(a.internalOnly) - Number(b.internalOnly) || Number(a.kind === "github_releases") - Number(b.kind === "github_releases"))
  const primary = ordered[0]
  const newest = Math.max(...c.signals.map((s) => (s.publishedAt ? Date.parse(s.publishedAt) : Date.now())))
  if (Date.now() - newest > 10 * DAY) {
    await done(null)
    return { ok: false, reason: "the newest source is more than ten days old" }
  }
  const res = await research({ db, primary, cluster: ordered.slice(1), settings: o.settings, depth: o.depth, ask: o.ask, officialSites: o.sites, deadline: o.deadline + 50_000 })
  if (!res.ok) {
    // A group the model skipped or got wrong is not retried on every run.
    await done(null)
    return res
  }
  const s = res.story
  const checkedEnough = !o.settings.autoPublishNeedsCheck || s.report.checked
  const status = o.canPublish && s.category !== "rumor" && o.settings.autoPublish[s.category] === true && checkedEnough ? "published" : "draft"
  const saved = await saveStory(db, s, { model: res.model, status, hashes: c.signals.map((x) => x.hash) })
  await done(saved.id)
  return { ok: true, status, depth: s.depth }
}

const pageSignal = (url: string): Signal => ({ hash: signalHash(url), url, title: url, excerpt: "", publisher: "", publishedAt: null, internalOnly: false, categoryHint: null, kind: "site" })

/**
 * A story from one page an editor (or a member's tip) pointed at, researched at the chosen depth. Always a
 * draft. With `replace`, an existing draft is researched again from its own sources and rewritten in place.
 */
export async function draftFromPage(
  db: Db,
  url: string,
  note: string,
  { depth, ask = (req) => askJson(req), replace, extraUrls = [] }: { depth?: Depth; ask?: AskFn; replace?: string; extraUrls?: string[] } = {}
) {
  const settingsRows = await select<{ value: unknown }>(db, "site_settings", "key=eq.newsroom&select=value").catch(() => [])
  const settings = readNewsroomSettings(settingsRows[0]?.value)
  const want: Depth = isDepth(depth) ? depth : settings.depth
  const res = await research({ db, primary: pageSignal(url), settings, depth: want, ask, note, officialSites: await officialSites(db), extraUrls, deadline: Date.now() + 230_000 })
  if (!res.ok) throw new RunError(res.skipped ? `The AI passed on this page: ${res.reason.replace(/^skipped: /, "")}.` : `The AI draft did not pass the newsroom's checks: ${res.reason}.`, 422)
  const saved = await saveStory(db, res.story, { model: res.model, status: "draft", hashes: [signalHash(url)], replace })
  return { story: saved, depth: res.story.depth, words: res.story.words, checked: res.story.report.checked, note: res.story.report.note }
}
