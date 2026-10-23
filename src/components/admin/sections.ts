import type { SettingKey } from "@/lib/site-settings"

/*
 * The admin panel's map. Plain data with no "use client", so server files (generateStaticParams, metadata)
 * and client components read the same list.
 *
 * The sidebar shows a few groups of items; each item is one page with tabs. Every older address still opens
 * (each one is a tab now), so links and bookmarks keep working.
 */

export const SETTING_SECTIONS: { key: SettingKey; label: string; blurb: string }[] = [
  { key: "brand", label: "Brand", blurb: "Site name, tagline and the description search engines use" },
  { key: "announcement", label: "Announcement", blurb: "A line above the header for news, launches or maintenance" },
  { key: "theme", label: "Look and feel", blurb: "Colours, background, stars, motion, header, glass, corners and text size, for everyone" },
  { key: "experience", label: "Look and feel", blurb: "Colours, background, stars, motion, header, glass, corners and text size, for everyone" },
  { key: "hero", label: "Home hero", blurb: "The first words and button visitors see on the home page" },
  { key: "home", label: "Home sections", blurb: "Order the home page sections and choose which ones show" },
  { key: "nav", label: "Hidden links", blurb: "Hide links from the header, footer and search" },
  { key: "features", label: "Features", blurb: "Switch whole parts of the site on or off" },
  { key: "footer", label: "Footer", blurb: "A note and up to eight links at the bottom of every page" },
  { key: "access", label: "Access", blurb: "Whether guests can browse and new people can join" },
]

export const isSettingSection = (s: string): s is SettingKey => SETTING_SECTIONS.some((x) => x.key === s)

export type AdminIcon =
  | "overview"
  | "content"
  | "newsroom"
  | "import"
  | "reports"
  | "members"
  | "spaces"
  | "pages"
  | "menus"
  | "appearance"
  | "access"
  | "ai"

export type AdminTab = {
  href: string
  label: string
  /** One line under the page title while this tab is open. */
  blurb: string
  /** Admins only (moderators do not see it). */
  admin?: boolean
  /** Headings the page's own component still renders; the frame already shows them, so they are folded away. */
  covers?: string[]
  /** Extra words the admin search matches. */
  keywords?: string
}

export type AdminItem = { id: string; label: string; icon: AdminIcon; tabs: AdminTab[] }
export type AdminGroup = { id: string; label: string | null; items: AdminItem[] }

