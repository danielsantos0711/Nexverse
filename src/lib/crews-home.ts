import { localMember } from "@/lib/chat"
import type { Crew, CrewRole } from "@/lib/crews"
import { db } from "@/lib/supabase"

/**
 * A crew's home (…_social.sql): launches (events with RSVPs), the project board, the leaderboard and the mission
 * log. Everything is read and written through Supabase and its row level security (members only; officers edit
 * anything, authors their own). Without a database, events and cards are kept in this browser. A database that
 * does not have these tables yet reads as empty, and writing says so plainly.
 */

type DbError = { message: string; code?: string } | null
const missing = (e: DbError) => Boolean(e && (["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache|Could not find/i.test(e.message)))

function fail(error: DbError): asserts error is null {
  if (!error) return
  if (missing(error)) throw new Error("This part of crews is not switched on in the database yet (migration …_social.sql).")
  if (error.code === "42501" || /row-level security/.test(error.message)) throw new Error("Only members of this crew can do that.")
  throw new Error(error.message)
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error("This browser would not save that. Allow site data and try again.")
  }
}

async function myId(): Promise<string | null> {
  const client = db()
  if (!client) return localMember().id
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

// ─── Launches (events) ──────────────────────────────────────────────────────────────────────────────────────

export type Rsvp = "going" | "maybe"
export type CrewEvent = {
  id: string
  crewId: string
  title: string
  body: string
  place: string
  startsAt: string
  endsAt: string | null
  createdBy: string | null
  going: string[]
  maybe: string[]
}
export type EventInput = { title: string; body: string; place: string; startsAt: string; endsAt: string | null }

const eventsKey = (crewId: string) => `nexverse-crew-events:${crewId}`

export function validateEvent(e: EventInput): string | null {
  if (e.title.trim().length < 2) return "Give the launch a name."
  if (e.title.length > 120) return "Names are up to 120 characters."
  if (Number.isNaN(Date.parse(e.startsAt))) return "Pick when it starts."
  if (e.endsAt && Date.parse(e.endsAt) < Date.parse(e.startsAt)) return "It cannot end before it starts."
  if (e.body.length > 2000) return "The description is up to 2,000 characters."
  if (e.place.length > 200) return "The place is up to 200 characters."
  return null
}

/** Launches from a day ago onwards, soonest first, with who is going. */
export async function listEvents(c: Crew): Promise<CrewEvent[]> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const client = db()
  if (!client) return read<CrewEvent[]>(eventsKey(c.id), []).filter((e) => e.startsAt >= since).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const { data, error } = await client
    .from("crew_events")
    .select("id, crew_id, title, body, place, starts_at, ends_at, created_by")
    .eq("crew_id", c.id)
    .gte("starts_at", since)
    .order("starts_at")
    .limit(20)
  if (missing(error)) return []
  fail(error)
  const rows = data as { id: string; crew_id: string; title: string; body: string; place: string; starts_at: string; ends_at: string | null; created_by: string | null }[]
  const ids = rows.map((r) => r.id)
  const rsvps = ids.length ? await client.from("crew_event_rsvps").select("event_id, user_id, status").in("event_id", ids).limit(2000) : { data: [], error: null }
  const list = (rsvps.data ?? []) as { event_id: string; user_id: string; status: Rsvp }[]
  return rows.map((r) => ({
    id: r.id,
    crewId: r.crew_id,
    title: r.title,
    body: r.body,
    place: r.place,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdBy: r.created_by,
    going: list.filter((x) => x.event_id === r.id && x.status === "going").map((x) => x.user_id),
    maybe: list.filter((x) => x.event_id === r.id && x.status === "maybe").map((x) => x.user_id),
  }))
}

export async function createEvent(c: Crew, input: EventInput): Promise<CrewEvent> {
  const problem = validateEvent(input)
  if (problem) throw new Error(problem)
  const row = { title: input.title.trim(), body: input.body.trim(), place: input.place.trim(), startsAt: new Date(input.startsAt).toISOString(), endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null }
  const client = db()
  const me = await myId()
  if (!client) {
    const e: CrewEvent = { id: crypto.randomUUID(), crewId: c.id, ...row, createdBy: me, going: me ? [me] : [], maybe: [] }
    write(eventsKey(c.id), [...read<CrewEvent[]>(eventsKey(c.id), []), e])
    return e
  }
  const { data, error } = await client
    .from("crew_events")
    .insert({ crew_id: c.id, title: row.title, body: row.body, place: row.place, starts_at: row.startsAt, ends_at: row.endsAt })
    .select("id")
    .single()
  fail(error)
  const id = (data as { id: string }).id
  await client.from("crew_event_rsvps").insert({ event_id: id, status: "going" })
  return { id, crewId: c.id, ...row, createdBy: me, going: me ? [me] : [], maybe: [] }
}

/** Going, maybe, or not (null). */
export async function rsvp(e: CrewEvent, status: Rsvp | null): Promise<CrewEvent> {
  const me = await myId()
  if (!me) throw new Error("Sign in first.")
  const next: CrewEvent = {
    ...e,
    going: status === "going" ? [...new Set([...e.going, me])] : e.going.filter((x) => x !== me),
    maybe: status === "maybe" ? [...new Set([...e.maybe, me])] : e.maybe.filter((x) => x !== me),
  }
  const client = db()
  if (!client) {
    write(
      eventsKey(e.crewId),
      read<CrewEvent[]>(eventsKey(e.crewId), []).map((x) => (x.id === e.id ? next : x))
    )
    return next
  }
  const { error } = status
    ? await client.from("crew_event_rsvps").upsert({ event_id: e.id, user_id: me, status }, { onConflict: "event_id,user_id" })
    : await client.from("crew_event_rsvps").delete().eq("event_id", e.id).eq("user_id", me)
  fail(error)
  return next
}

export async function deleteEvent(e: CrewEvent) {
  const client = db()
  if (!client) {
    write(
      eventsKey(e.crewId),
      read<CrewEvent[]>(eventsKey(e.crewId), []).filter((x) => x.id !== e.id)
    )
    return
  }
  const { error } = await client.from("crew_events").delete().eq("id", e.id)
  fail(error)
}

/** A calendar file for one launch, so members add it to their own calendar. Built in the browser. */
export function eventIcs(e: CrewEvent, crewName: string, url: string) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n")
  const end = e.endsAt ?? new Date(Date.parse(e.startsAt) + 3600_000).toISOString()
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nexverse//Crews//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@nexverse`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${e.title} (${crewName})`)}`,
    `DESCRIPTION:${esc(`${e.body}\n${url}`)}`,
    e.place ? `LOCATION:${esc(e.place)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")
}

// ─── The project board ──────────────────────────────────────────────────────────────────────────────────────

export const PROJECT_STATUS = ["idea", "building", "shipped"] as const
export type ProjectStatus = (typeof PROJECT_STATUS)[number]
export const STATUS_LABEL: Record<ProjectStatus, string> = { idea: "Ideas", building: "In orbit", shipped: "Landed" }
export type CrewProject = {
  id: string
  crewId: string
  title: string
  blurb: string
  status: ProjectStatus
  href: string | null
  position: number
  createdBy: string | null
  shippedAt: string | null
}
export type ProjectInput = { title: string; blurb: string; href: string }

const projectsKey = (crewId: string) => `nexverse-crew-projects:${crewId}`
const INTERNAL = /^\/[A-Za-z0-9/_.~%?=&#-]*$/

export function validateProject(p: ProjectInput): string | null {
  if (p.title.trim().length < 2) return "Give the card a title."
  if (p.title.length > 100) return "Titles are up to 100 characters."
  if (p.blurb.length > 500) return "The note is up to 500 characters."
  if (p.href.trim() && !INTERNAL.test(p.href.trim())) return "Links point to a page on Nexverse, like /projects/… or /gh/owner/repo."
  return null
}

export async function listProjects(c: Crew): Promise<CrewProject[]> {
  const client = db()
  if (!client) return read<CrewProject[]>(projectsKey(c.id), [])
  const { data, error } = await client
    .from("crew_projects")
    .select("id, crew_id, title, blurb, status, href, position, created_by, shipped_at")
    .eq("crew_id", c.id)
    .order("position")
    .limit(200)
  if (missing(error)) return []
  fail(error)
  return (data as { id: string; crew_id: string; title: string; blurb: string; status: ProjectStatus; href: string | null; position: number; created_by: string | null; shipped_at: string | null }[]).map((r) => ({
    id: r.id,
    crewId: r.crew_id,
    title: r.title,
    blurb: r.blurb,
    status: r.status,
    href: r.href,
    position: r.position,
    createdBy: r.created_by,
    shippedAt: r.shipped_at,
  }))
}

export async function createProject(c: Crew, input: ProjectInput, status: ProjectStatus = "idea"): Promise<CrewProject> {
  const problem = validateProject(input)
  if (problem) throw new Error(problem)
  const row = { title: input.title.trim(), blurb: input.blurb.trim(), href: input.href.trim() || null, status, position: Date.now() / 1000 }
  const client = db()
  if (!client) {
    const p: CrewProject = { id: crypto.randomUUID(), crewId: c.id, ...row, createdBy: await myId(), shippedAt: status === "shipped" ? new Date().toISOString() : null }
    write(projectsKey(c.id), [...read<CrewProject[]>(projectsKey(c.id), []), p])
    return p
  }
  const { data, error } = await client.from("crew_projects").insert({ crew_id: c.id, ...row }).select("id, created_by, shipped_at").single()
  fail(error)
  const r = data as { id: string; created_by: string | null; shipped_at: string | null }
  return { id: r.id, crewId: c.id, ...row, createdBy: r.created_by, shippedAt: r.shipped_at }
}

/** Moves a card to another column (any member), at the end of it or at `position`. */
export async function moveProject(p: CrewProject, status: ProjectStatus, position = Date.now() / 1000): Promise<CrewProject> {
  const next: CrewProject = { ...p, status, position, shippedAt: status === "shipped" ? (p.shippedAt ?? new Date().toISOString()) : null }
  const client = db()
  if (!client) {
    write(
      projectsKey(p.crewId),
      read<CrewProject[]>(projectsKey(p.crewId), []).map((x) => (x.id === p.id ? next : x))
    )
    return next
  }
  const { error } = await client.from("crew_projects").update({ status, position }).eq("id", p.id)
  fail(error)
  return next
}

export async function deleteProject(p: CrewProject) {
  const client = db()
  if (!client) {
    write(
      projectsKey(p.crewId),
      read<CrewProject[]>(projectsKey(p.crewId), []).filter((x) => x.id !== p.id)
    )
    return
  }
  const { error } = await client.from("crew_projects").delete().eq("id", p.id)
  fail(error)
}

// ─── Leaderboard and mission log ────────────────────────────────────────────────────────────────────────────

export type LeaderRow = { userId: string; name: string; role: CrewRole; posts: number; messages: number; reactions: number; shipped: number; score: number }

/** Who did the most in the last `days` days. Points: post 5, chat message 1, reaction on their posts 2, card shipped 10. */
export async function leaderboard(c: Crew, days = 30): Promise<LeaderRow[]> {
  const client = db()
  if (!client) return []
  const { data, error } = await client.rpc("crew_leaderboard", { crew: c.id, days })
  if (missing(error)) return []
  fail(error)
  return (data as { user_id: string; name: string | null; role: CrewRole; posts: number; messages: number; reactions: number; shipped: number; score: number }[])
    .map((r) => ({ userId: r.user_id, name: r.name || "Member", role: r.role, posts: Number(r.posts), messages: Number(r.messages), reactions: Number(r.reactions), shipped: Number(r.shipped), score: Number(r.score) }))
    .filter((r) => r.score > 0)
}

export type FeedItem = { kind: "join" | "post" | "event" | "project" | "shipped"; at: string; actorId: string | null; actorName: string; title: string; ref: string | null }

export async function crewFeed(c: Crew, max = 30): Promise<FeedItem[]> {
  const client = db()
  if (!client) {
    const events = read<CrewEvent[]>(eventsKey(c.id), []).map((e) => ({ kind: "event" as const, at: e.startsAt, actorId: e.createdBy, actorName: "You", title: e.title, ref: e.id }))
    const projects = read<CrewProject[]>(projectsKey(c.id), []).map((p) => ({ kind: (p.shippedAt ? "shipped" : "project") as FeedItem["kind"], at: p.shippedAt ?? new Date(p.position * 1000).toISOString(), actorId: p.createdBy, actorName: "You", title: p.title, ref: p.id }))
    return [...events, ...projects].sort((a, b) => b.at.localeCompare(a.at)).slice(0, max)
  }
  const { data, error } = await client.rpc("crew_feed", { crew: c.id, max_rows: max })
  if (missing(error)) return []
  fail(error)
  return (data as { kind: FeedItem["kind"]; happened_at: string; actor_id: string | null; actor_name: string | null; title: string; ref: string | null }[]).map((r) => ({
    kind: r.kind,
    at: r.happened_at,
    actorId: r.actor_id,
    actorName: r.actor_name || "A member",
    title: r.title,
    ref: r.ref,
  }))
}
