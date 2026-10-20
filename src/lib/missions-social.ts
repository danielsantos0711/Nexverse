// Types only from the store (it pulls in React hooks).
import type { Member } from "@/lib/store"
import type { Who } from "@/lib/community"
import { db } from "@/lib/supabase"

/**
 * The life around a mission (supabase/migrations/…_engage.sql): members following it, the poster's updates, a
 * discussion, the poster's reviews of entries, and the milestones each pilot has ticked off. All of it needs the
 * site's database; without one (or before the migration is applied) every read is empty and `available` is
 * false, so pages explain instead of failing.
 */

export type MissionUpdate = { id: string; body: string; createdAt: string; author: Who; mine: boolean }
export type MissionComment = { id: string; body: string; createdAt: string; editedAt: string | null; replyTo: string | null; author: Who; mine: boolean }
export type ReviewVerdict = "promising" | "changes" | "not-eligible"
export type MissionReview = { entryId: string; verdict: ReviewVerdict; note: string; updatedAt: string }

export const VERDICTS: Record<ReviewVerdict, { label: string; tone: string }> = {
  promising: { label: "Promising", tone: "text-ok border-ok/30 bg-ok/10" },
  changes: { label: "Changes asked", tone: "text-gold border-gold/30 bg-gold/10" },
  "not-eligible": { label: "Not eligible", tone: "text-muted-foreground border-border bg-white/[0.04]" },
}

export type MissionSocial = {
  available: boolean
  followers: number
  following: boolean
  updates: MissionUpdate[]
  comments: MissionComment[]
  reviews: Record<string, MissionReview>
  /** Member id → milestone steps ticked. */
  progress: Record<string, number[]>
}

export const EMPTY_SOCIAL: MissionSocial = { available: false, followers: 0, following: false, updates: [], comments: [], reviews: {}, progress: {} }

const who = (m: Member | null | undefined): Who => (m ? { name: m.name, memberId: m.id } : { name: "A member" })
const missing = (e: { message: string } | null) => Boolean(e && /does not exist|schema cache|Could not find/i.test(e.message))

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Check that you are signed in; paused accounts cannot post until the pause ends."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (missing({ message })) return "This part of missions is still being switched on for this site. Try again soon."
  return message
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await me()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

export async function getMissionSocial(missionId: string): Promise<MissionSocial> {
  const client = db()
  if (!client) return EMPTY_SOCIAL
  const userId = await me()
  const [follows, mineF, updates, comments, reviews, progress] = await Promise.all([
    client.from("mission_follows").select("mission_id", { count: "exact", head: true }).eq("mission_id", missionId),
    userId ? client.from("mission_follows").select("mission_id").eq("mission_id", missionId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    client.from("mission_updates").select("id, body, created_at, author_id, author:profiles(id, name)").eq("mission_id", missionId).order("created_at", { ascending: false }).limit(50),
    client.from("mission_comments").select("id, body, created_at, edited_at, reply_to, author_id, author:profiles(id, name)").eq("mission_id", missionId).is("hidden_at", null).order("created_at").limit(300),
    userId ? client.from("mission_reviews").select("entry_id, verdict, note, updated_at").eq("mission_id", missionId) : Promise.resolve({ data: [], error: null }),
    client.from("mission_progress").select("user_id, step").eq("mission_id", missionId).limit(1000),
  ])
  if (missing(follows.error) || missing(updates.error)) return EMPTY_SOCIAL
  type U = { id: string; body: string; created_at: string; author_id: string; author: Member | null }
  type C = U & { edited_at: string | null; reply_to: string | null }
  const prog: Record<string, number[]> = {}
  for (const r of (progress.data ?? []) as { user_id: string; step: number }[]) (prog[r.user_id] ??= []).push(r.step)
  return {
    available: true,
    followers: follows.count ?? 0,
    following: Boolean(mineF.data),
    updates: ((updates.data ?? []) as unknown as U[]).map((u) => ({ id: u.id, body: u.body, createdAt: u.created_at, author: who(u.author), mine: u.author_id === userId })),
    comments: ((comments.data ?? []) as unknown as C[]).map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, editedAt: c.edited_at, replyTo: c.reply_to, author: who(c.author), mine: c.author_id === userId })),
    reviews: Object.fromEntries(
      ((reviews.data ?? []) as { entry_id: string; verdict: ReviewVerdict; note: string; updated_at: string }[]).map((r) => [r.entry_id, { entryId: r.entry_id, verdict: r.verdict, note: r.note, updatedAt: r.updated_at }]),
    ),
    progress: prog,
  }
}

