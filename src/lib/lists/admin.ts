"use client"

import { explain, isMissingSchema } from "@/lib/moderation"
import { db } from "@/lib/supabase"
import { LISTS, type ListDef, type Row } from "./registry"

/*
 * What /admin/lists reads and writes. Every list is one row of public.site_content (key, value jsonb), the table
 * behind the site's editable content; the database decides who may write it (admins, through has_cap()). Each
 * save and reset also writes one line to the moderation log.
 */

export type Saved = { value: unknown; updatedAt: string | null }
export type Availability = { ok: true } | { ok: false; reason: "browser" | "schema" | "error"; message?: string }

/** Every saved list, by site_content key. Lists nobody saved are missing from the map. */
export async function loadSavedLists(): Promise<{ saved: Record<string, Saved>; availability: Availability }> {
  const c = db()
  if (!c) return { saved: {}, availability: { ok: false, reason: "browser" } }
  const keys = LISTS.map((l) => l.key)
  let res = await c.from("site_content").select("key, value, updated_at").in("key", keys)
  // A table without updated_at still works; only the "saved … ago" line is lost.
  if (res.error?.code === "42703") res = (await c.from("site_content").select("key, value").in("key", keys)) as typeof res
  if (res.error) {
    return { saved: {}, availability: isMissingSchema(res.error) ? { ok: false, reason: "schema" } : { ok: false, reason: "error", message: explain(res.error) } }
  }
  const saved: Record<string, Saved> = {}
  for (const r of (res.data ?? []) as { key: string; value: unknown; updated_at?: string }[]) saved[r.key] = { value: r.value, updatedAt: r.updated_at ?? null }
  return { saved, availability: { ok: true } }
}

async function log(action: "list.save" | "list.reset", def: ListDef, note: string) {
  const c = db()
  if (!c) return
  // The change itself is saved; a log that fails (an older database) must not undo it in the editor.
  await c.rpc("log_moderation", { action, target_kind: "list", target_id: def.slug, note: note.slice(0, 500) }).then(
    () => undefined,
    () => undefined
  )
}

/** Saves a list as the site's live version. `summary` goes to the moderation log. */
export async function saveList(def: ListDef, rows: Row[], summary: string) {
  const c = db()
  if (!c) throw new Error("Saving needs the database. This copy of Nexverse runs in the browser only.")
  const { error } = await c.from("site_content").upsert({ key: def.key, value: rows }, { onConflict: "key" })
  if (error) throw new Error(explain(error))
  await log("list.save", def, `${def.title}: ${summary}`)
}

/**
 * Goes back to the list the code ships with. The saved row is removed so later default updates reach the site;
 * when the database does not allow removing it, the defaults are saved over it instead.
 */
export async function resetList(def: ListDef) {
  const c = db()
  if (!c) throw new Error("Saving needs the database. This copy of Nexverse runs in the browser only.")
  const del = await c.from("site_content").delete().eq("key", def.key).select("key")
  if (del.error || !del.data?.length) {
    const { error } = await c.from("site_content").upsert({ key: def.key, value: def.fallback }, { onConflict: "key" })
    if (error) throw new Error(explain(del.error ?? error))
  }
  await log("list.reset", def, `${def.title}: back to the defaults`)
}
