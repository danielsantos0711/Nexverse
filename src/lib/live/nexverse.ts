import { KINDS, type ResourceKind } from "@/lib/data"
import { db } from "@/lib/supabase"

/*
 * "Rising in Nexverse": what is gaining attention on the site itself, from real activity only (the
 * nexverse_rising() database function: likes, saves, views, downloads, replies and code stars over the last
 * days, recent days weighing more). Read in the browser with the visitor's own session, like the rest of the hub.
 * Before the round 11 database update the function is missing: the list then comes back `available: false`.
 */

export type RisingKind = ResourceKind | "thread" | "code"

export type RisingItem = {
  target: string
  itemType: "project" | "thread" | "share" | "code"
  kind: RisingKind
  id: string
  title: string
  summary: string
  href: string
  owner: string | null
  ownerHandle: string | null
  cover: string | null
  createdAt: string
  score: number
  likes: number
  saves: number
  views: number
  downloads: number
  replies: number
  stars: number
  /** Activity per day, oldest first, one entry per day of the window. */
  spark: number[]
}

export type RisingList = { items: RisingItem[]; available: boolean }

type Row = {
  target: string
  item_type: RisingItem["itemType"]
  kind: string
  item_id: string
  title: string
  summary: string | null
  slug: string | null
  owner_name: string | null
  owner_handle: string | null
  cover_url: string | null
  created_at: string
  score: number | string
  likes: number
  saves: number
  views: number
  downloads: number
  replies: number
  stars: number
  spark: number[] | null
}

const isResourceKind = (k: string): k is ResourceKind => k in KINDS

function hrefOf(r: Row): string {
  if (r.item_type === "thread") return `/forum/${r.item_id}`
  if (r.item_type === "code") return r.owner_handle && r.slug ? `/code/${r.owner_handle}/${r.slug}` : "/code"
  return isResourceKind(r.kind) ? `${KINDS[r.kind].path}/${r.item_id}` : "/explore"
}

export async function listRising({ days = 7, kind, limit = 24 }: { days?: number; kind?: RisingKind; limit?: number } = {}): Promise<RisingList> {
  const client = db()
  if (!client) return { items: [], available: false }
  const { data, error } = await client.rpc("nexverse_rising", { days, only_kind: kind ?? null, lim: limit })
  if (error) return { items: [], available: !/nexverse_rising|schema cache|does not exist|function/i.test(error.message) }
  return {
    available: true,
    items: ((data ?? []) as Row[]).map((r) => ({
      target: r.target,
      itemType: r.item_type,
      kind: (r.kind as RisingKind) ?? "repo",
      id: r.item_id,
      title: r.title,
      summary: r.summary ?? "",
      href: hrefOf(r),
      owner: r.owner_name,
      ownerHandle: r.owner_handle,
      cover: r.cover_url && /^https:\/\//.test(r.cover_url) ? r.cover_url : null,
      createdAt: r.created_at,
      score: Number(r.score) || 0,
      likes: r.likes ?? 0,
      saves: r.saves ?? 0,
      views: r.views ?? 0,
      downloads: r.downloads ?? 0,
      replies: r.replies ?? 0,
      stars: r.stars ?? 0,
      spark: Array.isArray(r.spark) ? r.spark.map((n) => Number(n) || 0) : [],
    })),
  }
}

/** Cover pictures of projects by id (for the hub lists, whose entries carry no cover). */
export async function projectCovers(ids: string[]): Promise<Record<string, string>> {
  const client = db()
  const list = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)
  if (!client || !list.length) return {}
  const { data, error } = await client.from("projects").select("id, cover_url").in("id", list).not("cover_url", "is", null)
  if (error) return {}
  return Object.fromEntries(((data ?? []) as { id: string; cover_url: string }[]).filter((r) => /^https:\/\//.test(r.cover_url)).map((r) => [r.id, r.cover_url]))
}

/** Imported projects carry a source credit; members' own work does not. Used to rank members' work first. */
export async function importedIds(ids: string[]): Promise<Set<string>> {
  const client = db()
  const list = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)
  if (!client || !list.length) return new Set()
  const { data, error } = await client.from("projects").select("id").in("id", list).not("source", "is", null)
  if (error) return new Set()
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}
