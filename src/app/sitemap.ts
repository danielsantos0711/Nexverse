import type { MetadataRoute } from "next"
import { cacheLife } from "next/cache"
import { KINDS } from "@/lib/data"
import { publicDb, select } from "@/lib/newsroom/rest"
import { SITE_URL } from "@/lib/site-url"

/*
 * The public map of the site for search engines: the browse pages, then what members published (projects,
 * threads, news stories, profiles) as the publishable key sees it, so row level security keeps anything hidden
 * or private out. A missing database still gives the browse pages.
 */

const PAGES = [
  "/",
  "/explore",
  "/trending",
  "/news",
  "/collections",
  "/models",
  "/datasets",
  "/tools",
  "/code",
  "/lab",
  "/arena",
  "/benchmarks",
  "/compare",
  "/forum",
  "/chat",
  "/crews",
  "/missions",
  "/events",
  "/launchpad",
  "/people",
  "/leaderboard",
]

type Row = Record<string, string | null>

async function rows(table: string, query: string): Promise<Row[]> {
  const db = publicDb()
  if (!db) return []
  try {
    return await select<Row>(db, table, query)
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache"
  cacheLife("hours")
  const [projects, threads, stories, people] = await Promise.all([
    rows("projects", "select=id,kind,updated_at&status=eq.published&visibility=eq.public&hidden_at=is.null&order=updated_at.desc&limit=5000"),
    rows("questions", "select=id,edited_at,created_at&hidden_at=is.null&order=created_at.desc&limit=5000"),
    rows("news_stories", "select=slug,updated_at&status=eq.published&order=published_at.desc&limit=5000"),
    rows("profiles", "select=handle,created_at&handle=not.is.null&limit=5000"),
  ])
  const at = (v: string | null | undefined) => (v ? new Date(v) : undefined)
  return [
    ...PAGES.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 })),
    ...projects
      .filter((p) => p.id && p.kind && p.kind in KINDS)
      .map((p) => ({ url: `${SITE_URL}${KINDS[p.kind as keyof typeof KINDS].path}/${p.id}`, lastModified: at(p.updated_at), priority: 0.6 })),
    ...threads.filter((t) => t.id).map((t) => ({ url: `${SITE_URL}/forum/${t.id}`, lastModified: at(t.edited_at ?? t.created_at), priority: 0.5 })),
    ...stories.filter((s) => s.slug).map((s) => ({ url: `${SITE_URL}/news/${encodeURIComponent(s.slug!)}`, lastModified: at(s.updated_at), priority: 0.6 })),
    ...people.filter((p) => p.handle).map((p) => ({ url: `${SITE_URL}/people/${encodeURIComponent(p.handle!)}`, priority: 0.4 })),
  ]
}
