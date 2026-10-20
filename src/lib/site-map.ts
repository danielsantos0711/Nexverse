/*
 * Every page of the site, for the admin's site editor (/admin/site) and for per-page SEO and visibility.
 * Plain data with no "use client", so server files (generateMetadata) and client components read the same list.
 *
 * Keep it in step with src/app: a new route gets an entry here. `path` is the route as Next names it, with
 * [param] segments for dynamic ones. `keys` are the prefixes of the editable content keys used on that page
 * ("forum" covers "forum.header.title"), which is how the site editor groups saved texts by page.
 */

export type SiteArea = "Start" | "Hub" | "Talk" | "Create" | "Code" | "Lab" | "News" | "Members" | "Account" | "Site" | "Admin"

export type SitePageEntry = {
  path: string
  label: string
  area: SiteArea
  /** Content key prefixes on this page. */
  keys: string[]
  /** A dynamic route: one template for many items. Its title and description come from each item. */
  dynamic?: boolean
  /** A real address to open the template on, when there is a safe sample. */
  sample?: string
  /** Only signed-in members can use it, whatever the visibility says (it shows a sign-in wall otherwise). */
  membersOnly?: boolean
  /** Not a page: copy shared by every page (header, footer, dialogs). */
  global?: boolean
}

export const SITE_AREAS: SiteArea[] = ["Start", "Hub", "Talk", "Create", "Code", "Lab", "News", "Members", "Account", "Site", "Admin"]

