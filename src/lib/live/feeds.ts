/**
 * Live feeds from public APIs: GitHub (repository search and release feeds). Each fetcher is a
 * cached function ("use cache"): results become part of the prerendered page and are refreshed in the
 * background (ISR-style) on the lifetime set by cacheLife. A feed that fails returns `ok: false` with no items
 * and is cached only briefly, so the page still renders and a later visitor triggers a retry.
 */
import { cacheLife, cacheTag } from "next/cache"
import { getGhTopics, getMoreGhTopics, getReleaseRepos } from "@/lib/lists/server"
import { asArray, fetchSafe, getJson, isRecord } from "./http"
import { normalizeGh, parseReleasesAtom } from "./parse"
import type { Feed, GhReleaseItem, GhRepo } from "./types"

const clampLimit = (n: number, max: number) => Math.min(max, Math.max(1, Math.floor(Number.isFinite(n) ? n : 10)))

function failed<T>(source: Feed<T>["source"], err: unknown): Feed<T> {
  console.warn(`[live] ${source} feed unavailable:`, err instanceof Error ? err.message : err)
  return { items: [], fetchedAt: Date.now(), ok: false, source }
}

/** Combines several feeds of one source: items in the given order, the oldest fetch time, ok if any worked. */
function merge<T>(feeds: Feed<T>[], source: Feed<T>["source"], items: T[]): Feed<T> {
  const live = feeds.filter((f) => f.ok)
  const fetchedAt = Math.min(...(live.length ? live : feeds).map((f) => f.fetchedAt))
  return { items, fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : 0, ok: live.length > 0, source }
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10)

/*
 * Why "Rising on GitHub" used to look the same every day: it asked for repositories created in the last 30 days
 * sorted by total stars, so the few that went viral early in the month held the top places for weeks (the cache
 * did refresh hourly; the answer just barely changed). Rising now means star velocity: stars per day since the
 * repository was created (a two-day-old project with 400 stars beats a four-week-old one with 1,500), over the
 * featured topics plus two more that rotate every six hours, refreshed every 30 minutes.
 */

/** Refreshed every 30 minutes, served for up to 5 minutes stale, dropped after 6 hours. */
const RISING_LIFE = { stale: 300, revalidate: 1800, expire: 21600 }

/** Stars per day since creation, at least one day old (honest for brand-new repositories). */
export function starVelocity(r: Pick<GhRepo, "stars" | "createdAt">, now = Date.now()): number {
  const age = Math.max(1, (now - Date.parse(r.createdAt || "")) / 864e5)
  return Number.isFinite(age) ? Math.round((r.stars / age) * 10) / 10 : 0
}

const withVelocity = (items: GhRepo[], now: number): GhRepo[] => items.map((r) => ({ ...r, starsPerDay: r.createdAt ? starVelocity(r, now) : undefined }))
const byVelocity = (a: GhRepo, b: GhRepo) => (b.starsPerDay ?? 0) - (a.starsPerDay ?? 0) || b.stars - a.stars

/**
 * Repositories with a GitHub topic. "new": created in the last 30 days, ranked by star velocity (the rising
 * projects). "active": pushed to in the last week with 100+ stars, most starred first (the established projects
 * people are working on now). Unauthenticated search allows 10 requests a minute; GITHUB_TOKEN raises that.
 */
