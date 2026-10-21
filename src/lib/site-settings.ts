"use client"

import { useEffect, useSyncExternalStore } from "react"
import { db, live } from "@/lib/supabase"

/*
 * Site settings: what the admin panel changes for the whole site. Each section is one row in
 * public.site_settings (read by everyone, written by admins). Anything missing falls back to DEFAULTS,
 * so the site looks right before an admin has saved anything, and without a database.
 */

export type HomeSectionId = "signal" | "trending" | "forum" | "today" | "constellations" | "builders" | "close"
export type FeatureKey =
  | "forum"
  | "chat"
  | "news"
  | "missions"
  | "arena"
  | "benchmarks"
  | "launchpad"
  | "crews"
  | "messages"
  | "events"
  | "code"
  | "ai"
export type Accent = "ion" | "aurora" | "nova" | "solar" | "plasma" | "custom"
export type MotionLevel = "full" | "calm" | "off"
export type HeroEffect = "galaxy" | "orbit" | "still"
export type GlassLevel = "clear" | "standard" | "frosted" | "solid"
export type Backdrop = "space" | "nebula" | "aurora" | "deep"
export type FontScale = "small" | "default" | "large" | "larger"
export type Radius = "sharp" | "standard" | "round"

export type SiteSettings = {
  brand: { name: string; tagline: string; description: string }
  announcement: { enabled: boolean; text: string; href: string; tone: "info" | "launch" | "warning" }
  theme: {
    accent: Accent
    /** The accent when `accent` is "custom": a #rrggbb colour. */
    customAccent: string
    /** The warm second colour (badges, highlights, "edited" marks). Empty keeps the built-in champagne. */
    secondary: string
    motion: MotionLevel
    heroEffect: HeroEffect
    glass: GlassLevel
    background: Backdrop
    fontScale: FontScale
    radius: Radius
  }
  hero: { badge: string; title: string; subtitle: string; primaryLabel: string; primaryHref: string }
  home: { sections: { id: HomeSectionId; visible: boolean }[] }
  nav: { hidden: string[] }
  features: Record<FeatureKey, boolean>
  footer: { note: string; links: { label: string; href: string }[] }
  access: { guestsCanBrowse: boolean; signupOpen: boolean }
  /** The feel every visitor starts with (members may change each one unless it is in `locked`). */
  experience: {
    scroll: "smooth" | "silk" | "native"
    scrollFx: "subtle" | "lively" | "cinematic"
    backdrop: "nebula" | "starfield" | "deep"
    density: "sparse" | "normal" | "dense"
    header: "auto" | "pinned"
    locked: ("scroll" | "scrollFx" | "backdrop" | "density" | "header")[]
  }
}

export type SettingKey = keyof SiteSettings

export const HOME_SECTIONS: { id: HomeSectionId; label: string }[] = [
  { id: "signal", label: "Today's signal" },
  { id: "trending", label: "Trending in the hub" },
  { id: "forum", label: "Hot in the forum" },
  { id: "today", label: "Missions and duels" },
  { id: "constellations", label: "Constellations" },
  { id: "builders", label: "Builders" },
  { id: "close", label: "Closing call to action" },
]

export const FEATURES: { key: FeatureKey; label: string; href: string }[] = [
  { key: "forum", label: "Forum", href: "/forum" },
  { key: "chat", label: "Chat rooms", href: "/chat" },
  { key: "news", label: "News", href: "/news" },
  { key: "missions", label: "Missions", href: "/missions" },
  { key: "arena", label: "Arena", href: "/arena" },
  { key: "benchmarks", label: "Benchmarks", href: "/benchmarks" },
  { key: "launchpad", label: "Launchpad", href: "/launchpad" },
  { key: "crews", label: "Crews", href: "/crews" },
  { key: "messages", label: "Direct messages", href: "/messages" },
  { key: "events", label: "Events", href: "/events" },
  { key: "code", label: "Code", href: "/code" },
  { key: "ai", label: "AI assist", href: "/settings" },
]

export const DEFAULTS: SiteSettings = {
  brand: {
    name: "Nexverse",
    tagline: "The AI community universe",
    description: "Share models, datasets, tools, repos and news, talk in a real forum and live rooms, and build with people who care about AI.",
  },
  announcement: { enabled: false, text: "", href: "", tone: "info" },
  theme: { accent: "ion", customAccent: "#8fb4ff", secondary: "", motion: "full", heroEffect: "galaxy", glass: "standard", background: "space", fontScale: "default", radius: "standard" },
  hero: {
    badge: "Models, forum, missions and duels in one sky",
    title: "",
    subtitle: "",
    primaryLabel: "Join Nexverse",
    primaryHref: "/sign-in",
  },
  home: { sections: HOME_SECTIONS.map(({ id }) => ({ id, visible: true })) },
  nav: { hidden: [] },
  features: Object.fromEntries(FEATURES.map(({ key }) => [key, true])) as Record<FeatureKey, boolean>,
  footer: { note: "", links: [] },
  access: { guestsCanBrowse: true, signupOpen: true },
  experience: { scroll: "smooth", scrollFx: "cinematic", backdrop: "nebula", density: "normal", header: "auto", locked: [] },
}

