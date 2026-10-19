import type { SettingKey } from "@/lib/site-settings"

/*
 * The admin panel's map. Plain data with no "use client", so server files (generateStaticParams, metadata)
 * and client components read the same list.
 */

export const SETTING_SECTIONS: { key: SettingKey; label: string; blurb: string }[] = [
  { key: "brand", label: "Brand", blurb: "Site name, tagline and the description search engines and footers use" },
  { key: "announcement", label: "Announcement", blurb: "A line above the header for news, launches or maintenance" },
  { key: "theme", label: "Theme", blurb: "Accent colour, how much moves, and the home page backdrop" },
  { key: "hero", label: "Home hero", blurb: "The first words and button visitors see on the home page" },
  { key: "home", label: "Home sections", blurb: "Order the home page sections and choose which ones show" },
  { key: "nav", label: "Navigation", blurb: "Hide links from the header menus, footer and search" },
  { key: "features", label: "Features", blurb: "Switch whole parts of the site on or off" },
  { key: "footer", label: "Footer", blurb: "A note and up to eight links at the bottom of every page" },
  { key: "access", label: "Access", blurb: "Whether guests can browse and new people can join" },
]

export const isSettingSection = (s: string): s is SettingKey => SETTING_SECTIONS.some((x) => x.key === s)

export const ADMIN_PAGES = [
  { href: "/admin", label: "Overview", admin: false },
  { href: "/admin/reports", label: "Reports", admin: false },
  { href: "/admin/members", label: "Members", admin: false },
  { href: "/admin/content", label: "Content", admin: false },
  { href: "/admin/log", label: "Moderation log", admin: false },
  { href: "/admin/newsroom", label: "Newsroom", admin: false },
  { href: "/admin/forum", label: "Forum", admin: false },
  { href: "/admin/chat", label: "Chat rooms", admin: false },
  { href: "/admin/pages", label: "Pages", admin: false },
  { href: "/admin/menus", label: "Menus", admin: false },
  { href: "/admin/roles", label: "Roles and powers", admin: true },
  { href: "/admin/ai", label: "AI", admin: true },
  { href: "/admin/settings", label: "Site settings", admin: true },
] as const
