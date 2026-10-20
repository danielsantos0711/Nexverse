"use client"

import { useEffect, useState } from "react"
import type { ResourceKind } from "@/lib/data"
import { db } from "@/lib/supabase"

/*
 * What the home page shows from the community itself: real rows from the database, read in the browser
 * (row level security decides what a visitor may see). Without a database every loader answers "nothing yet",
 * and the sections show their empty states instead of examples. Content staff hid is left out; on a database
 * without the hidden_at columns yet, the same query runs without that filter.
 */

type Query = PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>

/** Runs a query with the "not hidden" filter, and again without it if the column is not there yet. */
async function visible<T>(build: (hideHidden: boolean) => Query): Promise<{ data: T | null; count: number | null }> {
  let res = await build(true)
  if (res.error) res = await build(false)
  if (res.error) return { data: null, count: null }
  return { data: res.data as T, count: res.count ?? null }
}

// ─── Totals ────────────────────────────────────────────────────────────────────────────────────────────────

export type HubCounts = { members: number; threads: number; replies: number; projects: number; links: number }

export async function loadCounts(): Promise<HubCounts | null> {
  const c = db()
  if (!c) return null
  const head = { count: "exact" as const, head: true }
  const [members, threads, replies, projects, links] = await Promise.all([
    visible<null>(() => c.from("profiles").select("id", head)),
    visible<null>((h) => (h ? c.from("questions").select("id", head).is("hidden_at", null) : c.from("questions").select("id", head))),
    visible<null>((h) => (h ? c.from("answers").select("id", head).is("hidden_at", null) : c.from("answers").select("id", head))),
    visible<null>((h) => {
      const q = c.from("projects").select("id", head).eq("status", "published").eq("visibility", "public")
      return h ? q.is("hidden_at", null) : q
    }),
    visible<null>((h) => (h ? c.from("submissions").select("id", head).is("hidden_at", null) : c.from("submissions").select("id", head))),
  ])
  return { members: members.count ?? 0, threads: threads.count ?? 0, replies: replies.count ?? 0, projects: projects.count ?? 0, links: links.count ?? 0 }
}

// ─── New in the hub: published projects and shared links ───────────────────────────────────────────────────

export type HubItem = {
  id: string
  kind: ResourceKind
  name: string
  summary: string
  by: string
  at: string
  /** A Nexverse page (projects) or the shared address (links, which open in a new tab). */
  href: string
  external: boolean
}

type ProjectRow = { id: string; kind: ResourceKind; name: string; summary: string; published_at: string | null; created_at: string; owner: { name: string } | null }
type SubmissionRow = { id: string; kind: ResourceKind | "news"; title: string; url: string; summary: string; created_at: string; author: { name: string } | null }

