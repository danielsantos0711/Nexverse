"use client"

import { useEffect, useMemo, useState } from "react"
import type { CategoryAccent } from "@/lib/forum-categories"
import { listPages, pagePath } from "@/lib/pages"
import { FEATURES, isLinkVisible, isSafeHref, saveSettingRow, useSiteSettings, type FeatureKey, type SiteSettings } from "@/lib/site-settings"

/*
 * The site's menus: the header's groups and direct links, the footer's columns and the phone menu. They are one
 * row in site_settings ("menus"), edited in /admin/menus by members with menus.edit. Until someone saves, the
 * defaults below are the menus. Every link passes isSafeHref; links into a part of the site that is switched off
 * (or hidden in Navigation) drop out on their own, and areas can carry a new name and blurb everywhere at once.
 */

export type MenuLink = {
  label: string
  href: string
  description: string
  icon: string
  accent: CategoryAccent
  /** A short sub-heading inside the group's panel ("Talk", "Hub"). Links with the same section sit together. */
  section?: string
}
export type MenuGroup = {
  id: string
  label: string
  /** One line under the group's name in the header's panel and on /explore: what lives here. */
  blurb?: string
  links: MenuLink[]
}
export type AreaText = { label: string; blurb: string }
/** One choice in the Create sheet: what you make, where its form is, and the power it needs. */
export type CreateLink = MenuLink & { cap?: string }

export type Menus = {
  header: MenuGroup[]
  /** Links that sit straight in the header bar, next to the menus. */
  headerLinks: MenuLink[]
  footer: MenuGroup[]
  /** The phone menu: the header's menus, or its own list. */
  mobile: { sameAsHeader: boolean; groups: MenuGroup[] }
  /** New names for parts of the site, used wherever a menu links to them. Empty fields keep each link's own text. */
  areas: Partial<Record<FeatureKey, AreaText>>
  /** The Create sheet (the header's Create button, the tab bar's middle button, C anywhere). */
  create?: CreateLink[]
  /**
   * The default links that existed when this row was saved ("header:/forum", "footer:/saved", "bar:/explore").
   * A default link added to the code later is not in it, so it shows up in a saved menu on its own (in the
   * group with the same id) without touching what the admins changed; a default they removed stays removed.
   */
  known?: string[]
}

const L = (label: string, href: string, description: string, icon: string, accent: CategoryAccent = "ion"): MenuLink => ({ label, href, description, icon, accent })
const C = (label: string, href: string, description: string, icon: string, accent: CategoryAccent, cap?: string): CreateLink => ({ ...L(label, href, description, icon, accent), cap })
/** Links under one sub-heading of a group's panel. */
const S = (section: string, links: MenuLink[]) => links.map((l) => ({ ...l, section }))

/*
 * The layout, for newcomers: three places, each named by what you do there, and a fourth that is yours.
 *   Discover   Browse: Explore (list or star map), Trending, News · Curated: Collections, For you
 *   Build      Hub: Models, Datasets, Tools, Code · Try and measure: Lab, Arena, Benchmarks, Compare · Share: publish, link
 *   Community  Talk: Forum, Chat · Together: Crews, Missions, Events, Launchpad · Members: People, Leaderboard
 *   You        (the avatar menu, the phone menu and the footer) Your page, For you, Saved, Messages, Notifications,
 *              Settings, Get started
 * Round 12 (Daniel: "nao estao todos no menu ... categorizado e mais organizado"): every member page is in a menu,
 * each group's panel is cut into short sub-headings of two to four links, and pages that did the same thing were
 * merged (see MOVED below), so the menus are shorter than round 11's while reaching more places.
 */
