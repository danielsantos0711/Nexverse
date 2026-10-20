import { cacheLife, cacheTag } from "next/cache"
import type { Benchmark } from "@/lib/benchmarks"
import type { LabTool } from "@/components/lab/tools"
import { defOf, resolveRows, toBenchmarks, toGhTopics, toLabShelves, toLabTools, toMoreTopics, toReleaseRepos, type GhTopic, type ListName, type Row } from "./registry"

/*
 * Server-side reads of the lists admins edit in /admin/lists, for server components, route handlers and the
 * live feeds. Never import this from a client component (it uses next/cache); client code reads the same rows
 * with the hooks in lib/lists/hooks.ts.
 *
 * Each value is one row of public.site_content (anyone may read it), fetched with the publishable key through
 * the REST API and cached under the "site-content" tag: /admin/lists expires that tag when an admin saves, so
 * pages show the change on their next request. A missing table, a missing row or any error means the defaults.
 */

/** Tag on every cached site_content read; expire it to refresh them all. */
export const CONTENT_TAG = "site-content"

/** The raw stored value of a site_content key, or `fallback` when there is none or it cannot be read. */
export async function getBlock<T>(key: string, fallback: T): Promise<T> {
  "use cache"
  cacheTag(CONTENT_TAG, `${CONTENT_TAG}:${key}`)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !apikey) {
    cacheLife("max")
    return fallback
  }
  try {
    const res = await fetch(`${url}/rest/v1/site_content?select=value&key=eq.${encodeURIComponent(key)}&limit=1`, {
      headers: { apikey, authorization: `Bearer ${apikey}`, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`site_content answered ${res.status}`)
    const rows = (await res.json()) as { value?: unknown }[]
    cacheLife("hours")
    return Array.isArray(rows) && rows[0] && rows[0].value !== null && rows[0].value !== undefined ? (rows[0].value as T) : fallback
  } catch (err) {
    console.warn(`[lists] ${key} unavailable, using the defaults:`, err instanceof Error ? err.message : err)
    cacheLife("minutes")
    return fallback
  }
}

/** One list as rows, checked and merged with its defaults (see resolveRows). */
export async function getList(name: ListName): Promise<Row[]> {
  const def = defOf(name)
  return resolveRows(def, await getBlock<unknown>(def.key, null))
}

/** The featured GitHub topics, in the admins' order (same shape as GH_TOPICS). */
export const getGhTopics = async (): Promise<GhTopic[]> => toGhTopics(await getList("ghTopics"))

/** The smaller topics linked as chips (same shape as MORE_GH_TOPICS). */
export const getMoreGhTopics = async (): Promise<string[]> => toMoreTopics(await getList("moreTopics"))

/** [owner, name] of every project whose releases /trending follows (same shape as RELEASE_REPOS). */
export const getReleaseRepos = async (): Promise<[string, string][]> => toReleaseRepos(await getList("releaseRepos"))

/** A featured topic's name and blurb, or undefined for any other topic (async topicInfo). */
export const getTopicInfo = async (id: string): Promise<GhTopic | undefined> => (await getGhTopics()).find((t) => t.id === id)

/** The benchmarks, retired ones included (same shape as BENCHMARKS). */
export const getBenchmarks = async (): Promise<Benchmark[]> => toBenchmarks(await getList("benchmarks"))

/** The Lab's tools in the admins' order. `all` keeps switched-off tools (enabled: false). */
export async function getLabTools({ all = false }: { all?: boolean } = {}): Promise<LabTool[]> {
  const tools = toLabTools(await getList("labTools"))
  return all ? tools : tools.filter((t) => t.enabled !== false)
}

export const getLabShelves = async () => toLabShelves(await getList("labShelves"))
