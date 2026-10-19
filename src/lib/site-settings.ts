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
  | "video"
  | "ai"
export type Accent = "ion" | "aurora" | "nova" | "solar" | "plasma"
export type MotionLevel = "full" | "calm" | "off"
export type HeroEffect = "galaxy" | "orbit" | "still"

export type SiteSettings = {
  brand: { name: string; tagline: string; description: string }
  announcement: { enabled: boolean; text: string; href: string; tone: "info" | "launch" | "warning" }
  theme: { accent: Accent; motion: MotionLevel; heroEffect: HeroEffect }
  hero: { badge: string; title: string; subtitle: string; primaryLabel: string; primaryHref: string }
  home: { sections: { id: HomeSectionId; visible: boolean }[] }
  nav: { hidden: string[] }
  features: Record<FeatureKey, boolean>
  footer: { note: string; links: { label: string; href: string }[] }
  access: { guestsCanBrowse: boolean; signupOpen: boolean }
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
  { key: "video", label: "Video", href: "/video" },
  { key: "ai", label: "AI assist", href: "/settings" },
]

export const DEFAULTS: SiteSettings = {
  brand: {
    name: "Nexverse",
    tagline: "The AI community universe",
    description: "Share models, datasets, tools, repos and news, talk in a real forum and live rooms, and build with people who care about AI.",
  },
  announcement: { enabled: false, text: "", href: "", tone: "info" },
  theme: { accent: "ion", motion: "full", heroEffect: "galaxy" },
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

type State = { settings: SiteSettings; ready: boolean }
const SERVER: State = { settings: DEFAULTS, ready: false }
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
    set({ settings: DEFAULTS, ready: true })
    return
  }
  const { data, error } = await c.from("site_settings").select("key, value")
  if (error || !data) {
    // The table may not exist yet on this database; the defaults still describe a complete site.
    set({ settings: DEFAULTS, ready: true })
    return
  }
  set({ settings: merge(Object.fromEntries(data.map((r) => [r.key, r.value]))), ready: true })
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
  set({ settings: { ...state.settings, [key]: value }, ready: true })
}

export const canSaveSettings = () => live