export const DEFAULT_MENUS: Menus = {
  header: [
    {
      id: "discover",
      label: "Discover",
      blurb: "Find what is new and worth your time",
      links: [
        ...S("Browse", [
          L("Explore", "/explore", "Everything members published, as a list or a star map", "compass", "ion"),
          L("Trending", "/trending", "Rising on Nexverse and GitHub", "flame", "gold"),
          L("News", "/news", "The AI newsroom, sourced and checked", "newspaper", "model"),
        ]),
        ...S("Curated", [
          L("Collections", "/collections", "Lists and star maps members curate", "library", "repo"),
          L("For you", "/for-you", "New from what you follow", "heart", "gold"),
        ]),
      ],
    },
    {
      id: "build",
      label: "Build",
      blurb: "Make, test and ship AI work",
      links: [
        ...S("Hub", [
          L("Models", "/models", "Weights to run, tune and ship", "box", "model"),
          L("Datasets", "/datasets", "Open data, licence up front", "database", "dataset"),
          L("Tools", "/tools", "Apps and libraries builders use", "wrench", "tool"),
          L("Code", "/code", "Nexverse repos and GitHub, read here", "code", "repo"),
        ]),
        ...S("Try and measure", [
          L("Lab", "/lab", "Calculators, playground, builders", "flask-conical", "dataset"),
          L("Arena", "/arena", "Blind duels between models", "swords", "model"),
          L("Benchmarks", "/benchmarks", "Eval results, reproduced", "gauge", "dataset"),
          L("Compare", "/compare", "Projects side by side", "scale", "ion"),
        ]),
        ...S("Share your work", [
          L("Publish a project", "/new/project", "A model, dataset, tool or code", "plus", "ion"),
          L("Share a link", "/share", "Something worth knowing, from elsewhere", "link", "ion"),
        ]),
      ],
    },
    {
      id: "community",
      label: "Community",
      blurb: "Talk, team up and take on challenges",
      links: [
        ...S("Talk", [
          L("Forum", "/forum", "Discussions by category", "message-square", "ion"),
          L("Chat", "/chat", "Live rooms for every corner of AI", "messages-square", "gold"),
        ]),
        ...S("Together", [
          L("Crews", "/crews", "Teams with a wall and a chat", "users-round", "repo"),
          L("Missions", "/missions", "Challenges with rewards", "target", "gold"),
          L("Events", "/events", "Reading clubs, meetups, demos", "calendar-days", "model"),
          L("Launchpad", "/launchpad", "Launches and countdowns", "rocket", "repo"),
        ]),
        ...S("Members", [
          L("People", "/people", "Builders and labs to follow", "users", "dataset"),
          L("Leaderboard", "/leaderboard", "Who helped most this week", "trophy", "gold"),
        ]),
      ],
    },
  ],
  // The three menus are the whole map; Explore is the first link of Discover and the phone's tab bar.
  headerLinks: [],
  footer: [
    {
      id: "discover",
      label: "Discover",
      links: [L("Explore", "/explore", "", "compass"), L("Trending", "/trending", "", "flame"), L("News", "/news", "", "newspaper"), L("Collections", "/collections", "", "library")],
    },
    {
      id: "build",
      label: "Build",
      links: [
        L("Models", "/models", "", "box"),
        L("Datasets", "/datasets", "", "database"),
        L("Tools", "/tools", "", "wrench"),
        L("Code", "/code", "", "code"),
        L("Lab", "/lab", "", "flask-conical"),
        L("Arena", "/arena", "", "swords"),
        L("Benchmarks", "/benchmarks", "", "gauge"),
      ],
    },
    {
      id: "community",
      label: "Community",
      links: [
        L("Forum", "/forum", "", "message-square"),
        L("Chat", "/chat", "", "messages-square"),
        L("Crews", "/crews", "", "users-round"),
        L("Missions", "/missions", "", "target"),
        L("Events", "/events", "", "calendar-days"),
        L("Launchpad", "/launchpad", "", "rocket"),
        L("People", "/people", "", "users"),
      ],
    },
    {
      // Also the avatar menu and the phone menu's "You" group.
      id: "you",
      label: "You",
      links: [
        L("Your page", "/you", "Projects, threads and progress", "user", "ion"),
        L("For you", "/for-you", "New from what you follow", "heart", "gold"),
        L("Saved", "/saved", "Everything you bookmarked", "bookmark", "ion"),
        L("Messages", "/messages", "Direct messages", "mail", "ion"),
        L("Notifications", "/notifications", "Replies, follows and mentions", "bell", "ion"),
        L("Settings", "/settings", "Profile, interests, experience", "settings", "ion"),
        L("Get started", "/welcome", "Set up your Nexverse in four steps", "sparkles", "gold"),
      ],
    },
  ],
  mobile: { sameAsHeader: true, groups: [] },
  areas: {},
  create: [
    C("Project", "/new/project", "A model, dataset, tool or code, with a README", "folder-git-2", "repo", "project.create"),
    C("Model", "/new/project?kind=model", "Weights with a model card", "box", "model", "project.create"),
    C("Dataset", "/new/project?kind=dataset", "Data with its licence and a preview", "database", "dataset", "project.create"),
    C("Tool", "/new/project?kind=tool", "An app or a library people can use", "wrench", "tool", "project.create"),
    C("Thread", "/forum/new", "Ask, share or start a debate", "message-square", "ion", "thread.create"),
    C("Event", "/events/new", "A reading club, meetup or live demo", "calendar-days", "model", "event.create"),
    C("Mission", "/missions/new", "A challenge with a reward", "target", "gold", "mission.create"),
    C("Crew", "/crews/new", "A team with a wall and a chat", "users-round", "repo", "crew.create"),
    C("Collection", "/collections?new=1", "A list of things worth knowing", "library", "repo", "collection.create"),
    C("Launch", "/launchpad/new", "A countdown to your release", "rocket", "gold", "launch.create"),
    C("Share a link", "/share", "A model, tool, paper or story from elsewhere", "link", "ion", "submission.create"),
    C("News tip", "/news#tip", "Tell the newsroom what happened", "newspaper", "model", "news.tip"),
  ],
}