/** Merges a saved section over its defaults, one level deep, so new fields keep working with old rows. */
function merge(saved: Partial<Record<SettingKey, unknown>>): SiteSettings {
  const out = structuredClone(DEFAULTS) as Record<SettingKey, unknown>
  for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
    const value = saved[key]
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = { ...(DEFAULTS[key] as object), ...(value as object) }
    }
  }
  return out as SiteSettings
}

/** `rows` keeps every saved row as it is, including sections other modules own (such as "menus", see lib/menus.ts). */
type State = { settings: SiteSettings; ready: boolean; rows: Record<string, unknown> }
const SERVER: State = { settings: DEFAULTS, ready: false, rows: {} }
let state: State = SERVER
let started = false
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

async function load() {
  const c = db()
  if (!c) {
    set({ settings: DEFAULTS, ready: true, rows: {} })
    return
  }
  const { data, error } = await c.from("site_settings").select("key, value")
  if (error || !data) {
    // The table may not exist yet on this database; the defaults still describe a complete site.
    set({ settings: DEFAULTS, ready: true, rows: {} })
    return
  }
  const rows = Object.fromEntries(data.map((r) => [r.key, r.value]))
  set({ settings: merge(rows), ready: true, rows })
}

function start() {
  if (started || typeof window === "undefined") return
  started = true
  void load()
  const c = db()
  c?.channel("site-settings")
    .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => void load())
    .subscribe()
}

/** The site's settings, live: an admin's save shows up in every open tab. */
export function useSiteSettings() {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, () => state, () => SERVER)
}

/** Whether a section of the site is switched on. */
export function useFeature(key: FeatureKey) {
  return useSiteSettings().settings.features[key] !== false
}

