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

export type MenuLink = { label: string; href: string; description: string; icon: string; accent: CategoryAccent }
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
}

const L = (label: string, href: string, description: string, icon: string, accent: CategoryAccent = "ion"): MenuLink => ({ label, href, description, icon, accent })
const C = (label: string, href: string, description: string, icon: string, accent: CategoryAccent, cap?: string): CreateLink => ({ ...L(label, href, description, icon, accent), cap })

/*
 * Round 10 layout, for newcomers: three places, each named by what you do there.
 *   Discover   find things: the map, what is trending, the news, curated collections
 *   Build      make things: projects (with their code), the hub's kinds, the Lab, evals
 *   Community  meet people: talk, crews, missions, events, launches
 * "Projects" is one entry: a project page carries its code, so Code and "Publish a project" are not separate.
 * Making anything starts from the Create button, never from a menu link.
 */
export const DEFAULT_MENUS: Menus = {
  header: [
    {
      id: "discover",
      label: "Discover",
      blurb: "Find what is new and worth your time",
      links: [
        L("Explore the map", "/explore", "Every part of Nexverse on one page", "compass", "ion"),
        L("Trending", "/trending", "Rising on GitHub and the hub this week", "flame", "gold"),
        L("News", "/news", "The AI newsroom: what happened and why", "newspaper", "model"),
        L("Collections", "/collections", "Lists members curated, with notes", "library", "repo"),
        L("Constellations", "/constellations", "Stacks drawn as star maps", "sparkles", "gold"),
        L("Cosmos", "/cosmos", "The whole hub as one star map", "orbit", "ion"),
        L("Leaderboard", "/leaderboard", "Who helped the most this week", "trophy", "gold"),
      ],
    },
    {
      id: "build",
      label: "Build",
      blurb: "Make, test and ship AI work",
      links: [
        L("Projects", "/code", "Projects with their code, issues and releases", "folder-git-2", "repo"),
        L("Models", "/models", "Weights you can run, tune and ship", "box", "model"),
        L("Datasets", "/datasets", "Open data with its licence up front", "database", "dataset"),
        L("Tools", "/tools", "Apps and libraries builders rely on", "wrench", "tool"),
        L("Lab", "/lab", "Calculators, cards and builders for AI work", "flask-conical", "dataset"),
        L("Arena", "/arena", "Blind duels between models: vote, then see", "swords", "model"),
        L("Benchmarks", "/benchmarks", "Eval results, verified by reproduction", "gauge", "dataset"),
        L("Your studio", "/studio", "Everything you made, with its numbers", "layout-dashboard", "gold"),
      ],
    },
    {
      id: "community",
      label: "Community",
      blurb: "Talk, team up and take on challenges",
      links: [
        L("Forum", "/forum", "Discussions organised by category", "message-square", "ion"),
        L("Chat", "/chat", "Live rooms for every corner of AI", "messages-square", "gold"),
        L("Crews", "/crews", "Teams with a wall, a chat and goals", "users-round", "repo"),
        L("Missions", "/missions", "Challenges with reputation rewards", "target", "gold"),
        L("Events", "/events", "Reading clubs, meetups and live demos", "calendar-days", "model"),
        L("Launchpad", "/launchpad", "Launches, countdowns, Launch of the day", "rocket", "repo"),
        L("People", "/people", "Builders and labs to follow", "users", "dataset"),
      ],
    },
  ],
  headerLinks: [],
  footer: [
    {
      id: "discover",
      label: "Discover",
      links: [
        L("Explore the map", "/explore", "", "compass"),
        L("Trending", "/trending", "", "flame"),
        L("News", "/news", "", "newspaper"),
        L("Collections", "/collections", "", "library"),
        L("Constellations", "/constellations", "", "sparkles"),
        L("Cosmos", "/cosmos", "", "orbit"),
        L("GitHub topics", "/gh/topics", "", "git-branch"),
      ],
    },
    {
      id: "build",
      label: "Build",
      links: [
        L("Projects", "/code", "", "folder-git-2"),
        L("Models", "/models", "", "box"),
        L("Datasets", "/datasets", "", "database"),
        L("Tools", "/tools", "", "wrench"),
        L("Repos", "/repos", "", "git-branch"),
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
        L("Leaderboard", "/leaderboard", "", "trophy"),
      ],
    },
    {
      id: "you",
      label: "You",
      links: [
        L("Your page", "/you", "", "user"),
        L("For you", "/for-you", "", "heart"),
        L("Your studio", "/studio", "", "layout-dashboard"),
        L("Messages", "/messages", "", "mail"),
        L("Saved", "/saved", "", "bookmark"),
        L("Notifications", "/notifications", "", "bell"),
        L("Settings", "/settings", "", "settings"),
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
  return { label, href, description: str(r.description, LIMITS.description), icon: str(r.icon, 40) || "link", accent: (ACCENT_IDS.includes(r.accent as string) ? r.accent : "ion") as CategoryAccent }
}

function cleanGroups(v: unknown): MenuGroup[] {
  return arr(v)
    .slice(0, LIMITS.groups)
    .map((g, i) => {
      const r = rec(g)
      return {
        id: str(r.id, 40) || `group-${i}`,
        label: str(r.label, LIMITS.groupLabel).trim(),
        blurb: str(r.blurb, LIMITS.description).trim() || undefined,
        links: arr(r.links).slice(0, LIMITS.links).map(cleanLink).filter((l): l is MenuLink => l !== null),
      }
    })
}

/** A saved menus row, cleaned; anything missing or broken falls back to the defaults. */
export function cleanMenus(raw: unknown): Menus {
  const r = rec(raw)
  if (!Object.keys(r).length) return DEFAULT_MENUS
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
    return {
      header,
      headerLinks: visible([{ id: "bar", label: "", links: m.headerLinks }], settings, m.areas)[0]?.links ?? [],
      footer: [...visible(m.footer, settings, m.areas), ...pageGroup].slice(0, 5),
      mobile: m.mobile.sameAsHeader ? [...header, ...pageGroup] : [...visible(m.mobile.groups, settings, m.areas), ...pageGroup],
      create: (m.create ?? DEFAULT_MENUS.create ?? []).filter((l) => !l.href.startsWith("/") || isLinkVisible(settings, l.href.split(/[?#]/)[0])),
      pages,
    }
  }, [raw, settings, pages])
}

export async function saveMenus(m: Menus) {
  const problems = menuProblems(m)
  if (problems.length) throw new Error(problems[0])
  await saveSettingRow("menus", m)
}
