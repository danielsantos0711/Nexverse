"use client"

import { explain, isMissingSchema, type ContentKind, type ReportStatus } from "@/lib/moderation"
import { db } from "@/lib/supabase"

/*
 * What the admin panel reads and changes. Everything goes through the browser's database client, so row level
 * security decides: staff see every report and the log, admins change roles and site settings. Nothing here
 * is trusted because the interface hid a button.
 */

export type SiteRoleName = "member" | "moderator" | "admin"
export const ROLE_LABELS: Record<SiteRoleName, string> = { member: "Member", moderator: "Moderator", admin: "Admin" }

const WEEK = 7 * 864e5

/** Whether the roles migration has reached this database, judged by one cheap read. */
export async function moderationReady(): Promise<{ ok: boolean; reason?: string }> {
  const c = db()
  if (!c) return { ok: false, reason: "browser" }
  const { error } = await c.from("site_settings").select("key").limit(1)
  if (error) return { ok: false, reason: isMissingSchema(error) ? "schema" : explain(error) }
  return { ok: true }
}

// Overview

export type OverviewCounts = Record<"members" | "newMembers" | "openReports" | "threads" | "submissions" | "projects" | "events" | "rooms", number | null>

async function count(table: string, where: { eq?: [string, string]; gte?: [string, string] } = {}) {
  const c = db()
  if (!c) return null
  let q = c.from(table).select("*", { count: "exact", head: true })
  if (where.eq) q = q.eq(...where.eq)
  if (where.gte) q = q.gte(...where.gte)
  const { count: n, error } = await q
  return error ? null : (n ?? 0)
}

/** Real totals, each one on its own: a table that is missing shows as unknown instead of breaking the page. */
export async function loadOverview(): Promise<OverviewCounts> {
  const since = new Date(Date.now() - WEEK).toISOString()
  const [members, newMembers, openReports, threads, submissions, projects, events, rooms] = await Promise.all([
    count("profiles"),
    count("profiles", { gte: ["created_at", since] }),
    count("reports", { eq: ["status", "open"] }),
    count("questions"),
    count("submissions"),
    count("projects", { eq: ["status", "published"] }),
    count("events"),
    count("rooms"),
  ])
  return { members, newMembers, openReports, threads, submissions, projects, events, rooms }
}

// Members

export type AdminMember = {
  id: string
  name: string
  handle: string | null
  role: SiteRoleName
  suspendedUntil: string | null
  suspendedReason: string | null
  createdAt: string
}

type MemberRow = { id: string; name: string; handle?: string | null; role?: string; suspended_until?: string | null; suspended_reason?: string | null; created_at: string }

const toMember = (r: MemberRow): AdminMember => ({
  id: r.id,
  name: r.name,
  handle: r.handle ?? null,
  role: r.role === "admin" || r.role === "moderator" ? r.role : "member",
  suspendedUntil: r.suspended_until ?? null,
  suspendedReason: r.suspended_reason ?? null,
  createdAt: r.created_at,
})

export const isSuspended = (m: Pick<AdminMember, "suspendedUntil">) => Boolean(m.suspendedUntil && Date.parse(m.suspendedUntil) > Date.now())