export const SITE_MAP: SitePageEntry[] = [
  // Shared pieces
  { path: "/", label: "Home", area: "Start", keys: ["home", "hero"] },
  { path: "*header", label: "Header and menus", area: "Site", keys: ["header", "nav", "menu", "command"], global: true },
  { path: "*footer", label: "Footer", area: "Site", keys: ["footer"], global: true },
  { path: "*lists", label: "Curated lists (also in Admin → Lists)", area: "Site", keys: ["lists"], global: true },
  { path: "*common", label: "Shared texts (sign-in walls, notices, dialogs)", area: "Site", keys: ["common", "gate", "announcement", "guard", "share-sheet", "hub", "site", "error", "editor", "assistant", "tabbar", "search"], global: true },
  { path: "/explore", label: "Explore", area: "Start", keys: ["explore"] },
  { path: "/trending", label: "Trending", area: "Start", keys: ["trending"] },
  { path: "/for-you", label: "For you", area: "Start", keys: ["for-you"], membersOnly: true },
  { path: "/cosmos", label: "Cosmos", area: "Start", keys: ["cosmos"] },
  { path: "/constellations", label: "Constellations", area: "Start", keys: ["constellations"] },
  { path: "/constellations/[slug]", label: "Constellation", area: "Start", keys: ["constellation"], dynamic: true },
  { path: "/welcome", label: "Welcome", area: "Start", keys: ["welcome"] },
  { path: "/join", label: "Join", area: "Start", keys: ["join"] },

  // Hub
  { path: "/models", label: "Models", area: "Hub", keys: ["models"] },
  { path: "/models/[slug]", label: "Model", area: "Hub", keys: ["model"], dynamic: true },
  { path: "/datasets", label: "Datasets", area: "Hub", keys: ["datasets"] },
  { path: "/datasets/[slug]", label: "Dataset", area: "Hub", keys: ["dataset"], dynamic: true },
  { path: "/tools", label: "Tools", area: "Hub", keys: ["tools"] },
  { path: "/tools/[slug]", label: "Tool", area: "Hub", keys: ["tool"], dynamic: true },
  { path: "/repos", label: "Repos", area: "Hub", keys: ["repos"] },
  { path: "/repos/[slug]", label: "Repo", area: "Hub", keys: ["repo"], dynamic: true },
  { path: "/collections", label: "Collections", area: "Hub", keys: ["collections"] },
  { path: "/collections/[id]", label: "Collection", area: "Hub", keys: ["collection"], dynamic: true },
  { path: "/compare", label: "Compare", area: "Hub", keys: ["compare"] },
  { path: "/leaderboard", label: "Leaderboard", area: "Hub", keys: ["leaderboard"] },
  { path: "/benchmarks", label: "Benchmarks", area: "Hub", keys: ["benchmarks"] },
  { path: "/benchmarks/[slug]", label: "Benchmark", area: "Hub", keys: ["benchmark"], dynamic: true },
  { path: "/arena", label: "Arena", area: "Hub", keys: ["arena"] },
  { path: "/arena/ratings", label: "Arena ratings", area: "Hub", keys: ["arena-ratings"] },
  { path: "/arena/new", label: "Post a duel", area: "Hub", keys: ["arena-new"], membersOnly: true },
  { path: "/arena/[id]", label: "Duel", area: "Hub", keys: ["duel"], dynamic: true },

  // Talk
  { path: "/forum", label: "Forum", area: "Talk", keys: ["forum"] },
  { path: "/forum/c/[slug]", label: "Forum category", area: "Talk", keys: ["forum-category"], dynamic: true },
  { path: "/forum/[id]", label: "Forum thread", area: "Talk", keys: ["thread"], dynamic: true },
  { path: "/forum/new", label: "Start a thread", area: "Talk", keys: ["forum-new"], membersOnly: true },
  { path: "/chat", label: "Chat", area: "Talk", keys: ["chat"] },
  { path: "/chat/[room]", label: "Chat room", area: "Talk", keys: ["chat-room"], dynamic: true },
  { path: "/messages", label: "Messages", area: "Talk", keys: ["messages"], membersOnly: true },
  { path: "/messages/[id]", label: "Conversation", area: "Talk", keys: ["conversation"], dynamic: true, membersOnly: true },
  { path: "/events", label: "Events", area: "Talk", keys: ["events"] },
  { path: "/events/new", label: "Create an event", area: "Talk", keys: ["events-new"], membersOnly: true },
  { path: "/events/[id]", label: "Event", area: "Talk", keys: ["event"], dynamic: true },
  { path: "/crews", label: "Crews", area: "Talk", keys: ["crews"] },
  { path: "/crews/new", label: "Start a crew", area: "Talk", keys: ["crews-new"], membersOnly: true },
  { path: "/crews/[slug]", label: "Crew", area: "Talk", keys: ["crew"], dynamic: true },

  // Create
  { path: "/missions", label: "Missions", area: "Create", keys: ["missions"] },
  { path: "/missions/new", label: "Post a mission", area: "Create", keys: ["missions-new"], membersOnly: true },
  { path: "/missions/[id]", label: "Mission", area: "Create", keys: ["mission"], dynamic: true },
  { path: "/launchpad", label: "Launchpad", area: "Create", keys: ["launchpad"] },
  { path: "/launchpad/new", label: "Schedule a launch", area: "Create", keys: ["launchpad-new"], membersOnly: true },
  { path: "/launchpad/[id]", label: "Launch", area: "Create", keys: ["launch"], dynamic: true },
  { path: "/share", label: "Share", area: "Create", keys: ["share"], membersOnly: true },
  { path: "/studio", label: "Your studio", area: "Create", keys: ["studio"], membersOnly: true },
  { path: "/new/project", label: "New project", area: "Create", keys: ["project-new"], membersOnly: true },
  { path: "/p/[id]", label: "Project", area: "Create", keys: ["project"], dynamic: true },
  { path: "/p/[id]/edit", label: "Edit project", area: "Create", keys: ["project-edit"], dynamic: true, membersOnly: true },

  // Code
  { path: "/code", label: "Code", area: "Code", keys: ["code"] },
  { path: "/code/new", label: "New repository", area: "Code", keys: ["code-new"], membersOnly: true },
  { path: "/code/import", label: "Import from GitHub", area: "Code", keys: ["code-import"], membersOnly: true },
  { path: "/code/[owner]", label: "Code owner", area: "Code", keys: ["code-owner"], dynamic: true },
  { path: "/code/[owner]/[repo]/[[...rest]]", label: "Code repository", area: "Code", keys: ["code-repo"], dynamic: true },
  { path: "/code/go/[id]", label: "Code short link", area: "Code", keys: ["code-go"], dynamic: true },
  { path: "/gh/topics", label: "GitHub topics", area: "Code", keys: ["gh-topics"] },
  { path: "/gh/topics/[topic]", label: "GitHub topic", area: "Code", keys: ["gh-topic"], dynamic: true, sample: "/gh/topics/llm" },
  { path: "/gh/[owner]/[repo]", label: "GitHub repository", area: "Code", keys: ["gh-repo"], dynamic: true },
  { path: "/gh/[owner]/[repo]/tree/[ref]/[...path]", label: "GitHub folder", area: "Code", keys: ["gh-tree"], dynamic: true },
  { path: "/gh/[owner]/[repo]/blob/[ref]/[...path]", label: "GitHub file", area: "Code", keys: ["gh-blob"], dynamic: true },

  // Lab
  { path: "/lab", label: "Lab", area: "Lab", keys: ["lab"] },
  { path: "/lab/[tool]", label: "Lab tool", area: "Lab", keys: ["lab-tool"], dynamic: true },
  { path: "/lab/prompt/[id]", label: "Shared prompt", area: "Lab", keys: ["lab-prompt"], dynamic: true },

  // News
  { path: "/news", label: "News", area: "News", keys: ["news"] },
  { path: "/news/[id]", label: "News story", area: "News", keys: ["story"], dynamic: true },
  { path: "/pages/[slug]", label: "Custom page", area: "News", keys: ["custom-page"], dynamic: true },

  // Members
  { path: "/people", label: "People", area: "Members", keys: ["people"] },
  { path: "/people/[handle]", label: "Member profile", area: "Members", keys: ["profile"], dynamic: true },

  // Account
  { path: "/sign-in", label: "Sign in", area: "Account", keys: ["sign-in", "auth"] },
  { path: "/reset-password", label: "Reset password", area: "Account", keys: ["reset-password"] },
  { path: "/auth/callback", label: "Signing in", area: "Account", keys: ["auth-callback"] },
  { path: "/auth/confirm", label: "Confirm email", area: "Account", keys: ["auth-confirm"] },
  { path: "/you", label: "You", area: "Account", keys: ["you"], membersOnly: true },
  { path: "/settings", label: "Settings", area: "Account", keys: ["settings"], membersOnly: true },
  { path: "/notifications", label: "Notifications", area: "Account", keys: ["notifications"], membersOnly: true },
  { path: "/saved", label: "Saved", area: "Account", keys: ["saved"], membersOnly: true },

  // Site
  { path: "*not-found", label: "Page not found (404)", area: "Site", keys: ["not-found"], global: true },

  // Admin (staff only: content here is for the team)
  { path: "/admin", label: "Admin overview", area: "Admin", keys: ["admin"], membersOnly: true },
  { path: "/admin/site", label: "Site editor", area: "Admin", keys: ["admin-site"], membersOnly: true },
  { path: "/admin/settings", label: "Site settings", area: "Admin", keys: ["admin-settings"], membersOnly: true },
  { path: "/admin/pages", label: "Custom pages", area: "Admin", keys: ["admin-pages"], membersOnly: true },
  { path: "/admin/menus", label: "Menus", area: "Admin", keys: ["admin-menus"], membersOnly: true },
  { path: "/admin/forum", label: "Forum admin", area: "Admin", keys: ["admin-forum"], membersOnly: true },
  { path: "/admin/chat", label: "Chat admin", area: "Admin", keys: ["admin-chat"], membersOnly: true },
  { path: "/admin/newsroom", label: "Newsroom", area: "Admin", keys: ["admin-newsroom"], membersOnly: true },
  { path: "/admin/members", label: "Members admin", area: "Admin", keys: ["admin-members"], membersOnly: true },
  { path: "/admin/reports", label: "Reports", area: "Admin", keys: ["admin-reports"], membersOnly: true },
  { path: "/admin/content", label: "Content moderation", area: "Admin", keys: ["admin-content"], membersOnly: true },
  { path: "/admin/log", label: "Moderation log", area: "Admin", keys: ["admin-log"], membersOnly: true },
  { path: "/admin/roles", label: "Roles and powers", area: "Admin", keys: ["admin-roles"], membersOnly: true },
  { path: "/admin/ai", label: "AI admin", area: "Admin", keys: ["admin-ai"], membersOnly: true },
  { path: "/admin/logins", label: "Social logins", area: "Admin", keys: ["admin-logins"], membersOnly: true },
  { path: "/admin/lists", label: "Curated lists", area: "Admin", keys: ["admin-lists"], membersOnly: true },
]

