"use client"

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react"
import { conform, isContentKey, seoFor, visibilityFor, type Seo, type Visibility } from "@/lib/content-shape"
import { db, live } from "@/lib/supabase"

/*
 * Editable site content. Every piece of copy or curated list on a page goes through these hooks with a key
 * and the default the code ships with; an admin can then change it from the site editor or in place on the
 * page, without a deploy. Keys are dotted and stable: "<page>.<section>.<field>", e.g. "home.hero.title".
 *
 * Storage: public.site_content (supabase/migrations/20261019130000_site_content.sql), one row per key. All
 * overrides load in one read, shared by every component, and stay live: an editor's save shows up in every
 * open tab within seconds. The server renders with the same overrides (ContentProvider seeds them), so pages
 * arrive with the right text and no flash. Without a database, or before the migration, everything falls
 * back to the defaults in the code.
 *
 * Keys starting with "seo." and "visibility." are reserved for the per-page settings below.
 */

export type ContentKey = string
export type ContentKind = "copy" | "block"
export { CONTENT_KEY, VISIBILITIES, conform, emptyOf, isContentKey, isVisibility, seoFor, seoKey, visibilityFor, visibilityKey } from "@/lib/content-shape"
export type { Seo, Visibility } from "@/lib/content-shape"
// ─── The shared store ───────────────────────────────────────────────────────────────────────────────────────

type Values = Record<string, unknown>
type State = { ready: boolean; values: Values }

const SERVER: State = { ready: false, values: {} }
let state: State = SERVER
let started = false
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  start()
  listeners.add(l)
  return () => listeners.delete(l)
}

const PAGE = 1000

async function load() {
  const c = db()
  if (!c) {
    set({ ready: true, values: {} })
    return
  }
  const values: Values = {}
  // Pages of 1000 rows (the API's cap), only rows that override something.
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await c
      .from("site_content")
      .select("key, value")
      .not("value", "is", null)
      .order("key")
      .range(from, from + PAGE - 1)
    if (error || !data) {
      // The table may not exist yet on this database; the code's defaults still describe a complete site.
      if (from === 0) set({ ready: true, values: {} })
      return
    }
    for (const r of data as { key: string; value: unknown }[]) values[r.key] = r.value
    if (data.length < PAGE) break
  }
  set({ ready: true, values })
}

function start() {
  if (started || typeof window === "undefined") return
  started = true
  void load()
  db()
    ?.channel("site-content")
    .on("postgres_changes", { event: "*", schema: "public", table: "site_content" }, (p) => {
      const row = (p.new ?? {}) as { key?: string; value?: unknown }
      if (!row.key) return
      const values = { ...state.values }
      if (row.value === null || row.value === undefined) delete values[row.key]
      else values[row.key] = row.value
      set({ ready: true, values })
    })
    .subscribe()
}

/**
 * Overrides the server read for this render (see ContentProvider). Used until the live store has loaded, so
 * the server's HTML and the first client render agree.
 */
export const ContentSeed = createContext<Values | null>(null)

function useValues(): Values {
  const seed = useContext(ContentSeed)
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER)
  return s.ready ? s.values : (seed ?? {})
}

/** Every override, live. For the editor panel and the site editor. */
export function useContentValues() {
  return useValues()
}

// ─── What is on the page: a registry the editor panel reads ────────────────────────────────────────────────

export type Registered = { key: string; kind: ContentKind; fallback: unknown; multiline?: boolean; count: number }

const registry = new Map<string, Registered>()
const registryListeners = new Set<() => void>()
let registrySnapshot: Registered[] = []
let registryQueued = false

function registryChanged() {
  if (registryQueued) return
  registryQueued = true
  queueMicrotask(() => {
    registryQueued = false
    registrySnapshot = [...registry.values()]
    registryListeners.forEach((l) => l())
  })
}

function register(key: string, kind: ContentKind, fallback: unknown, multiline?: boolean) {
  const had = registry.get(key)
  registry.set(key, { key, kind, fallback, multiline: multiline || had?.multiline, count: (had?.count ?? 0) + 1 })
  registryChanged()
  return () => {
    const now = registry.get(key)
    if (!now) return
    if (now.count <= 1) registry.delete(key)
    else registry.set(key, { ...now, count: now.count - 1 })
    registryChanged()
  }
}

/** Records that a key is used by a mounted component, so the editor panel can list it. */
function useRegister(key: string, kind: ContentKind, fallback: unknown, multiline?: boolean) {
  const latest = useRef(fallback)
  useEffect(() => {
    latest.current = fallback
  })
  useEffect(() => register(key, kind, latest.current, multiline), [key, kind, multiline])
}

/** The keys used by what is on screen right now. */
export function useRegistry() {
  return useSyncExternalStore(
    (l) => {
      registryListeners.add(l)
      return () => registryListeners.delete(l)
    },
    () => registrySnapshot,
    () => registrySnapshot
  )
}

/** For <Copy>: registers the text with its multiline flag (so the panel offers a text area). */
export function useCopyEntry(key: ContentKey, fallback: string, multiline?: boolean): { text: string; overridden: boolean } {
  const values = useValues()
  useRegister(key, "copy", fallback, multiline)
  const v = values[key]
  const overridden = typeof v === "string" && v.trim() !== ""
  return { text: overridden ? (v as string) : fallback, overridden }
}

