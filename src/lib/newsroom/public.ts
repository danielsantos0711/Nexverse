import { cacheLife, cacheTag } from "next/cache"
import { categoryNames, LEGACY_STORY_COLUMNS, readNewsroomSettings, STORY_COLUMNS, STORY_SLUG, toStory, type CategoryNames, type NewsCategory, type Story, type StoryRow } from "@/lib/newsroom"
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
