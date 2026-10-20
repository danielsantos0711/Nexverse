"use client"

import { resetContent, saveContent } from "@/lib/content"
import { explain, isMissingSchema } from "@/lib/moderation"
import { db } from "@/lib/supabase"
import { LISTS, type ListDef, type Row } from "./registry"

/*
 * What /admin/lists reads and writes. Every list is one "block" row of public.site_content (key, value jsonb),
 * written through the shared content layer (saveContent / resetContent in lib/content.ts), so open pages pick
 * up a change within seconds. The database decides who may write and records every change in the moderation
 * log and the row's history (supabase/migrations/20261019130000_site_content.sql); lists are admins only
 * (20261019131000_lists.sql).
 */

export type Saved = { value: unknown; updatedAt: string | null; editor: string | null }
export type Availability = { ok: true } | { ok: false; reason: "browser" | "schema" | "error"; message?: string }

/** Every list someone saved, by site_content key. Lists on their defaults are missing from the map. */
export async function loadSavedLists(): Promise<{ saved: Record<string, Saved>; availability: Availability }> {
  const c = db()
  if (!c) return { saved: {}, availability: { ok: false, reason: "browser" } }
  const keys = LISTS.map((l) => l.key)
  const res = await c.from("site_content").select("key, value, updated_at, editor:profiles!site_content_updated_by_fkey(name)").in("key", keys)
  if (res.error) {
    // An older table without the editor link still lists what was saved.
    const plain = await c.from("site_content").select("key, value").in("key", keys)
    if (plain.error) return { saved: {}, availability: isMissingSchema(plain.error) ? { ok: false, reason: "schema" } : { ok: false, reason: "error", message: explain(plain.error) } }
    return { saved: Object.fromEntries(plain.data.filter((r) => r.value !== null).map((r) => [r.key as string, { value: r.value, updatedAt: null, editor: null }])), availability: { ok: true } }
  }
  const saved: Record<string, Saved> = {}
  for (const r of (res.data ?? []) as unknown as { key: string; value: unknown; updated_at: string; editor: { name: string } | null }[]) {
    if (r.value !== null) saved[r.key] = { value: r.value, updatedAt: r.updated_at, editor: r.editor?.name ?? null }
  }
  return { saved, availability: { ok: true } }
}

/** Saves a list as the site's live version. */
export async function saveList(def: ListDef, rows: Row[]) {
  await saveContent(def.key, "block", rows, { fallback: def.fallback })
}

/** Back to the list the code ships with (the saved value stays in the row's history). */
export async function resetList(def: ListDef) {
  await resetContent(def.key, "block")
}
