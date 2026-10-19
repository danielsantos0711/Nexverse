import { listMemberCollections, type Collection } from "@/lib/community"
import { listShares, type Share } from "@/lib/hub"
import { listProjects, type Project } from "@/lib/projects"
import { listQuestions, type Question } from "@/lib/store"
import { isMemberRef } from "@/lib/refs"
import { db } from "@/lib/supabase"

/**
 * Members as the public sees them: the profile fields they chose to fill in and what they did on Nexverse.
 * Everything is read from public.profiles and the tables members write to; there are no invented people.
 * A member is addressed by their handle when they picked one (/people/ines) and by their id otherwise.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A segment /people/[handle] can serve: a member id or a handle. */
export { isMemberRef }

export type PublicMember = {
  id: string
  name: string
  handle: string | null
  bio: string
  location: string
  website: string
  github: string
  avatarUrl: string | null
  joinedAt: string
}

export const memberHref = (m: Pick<PublicMember, "id" | "handle">) => `/people/${m.handle ?? m.id}`

const COLUMNS = "id, name, handle, bio, location, website, github, avatar_url, created_at"
// Before the studio migration profiles had only these.
const BASE_COLUMNS = "id, name, created_at"

type Row = { id: string; name: string; handle?: string | null; bio?: string | null; location?: string | null; website?: string | null; github?: string | null; avatar_url?: string | null; created_at: string }

const fromRow = (r: Row): PublicMember => ({
  id: r.id,
  name: r.name,
  handle: r.handle ?? null,
  bio: r.bio ?? "",
  location: r.location ?? "",
  website: r.website ?? "",
  github: r.github ?? "",
  avatarUrl: r.avatar_url ?? null,
  joinedAt: r.created_at,
})

const columnMissing = (e: { message: string } | null) => Boolean(e && /column|schema cache|does not exist/.test(e.message))

export type MemberSort = "new" | "name"

/** Members, newest first or by name, optionally matching a name or handle. Empty without a database. */
export async function listMembers({ q = "", sort = "new", limit = 48, offset = 0 }: { q?: string; sort?: MemberSort; limit?: number; offset?: number } = {}): Promise<PublicMember[]> {
  const client = db()
  if (!client) return []
  const term = q.trim().replace(/[\\%_,()]/g, (c) => `\\${c}`)
  const build = (columns: string, full: boolean) => {
    let query = client.from("profiles").select(columns).range(offset, offset + limit - 1)
    query = sort === "name" ? query.order("name", { ascending: true }) : query.order("created_at", { ascending: false })
    if (term) query = full ? query.or(`name.ilike.%${term}%,handle.ilike.%${term}%`) : query.ilike("name", `%${term}%`)
    return query
  }
  let res = await build(COLUMNS, true)
  if (columnMissing(res.error)) res = await build(BASE_COLUMNS, false)
  if (res.error) throw new Error(res.error.message)
  return (res.data as unknown as Row[]).map(fromRow)
}

/** How many members there are. Null when it cannot be counted. */
export async function countMembers(): Promise<number | null> {
  const client = db()
  if (!client) return null
  const { count, error } = await client.from("profiles").select("id", { count: "exact", head: true })
  return error ? null : (count ?? 0)
}

/** One member by handle or id; null when there is no such member (or no database). */
export async function getMember(ref: string): Promise<PublicMember | null> {
  const client = db()
  if (!client || !isMemberRef(ref)) return null
  const key = UUID.test(ref) ? "id" : "handle"
  let res = await client.from("profiles").select(COLUMNS).eq(key, key === "id" ? ref.toLowerCase() : ref).maybeSingle()
  if (columnMissing(res.error) && key === "id") res = await client.from("profiles").select(BASE_COLUMNS).eq("id", ref.toLowerCase()).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? fromRow(res.data as unknown as Row) : null
}

export type MemberActivity = {
  projects: Project[]
  shares: Share[]
  threads: Question[]
  /** Dates of the member's replies, for the activity field (the replies themselves live in their threads). */
  replyDates: string[]
  collections: Collection[]
}

/** What a member made and wrote, newest first. Each part fails on its own and comes back empty. */
export async function getMemberActivity(memberId: string, viewerId: string | null): Promise<MemberActivity> {
  const client = db()
  const [projects, shares, threads, replies, collections] = await Promise.all([
    listProjects({ owner: memberId, limit: 60 }).catch(() => [] as Project[]),
    listShares({ author: memberId, limit: 60 }).catch(() => [] as Share[]),
    listQuestions({ author: memberId, limit: 60 }).catch(() => [] as Question[]),
    client
      ? Promise.resolve(client.from("answers").select("created_at").eq("author_id", memberId).order("created_at", { ascending: false }).limit(500)).then((r) => (r.data ?? []) as { created_at: string }[])
      : Promise.resolve([]),
    listMemberCollections(memberId).catch(() => [] as Collection[]),
  ])
  const self = viewerId === memberId
  return {
    // The owner query returns drafts to their owner; the public page shows published work only.
    projects: projects.filter((p) => p.status === "published" || (self && p.local)),
    shares,
    threads,
    replyDates: replies.map((r) => r.created_at),
    collections: collections.filter((c) => c.isPublic),
  }
}
