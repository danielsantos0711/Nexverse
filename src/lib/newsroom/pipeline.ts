import { AiError } from "@/lib/ai/errors"
import { askJson, type JsonSchema, type LlmOptions } from "@/lib/ai/llm"
import { htmlToText } from "@/lib/ai/safe-url"
import { hostname } from "@/lib/live/http"
import { makeSlug, readNewsroomSettings, toSource, type NewsSource, type RunSummary, type SourceRow } from "@/lib/newsroom"
import { clusterSignals, pickClusters, type Cluster, type Signal } from "./cluster"
import { collectSource } from "./collect"
import { getPage } from "./http"
import { signalHash } from "./parse"
import { DbError, insert, isMissing, rpc, select, update, type Db } from "./rest"
import { readStory, storyRequest, type Material, type WrittenStory } from "./writer"

/*
 * Server only. One newsroom run: collect every enabled source, store new signals (deduplicated by address),
 * group the fresh ones, and have the free AI write up to the day's allowance of stories, each checked
 * against its material before it is saved. Stories go to the editors' queue as drafts, or straight out when
 * the editors switched auto-publish on for that category (never for rumours) and the caller may publish.
 * Used by the daily cron (service role) and by "Collect now" (the editor's own session).
 */

export type AskFn = (o: LlmOptions & { schema: JsonSchema }) => Promise<{ json: unknown; model: string }>

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
const PAGE_CHARS = 6000

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

/** The date a page says it was published (Open Graph, schema.org or a <time> element), if it says. */
export function pagePublished(html: string): string | null {
  const raw =
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|date|pubdate)["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1]
  const t = raw ? Date.parse(raw) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** The article pages behind the first signals of a cluster, as plain text, best effort. */
export async function readPages(signals: Signal[], max = 2): Promise<Material[]> {
  return Promise.all(
    signals.map(async (signal, i) => {
      if (i >= max) return { signal }
      const got = await getPage(signal.url, 8_000)
      if (!got.ok) return { signal }
      const page = htmlToText(got.text, PAGE_CHARS)
      // A page that dates itself fills in a signal that came without a date (news pages without feeds).
      const dated = signal.publishedAt ? signal : { ...signal, publishedAt: pagePublished(got.text) }
      return { signal: dated, page: { title: page.title, text: [page.description, page.text].filter(Boolean).join("\n\n").slice(0, PAGE_CHARS) } }
    })
  )
}

/** Asks for one story and checks it. Throws AiError when AI is not available at all. */
export async function writeStory(material: Material[], ask: AskFn, note = ""): Promise<{ ok: true; story: WrittenStory; model: string } | { ok: false; reason: string }> {
  const req = storyRequest(material, note)
  let res: { json: unknown; model: string }
  try {
    res = await ask({ ...req, job: "news" })
  } catch (err) {
    if (err instanceof AiError && (err.code === "not_configured" || err.status === 503)) throw err
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "the AI request failed" }
  }
  const verdict = readStory(res.json, material)
  return verdict.ok ? { ok: true, story: verdict.story, model: res.model } : { ok: false, reason: verdict.reason }
}

