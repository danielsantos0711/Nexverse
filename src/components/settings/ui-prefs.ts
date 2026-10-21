"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useSession } from "@/lib/store"
import { db } from "@/lib/supabase"

/*
 * A member's own feel for the site: calmer motion, their own accent colour, single-key shortcuts on or off, and
 * (round 11) how scrolling feels, how much moves while they scroll, the sky behind every page and what the
 * header does on scroll.
 * Saved on their profile (profiles.ui_prefs, migration 20261020130000_shell.sql) and mirrored in this browser so
 * it applies on the first paint of the next visit. Guests keep it in this browser only. Until the column exists
 * the browser copy is the only one and nothing breaks.
 */

export type UiMotion = "site" | "calm" | "full"
export type UiAccent = "site" | "ion" | "gold" | "aurora" | "nova"
/** Scrolling: eased wheel scrolling (smooth), a longer glide (silk), or the browser's own (native). */
export type UiScroll = "smooth" | "silk" | "native"
/** How much moves as you scroll: parallax depth, tilts, reveals. */
export type UiScrollFx = "subtle" | "lively" | "cinematic"
/** The sky behind every page. */
export type UiBackdrop = "nebula" | "starfield" | "deep"
export type UiDensity = "sparse" | "normal" | "dense"
/** The header on scroll: slides away while you read down and comes back when you scroll up, or stays. */
export type UiHeader = "auto" | "pinned"
export type UiPrefs = { motion: UiMotion; accent: UiAccent; shortcuts: boolean; scroll: UiScroll; scrollFx: UiScrollFx; backdrop: UiBackdrop; density: UiDensity; header: UiHeader }

export const DEFAULT_UI: UiPrefs = { motion: "site", accent: "site", shortcuts: true, scroll: "smooth", scrollFx: "lively", backdrop: "nebula", density: "normal", header: "auto" }

const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback)
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
    scroll: pick(r.scroll, ["smooth", "silk", "native"], DEFAULT_UI.scroll),
    scrollFx: pick(r.scrollFx, ["subtle", "lively", "cinematic"], DEFAULT_UI.scrollFx),
    backdrop: pick(r.backdrop, ["nebula", "starfield", "deep"], DEFAULT_UI.backdrop),
    density: pick(r.density, ["sparse", "normal", "dense"], DEFAULT_UI.density),
    header: pick(r.header, ["auto", "pinned"], DEFAULT_UI.header),
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

/** Applies the prefs to the page: data-calm, data-keys, data-scroll, data-scroll-fx, data-backdrop, data-stars and data-header on <html>, the accent on <body> (it wins over the site's). */
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
    // read by CSS (globals.css: the sky, scroll-driven motion) and by src/components/motion
    root.dataset.scroll = p.scroll
    root.dataset.scrollFx = p.scrollFx
    root.dataset.backdrop = p.backdrop
    root.dataset.stars = p.density
    root.dataset.header = p.header
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