export async function loadHubItems(limit = 40): Promise<HubItem[]> {
  const c = db()
  if (!c) return []
  const [projects, links] = await Promise.all([
    visible<ProjectRow[]>((h) => {
      const q = c.from("projects").select("id, kind, name, summary, published_at, created_at, owner:profiles(name)").eq("status", "published").eq("visibility", "public").lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(limit)
      return h ? q.is("hidden_at", null) : q
    }),
    visible<SubmissionRow[]>((h) => {
      const q = c.from("submissions").select("id, kind, title, url, summary, created_at, author:profiles(name)").neq("kind", "news").order("created_at", { ascending: false }).limit(limit)
      return h ? q.is("hidden_at", null) : q
    }),
  ])
  const items: HubItem[] = [
    ...(projects.data ?? []).map((p) => ({
      id: `project:${p.id}`,
      kind: p.kind,
      name: p.name,
      summary: p.summary,
      by: p.owner?.name ?? "A member",
      at: p.published_at ?? p.created_at,
      href: `/p/${p.id}`,
      external: false,
    })),
    ...(links.data ?? [])
      .filter((s): s is SubmissionRow & { kind: ResourceKind } => s.kind !== "news")
      .map((s) => ({ id: `link:${s.id}`, kind: s.kind, name: s.title, summary: s.summary, by: s.author?.name ?? "A member", at: s.created_at, href: s.url, external: true })),
  ]
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** The newest links members shared as news, for the briefing's last line. */
export async function loadSharedNews(limit = 3): Promise<HubItem[]> {
  const c = db()
  if (!c) return []
  const { data } = await visible<SubmissionRow[]>((h) => {
    const q = c.from("submissions").select("id, kind, title, url, summary, created_at, author:profiles(name)").eq("kind", "news").order("created_at", { ascending: false }).limit(limit)
    return h ? q.is("hidden_at", null) : q
  })
  return (data ?? []).map((s) => ({ id: `link:${s.id}`, kind: "repo", name: s.title, summary: s.summary, by: s.author?.name ?? "A member", at: s.created_at, href: s.url, external: true }))
}

// ─── Forum ──────────────────────────────────────────────────────────────────────────────────────────────────

export type HotThread = { id: string; title: string; orbit: string; lang: string; at: string; by: string; replies: number; solved: boolean }
type QuestionRow = { id: string; title: string; orbit: string; lang: string; created_at: string; accepted_answer_id: string | null; author: { name: string } | null; answers: { count: number }[] }

/** The liveliest recent threads: most replies first among the newest fifty, then the newest. */
export async function loadHotThreads(limit = 6): Promise<HotThread[]> {
  const c = db()
  if (!c) return []
  const { data } = await visible<QuestionRow[]>((h) => {
    const q = c
      .from("questions")
      .select("id, title, orbit, lang, created_at, accepted_answer_id, author:profiles(name), answers!answers_question_id_fkey(count)")
      .order("created_at", { ascending: false })
      .limit(50)
    return h ? q.is("hidden_at", null) : q
  })
  return (data ?? [])
    .map((q) => ({ id: q.id, title: q.title, orbit: q.orbit, lang: q.lang, at: q.created_at, by: q.author?.name ?? "A member", replies: q.answers?.[0]?.count ?? 0, solved: Boolean(q.accepted_answer_id) }))
    .sort((a, b) => b.replies - a.replies || b.at.localeCompare(a.at))
    .slice(0, limit)
}

// ─── Collections (the members' constellations) ──────────────────────────────────────────────────────────────

export type HubCollection = { id: string; title: string; description: string; by: string; items: number; at: string; targets: string[] }
type CollectionRow = { id: string; title: string; description: string; updated_at: string; owner: { name: string } | null; items: { target: string; position: number }[] }

export async function loadCollections(limit = 4): Promise<HubCollection[]> {
  const c = db()
  if (!c) return []
  const { data } = await visible<CollectionRow[]>(() =>
    c.from("collections").select("id, title, description, updated_at, owner:profiles(name), items:collection_items(target, position)").eq("is_public", true).order("updated_at", { ascending: false }).limit(limit)
  )
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    by: r.owner?.name ?? "A member",
    items: r.items?.length ?? 0,
    at: r.updated_at,
    targets: [...(r.items ?? [])].sort((a, b) => a.position - b.position).map((i) => i.target),
  }))
}

// ─── Builders ───────────────────────────────────────────────────────────────────────────────────────────────

export type Builder = { id: string; name: string; handle: string | null; avatar: string | null; points: number; threads: number; replies: number; accepted: number; place: string }
type LeaderRow = { member_id: string; name: string; points: number; threads: number; answers: number; accepted: number }
type ProfileRow = { id: string; name: string; handle: string | null; avatar_url: string | null; location: string | null }

/** Members ranked by reputation (all time); when nobody has points yet, the newest members. */
export async function loadBuilders(limit = 8): Promise<Builder[]> {
  const c = db()
  if (!c) return []
  const board = await c.rpc("leaderboard", { period: "all", max_rows: limit })
  const ranked = ((board.data ?? []) as LeaderRow[]).filter((r) => Number(r.points) > 0)
  let ids = ranked.map((r) => r.member_id)
  let profiles: ProfileRow[] = []
  if (ids.length) {
    const res = await c.from("profiles").select("id, name, handle, avatar_url, location").in("id", ids)
    profiles = (res.data ?? []) as ProfileRow[]
  } else {
    const res = await c.from("profiles").select("id, name, handle, avatar_url, location").order("created_at", { ascending: false }).limit(limit)
    profiles = (res.data ?? []) as ProfileRow[]
    ids = profiles.map((p) => p.id)
  }
  return ids
    .map((id) => {
      const p = profiles.find((x) => x.id === id)
      const r = ranked.find((x) => x.member_id === id)
      if (!p) return null
      return { id, name: p.name, handle: p.handle, avatar: p.avatar_url, place: p.location ?? "", points: Number(r?.points ?? 0), threads: Number(r?.threads ?? 0), replies: Number(r?.answers ?? 0), accepted: Number(r?.accepted ?? 0) }
    })
    .filter((b): b is Builder => b !== null)
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────────────────────────────────

/** Loads once on mount; `undefined` while loading, then the value (loaders never throw to the page). */
export function useLoad<T>(load: () => Promise<T>, fallback: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    let on = true
    load()
      .then((v) => on && setValue(v))
      .catch(() => on && setValue(fallback))
    return () => {
      on = false
    }
    // the loaders are module functions; one load per mount
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return value
}

export { since } from "./time"