export async function saveStory(db: Db, s: WrittenStory, { model, status, hashes }: { model: string; status: "draft" | "published"; hashes: string[] }) {
  const rows = await insert<{ id: string; slug: string; title: string }>(db, "news_stories", {
    slug: makeSlug(s.title),
    title: s.title,
    dek: s.dek,
    body: s.body,
    category: s.category,
    unconfirmed: s.unconfirmed,
    sources: s.sources,
    ai_generated: true,
    model: model.slice(0, 120),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    signal_hashes: hashes.slice(0, 20),
  })
  return rows[0]
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
    return { runId: null, status: "ok", sourcesChecked: 0, signalsNew: 0, drafts: 0, published: 0, rejected: 0, aiReady: true, note: "The newsroom is paused in its settings.", errors: [] }
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
  const summary: RunSummary = { runId, status: "ok", sourcesChecked: 0, signalsNew: 0, drafts: 0, published: 0, rejected: 0, aiReady: true, note: "", errors }

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

    // 2. How many stories today still allows.
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
    for (const c of clusters) {
      if (summary.drafts + summary.published >= room) break
      if (Date.now() > deadline) {
        summary.note = "Stopped early to stay within the time limit; the rest waits for the next run."
        break
      }
      const outcome = await writeCluster(db, c, ask, settings.autoPublish, o.canPublish).catch((err: unknown) => {
        if (err instanceof AiError) throw err
        return { ok: false as const, reason: err instanceof Error ? err.message : "could not save" }
      })
      if (outcome.ok) {
        if (outcome.status === "published") summary.published++
        else summary.drafts++
      } else {
        summary.rejected++
        errors.push({ where: c.signals[0].title.slice(0, 80), error: `story not saved: ${outcome.reason}` })
      }
    }
    if (!summary.note) summary.note = clusters.length ? "" : "No fresh signals to write about."
  } catch (err) {
    if (err instanceof AiError) {
      summary.aiReady = false
      summary.note = "AI is not switched on for this site yet, so no stories were written. Signals were collected and wait in the queue."
    } else {
      summary.status = "failed"
      summary.note = err instanceof Error ? err.message.slice(0, 300) : "The run failed."
    }
  } finally {
    if (summary.status !== "failed" && errors.length) summary.status = "partial"
    await update(db, "news_runs", `id=eq.${runId}`, {
      status: summary.status,
      sources_checked: summary.sourcesChecked,
      signals_new: summary.signalsNew,
      drafts: summary.drafts,
      published: summary.published,
      rejected: summary.rejected,
      errors: errors.slice(0, 30).map((e) => ({ where: e.where.slice(0, 120), error: e.error.slice(0, 300) })),
      note: summary.note.slice(0, 500),
      finished_at: new Date().toISOString(),
    }).catch(() => {})
  }
  return summary
}

async function writeCluster(
  db: Db,
  c: Cluster,
  ask: AskFn,
  autoPublish: Record<string, boolean>,
  canPublish: boolean
): Promise<{ ok: true; status: "draft" | "published" } | { ok: false; reason: string }> {
  const ids = c.signals.map((s) => s.id).filter((n): n is number => typeof n === "number")
  const done = (storyId: string | null) => (ids.length ? update(db, "news_signals", `id=in.(${ids.join(",")})`, { used: true, story_id: storyId }).catch(() => {}) : Promise.resolve())
  const material = await readPages(c.signals.slice(0, 5))
  const newest = Math.max(...material.map((m) => (m.signal.publishedAt ? Date.parse(m.signal.publishedAt) : Date.now())))
  if (Date.now() - newest > 10 * DAY) {
    await done(null)
    return { ok: false, reason: "the newest source is more than ten days old" }
  }
  const res = await writeStory(material, ask)
  if (!res.ok) {
    // A group the model skipped or got wrong is not retried on every run.
    await done(null)
    return res
  }
  const status = canPublish && res.story.category !== "rumor" && autoPublish[res.story.category] === true ? "published" : "draft"
  const saved = await saveStory(db, res.story, { model: res.model, status, hashes: c.signals.map((s) => s.hash) })
  await done(saved?.id ?? null)
  return { ok: true, status }
}

/** A story from one page an editor (or a member's tip) pointed at. Always a draft. */
export async function draftFromPage(db: Db, url: string, note: string, ask: AskFn = (req) => askJson(req)) {
  const got = await getPage(url, 10_000)
  if (!got.ok) throw new RunError(`That page could not be read: ${got.error}.`, 422)
  const page = htmlToText(got.text, PAGE_CHARS)
  if (page.text.length < 200 && !page.description) throw new RunError("That page has almost no readable text (it may need JavaScript).", 422)
  const signal: Signal = {
    hash: signalHash(got.url),
    url: got.url,
    title: page.title || got.url,
    excerpt: page.description,
    publisher: hostname(got.url),
    publishedAt: null,
    internalOnly: false,
    categoryHint: null,
    kind: "site",
  }
  const res = await writeStory([{ signal, page: { title: page.title, text: [page.description, page.text].filter(Boolean).join("\n\n").slice(0, PAGE_CHARS) } }], ask, note)
  if (!res.ok) throw new RunError(`The AI draft did not pass the newsroom's checks: ${res.reason}.`, 422)
  const saved = await saveStory(db, res.story, { model: res.model, status: "draft", hashes: [signal.hash] })
  if (!saved) throw new RunError("The draft could not be saved.", 500)
  return saved
}