/** True for a real address (not a "*shared" pseudo-entry). */
export const isRoutable = (p: SitePageEntry) => !p.global

/** Whether a concrete address ("/forum/c/models") matches a route pattern ("/forum/c/[slug]"). */
export function matchRoute(pattern: string, path: string): boolean {
  const clean = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s)
  const a = clean(pattern).split("/").filter(Boolean)
  const b = clean(path.split(/[?#]/)[0]).split("/").filter(Boolean)
  for (let i = 0; i < a.length; i++) {
    const seg = a[i]
    if (seg.startsWith("[[...")) return true
    if (seg.startsWith("[...")) return b.length > i
    if (i >= b.length) return false
    if (seg.startsWith("[")) continue
    if (seg !== b[i]) return false
  }
  return a.length === b.length
}

/**
 * The site-map entry for an address: an exact static route first, then the dynamic template that matches.
 * "/forum/new" is the static "Start a thread", never the thread template "/forum/[id]".
 */
export function routeFor(path: string): SitePageEntry | null {
  const p = path.split(/[?#]/)[0].replace(/(.)\/+$/, "$1") || "/"
  const routable = SITE_MAP.filter(isRoutable)
  return (
    routable.find((r) => !r.dynamic && r.path === p) ??
    // More specific templates (more fixed segments) win.
    routable
      .filter((r) => r.dynamic && matchRoute(r.path, p))
      .sort((x, y) => y.path.split("/").filter((s) => s && !s.startsWith("[")).length - x.path.split("/").filter((s) => s && !s.startsWith("[")).length)[0] ??
    null
  )
}

/** The page a content key belongs to, by its first segment. */
export function pageForKey(key: string): SitePageEntry | null {
  const head = key.split(".")[0]
  return SITE_MAP.find((p) => p.keys.includes(head)) ?? null
}

/** Where to open a page to edit it in place: the route itself, or its sample for templates. */
export function openAddress(p: SitePageEntry): string | null {
  if (p.global) return p.path === "*not-found" ? "/this-page-is-not-here" : "/"
  if (!p.dynamic) return p.path
  return p.sample ?? null
}
