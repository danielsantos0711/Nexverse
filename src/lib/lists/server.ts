import { getContentValues } from "@/lib/content-server"
import type { Benchmark } from "@/lib/benchmarks"
import type { LabTool } from "@/components/lab/tools"
import { defOf, resolveRows, toBenchmarks, toGhTopics, toLabShelves, toLabTools, toMoreTopics, toReleaseRepos, type GhTopic, type ListName, type Row } from "./registry"

/*
 * Server-side reads of the lists admins edit in /admin/lists, for server components, route handlers and the
 * live feeds. Never import this from a client component; client code reads the same rows with the hooks in
 * lib/lists/hooks.ts.
 *
 * Values come from the shared editable-content read (lib/content-server.ts: every public.site_content row,
 * fetched with the publishable key and cached under the "site-content" tag, which /admin/lists expires on save).
 * The raw value is checked here with the lists' own rules; a missing table, row or bad value means the defaults.
 */

/** Tag on the cached site_content read; expire it to refresh every server page that uses a list. */
export const CONTENT_TAG = "site-content"

/** One list as rows, checked and merged with its defaults (see resolveRows). */
export async function getList(name: ListName): Promise<Row[]> {
  const def = defOf(name)
  return resolveRows(def, (await getContentValues())[def.key])
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
