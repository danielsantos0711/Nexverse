import { cacheLife, cacheTag } from "next/cache"
import { categoryNames, LEGACY_STORY_COLUMNS, readNewsroomSettings, STORY_COLUMNS, STORY_SLUG, toStory, type CategoryNames, type NewsCategory, type Story, type StoryRow } from "@/lib/newsroom"
import { DESK_COLUMNS, EXTRA_COLUMNS, FALLBACK_DESKS, readExtras, toDesk, type Desk, type DeskRow, type StoryExtras } from "./engine/types"
import { DbError, publicDb, select } from "./rest"

/*
 * Server only. What readers see: published stories (and scheduled ones whose time has come), read with the
 * publishable key so row level security shows exactly what a guest may see. Cached and tagged "newsroom";
 * editors' publishes refresh the tag at once, and the cache turns over within minutes anyway. When the
 * database or the newsroom tables are missing, `ok` is false and the pages say so honestly.
 */

export type Stories = { ok: boolean; items: Story[] }

const LIST_COLUMNS = STORY_COLUMNS.replace("body, ", "")

/** Reads with the long-form columns, and again without them while the database does not have them yet. */
async function read(query: string): Promise<Stories> {
  const db = publicDb()
  if (!db) return { ok: false, items: [] }
  try {
    let rows: StoryRow[]
    try {
      rows = await select<StoryRow>(db, "news_stories", query)
    } catch (err) {
      if (!(err instanceof DbError && (err.code === "42703" || err.code === "PGRST204"))) throw err
      const legacy = query.includes(encodeURIComponent(LIST_COLUMNS)) ? LEGACY_STORY_COLUMNS.replace("body, ", "") : LEGACY_STORY_COLUMNS
      rows = await select<StoryRow>(db, "news_stories", query.replace(/select=[^&]*/, `select=${encodeURIComponent(legacy)}`))
    }
    return { ok: true, items: rows.map((r) => toStory({ ...r, body: r.body ?? "" })) }
  } catch (err) {
    console.warn("[newsroom] public read failed:", err instanceof Error ? err.message : err)
    return { ok: false, items: [] }
  }
}

const PUBLIC = "or=(status.eq.published,status.eq.scheduled)"

/** The newest stories, featured ones included, newest first. */
export async function latestStories(limit = 60): Promise<Stories> {
  "use cache"
  cacheTag("newsroom")
  const res = await read(`${PUBLIC}&order=published_at.desc&limit=${Math.min(100, Math.max(1, limit))}&select=${encodeURIComponent(LIST_COLUMNS)}`)
  // Readers never see an editor's scheduled story early, whatever the cache did.
  const now = Date.now()
  const items = res.items.filter((s) => s.publishedAt && Date.parse(s.publishedAt) <= now)
  cacheLife("minutes")
  return { ok: res.ok, items }
}

/** One story by its slug (or its id, for links shared before a headline changed). */
export async function storyByKey(key: string): Promise<{ ok: boolean; story: Story | null }> {
  "use cache"
  cacheTag("newsroom", `newsroom:${key}`)
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
  if (!isId && !STORY_SLUG.test(key)) {
    cacheLife("hours")
    return { ok: true, story: null }
  }
  const res = await read(`${PUBLIC}&${isId ? "id" : "slug"}=eq.${encodeURIComponent(key.toLowerCase())}&limit=1&select=${encodeURIComponent(STORY_COLUMNS)}`)
  cacheLife("minutes")
  const story = res.items[0] ?? null
  return { ok: res.ok, story: story && story.publishedAt && Date.parse(story.publishedAt) <= Date.now() ? story : null }
}

/** Other stories in the same category, then the newest of any. */
export async function relatedStories(category: NewsCategory, exclude: string, limit = 4): Promise<Story[]> {
  const all = await latestStories(60)
  const others = all.items.filter((s) => s.id !== exclude)
  const same = others.filter((s) => s.category === category)
  return [...same, ...others.filter((s) => s.category !== category)].slice(0, limit)
}

/** The readers' category names and visibility, as the editors set them. */
export async function newsCategoryNames(): Promise<CategoryNames> {
  "use cache"
  cacheTag("newsroom")
  cacheLife("minutes")
  const db = publicDb()
  if (!db) return categoryNames(readNewsroomSettings(null))
  const rows = await select<{ value: unknown }>(db, "site_settings", "key=eq.newsroom&select=value").catch(() => [])
  return categoryNames(readNewsroomSettings(rows[0]?.value))
}

// ─── The research engine's extras (migration 20261021100000) ────────────────────────────────────────────────

/** The desks readers see, in the editors' order. The fixed six until the engine's tables exist. */
export async function publicDesks(): Promise<Desk[]> {
  "use cache"
  cacheTag("newsroom")
  cacheLife("minutes")
  const db = publicDb()
  if (!db) return FALLBACK_DESKS
  const rows = await select<DeskRow>(db, "news_desks", `enabled=is.true&hidden=is.false&order=sort.asc&select=${encodeURIComponent(DESK_COLUMNS)}`).catch(() => null)
  return rows && rows.length ? rows.map(toDesk) : FALLBACK_DESKS
}

/** Desk, evidence, media, timeline and read counts for some stories. Empty when the columns do not exist yet. */
export async function storyExtras(ids: string[]): Promise<Record<string, StoryExtras>> {
  "use cache"
  cacheTag("newsroom")
  cacheLife("minutes")
  const db = publicDb()
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
  if (!db || !clean.length) return {}
  const rows = await select<Record<string, unknown>>(db, "news_stories", `id=in.(${clean.join(",")})&select=id,${encodeURIComponent(EXTRA_COLUMNS.replace(/\s/g, ""))}`).catch(() => [])
  return Object.fromEntries(rows.map((r) => [String(r.id), readExtras(r)]))
}

/** Rising in Nexverse news: the most read stories of the last three days, then the newest high-impact ones. */
export async function risingStories(limit = 5): Promise<{ story: Story; reads: number }[]> {
  "use cache"
  cacheTag("newsroom")
  cacheLife("minutes")
  const [{ items }, db] = [await latestStories(60), publicDb()]
  if (!items.length) return []
  const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)
  const rows = db ? await select<{ story_id: string; n: number }>(db, "news_reads", `day=gte.${since}&select=story_id,n&limit=5000`).catch(() => []) : []
  const reads = new Map<string, number>()
  for (const r of rows) reads.set(r.story_id, (reads.get(r.story_id) ?? 0) + r.n)
  const extras = await storyExtras(items.map((s) => s.id))
  const age = (s: Story) => (Date.now() - Date.parse(s.publishedAt ?? s.createdAt)) / 36e5
  const heat = (s: Story) => (reads.get(s.id) ?? 0) * 3 + (extras[s.id]?.impact ?? 50) / 10 - age(s) / 12
  return [...items]
    .filter((s) => age(s) < 24 * 10)
    .sort((a, b) => heat(b) - heat(a))
    .slice(0, limit)
    .map((story) => ({ story, reads: reads.get(story.id) ?? 0 }))
}
