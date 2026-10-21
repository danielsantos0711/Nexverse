"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useSession } from "@/lib/store"
import { useSiteSettings } from "@/lib/site-settings"
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

/** The built-in feel, before the admins or the member choose anything. */
export const DEFAULT_UI: UiPrefs = { motion: "site", accent: "site", shortcuts: true, scroll: "smooth", scrollFx: "cinematic", backdrop: "nebula", density: "normal", header: "auto" }

/** The parts of the feel the admins set for everyone in Admin › Site settings › Experience (and may lock). */
export const FEEL_KEYS = ["scroll", "scrollFx", "backdrop", "density", "header"] as const
export type FeelKey = (typeof FEEL_KEYS)[number]

/** What round 11 shipped as the default. Older saved prefs stored every field; a value equal to this was never a choice. */
const LEGACY: UiPrefs = { motion: "site", accent: "site", shortcuts: true, scroll: "smooth", scrollFx: "lively", backdrop: "nebula", density: "normal", header: "auto" }

const pick = <T extends string>(v: unknown, ok: readonly T[]): T | undefined => (ok.includes(v as T) ? (v as T) : undefined)
export const ACCENTS: Record<Exclude<UiAccent, "site">, { label: string; color: string; fg: string }> = {
  ion: { label: "Ion blue", color: "#8fb4ff", fg: "#061026" },
  gold: { label: "Champagne", color: "#d8c59e", fg: "#1b160c" },
  aurora: { label: "Aurora", color: "#7fe0b0", fg: "#04150d" },
  nova: { label: "Nova", color: "#c3a6ff", fg: "#130a26" },
}

const KEY = "nexverse.ui.own"
const LEGACY_KEY = "nexverse.ui"
/** Only what this member chose. Everything else follows the site (the admins' experience settings). */
let own: Partial<UiPrefs> = {}
let loadedFor: string | null | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** The member's own choices from a saved value. Values from before round 11's fix that equal the old defaults are dropped. */
function clean(v: unknown): Partial<UiPrefs> {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  const legacy = r.v !== 2
  const out: Partial<UiPrefs> = {
    motion: pick(r.motion, ["site", "calm", "full"] as const),
    accent: pick(r.accent, ["site", "ion", "gold", "aurora", "nova"] as const),
    shortcuts: typeof r.shortcuts === "boolean" ? r.shortcuts : undefined,
    scroll: pick(r.scroll, ["smooth", "silk", "native"] as const),
    scrollFx: pick(r.scrollFx, ["subtle", "lively", "cinematic"] as const),
    backdrop: pick(r.backdrop, ["nebula", "starfield", "deep"] as const),
    density: pick(r.density, ["sparse", "normal", "dense"] as const),
    header: pick(r.header, ["auto", "pinned"] as const),
  }
  for (const k of Object.keys(out) as (keyof UiPrefs)[]) {
    if (out[k] === undefined || (legacy && out[k] === LEGACY[k])) delete out[k]
  }
  return out
}

function readLocal(): Partial<UiPrefs> {
  try {
    const now = localStorage.getItem(KEY)
    if (now) return clean(JSON.parse(now))
    return clean(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}"))
  } catch {
    return {}
  }
}

function set(next: Partial<UiPrefs>) {
  own = next
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, v: 2 }))
  } catch {}
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The site's feel as the admins set it: their defaults over the built-in ones, and which choices they locked. */
export function useSiteFeel(): { defaults: UiPrefs; locked: FeelKey[] } {
  const exp = useSiteSettings().settings.experience
  return useMemo(() => {
    const defaults = { ...DEFAULT_UI }
    for (const k of FEEL_KEYS) {
      const v = exp?.[k]
      if (v) (defaults as Record<string, unknown>)[k] = v
    }
    return { defaults, locked: (exp?.locked ?? []).filter((k): k is FeelKey => (FEEL_KEYS as readonly string[]).includes(k)) }
  }, [exp])
}

/** The feel in effect for this visitor: their own choices over the site's, except where the admins locked one. */
export function useUiPrefs(): UiPrefs {
  const mine = useSyncExternalStore(subscribe, () => own, () => own)
  const { defaults, locked } = useSiteFeel()
  return useMemo(() => {
    const out = { ...defaults, ...mine }
    for (const k of locked) (out as Record<string, unknown>)[k] = defaults[k]
    return out
  }, [mine, defaults, locked])
}

/** Only the member's own choices (for Settings: what differs from the site). */
export const useOwnUiPrefs = () => useSyncExternalStore(subscribe, () => own, () => own)

async function persist(next: Partial<UiPrefs>, userId: string | null) {
  set(next)
  const c = db()
  if (!c || !userId) return
  const { error } = await c.from("profiles").update({ ui_prefs: { ...next, v: 2 } }).eq("id", userId)
  // A missing column (migration not applied yet) keeps the browser copy without complaining.
  if (error && !/ui_prefs|column/i.test(error.message)) throw new Error("Could not save to your account. It is kept in this browser.")
}

/** Save for this member (and this browser). Throws when the database refuses, after the browser copy is kept. */
export const saveUiPrefs = (patch: Partial<UiPrefs>, userId: string | null) => persist({ ...own, ...patch }, userId)

/** Forget the member's own choices for these keys, so they follow the site again. */
export function resetUiPrefs(keys: (keyof UiPrefs)[], userId: string | null) {
  const next = { ...own }
  for (const k of keys) delete next[k]
  return persist(next, userId)
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
