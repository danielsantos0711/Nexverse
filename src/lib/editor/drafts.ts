"use client"

import { useEffect, useRef, useState } from "react"
import { db, live } from "@/lib/supabase"

/**
 * Autosaved drafts. What a member types is kept in this browser at once and, when signed in, in
 * public.editor_drafts a few seconds later, so a closed tab, a crash or a switch of device loses nothing.
 * One draft per place, named by a key ("project:<id>:readme", "forum:new", …). Saving an empty text removes the
 * draft, so a form that clears its box after posting also clears its draft.
 *
 * Without the database table (older installs) the browser copy still works and the database is not asked again.
 */

export type Draft = { key: string; body: string; title: string; meta: Record<string, unknown>; savedAt: string; where: "device" | "account" }

const LOCAL = (key: string) => `nexverse-draft:${key}`
const KEY = /^[a-z0-9][a-z0-9:_.-]{0,119}$/

/** Turns any place name into a valid draft key. */
export function draftKey(...parts: string[]) {
  const k = parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:_.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 120)
  return KEY.test(k) ? k : "draft"
}

let tableMissing = false

function readLocal(key: string): Draft | null {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL(key)) ?? "null") as Partial<Draft> | null
    return v && typeof v.body === "string" && typeof v.savedAt === "string" ? { key, body: v.body, title: v.title ?? "", meta: v.meta ?? {}, savedAt: v.savedAt, where: "device" } : null
  } catch {
    return null
  }
}

function writeLocal(key: string, d: Omit<Draft, "key" | "where"> | null) {
  try {
    if (d) localStorage.setItem(LOCAL(key), JSON.stringify(d))
    else localStorage.removeItem(LOCAL(key))
  } catch {}
}

async function signedIn() {
  const client = db()
  if (!client || tableMissing) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ? client : null
}

const missing = (e: { code?: string; message: string } | null) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /editor_drafts/.test(e.message)))

/** The newest saved draft for a key, from this browser or the member's account. */
export async function loadDraft(key: string): Promise<Draft | null> {
  const local = readLocal(key)
  const client = await signedIn().catch(() => null)
  if (!client) return local
  const { data, error } = await client.from("editor_drafts").select("key, title, body, meta, updated_at").eq("key", key).maybeSingle()
  if (error) {
    if (missing(error)) tableMissing = true
    return local
  }
  if (!data) return local
  const remote: Draft = { key, body: data.body, title: data.title, meta: (data.meta as Record<string, unknown>) ?? {}, savedAt: data.updated_at, where: "account" }
  return !local || remote.savedAt > local.savedAt ? remote : local
}

/** Saves (or, for an empty body, removes) a draft everywhere it is kept. */
export async function saveDraft(key: string, body: string, title = "", meta: Record<string, unknown> = {}): Promise<"device" | "account"> {
  const empty = !body.trim() && !title.trim()
  const savedAt = new Date().toISOString()
  writeLocal(key, empty ? null : { body, title, meta, savedAt })
  const client = await signedIn().catch(() => null)
  if (!client) return "device"
  const { error } = empty
    ? await client.from("editor_drafts").delete().eq("key", key)
    : await client.from("editor_drafts").upsert({ key, body: body.slice(0, 60000), title: title.slice(0, 300), meta }, { onConflict: "owner_id,key" })
  if (error) {
    if (missing(error)) tableMissing = true
    return "device"
  }
  return "account"
}

export const clearDraft = (key: string) => saveDraft(key, "")

export type SaveState = { status: "idle" | "pending" | "saved" | "error"; where: "device" | "account" | null; at: string | null }

/**
 * Keeps a draft of `value` as it changes: in this browser after a short pause, in the account after a longer
 * one. `restore` is an older draft that differs from what the box started with, for the editor to offer back.
 */
export function useAutosave(key: string | null, value: string, opts: { title?: string; delay?: number } = {}) {
  const [state, setState] = useState<SaveState>({ status: "idle", where: null, at: null })
  const [restore, setRestore] = useState<Draft | null>(null)
  const initial = useRef(value)
  const touched = useRef(false)
  const delay = opts.delay ?? 1500
  const title = opts.title ?? ""

  useEffect(() => {
    if (!key) return
    let stale = false
    loadDraft(key)
      .then((d) => {
        if (stale || !d || touched.current) return
        if (d.body.trim() && d.body !== initial.current) setRestore(d)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [key])

  useEffect(() => {
    if (!key) return
    if (!touched.current) {
      if (value === initial.current) return
      touched.current = true
      setRestore(null)
    }
    setState((s) => ({ ...s, status: "pending" }))
    const t = setTimeout(() => {
      saveDraft(key, value, title)
        .then((where) => setState({ status: "saved", where: live ? where : "device", at: new Date().toISOString() }))
        .catch(() => setState((s) => ({ ...s, status: "error" })))
    }, delay)
    return () => clearTimeout(t)
  }, [key, value, title, delay])

  return {
    state,
    restore,
    dismiss: () => setRestore(null),
    /** Call after a successful post. */
    clear: () => key && clearDraft(key),
  }
}