/** Missions you follow (ids, newest first), for the board's "Following" filter. */
export async function listFollowedMissions(): Promise<string[]> {
  const client = db()
  if (!client) return []
  const userId = await me()
  if (!userId) return []
  const { data, error } = await client.from("mission_follows").select("mission_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(300)
  if (error) return []
  return (data as { mission_id: string }[]).map((r) => r.mission_id)
}

export async function setMissionFollow(missionId: string, on: boolean) {
  const client = db()
  if (!client) throw new Error("Following missions needs the site's database.")
  const userId = await requireMe()
  const { error } = on
    ? await client.from("mission_follows").upsert({ mission_id: missionId }, { onConflict: "mission_id,user_id", ignoreDuplicates: true })
    : await client.from("mission_follows").delete().eq("mission_id", missionId).eq("user_id", userId)
  fail(error)
}

export const UPDATE_MAX = 4000
export const COMMENT_MAX = 4000

export async function postMissionUpdate(missionId: string, body: string) {
  const text = body.trim()
  if (!text) throw new Error("Write the update first.")
  if (text.length > UPDATE_MAX) throw new Error("Keep updates under 4,000 characters.")
  const client = db()
  if (!client) throw new Error("Updates need the site's database.")
  await requireMe()
  const { error } = await client.from("mission_updates").insert({ mission_id: missionId, body: text })
  fail(error)
}

export async function deleteMissionUpdate(id: string) {
  const client = db()
  if (!client) return
  const { error } = await client.from("mission_updates").delete().eq("id", id)
  fail(error)
}

export async function postMissionComment(missionId: string, body: string, replyTo: string | null) {
  const text = body.trim()
  if (!text) throw new Error("Write something first.")
  if (text.length > COMMENT_MAX) throw new Error("Keep comments under 4,000 characters.")
  const client = db()
  if (!client) throw new Error("The discussion needs the site's database.")
  await requireMe()
  const { error } = await client.from("mission_comments").insert({ mission_id: missionId, body: text, reply_to: replyTo })
  fail(error)
}

export async function deleteMissionComment(id: string) {
  const client = db()
  if (!client) return
  const { error } = await client.from("mission_comments").delete().eq("id", id)
  fail(error)
}

/** The poster's verdict on an entry; the pilot is told. */
export async function reviewEntry(missionId: string, entryId: string, verdict: ReviewVerdict, note: string) {
  if (note.length > 1000) throw new Error("Keep the note under 1,000 characters.")
  const client = db()
  if (!client) throw new Error("Reviews need the site's database.")
  await requireMe()
  const { error } = await client.from("mission_reviews").upsert({ entry_id: entryId, mission_id: missionId, verdict, note: note.trim() }, { onConflict: "entry_id" })
  fail(error)
}

/** Ticks (or unticks) one of the mission's milestones for you. You must be on the crew. */
export async function setMilestone(missionId: string, step: number, done: boolean) {
  const client = db()
  if (!client) throw new Error("Milestones need the site's database.")
  const userId = await requireMe()
  const { error } = done
    ? await client.from("mission_progress").upsert({ mission_id: missionId, step }, { onConflict: "mission_id,user_id,step", ignoreDuplicates: true })
    : await client.from("mission_progress").delete().eq("mission_id", missionId).eq("user_id", userId).eq("step", step)
  fail(error)
}

let seq = 0

/** Calls `onChange` when follows, updates, comments or progress change on one mission. */
export function subscribeMissionSocial(missionId: string, onChange: () => void): () => void {
  const client = db()
  if (!client) return () => {}
  const channel = client.channel(`mission-social:${missionId}:${++seq}`)
  for (const table of ["mission_follows", "mission_updates", "mission_comments", "mission_progress"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
      const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as Record<string, unknown>
      if (!row?.mission_id || row.mission_id === missionId) onChange()
    })
  }
  channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