export async function githubTopicRepos(topic: string, mode: "new" | "active" = "new", limit = 12): Promise<Feed<GhRepo>> {
  "use cache"
  cacheTag("live", "live:github", `live:github:topic:${topic}`)
  const n = clampLimit(limit, 50)
  try {
    const q = mode === "new" ? `topic:${topic} created:>${day(30)}` : `topic:${topic} pushed:>${day(7)} stars:>100`
    // "new" reads the 50 best starred of the month and re-ranks them by velocity; archived, unsuitable or
    // off-site entries are dropped by the normaliser.
    const data = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${mode === "new" ? 50 : Math.min(50, n + 8)}`, {
      headers: ghHeaders(),
    })
    const now = Date.now()
    const all = withVelocity(
      asArray(isRecord(data) ? data.items : null)
        .map(normalizeGh)
        .filter((r): r is GhRepo => r !== null),
      now
    )
    const items = (mode === "new" ? all.sort(byVelocity) : all).slice(0, n)
    if (!items.length && !(isRecord(data) && data.total_count === 0)) throw new Error("empty response")
    cacheLife(RISING_LIFE)
    return { items, fetchedAt: now, ok: true, source: "github" }
  } catch (err) {
    cacheLife("minutes")
    return failed("github", err)
  }
}

/** Two of the extra topics, a different pair every six hours (computed inside a cache so pages stay static). */
async function rotatingTopics(more: string[], featured: string[]): Promise<{ topics: string[]; slot: number }> {
  "use cache"
  cacheLife({ stale: 300, revalidate: 1800, expire: 21600 })
  const pool = more.filter((t) => !featured.includes(t))
  const slot = Math.floor(Date.now() / (6 * 3600e3))
  if (!pool.length) return { topics: [], slot }
  const a = pool[(slot * 2) % pool.length]
  const b = pool[(slot * 2 + 1) % pool.length]
  return { topics: a === b ? [a] : [a, b], slot }
}

export type RisingTopic = { id: string; label: string; rotating: boolean }

/** Rising repositories across the featured topics and this window's rotating ones, each tagged with its topic. */
export async function githubRising(limit = 60): Promise<Feed<GhRepo> & { topics: RisingTopic[] }> {
  const featured = await getGhTopics()
  const { topics: extra } = await rotatingTopics(await getMoreGhTopics(), featured.map((t) => t.id))
  const topics: RisingTopic[] = [
    ...featured.map((t) => ({ id: t.id, label: t.label, rotating: false })),
    ...extra.map((t) => ({ id: t, label: `#${t}`, rotating: true })),
  ]
  const feeds = await Promise.all(topics.map((t) => githubTopicRepos(t.id, "new", 30)))
  const seen = new Set<string>()
  const items = feeds
    .flatMap((f, i) => f.items.map((r) => ({ ...r, topic: topics[i].id })))
    .filter((r) => !seen.has(r.fullName) && (seen.add(r.fullName), true))
    .sort(byVelocity)
    .slice(0, clampLimit(limit, 120))
  return { ...merge(feeds, "github", items), topics }
}

/**
 * New and rising open-source AI repositories across the topics Nexverse follows: created in the last 30 days and
 * ranked by star velocity. Built from the per-topic feeds, so it shares their cache entries.
 */
export async function githubTrendingAi(limit = 9): Promise<Feed<GhRepo>> {
  const feed = await githubRising(Math.max(limit, 9))
  return { items: feed.items.slice(0, clampLimit(limit, 60)), fetchedAt: feed.fetchedAt, ok: feed.ok, source: feed.source }
}

/** The latest releases of one project, from its public Atom feed (no API quota). */
export async function githubRepoReleases(owner: string, name: string): Promise<Feed<GhReleaseItem>> {
  "use cache"
  cacheTag("live", "live:github", `gh:${owner.toLowerCase()}/${name.toLowerCase()}`)
  const res = await fetchSafe(`https://github.com/${owner}/${name}/releases.atom`, { accept: "application/atom+xml, application/xml;q=0.9", maxBytes: 1_500_000 })
  if (!res.ok) {
    cacheLife("minutes")
    return failed("github", new Error(`releases of ${owner}/${name}: ${res.reason}`))
  }
  cacheLife("hours")
  return { items: parseReleasesAtom(res.text, owner, name, 2), fetchedAt: Date.now(), ok: true, source: "github" }
}

/** Recent releases of popular open-source AI projects, newest first. */
export async function githubReleases(limit = 8): Promise<Feed<GhReleaseItem>> {
  const repos = await getReleaseRepos()
  const feeds = await Promise.all(repos.map(([o, n]) => githubRepoReleases(o, n)))
  const items = feeds
    .flatMap((f) => f.items)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, clampLimit(limit, 30))
  return merge(feeds, "github", items)
}
