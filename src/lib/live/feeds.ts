/**
 * Live feeds from public APIs: GitHub (repository search and release feeds). Each fetcher is a
 * cached function ("use cache"): results become part of the prerendered page and are refreshed in the
 * background (ISR-style) on the lifetime set by cacheLife. A feed that fails returns `ok: false` with no items
 * and is cached only briefly, so the page still renders and a later visitor triggers a retry.
 */
import { cacheLife, cacheTag } from "next/cache"
import { GH_TOPICS, RELEASE_REPOS } from "./catalog"
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

/**
 * Repositories with a GitHub topic, most starred first. "new": created in the last 30 days, the rising
 * projects. "active": pushed to in the last week, the established projects people are working on now.
 * Unauthenticated search allows 10 requests a minute; an optional GITHUB_TOKEN raises that. Cached for hours.
 */
export async function githubTopicRepos(topic: string, mode: "new" | "active" = "new", limit = 12): Promise<Feed<GhRepo>> {
  "use cache"
  cacheTag("live", "live:github", `live:github:topic:${topic}`)
  const n = clampLimit(limit, 30)
  try {
    const q = mode === "new" ? `topic:${topic} created:>${day(30)}` : `topic:${topic} pushed:>${day(7)} stars:>100`
    // Ask for a few extra: archived, unsuitable or off-site entries are dropped by the normaliser.
    const data = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.min(50, n + 8)}`, {
      headers: ghHeaders(),
    })
    const items = asArray(isRecord(data) ? data.items : null)
      .map(normalizeGh)
      .filter((r): r is GhRepo => r !== null)
      .slice(0, n)
    if (!items.length && !(isRecord(data) && data.total_count === 0)) throw new Error("empty response")
    cacheLife("hours")
    return { items, fetchedAt: Date.now(), ok: true, source: "github" }
  } catch (err) {
    cacheLife("minutes")
    return failed("github", err)
  }
}

/**
 * New and rising open-source AI repositories across the topics Nexverse follows: created in the last 30 days,
 * most starred first. Built from the per-topic feeds, so it shares their cache entries.
 */
export async function githubTrendingAi(limit = 9): Promise<Feed<GhRepo>> {
  const feeds = await Promise.all(GH_TOPICS.map((t) => githubTopicRepos(t.id, "new", 12)))
  const seen = new Set<string>()
  const items = feeds
    .flatMap((f) => f.items)
    .filter((r) => !seen.has(r.fullName) && (seen.add(r.fullName), true))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, clampLimit(limit, 60))
  return merge(feeds, "github", items)
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
  const feeds = await Promise.all(RELEASE_REPOS.map(([o, n]) => githubRepoReleases(o, n)))
  const items = feeds
    .flatMap((f) => f.items)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, clampLimit(limit, 30))
  return merge(feeds, "github", items)
}