const setting = (key: SettingKey, keywords = "", label?: string): AdminTab => {
  const s = SETTING_SECTIONS.find((x) => x.key === key)!
  return { href: `/admin/settings/${key}`, label: label ?? s.label, blurb: s.blurb, admin: true, keywords: `settings ${keywords}` }
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: "home",
    label: null,
    items: [{ id: "overview", label: "Overview", icon: "overview", tabs: [{ href: "/admin", label: "Overview", blurb: "What needs you today, and the site at a glance", keywords: "dashboard home stats" }] }],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        id: "content",
        label: "Content",
        icon: "content",
        tabs: [
          { href: "/admin/content", label: "Posts", blurb: "Hide, feature or remove threads, replies, links, projects, events and chat", covers: ["Content"], keywords: "threads replies projects events moderate hide feature" },
          { href: "/admin/lists", label: "Curated lists", blurb: "The topics, languages, tasks and tags the site is built around", admin: true, keywords: "topics tags benchmarks languages orbits" },
        ],
      },
      {
        id: "newsroom",
        label: "Newsroom",
        icon: "newsroom",
        tabs: [
          { href: "/admin/newsroom", label: "Desk", blurb: "Review, write and publish stories", covers: ["Newsroom"], keywords: "news stories drafts tips sources publish" },
          { href: "/admin/newsroom/control", label: "Research engine", blurb: "Desks, schedule and the AI researchers that find the news", covers: ["Newsroom control"], keywords: "scan run engine desks schedule hours" },
        ],
      },
      {
        id: "import",
        label: "Import",
        icon: "import",
        tabs: [{ href: "/admin/import", label: "Import", blurb: "Bring models, datasets and repos into Nexverse in bulk", admin: true, keywords: "bulk models datasets repos github" }],
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      {
        id: "reports",
        label: "Reports",
        icon: "reports",
        tabs: [
          { href: "/admin/reports", label: "Queue", blurb: "Reported posts, oldest first", covers: ["Reports"], keywords: "flags abuse spam" },
          { href: "/admin/log", label: "Moderation log", blurb: "Every action the team took, kept by the database", keywords: "history audit" },
        ],
      },
      {
        id: "members",
        label: "Members",
        icon: "members",
        tabs: [
          { href: "/admin/members", label: "People", blurb: "Find members, pause posting, change roles", covers: ["Members"], keywords: "users suspend ban" },
          { href: "/admin/roles", label: "Roles and powers", blurb: "Who can do what, and what reputation unlocks", admin: true, keywords: "permissions capabilities tiers reputation" },
        ],
      },
      {
        id: "spaces",
        label: "Forum and chat",
        icon: "spaces",
        tabs: [
          { href: "/admin/forum", label: "Forum", blurb: "Groups and categories, their order and rules", keywords: "categories groups" },
          { href: "/admin/chat", label: "Chat rooms", blurb: "Open, lock, slow down or archive rooms", keywords: "rooms" },
        ],
      },
    ],
  },
  {
    id: "site",
    label: "Site",
    items: [
      {
        id: "pages",
        label: "Pages",
        icon: "pages",
        tabs: [
          { href: "/admin/site", label: "Site texts", blurb: "Texts, search details and visibility of every page", covers: ["Site editor"], keywords: "seo copy edit visibility" },
          { href: "/admin/pages", label: "Custom pages", blurb: "Pages you build from blocks", covers: ["Pages"], keywords: "blocks builder" },
        ],
      },
      {
        id: "menus",
        label: "Menus",
        icon: "menus",
        tabs: [
          { href: "/admin/menus", label: "Menus", blurb: "What the header, footer and phone menu link to", keywords: "navigation header footer" },
          setting("nav", "navigation hide"),
        ],
      },
      {
        id: "appearance",
        label: "Appearance",
        icon: "appearance",
        tabs: [setting("brand", "name logo"), setting("theme", "theme experience colour color accent background backdrop sky stars motion scrolling parallax header glass blur corners radius text size font"), setting("hero", "home headline"), setting("home"), setting("announcement", "banner"), setting("footer")],
      },
      {
        id: "access",
        label: "Access and sign-in",
        icon: "access",
        tabs: [setting("access", "guests sign up join access", "Guests and joining"), setting("features", "switch off modules"), { href: "/admin/logins", label: "Sign-in methods", blurb: "Google, GitHub, Discord and other ways to sign in", admin: true, keywords: "oauth login social" }],
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [{ id: "ai", label: "AI", icon: "ai", tabs: [{ href: "/admin/ai", label: "AI", blurb: "Free models by default, what each job runs on and how it is doing", admin: true, keywords: "models providers keys quotas premium" }] }],
  },
]

export const ADMIN_ITEMS = ADMIN_GROUPS.flatMap((g) => g.items)

/** Where an item opens: its first tab the viewer may see. */
export const itemHref = (item: AdminItem, isAdmin: boolean) => (item.tabs.find((t) => !t.admin || isAdmin) ?? item.tabs[0]).href

/** The item and tab an address belongs to: the longest tab address that matches wins. */
export function locate(path: string): { item: AdminItem; tab: AdminTab } | null {
  let best: { item: AdminItem; tab: AdminTab } | null = null
  for (const item of ADMIN_ITEMS) {
    for (const tab of item.tabs) {
      const hit = tab.href === "/admin" ? path === "/admin" : path === tab.href || path.startsWith(tab.href + "/")
      if (hit && (!best || tab.href.length > best.tab.href.length)) best = { item, tab }
    }
  }
  return best
}