/*
 * Pages merged in round 12, old address -> where it lives now. The old addresses still work (next.config.ts
 * redirects them); saved menus are rewritten on read, so a menu saved before the merge never shows a dead or
 * doubled link.
 */
export const MOVED: Record<string, string> = {
  "/repos": "/code",
  "/gh/topics": "/code?tab=github",
  "/cosmos": "/explore?show=map",
  "/constellations": "/collections?show=map",
  "/studio": "/you",
}

/** The current address of a link saved before a merge (only exact paths move; /repos/<id> pages still exist). */
export function movedHref(href: string): string {
  const [path, rest = ""] = href.split(/(?=[?#])/)
  const to = MOVED[path]
  if (!to) return href
  if (!rest) return to
  // keep the old query (/cosmos?focus=...) on top of the new one
  return rest.startsWith("?") ? `${to}${to.includes("?") ? "&" : "?"}${rest.slice(1)}` : `${to}${rest}`
}

/** Each default link's sub-heading, so links saved before sections existed still land under one. */
const SECTION_OF = new Map(DEFAULT_MENUS.header.flatMap((g) => g.links.map((l) => [l.href, l.section] as const)))

// ─── Reading and cleaning ───────────────────────────────────────────────────────────────────────────────────

const ACCENT_IDS = ["ion", "gold", "model", "dataset", "tool", "repo"]
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export const LIMITS = { groups: 8, links: 16, label: 40, description: 90, groupLabel: 30 }

function cleanLink(v: unknown): MenuLink | null {
  const r = rec(v)
  const href = str(r.href, 400).trim()
  const label = str(r.label, LIMITS.label).trim()
  if (!label || !isSafeHref(href)) return null
  const at = movedHref(href)
  const section = str(r.section, LIMITS.groupLabel).trim() || SECTION_OF.get(at)
  return {
    label,
    href: at,
    description: str(r.description, LIMITS.description),
    icon: str(r.icon, 40) || "link",
    accent: (ACCENT_IDS.includes(r.accent as string) ? r.accent : "ion") as CategoryAccent,
    ...(section ? { section } : {}),
  }
}

const pathOf = (href: string) => href.split(/[?#]/)[0]

/**
 * One link per place in a group: two old pages merged into one must not show twice. A link that moved (Cosmos,
 * now Explore's map view) goes when the group already links to the page it moved into.
 */
function oncePerHref(raw: unknown[], links: (MenuLink | null)[]): MenuLink[] {
  const moved = (i: number) => movedHref(str(rec(raw[i]).href, 400).trim()) !== str(rec(raw[i]).href, 400).trim()
  const kept = links.map((l, i) => (l ? { l, moved: moved(i) } : null)).filter((x): x is { l: MenuLink; moved: boolean } => x !== null)
  return kept
    .filter(({ l, moved }, i) => kept.findIndex((x) => x.l.href === l.href) === i && !(moved && kept.some((x) => !x.moved && pathOf(x.l.href) === pathOf(l.href))))
    .map((x) => x.l)
}

function cleanGroups(v: unknown): MenuGroup[] {
  return arr(v)
    .slice(0, LIMITS.groups)
    .map((g, i) => {
      const r = rec(g)
      const raw = arr(r.links).slice(0, LIMITS.links)
      return {
        id: str(r.id, 40) || `group-${i}`,
        label: str(r.label, LIMITS.groupLabel).trim(),
        blurb: str(r.blurb, LIMITS.description).trim() || undefined,
        links: oncePerHref(raw, raw.map(cleanLink)),
      }
    })
}

// ─── New defaults inside an older saved row ─────────────────────────────────────────────────────────────────

/** Every default link, keyed by where it sits. Saved with the row (saveMenus) as `known`. */
export function defaultKeys(): string[] {
  return [
    ...DEFAULT_MENUS.header.flatMap((g) => g.links.map((l) => `header:${l.href}`)),
    ...DEFAULT_MENUS.footer.flatMap((g) => g.links.map((l) => `footer:${l.href}`)),
    ...DEFAULT_MENUS.headerLinks.map((l) => `bar:${l.href}`),
  ]
}

/** What round 10's defaults held: a row saved before `known` existed had seen exactly these. */
const ROUND_10_KEYS = [
  ...["/explore", "/trending", "/news", "/collections", "/constellations", "/cosmos", "/leaderboard", "/code", "/models", "/datasets", "/tools", "/lab", "/arena", "/benchmarks", "/studio", "/forum", "/chat", "/crews", "/missions", "/events", "/launchpad", "/people"].map((h) => `header:${h}`),
  ...["/explore", "/trending", "/news", "/collections", "/constellations", "/cosmos", "/gh/topics", "/code", "/models", "/datasets", "/tools", "/repos", "/lab", "/arena", "/benchmarks", "/forum", "/chat", "/crews", "/missions", "/events", "/launchpad", "/people", "/leaderboard", "/you", "/for-you", "/studio", "/messages", "/saved", "/notifications", "/settings"].map((h) => `footer:${h}`),
]

/** Adds the default links a saved row has never seen to the group with the same id (when that group is still there). */
function withNewDefaults(m: Menus, known: Set<string>): Menus {
  const add = (where: "header" | "footer", saved: MenuGroup[], defaults: MenuGroup[]) =>
    saved.map((g) => {
      const d = defaults.find((x) => x.id === g.id)
      if (!d) return g
      const have = new Set(saved.flatMap((x) => x.links.map((l) => l.href)))
      const fresh = d.links.filter((l) => !known.has(`${where}:${l.href}`) && !have.has(l.href))
      return fresh.length ? { ...g, links: [...g.links, ...fresh].slice(0, LIMITS.links) } : g
    })
  const bar = DEFAULT_MENUS.headerLinks.filter((l) => !known.has(`bar:${l.href}`) && !m.headerLinks.some((x) => x.href === l.href))
  return { ...m, header: add("header", m.header, DEFAULT_MENUS.header), footer: add("footer", m.footer, DEFAULT_MENUS.footer), headerLinks: [...m.headerLinks, ...bar].slice(0, 4) }
}

/** A saved menus row, cleaned; anything missing or broken falls back to the defaults. */
export function cleanMenus(raw: unknown): Menus {
  const r = rec(raw)
  if (!Object.keys(r).length) return DEFAULT_MENUS
  const known = new Set(Array.isArray(r.known) ? arr(r.known).filter((k): k is string => typeof k === "string") : ROUND_10_KEYS)
  return withNewDefaults(cleanSaved(r), known)
}

function cleanSaved(r: Record<string, unknown>): Menus {
  const m = rec(r.mobile)
  const areas: Menus["areas"] = {}
  for (const f of FEATURES) {
    const a = rec(rec(r.areas)[f.key])
    const label = str(a.label, LIMITS.label).trim()
    const blurb = str(a.blurb, LIMITS.description).trim()
    if (label || blurb) areas[f.key] = { label, blurb }
  }
  return {
    header: Array.isArray(r.header) ? cleanGroups(r.header) : DEFAULT_MENUS.header,
    headerLinks: Array.isArray(r.headerLinks) ? arr(r.headerLinks).slice(0, 4).map(cleanLink).filter((l): l is MenuLink => l !== null) : DEFAULT_MENUS.headerLinks,
    footer: Array.isArray(r.footer) ? cleanGroups(r.footer) : DEFAULT_MENUS.footer,
    mobile: { sameAsHeader: m.sameAsHeader !== false, groups: cleanGroups(m.groups) },
    areas,
    create: Array.isArray(r.create)
      ? arr(r.create)
          .slice(0, LIMITS.links)
          .map((v): CreateLink | null => {
            const l = cleanLink(v)
            return l ? { ...l, cap: str(rec(v).cap, 40) || undefined } : null
          })
          .filter((l): l is CreateLink => l !== null)
      : DEFAULT_MENUS.create,
  }
}

/** Problems that would stop a save, in sentences. */
export function menuProblems(m: Menus): string[] {
  const out: string[] = []
  const groups = [
    ...m.header.map((g) => ["Header", g] as const),
    ...m.footer.map((g) => ["Footer", g] as const),
    ...(m.mobile.sameAsHeader ? [] : m.mobile.groups.map((g) => ["Phone menu", g] as const)),
  ]
  for (const [where, g] of groups) {
    if (!g.label.trim() && where !== "Phone menu") out.push(`${where}: every group needs a name.`)
    if (g.links.length > LIMITS.links) out.push(`${where} · ${g.label}: up to ${LIMITS.links} links.`)
    g.links.forEach((l) => {
      if (!l.label.trim()) out.push(`${where} · ${g.label || "a group"}: a link has no label.`)
      if (!isSafeHref(l.href)) out.push(`${where} · ${g.label || "a group"} · ${l.label || "a link"}: use a path on this site (/forum) or an https address.`)
    })
  }
  m.headerLinks.forEach((l) => {
    if (!l.label.trim() || !isSafeHref(l.href)) out.push(`Header bar: “${l.label || "a link"}” needs a label and a path or https address.`)
  })
  if (m.header.length > LIMITS.groups) out.push(`The header holds up to ${LIMITS.groups} menus.`)
  return [...new Set(out)]
}

// ─── What the site shows ────────────────────────────────────────────────────────────────────────────────────

const areaOf = (href: string) => FEATURES.find((f) => f.key !== "ai" && f.href === href.split("?")[0])?.key

/** A link with its area's new name, when the admins gave one. */
function withArea(l: MenuLink, areas: Menus["areas"]): MenuLink {
  const key = areaOf(l.href)
  const a = key ? areas[key] : undefined
  if (!a) return l
  return { ...l, label: a.label || l.label, description: a.blurb && l.description ? a.blurb : l.description }
}

function visible(groups: MenuGroup[], settings: SiteSettings, areas: Menus["areas"]) {
  return groups
    .map((g) => ({ ...g, links: g.links.filter((l) => !l.href.startsWith("/") || isLinkVisible(settings, l.href.split("?")[0])).map((l) => withArea(l, areas)) }))
    .filter((g) => g.links.length > 0)
}

export type MenuPage = { slug: string; title: string; href: string }

// Published pages marked "show in menu", loaded once per visit and shared by the header, footer and ⌘K.
let menuPages: Promise<MenuPage[]> | null = null
export function loadMenuPages(fresh = false) {
  if (fresh || !menuPages) {
    menuPages = listPages()
      .then((list) => list.filter((p) => p.status === "published" && p.showInMenu).map((p) => ({ slug: p.slug, title: p.title, href: pagePath(p.slug) })))
      .catch(() => [])
  }
  return menuPages
}

function useMenuPages() {
  const [pages, setPages] = useState<MenuPage[]>([])
  useEffect(() => {
    let on = true
    void loadMenuPages().then((p) => on && setPages(p))
    return () => {
      on = false
    }
  }, [])
  return pages
}

/** The saved menus (or the defaults), as stored. For the editor. */
export function useSavedMenus() {
  const { rows, ready } = useSiteSettings()
  const raw = rows.menus
  return { menus: useMemo(() => cleanMenus(raw), [raw]), ready, saved: raw !== undefined }
}

/** The menus as visitors see them: switched-off areas and hidden links left out, area names applied, pages added. */
export function useMenus() {
  const { settings, rows } = useSiteSettings()
  const raw = rows.menus
  const pages = useMenuPages()
  return useMemo(() => {
    const m = cleanMenus(raw)
    const header = visible(m.header, settings, m.areas)
    const pageGroup: MenuGroup[] = pages.length ? [{ id: "pages", label: "Pages", links: pages.map((p) => L(p.title, p.href, "", "file-text")) }] : []
    const footer = visible(m.footer, settings, m.areas)
    // "You" is the footer's column of that id (so the admins edit it in one place), shown in the avatar menu and
    // the phone menu; a row saved without one keeps the default.
    const youGroup = footer.find((g) => g.id === "you") ?? visible(DEFAULT_MENUS.footer.filter((g) => g.id === "you"), settings, m.areas)[0]
    // descriptions of the You links come from the defaults when a saved row has none
    const youLinks = (youGroup?.links ?? []).map((l) => (l.description ? l : { ...l, description: DEFAULT_MENUS.footer.flatMap((g) => g.links).find((d) => d.href === l.href)?.description ?? "" }))
    const you: MenuGroup = { id: "you", label: youGroup?.label || "You", links: youLinks }
    return {
      header,
      headerLinks: visible([{ id: "bar", label: "", links: m.headerLinks }], settings, m.areas)[0]?.links ?? [],
      footer: [...footer, ...pageGroup].slice(0, 5),
      you,
      mobile: m.mobile.sameAsHeader ? [...header, ...(you.links.length ? [you] : []), ...pageGroup] : [...visible(m.mobile.groups, settings, m.areas), ...pageGroup],
      create: (m.create ?? DEFAULT_MENUS.create ?? []).filter((l) => !l.href.startsWith("/") || isLinkVisible(settings, l.href.split(/[?#]/)[0])),
      pages,
    }
  }, [raw, settings, pages])
}

export async function saveMenus(m: Menus) {
  const problems = menuProblems(m)
  if (problems.length) throw new Error(problems[0])
  // remember which defaults this save has seen, so only links added to the code later appear on their own
  await saveSettingRow("menus", { ...m, known: defaultKeys() })
}
