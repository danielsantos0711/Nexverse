"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useSession } from "@/lib/store"
import { useSiteSettings } from "@/lib/site-settings"
import { db } from "@/lib/supabase"

/*
 * How the site looks and moves for a visitor. Round 12b: only the admins decide this, for everyone
 * (Admin › Appearance › Look and feel, rows "theme" and "experience" of public.site_settings). Members no longer
 * choose their own scrolling, motion, sky, stars, header or accent colour: anything saved by older versions
 * (localStorage nexverse.ui.own / nexverse.ui and profiles.ui_prefs) is ignored for the look.
 *
 * The one personal choice left is single-key keyboard shortcuts, which is about input, not the site's look.
 * It is kept on the profile (profiles.ui_prefs.shortcuts) and in this browser. The visitor's own device setting
 * for reduced motion is still respected everywhere (CSS media queries and MotionConfig reducedMotion="user").
 */

export type UiMotion = "site" | "calm" | "full"
/** Scrolling: eased wheel scrolling (smooth), a longer glide (silk), or the browser's own (native). */
export type UiScroll = "smooth" | "silk" | "native"
/** How much moves as you scroll: parallax depth, tilts, reveals. */
export type UiScrollFx = "subtle" | "lively" | "cinematic"
/** The sky behind every page. */
export type UiBackdrop = "nebula" | "starfield" | "deep"
export type UiDensity = "sparse" | "normal" | "dense"
/** The header on scroll: slides away while you read down and comes back when you scroll up, or stays. */
export type UiHeader = "auto" | "pinned"
export type UiPrefs = { motion: UiMotion; shortcuts: boolean; scroll: UiScroll; scrollFx: UiScrollFx; backdrop: UiBackdrop; density: UiDensity; header: UiHeader }

/** The built-in feel, before the admins choose anything. */
export const DEFAULT_UI: UiPrefs = { motion: "site", shortcuts: true, scroll: "smooth", scrollFx: "cinematic", backdrop: "nebula", density: "normal", header: "auto" }

/** The parts of the feel the admins set in the "experience" row. */
export const FEEL_KEYS = ["scroll", "scrollFx", "backdrop", "density", "header"] as const
export type FeelKey = (typeof FEEL_KEYS)[number]

const KEY = "nexverse.ui.own"
const LEGACY_KEY = "nexverse.ui"
/** The member's own shortcuts switch (the only personal part). */
let shortcuts = true
let loadedFor: string | null | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const readShortcuts = (v: unknown) => (v && typeof v === "object" && typeof (v as { shortcuts?: unknown }).shortcuts === "boolean" ? (v as { shortcuts: boolean }).shortcuts : undefined)

function readLocal(): boolean {
  try {
    return readShortcuts(JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? "{}")) ?? true
  } catch {
    return true
  }
}

function setShortcuts(on: boolean) {
  shortcuts = on
  try {
    // Rewriting the key also drops the look overrides older versions stored here.
    localStorage.setItem(KEY, JSON.stringify({ shortcuts: on, v: 3 }))
    localStorage.removeItem(LEGACY_KEY)
  } catch {}
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The site's feel as the admins set it, over the built-in defaults. */
export function useSiteFeel(): Pick<UiPrefs, FeelKey> {
  const exp = useSiteSettings().settings.experience
  return useMemo(() => {
    const out: Pick<UiPrefs, FeelKey> = { scroll: DEFAULT_UI.scroll, scrollFx: DEFAULT_UI.scrollFx, backdrop: DEFAULT_UI.backdrop, density: DEFAULT_UI.density, header: DEFAULT_UI.header }
    for (const k of FEEL_KEYS) {
      const v = exp?.[k]
      if (v) (out as Record<string, unknown>)[k] = v
    }
    return out
  }, [exp])
}

/**
 * The feel in effect for every visitor: exactly what the admins set. `motion` is "calm" when the admins
 * switched motion off (every animation becomes an instant change), otherwise "site".
 */
export function useUiPrefs(): UiPrefs {
  const keys = useSyncExternalStore(subscribe, () => shortcuts, () => true)
  const feel = useSiteFeel()
  const level = useSiteSettings().settings.theme.motion
  return useMemo(() => ({ ...feel, motion: level === "off" ? "calm" : "site", shortcuts: keys }), [feel, level, keys])
}

/** Turn single-key shortcuts on or off for this member (and this browser). Throws when the database refuses. */
export async function saveShortcuts(on: boolean, userId: string | null) {
  setShortcuts(on)
  const c = db()
  if (!c || !userId) return
  const { error } = await c.from("profiles").update({ ui_prefs: { shortcuts: on, v: 3 } }).eq("id", userId)
  if (error && !/ui_prefs|column/i.test(error.message)) throw new Error("Could not save to your account. It is kept in this browser.")
}

/** Applies the feel to the page: data-calm, data-keys, data-scroll, data-scroll-fx, data-stars and data-header on <html>. */
export function UiPrefsApplier() {
  const { ready, user } = useSession()
  const p = useUiPrefs()

  useEffect(() => {
    if (loadedFor === undefined) setShortcuts(readLocal())
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
        const on = !error ? readShortcuts((data as { ui_prefs?: unknown } | null)?.ui_prefs) : undefined
        if (on !== undefined) setShortcuts(on)
      })
  }, [ready, user?.id])

  useEffect(() => {
    const root = document.documentElement
    root.toggleAttribute("data-calm", p.motion === "calm")
    root.removeAttribute("data-full-motion")
    root.dataset.keys = p.shortcuts ? "on" : "off"
    // read by CSS (globals.css: the sky, scroll-driven motion) and by src/components/motion.
    // data-backdrop on <html> belongs to SiteSettingsApplier (it maps the same admin choice).
    root.dataset.scroll = p.scroll
    root.dataset.scrollFx = p.scrollFx
    root.dataset.stars = p.density
    root.dataset.header = p.header
    // Older versions put a member's own accent on <body>; it must never win over the site's.
    for (const v of ["--ion", "--ion-foreground", "--ring"]) document.body.style.removeProperty(v)
  }, [p])

  return null
}

/** Whether single-key shortcuts are on for this visitor (read at key time, no re-render). */
export const shortcutsOn = () => typeof document === "undefined" || document.documentElement.dataset.keys !== "off"
