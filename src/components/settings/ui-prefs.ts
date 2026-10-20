"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useSession } from "@/lib/store"
import { db } from "@/lib/supabase"

/*
 * A member's own feel for the site: calmer motion, their own accent colour, single-key shortcuts on or off.
 * Saved on their profile (profiles.ui_prefs, migration 20261020130000_shell.sql) and mirrored in this browser so
 * it applies on the first paint of the next visit. Guests keep it in this browser only. Until the column exists
 * the browser copy is the only one and nothing breaks.
 */

export type UiMotion = "site" | "calm" | "full"
export type UiAccent = "site" | "ion" | "gold" | "aurora" | "nova"
export type UiPrefs = { motion: UiMotion; accent: UiAccent; shortcuts: boolean }

export const DEFAULT_UI: UiPrefs = { motion: "site", accent: "site", shortcuts: true }
export const ACCENTS: Record<Exclude<UiAccent, "site">, { label: string; color: string; fg: string }> = {
  ion: { label: "Ion blue", color: "#8fb4ff", fg: "#061026" },
  gold: { label: "Champagne", color: "#d8c59e", fg: "#1b160c" },
  aurora: { label: "Aurora", color: "#7fe0b0", fg: "#04150d" },
  nova: { label: "Nova", color: "#c3a6ff", fg: "#130a26" },
}

const KEY = "nexverse.ui"
let prefs: UiPrefs = DEFAULT_UI
let loadedFor: string | null | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function clean(v: unknown): UiPrefs {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  return {
    motion: ["site", "calm", "full"].includes(r.motion as string) ? (r.motion as UiMotion) : "site",
    accent: ["site", "ion", "gold", "aurora", "nova"].includes(r.accent as string) ? (r.accent as UiAccent) : "site",
    shortcuts: r.shortcuts !== false,
  }
}

function readLocal(): UiPrefs {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? "{}"))
  } catch {
    return DEFAULT_UI
  }
}

function set(next: UiPrefs) {
  prefs = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_UI)
}

/** Save for this member (and this browser). Throws when the database refuses, after the browser copy is kept. */
export async function saveUiPrefs(patch: Partial<UiPrefs>, userId: string | null) {
  const next = { ...prefs, ...patch }
  set(next)
  const c = db()
  if (!c || !userId) return
  const { error } = await c.from("profiles").update({ ui_prefs: next }).eq("id", userId)
  // A missing column (migration not applied yet) keeps the browser copy without complaining.
  if (error && !/ui_prefs|column/i.test(error.message)) throw new Error("Could not save to your account. It is kept in this browser.")
}

/** Applies the prefs to the page: data-calm and data-keys on <html>, the accent on <body> (it wins over the site's). */
export function UiPrefsApplier() {
  const { ready, user } = useSession()
  const p = useUiPrefs()

  useEffect(() => {
    if (loadedFor === undefined) set(readLocal())
    if (!ready) return
    const id = user?.id ?? null
    if (loadedFor === id) return
    loadedFor = id
    const c = db()
    if (!c || !id) return
    void c
      .from("profiles")
      .select("ui_prefs")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data && (data as { ui_prefs?: unknown }).ui_prefs && Object.keys((data as { ui_prefs: object }).ui_prefs).length) set(clean((data as { ui_prefs: unknown }).ui_prefs))
      })
  }, [ready, user?.id])

  useEffect(() => {
    const root = document.documentElement
    root.toggleAttribute("data-calm", p.motion === "calm")
    root.toggleAttribute("data-full-motion", p.motion === "full")
    root.dataset.keys = p.shortcuts ? "on" : "off"
    const body = document.body
    if (p.accent === "site") {
      body.style.removeProperty("--ion")
      body.style.removeProperty("--ion-foreground")
      body.style.removeProperty("--ring")
    } else {
      const a = ACCENTS[p.accent]
      body.style.setProperty("--ion", a.color)
      body.style.setProperty("--ion-foreground", a.fg)
      body.style.setProperty("--ring", a.color)
    }
  }, [p])

  return null
}

/** Whether single-key shortcuts are on for this visitor (read at key time, no re-render). */
export const shortcutsOn = () => typeof document === "undefined" || document.documentElement.dataset.keys !== "off"