/** Members matching a name or handle, newest first. Characters PostgREST treats as syntax are dropped from the search. */
export async function searchMembers({ query = "", role = "all", limit = 50 }: { query?: string; role?: SiteRoleName | "all" | "suspended"; limit?: number }) {
  const c = db()
  if (!c) return { members: [] as AdminMember[], error: null as string | null }
  const term = query.replace(/[%,()*\\:."']/g, " ").trim().slice(0, 60)
  let q = c.from("profiles").select("id, name, handle, role, suspended_until, suspended_reason, created_at").order("created_at", { ascending: false }).limit(limit)
  if (term) q = q.or(`name.ilike.%${term}%,handle.ilike.%${term}%`)
  if (role === "suspended") q = q.gt("suspended_until", new Date().toISOString())
  else if (role !== "all") q = q.eq("role", role)
  const { data, error } = await q
  if (error) return { members: [] as AdminMember[], error: explain(error) }
  return { members: (data as MemberRow[]).map(toMember), error: null }
}

export async function setMemberRole(member: string, role: SiteRoleName) {
  const c = db()
  if (!c) throw new Error("Roles need the database.")
  const { error } = await c.rpc("set_member_role", { member, new_role: role })
  if (error) throw new Error(explain(error))
}

/** Pauses a member's posting for some days, or lifts the pause with days = 0. */
export async function suspendMember(member: string, days: number, reason: string) {
  const c = db()
  if (!c) throw new Error("Suspensions need the database.")
  const { error } = await c.rpc("suspend_member", { member, days: Math.max(0, Math.min(3650, Math.round(days))), reason: reason.trim().slice(0, 300) })
  if (error) throw new Error(explain(error))
}

// Content: what members posted, with enough text to judge it and a way to open it.

export type ContentItem = {
  kind: ContentKind
  id: string
  title: string
  excerpt: string
  author: { id: string; name: string } | null
  createdAt: string
  hiddenAt: string | null
  featuredAt: string | null
  /** A page inside Nexverse where the item shows, when it has one. */
  href: string | null
  /** The outside address a shared link points to (submissions only). */
  external: string | null
  meta: string
}

type Shape = { columns: string; map: (r: Record<string, unknown>) => Omit<ContentItem, "kind" | "id" | "createdAt" | "hiddenAt" | "author" | "featuredAt"> }

const clip = (s: unknown, n = 220) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

const SHAPES: Record<ContentKind, Shape> = {
  question: {
    columns: "id, title, body, orbit, created_at, hidden_at, author:profiles!questions_author_id_fkey(id, name)",
    map: (r) => ({ title: clip(r.title, 140), excerpt: clip(r.body), href: `/forum/${r.id}`, external: null, meta: `Forum · ${r.orbit}` }),
  },
  answer: {
    columns: "id, body, question_id, sample_thread, created_at, hidden_at, author:profiles!answers_author_id_fkey(id, name)",
    map: (r) => ({ title: "Reply", excerpt: clip(r.body), href: `/forum/${r.question_id ?? r.sample_thread}`, external: null, meta: "Forum reply" }),
  },
  submission: {
    columns: "id, kind, title, url, summary, created_at, hidden_at, featured_at, author:profiles!submissions_author_id_fkey(id, name)",
    map: (r) => ({ title: clip(r.title, 140), excerpt: clip(r.summary), href: r.kind === "news" ? "/news" : null, external: String(r.url ?? ""), meta: `Shared ${r.kind}` }),
  },
  project: {
    columns: "id, name, summary, kind, status, created_at, hidden_at, author:profiles!projects_owner_id_fkey(id, name)",
    map: (r) => ({ title: clip(r.name, 140), excerpt: clip(r.summary), href: `/p/${r.id}`, external: null, meta: `Project · ${r.kind}${r.status === "draft" ? " · draft" : ""}` }),
  },
  event: {
    columns: "id, title, description, kind, starts_at, created_at, hidden_at, author:profiles!events_host_id_fkey(id, name)",
    map: (r) => ({ title: clip(r.title, 140), excerpt: clip(r.description), href: `/events/${r.id}`, external: null, meta: `Event · ${String(r.kind).replace("-", " ")}` }),
  },
  room_message: {
    columns: "id, body, room, created_at, hidden_at, author:profiles!room_messages_author_id_fkey(id, name)",
    map: (r) => ({ title: `#${r.room}`, excerpt: clip(r.body), href: `/chat/${r.room}`, external: null, meta: "Chat message" }),
  },
}

const TABLES: Record<ContentKind, string> = {
  question: "questions",
  answer: "answers",
  submission: "submissions",
  project: "projects",
  event: "events",
  room_message: "room_messages",
}

function toItem(kind: ContentKind, r: Record<string, unknown>): ContentItem {
  const author = (Array.isArray(r.author) ? r.author[0] : r.author) as { id: string; name: string } | null
  return {
    kind,
    id: String(r.id),
    createdAt: String(r.created_at),
    hiddenAt: (r.hidden_at as string | null) ?? null,
    featuredAt: (r.featured_at as string | null) ?? null,
    author: author ?? null,
    ...SHAPES[kind].map(r),
  }
}

/** The latest items of one kind, hidden ones included (staff can read them). */
export async function listContent(kind: ContentKind, { hiddenOnly = false, limit = 40 } = {}) {
  const c = db()
  if (!c) return { items: [] as ContentItem[], error: null as string | null }
  let q = c.from(TABLES[kind]).select(SHAPES[kind].columns).order("created_at", { ascending: false }).limit(limit)
  if (hiddenOnly) q = q.not("hidden_at", "is", null)
  const { data, error } = await q
  if (error) return { items: [] as ContentItem[], error: explain(error) }
  return { items: (data as unknown as Record<string, unknown>[]).map((r) => toItem(kind, r)), error: null }
}

/** The items a set of reports point at, keyed "kind:id", so the queue can show what was reported. */
export async function loadTargets(refs: { kind: string; id: string }[]) {
  const c = db()
  const out: Record<string, ContentItem> = {}
  if (!c) return out
  const byKind = new Map<ContentKind, string[]>()
  for (const r of refs) {
    if (!(r.kind in TABLES) || !/^[0-9a-f-]{36}$/i.test(r.id)) continue
    const kind = r.kind as ContentKind
    byKind.set(kind, [...(byKind.get(kind) ?? []), r.id])
  }
  await Promise.all(
    [...byKind].map(async ([kind, ids]) => {
      const { data } = await c.from(TABLES[kind]).select(SHAPES[kind].columns).in("id", [...new Set(ids)])
      for (const row of (data as unknown as Record<string, unknown>[] | null) ?? []) out[`${kind}:${row.id}`] = toItem(kind, row)
    })
  )
  return out
}

// Reports

export type Report = {
  id: string
  targetKind: string
  targetId: string
  targetUrl: string | null
  reason: string
  details: string
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  reporter: { id: string; name: string } | null
  resolver: { id: string; name: string } | null
}

type ReportRow = {
  id: string
  target_kind: string
  target_id: string
  target_url: string | null
  reason: string
  details: string
  status: ReportStatus
  created_at: string
  resolved_at: string | null
  reporter: { id: string; name: string } | null
  resolver: { id: string; name: string } | null
}

export async function listReports(status: "open" | "closed", limit = 60) {
  const c = db()
  if (!c) return { reports: [] as Report[], error: null as string | null }
  let q = c
    .from("reports")
    .select(
      "id, target_kind, target_id, target_url, reason, details, status, created_at, resolved_at, reporter:profiles!reports_reporter_id_fkey(id, name), resolver:profiles!reports_resolved_by_fkey(id, name)"
    )
    .limit(limit)
  q = status === "open" ? q.eq("status", "open").order("created_at", { ascending: true }) : q.neq("status", "open").order("resolved_at", { ascending: false })
  const { data, error } = await q
  if (error) return { reports: [] as Report[], error: explain(error) }
  return {
    reports: (data as unknown as ReportRow[]).map((r) => ({
      id: r.id,
      targetKind: r.target_kind,
      targetId: r.target_id,
      targetUrl: r.target_url,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      reporter: r.reporter,
      resolver: r.resolver,
    })),
    error: null,
  }
}

// Moderation log

export type LogEntry = { id: number; action: string; targetKind: string; targetId: string; note: string; createdAt: string; actor: { id: string; name: string } | null }

export async function listLog({ limit = 50, before }: { limit?: number; before?: number } = {}) {
  const c = db()
  if (!c) return { entries: [] as LogEntry[], error: null as string | null }
  let q = c.from("moderation_log").select("id, action, target_kind, target_id, note, created_at, actor:profiles(id, name)").order("id", { ascending: false }).limit(limit)
  if (before) q = q.lt("id", before)
  const { data, error } = await q
  if (error) return { entries: [] as LogEntry[], error: explain(error) }
  type Row = { id: number; action: string; target_kind: string; target_id: string; note: string; created_at: string; actor: { id: string; name: string } | null }
  return {
    entries: (data as unknown as Row[]).map((r) => ({ id: r.id, action: r.action, targetKind: r.target_kind, targetId: r.target_id, note: r.note, createdAt: r.created_at, actor: r.actor })),
    error: null,
  }
}

/** Where a log entry's target can be opened, when it is something with a page. */
export function logTargetHref(e: Pick<LogEntry, "targetKind" | "targetId">): string | null {
  switch (e.targetKind) {
    case "question":
      return `/forum/${e.targetId}`
    case "project":
      return `/p/${e.targetId}`
    case "event":
      return `/events/${e.targetId}`
    case "import":
      return "/admin/import"
    default:
      return null
  }
}

// Navigation: every link the header, footer and menus show, so admins can hide any of them.

export const NAV_LINKS: { href: string; label: string; group: string }[] = [
  { href: "/explore", label: "Explore", group: "Header" },
  { href: "/share", label: "Share a link", group: "Header" },
  { href: "/models", label: "Models", group: "Hub" },
  { href: "/datasets", label: "Datasets", group: "Hub" },
  { href: "/tools", label: "Tools", group: "Hub" },
  { href: "/trending", label: "Trending now", group: "Hub" },
  { href: "/code", label: "Code", group: "Hub" },
  { href: "/forum", label: "Forum", group: "Community" },
  { href: "/crews", label: "Crews", group: "Community" },
  { href: "/messages", label: "Messages", group: "Community" },
  { href: "/chat", label: "Chat", group: "Community" },
  { href: "/news", label: "News", group: "Community" },
  { href: "/people", label: "People", group: "Community" },
  { href: "/missions", label: "Missions", group: "Community" },
  { href: "/launchpad", label: "Launchpad", group: "Community" },
  { href: "/arena", label: "Arena", group: "Community" },
  { href: "/benchmarks", label: "Benchmarks", group: "Community" },
  { href: "/events", label: "Events", group: "Community" },
  { href: "/leaderboard", label: "Leaderboard", group: "Community" },
  { href: "/for-you", label: "For you", group: "Community" },
  { href: "/new/project", label: "Publish a project", group: "Create" },
  { href: "/compare", label: "Compare", group: "Create" },
  { href: "/lab", label: "Lab", group: "Create" },
  { href: "/collections", label: "Collections", group: "Create" },
  { href: "/forum/new", label: "Start a thread", group: "Create" },
  { href: "/saved", label: "Saved", group: "You" },
  { href: "/notifications", label: "Notifications", group: "You" },
]