// ─── The hooks every page uses ──────────────────────────────────────────────────────────────────────────────

/** A piece of editable text. */
export function useCopy(key: ContentKey, fallback: string): string {
  return useCopyEntry(key, fallback).text
}

/**
 * An editable structured value: a list of items or a small config object. The fallback's shape is the
 * schema the admin editor shows (strings, numbers, booleans, arrays of flat objects).
 */
export function useBlock<T>(key: ContentKey, fallback: T): T {
  const values = useValues()
  useRegister(key, "block", fallback)
  return conform(fallback, values[key])
}

/** Who may see a page: "everyone" unless an admin chose otherwise. Accepts a real address ("/forum/c/models"). */
export function usePageVisibility(path: string): Visibility {
  return visibilityFor(useValues(), path)
}

/** The SEO overrides for a page (empty strings where none). */
export function useSeo(path: string): Seo {
  return seoFor(useValues(), path)
}

// ─── Edit mode (page editors only; the editor component decides who sees the switch) ──────────────────────

let editing = false
const editListeners = new Set<() => void>()

export function setEditMode(on: boolean) {
  if (editing === on) return
  editing = on
  if (typeof document !== "undefined") {
    if (on) document.documentElement.dataset.contentEdit = "on"
    else delete document.documentElement.dataset.contentEdit
  }
  editListeners.forEach((l) => l())
}

export function useEditMode() {
  return useSyncExternalStore(
    (l) => {
      editListeners.add(l)
      return () => editListeners.delete(l)
    },
    () => editing,
    () => false
  )
}

// ─── Writing (the database decides who may: pages.edit, and admins for visibility) ────────────────────────

export const canSaveContent = () => live

function friendly(message: string) {
  if (/schema cache|does not exist|PGRST205|42P01/i.test(message)) return "The content table is not on this database yet. Apply the migration 20261019130000_site_content.sql."
  if (/row-level security|permission|violates/i.test(message)) {
    if (/check constraint/i.test(message)) return "That value is not allowed here (too long, or the wrong kind)."
    return "Your account cannot change this. Page editors change texts; admins change who sees a page."
  }
  return message
}

function need() {
  const c = db()
  if (!c) throw new Error("Editing the site needs the database. Connect Supabase to save changes.")
  return c
}

/** Saves an override. `fallback` and `path` help the site editor list it later. */
export async function saveContent(key: string, kind: ContentKind, value: unknown, meta: { fallback?: unknown; path?: string } = {}) {
  const c = need()
  const row: Record<string, unknown> = { key, kind, value }
  if (meta.fallback !== undefined) row.fallback = meta.fallback
  if (meta.path && meta.path.startsWith("/")) row.path = meta.path.slice(0, 200)
  const { error } = await c.from("site_content").upsert(row, { onConflict: "key" })
  if (error) throw new Error(friendly(error.message))
  const values = { ...state.values }
  if (value === null) delete values[key]
  else values[key] = value
  set({ ready: true, values })
}

/** Back to the code's default. The previous value stays in the history. */
export async function resetContent(key: string, kind: ContentKind) {
  await saveContent(key, kind, null)
}

/**
 * Notes the defaults of keys seen on a page, so the site editor can list texts nobody changed yet. Existing
 * rows are left alone. Quietly does nothing when the editor may not write.
 */
export async function noteDefaults(entries: { key: string; kind: ContentKind; fallback: unknown }[], path: string) {
  const c = db()
  if (!c || !entries.length) return
  const rows = entries.filter((e) => isContentKey(e.key)).map((e) => ({ key: e.key, kind: e.kind, value: null, fallback: e.fallback, path: path.startsWith("/") ? path.slice(0, 200) : null }))
  for (let i = 0; i < rows.length; i += 200) {
    await c.from("site_content").upsert(rows.slice(i, i + 200), { onConflict: "key", ignoreDuplicates: true })
  }
}

export type HistoryEntry = { value: unknown; by: string | null; at: string }
export type ContentRow = {
  key: string
  kind: ContentKind
  value: unknown
  fallback: unknown
  path: string | null
  history: HistoryEntry[]
  updatedAt: string
  editor: string | null
}

/** Every row, with defaults and history, for the site editor. `ok` is false when the table is missing. */
export async function loadContentRows(): Promise<{ ok: boolean; rows: ContentRow[]; reason?: string }> {
  const c = db()
  if (!c) return { ok: false, rows: [], reason: "browser" }
  const rows: ContentRow[] = []
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await c
      .from("site_content")
      .select("key, kind, value, fallback, path, history, updated_at, editor:profiles!site_content_updated_by_fkey(name)")
      .order("key")
      .range(from, from + PAGE - 1)
    if (error || !data) return { ok: false, rows, reason: friendly(error?.message ?? "Could not read the site's content.") }
    for (const r of data as unknown as {
      key: string
      kind: ContentKind
      value: unknown
      fallback: unknown
      path: string | null
      history: HistoryEntry[] | null
      updated_at: string
      editor: { name: string } | null
    }[]) {
      rows.push({ key: r.key, kind: r.kind, value: r.value, fallback: r.fallback, path: r.path, history: r.history ?? [], updatedAt: r.updated_at, editor: r.editor?.name ?? null })
    }
    if (data.length < PAGE) break
  }
  return { ok: true, rows }
}