/** Saves one section. Only admins can; the database refuses everyone else. */
export async function saveSiteSetting<K extends SettingKey>(key: K, value: SiteSettings[K]) {
  const c = db()
  if (!c) throw new Error("Site settings need the database. Connect Supabase to save them.")
  const { error } = await c.from("site_settings").upsert({ key, value }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  set({ settings: { ...state.settings, [key]: value }, ready: true, rows: { ...state.rows, [key]: value } })
}

/** Saves a row another module owns (its own shape and checks), such as "menus". The database decides who may. */
export async function saveSettingRow(key: string, value: unknown) {
  const c = db()
  if (!c) throw new Error("Site settings need the database. Connect Supabase to save them.")
  const { error } = await c.from("site_settings").upsert({ key, value }, { onConflict: "key" })
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Your account cannot save this." : error.message)
  set({ ...state, rows: { ...state.rows, [key]: value } })
}

export const canSaveSettings = () => live

// Presets the admin panel offers, and helpers every part of the site can use to follow the settings.

/** Accent presets. Each one replaces the site's ion colour (links, focus rings, live things) on the dark ground. */
export const ACCENTS: { id: Accent; label: string; blurb: string; color: string; foreground: string }[] = [
  { id: "ion", label: "Ion blue", blurb: "The original: cool and calm", color: "#8fb4ff", foreground: "#061026" },
  { id: "aurora", label: "Aurora", blurb: "Green of the northern lights", color: "#7fe0c4", foreground: "#03201a" },
  { id: "nova", label: "Nova violet", blurb: "A young star's glow", color: "#b9a7ff", foreground: "#140b33" },
  { id: "solar", label: "Solar gold", blurb: "Warm, like a sunrise from orbit", color: "#e9c27c", foreground: "#1f1606" },
  { id: "plasma", label: "Plasma rose", blurb: "Hot and bright, for launches", color: "#ff9fc6", foreground: "#2a0716" },
]

export const GLASS_LEVELS: { id: GlassLevel; label: string; blurb: string }[] = [
  { id: "clear", label: "Clear", blurb: "Thin glass: more of the sky shows through" },
  { id: "standard", label: "Standard", blurb: "The balanced Liquid Glass" },
  { id: "frosted", label: "Frosted", blurb: "Thicker, more blur, calmer behind text" },
  { id: "solid", label: "Solid", blurb: "No transparency: opaque panels, lightest on old computers" },
]

export const BACKDROPS: { id: Backdrop; label: string; blurb: string }[] = [
  { id: "space", label: "Deep space", blurb: "The original dark sky" },
  { id: "nebula", label: "Nebula", blurb: "Soft violet and blue clouds at the edges" },
  { id: "aurora", label: "Aurora", blurb: "A green and teal glow along the top" },
  { id: "deep", label: "Pure black", blurb: "No glow at all, the quietest" },
]

export const FONT_SCALES: { id: FontScale; label: string; blurb: string; percent: number }[] = [
  { id: "small", label: "Compact", blurb: "94% · more on screen", percent: 93.75 },
  { id: "default", label: "Default", blurb: "100%", percent: 100 },
  { id: "large", label: "Large", blurb: "106% · easier to read", percent: 106.25 },
  { id: "larger", label: "Larger", blurb: "112.5% · for big screens", percent: 112.5 },
]

export const RADII: { id: Radius; label: string; blurb: string; rem: number }[] = [
  { id: "sharp", label: "Sharp", blurb: "Small, crisp corners", rem: 0.4 },
  { id: "standard", label: "Standard", blurb: "The original corners", rem: 0.75 },
  { id: "round", label: "Round", blurb: "Soft, generous corners", rem: 1.05 },
]

export const HEX = /^#[0-9a-f]{6}$/i

/** Relative luminance of a #rrggbb colour (WCAG). */
export function luminance(hex: string) {
  const m = HEX.exec(hex) ? hex.slice(1) : "000000"
  return [0, 2, 4]
    .map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** The text colour for something filled with `hex`: near-black on light colours, near-white on dark ones. */
export function foregroundFor(hex: string) {
  return contrast(hex, "#05060a") >= contrast(hex, "#f4f6fb") ? "#05060a" : "#f4f6fb"
}

/** The accent in use: a preset's colour, or the admins' own when it is a valid hex. */
export function accentColors(theme: SiteSettings["theme"]): { color: string; foreground: string } {
  if (theme.accent === "custom" && HEX.test(theme.customAccent)) return { color: theme.customAccent.toLowerCase(), foreground: foregroundFor(theme.customAccent) }
  const preset = ACCENTS.find((a) => a.id === theme.accent) ?? ACCENTS[0]
  return { color: preset.color, foreground: preset.foreground }
}

export const MOTION_LEVELS: { id: MotionLevel; label: string; blurb: string }[] = [
  { id: "full", label: "Full", blurb: "Every animation, unless a visitor asks their device for less" },
  { id: "calm", label: "Calm", blurb: "No looping background motion; transitions stay" },
  { id: "off", label: "Off", blurb: "No animation anywhere except what is essential" },
]

export const HERO_EFFECTS: { id: HeroEffect; label: string; blurb: string }[] = [
  { id: "galaxy", label: "Galaxy", blurb: "The animated galaxy behind the home page" },
  { id: "orbit", label: "Orbit", blurb: "A lighter ring of orbits" },
  { id: "still", label: "Still", blurb: "A still image of space, no animation" },
]

export const ANNOUNCEMENT_TONES: { id: SiteSettings["announcement"]["tone"]; label: string }[] = [
  { id: "info", label: "News" },
  { id: "launch", label: "Launch" },
  { id: "warning", label: "Heads-up" },
]

/** A link the settings may hold: a path on this site ("/forum", "/events?kind=ama") or a https address. */
export function isSafeHref(href: string) {
  const h = href.trim()
  if (/^\/(?![/\\])[A-Za-z0-9/_.~%?=&#+-]*$/.test(h)) return true
  try {
    const u = new URL(h)
    return u.protocol === "https:" && !u.username && !u.password && Boolean(u.hostname)
  } catch {
    return false
  }
}

/** Whether a navigation link should show: not hidden by the admins, and not in a part of the site that is switched off. */
export function isLinkVisible(settings: SiteSettings, href: string) {
  if (settings.nav.hidden.includes(href)) return false
  const area = FEATURES.find((f) => f.key !== "ai" && (href === f.href || href.startsWith(f.href + "/")))
  return !area || settings.features[area.key] !== false
}

/** The feature a path belongs to, if any ("/missions/new" belongs to missions). AI assist is not a place, so it never matches. */
export function featureForPath(path: string): FeatureKey | null {
  return FEATURES.find((f) => f.key !== "ai" && (path === f.href || path.startsWith(f.href + "/")))?.key ?? null
}

/** The home sections in the admins' order, with any section added since they saved appended (visible) at the end. */
export function orderedHomeSections(settings: SiteSettings) {
  const known = new Set(HOME_SECTIONS.map((s) => s.id))
  const saved = (Array.isArray(settings.home.sections) ? settings.home.sections : []).filter((s, i, all) => known.has(s.id) && all.findIndex((t) => t.id === s.id) === i)
  return [...saved, ...HOME_SECTIONS.filter((s) => !saved.some((t) => t.id === s.id)).map(({ id }) => ({ id, visible: true }))]
}
