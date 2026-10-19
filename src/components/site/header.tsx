"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  BoxIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FilmIcon,
  FlameIcon,
  FolderGit2Icon,
  MenuIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  PlusIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
  HeartIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  HomeIcon,
  LayoutDashboardIcon,
  CalendarDaysIcon,
  TrophyIcon,
  LibraryIcon,
  OrbitIcon,
  SwordsIcon,
  GaugeIcon,
  MailIcon,
  UsersRoundIcon,
  TargetIcon,
  RocketIcon,
} from "lucide-react"
import { AccountButton } from "@/components/account/account-button"
import { NotificationBell } from "@/components/social/notification-bell"
import { OnlineNow } from "@/components/presence/online-now"
import { useUnreadMessages } from "@/lib/messages"
import { Lockup } from "@/components/brand"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useRole } from "@/lib/roles"
import { FEATURES, useSiteSettings, type SiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

type NavLink = { href: string; label: string; blurb: string; icon: LucideIcon; tint: string }

/** Three menus, grouped by what you came to do: find things, meet people, or make something. */
const MENUS: { id: string; label: string; links: NavLink[] }[] = [
  {
    id: "hub",
    label: "Hub",
    links: [
      { href: "/models", label: "Models", blurb: "Weights you can run, tune and ship", icon: BoxIcon, tint: "text-model" },
      { href: "/datasets", label: "Datasets", blurb: "Open data with its licence up front", icon: DatabaseIcon, tint: "text-dataset" },
      { href: "/tools", label: "Tools", blurb: "Apps and libraries builders rely on", icon: WrenchIcon, tint: "text-tool" },
      { href: "/repos", label: "Repos", blurb: "Code worth reading and forking", icon: FolderGit2Icon, tint: "text-repo" },
      { href: "/trending", label: "Trending now", blurb: "Live from GitHub, arXiv and the hub", icon: FlameIcon, tint: "text-gold" },
      { href: "/papers", label: "Papers", blurb: "Today's research, ready to discuss", icon: ScrollTextIcon, tint: "text-ion" },
      { href: "/gh/topics", label: "GitHub topics", blurb: "LLMs, agents, RAG and more, rising", icon: GitBranchIcon, tint: "text-repo" },
      { href: "/cosmos", label: "Cosmos", blurb: "The whole hub as a star map", icon: OrbitIcon, tint: "text-ion" },
      { href: "/constellations", label: "Constellations", blurb: "Stacks drawn as star maps", icon: SparklesIcon, tint: "text-gold" },
    ],
  },
  {
    id: "community",
    label: "Community",
    links: [
      { href: "/forum", label: "Forum", blurb: "Real discussions, organised by category", icon: MessageSquareIcon, tint: "text-ion" },
      { href: "/crews", label: "Crews", blurb: "Labs, study groups and teams with a wall and a chat", icon: UsersRoundIcon, tint: "text-repo" },
      { href: "/messages", label: "Messages", blurb: "Direct messages with other members", icon: MailIcon, tint: "text-ion" },
      { href: "/chat", label: "Chat", blurb: "Live rooms for every corner of AI", icon: MessagesSquareIcon, tint: "text-gold" },
      { href: "/news", label: "News", blurb: "What happened and why it matters", icon: NewspaperIcon, tint: "text-model" },
      { href: "/people", label: "People", blurb: "Builders and labs to follow", icon: UsersIcon, tint: "text-dataset" },
      { href: "/missions", label: "Missions", blurb: "Challenges with reputation rewards: accept, build, win", icon: TargetIcon, tint: "text-gold" },
      { href: "/launchpad", label: "Launchpad", blurb: "Project launches, countdowns and Launch of the day", icon: RocketIcon, tint: "text-repo" },
      { href: "/arena", label: "Arena", blurb: "Blind duels between models: vote, then see who wrote what", icon: SwordsIcon, tint: "text-model" },
      { href: "/benchmarks", label: "Benchmarks", blurb: "Eval results from members, verified by reproduction", icon: GaugeIcon, tint: "text-dataset" },
      { href: "/events", label: "Events", blurb: "Reading clubs, meetups and live demos", icon: CalendarDaysIcon, tint: "text-model" },
      { href: "/leaderboard", label: "Leaderboard", blurb: "Who helped the most this week", icon: TrophyIcon, tint: "text-gold" },
      { href: "/for-you", label: "For you", blurb: "New from what you follow and save", icon: HeartIcon, tint: "text-gold" },
    ],
  },
  {
    id: "create",
    label: "Create",
    links: [
      { href: "/new/project", label: "Publish a project", blurb: "A model, dataset, tool or repo page", icon: PlusIcon, tint: "text-ion" },
      { href: "/studio", label: "Your studio", blurb: "Everything you made, with its numbers", icon: LayoutDashboardIcon, tint: "text-gold" },
      { href: "/video", label: "Video lab", blurb: "AI videos with their prompts, and a shot builder", icon: FilmIcon, tint: "text-model" },
      { href: "/lab", label: "Lab", blurb: "VRAM, token cost, licences, cards", icon: FlaskConicalIcon, tint: "text-dataset" },
      { href: "/collections", label: "Collections", blurb: "Curate your own constellation", icon: LibraryIcon, tint: "text-repo" },
      { href: "/forum/new", label: "Start a thread", blurb: "Ask, share or start a debate", icon: MessageSquareIcon, tint: "text-model" },
    ],
  },
]

const DIRECT: NavLink[] = [{ href: "/explore", label: "Explore", blurb: "Search everything", icon: SearchIcon, tint: "text-ion" }]


// Admin is built by the admin panel; typed routes learn it once that page exists.
const ADMIN = "/admin" as Route

const isOnPath = (pathname: string, href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"))

/**
 * Whether a link is switched off by the admins: listed in nav.hidden, or inside an area whose feature is off.
 * "AI assist" lives on the settings page, which must stay reachable, so it never hides a link.
 */
function hiddenBy(settings: SiteSettings) {
  const off = FEATURES.filter((f) => f.key !== "ai" && settings.features[f.key] === false).map((f) => f.href)
  const hidden = settings.nav.hidden ?? []
  return (href: string) => hidden.includes(href) || off.some((h) => href === h || href.startsWith(h + "/"))
}

/** The menus with everything the admins switched off taken out (and menus left empty dropped). */
function useMenus() {
  const { settings } = useSiteSettings()
  return useMemo(() => {
    const hide = hiddenBy(settings)
    return {
      menus: MENUS.map((m) => ({ ...m, links: m.links.filter((l) => !hide(l.href)) })).filter((m) => m.links.length > 0),
      direct: DIRECT.filter((l) => !hide(l.href)),
      hide,
      name: settings.brand.name || "Nexverse",
    }
  }, [settings])
}

export function SiteHeader() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { menus, direct, hide, name } = useMenus()
  const { isStaff } = useRole()
  const [scrolled, setScrolled] = useState(false)

  // A passive listener that only re-renders when the header crosses the 8px line, never per scroll event.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 border-b transition-[background-color,border-color] duration-300",
        // a thin strip of glass: the blur covers 64px, never the page
        scrolled ? "border-border bg-background/90 backdrop-blur-md" : "border-transparent bg-transparent"
      )}
    >
      <div className="shell flex h-full items-center gap-3 lg:gap-6">
        <Link
          href="/"
          aria-label={`${name} home`}
          className="pressable -mx-1.5 flex shrink-0 items-center rounded-lg px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Lockup size="sm" priority alt="" className="sm:hidden" />
          <Lockup size="md" priority alt="" className="hidden sm:block" />
        </Link>

        <MainNav pathname={pathname} menus={menus} direct={direct} />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:ml-0">
          <button
            type="button"
            onClick={openSearch}
            className="pressable flex h-9 items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 text-sm text-muted-foreground transition-colors hover:border-white/15 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <SearchIcon aria-hidden className="size-4" />
            <span className="hidden xl:inline">Search</span>
            <Kbd className="hidden xl:inline-flex">⌘K</Kbd>
            <span className="sr-only xl:hidden">Search</span>
          </button>
          <OnlineNow className="hidden xl:flex" />
          {!hide("/messages") && <MessagesLink />}
          <NotificationBell />
          {isStaff && (
            <Link
              href={ADMIN}
              aria-current={isOnPath(pathname, "/admin") ? "page" : undefined}
              className="pressable hidden h-9 items-center gap-1.5 rounded-full border border-gold/30 px-3 text-sm text-gold transition-colors hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-gold/15 md:inline-flex"
            >
              <ShieldIcon aria-hidden className="size-4" />
              Admin
            </Link>
          )}
          <AccountButton />
          <Link
            href="/share"
            className="pressable hidden h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:inline-flex"
          >
            <PlusIcon aria-hidden className="size-4" />
            Share
          </Link>
          <MobileMenu pathname={pathname} menus={menus} direct={direct} isStaff={isStaff} name={name} />
        </div>
      </div>
    </header>
  )
}

/** The menu sheet for phones and tablets: the lockup, then every place in its group, then the two things to do. */
function MobileMenu({ pathname, menus, direct, isStaff, name }: { pathname: string; menus: typeof MENUS; direct: NavLink[]; isStaff: boolean; name: string }) {
  const groups = [{ id: "top", label: "", links: [{ href: "/", label: "Home", blurb: "", icon: HomeIcon, tint: "text-ion" }, ...direct] }, ...menus]
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(22rem,88vw)] bg-background">
        <SheetTitle className="sr-only">{name} menu</SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Lockup size="sm" alt={name} />
        </div>
        <nav aria-label="Menu" className="flex flex-col gap-6 overflow-y-auto px-3 pt-2 pb-8">
          {groups.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5">
              {m.label && <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.label}</p>}
              {m.links.map((n) => {
                const Icon = n.icon
                const on = isOnPath(pathname, n.href)
                return (
                  <SheetClose
                    key={n.href}
                    render={<Link href={n.href as Route} aria-current={on ? "page" : undefined} />}
                    nativeButton={false}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-ring",
                      on && "bg-white/[0.06] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-ion"
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4", n.tint)} />
                    {n.label}
                  </SheetClose>
                )
              })}
            </div>
          ))}
          {isStaff && (
            <SheetClose
              render={<Link href={ADMIN} />}
              nativeButton={false}
              className="mx-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-gold/30 text-sm font-medium text-gold"
            >
              <ShieldIcon aria-hidden className="size-4" /> Admin
            </SheetClose>
          )}
          <SheetClose
            render={<Link href="/share" />}
            nativeButton={false}
            className="mx-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-medium text-primary-foreground"
          >
            <PlusIcon aria-hidden className="size-4" /> Share something
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

/** Direct messages, with the number of unread ones. */
function MessagesLink() {
  const unread = useUnreadMessages()
  return (
    <Link
      href="/messages"
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      className="pressable relative hidden size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid"
    >
      <MailIcon aria-hidden className="size-4.5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ion px-1 text-[10px] font-semibold text-background tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}

/**
 * Desktop navigation. Hovering a menu opens one shared panel that glides and resizes between menus instead of
 * closing one dropdown and opening another. From the keyboard: Enter, Space or Down opens a menu and moves into
 * it, the arrow keys walk its links, Escape closes it and returns to its button.
 */
function MainNav({ pathname, menus, direct }: { pathname: string; menus: typeof MENUS; direct: NavLink[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [dir, setDir] = useState(0)
  const reduce = useReducedMotion()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  const focusFirst = useRef(false)
  const order = menus.map((m) => m.id)
  const isOn = (href: string) => isOnPath(pathname, href)

  // Close on Escape (focus back on the menu's button) and on any click outside the navigation.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      triggers.current[open]?.focus()
      setOpen(null)
    }
    const onDown = (e: PointerEvent) => {
      const nav = panel.current?.closest("nav")
      if (nav && !nav.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  // Opened from the keyboard: move focus to the first link once the panel is there.
  useEffect(() => {
    if (!open || !focusFirst.current) return
    focusFirst.current = false
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus()
  }, [open])

  // A new page closes the panel.
  const [shownFor, setShownFor] = useState(pathname)
  if (shownFor !== pathname) {
    setShownFor(pathname)
    setOpen(null)
  }

  const show = (id: string) => {
    clearTimeout(closeTimer.current)
    setDir(open ? Math.sign(order.indexOf(id) - order.indexOf(open)) : 0)
    setOpen(id)
  }
  const hide = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(null), 140)
  }
  const menu = menus.find((m) => m.id === open)

  function onPanelKey(e: React.KeyboardEvent) {
    const links = [...(panel.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])]
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    const step = e.key === "ArrowDown" ? 2 : e.key === "ArrowUp" ? -2 : e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step || i < 0) return
    e.preventDefault()
    links[Math.min(links.length - 1, Math.max(0, i + step))]?.focus()
  }

  return (
    <nav aria-label="Main" className="relative hidden flex-1 justify-center lg:flex" onPointerLeave={hide} onPointerEnter={() => clearTimeout(closeTimer.current)}>
      <ul className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1">
        {menus.map((m) => {
          const current = m.links.some((l) => isOn(l.href))
          return (
            <li key={m.id}>
              <button
                ref={(el) => {
                  triggers.current[m.id] = el
                }}
                type="button"
                aria-expanded={open === m.id}
                aria-controls={open === m.id ? "nav-panel" : undefined}
                aria-haspopup="true"
                onPointerEnter={(e) => e.pointerType === "mouse" && show(m.id)}
                onClick={() => (open === m.id ? setOpen(null) : show(m.id))}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown") return
                  e.preventDefault()
                  focusFirst.current = true
                  show(m.id)
                }}
                className={cn(
                  "relative flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  open === m.id || current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  (current || open === m.id) && "bg-white/[0.07]"
                )}
              >
                {m.label}
                {current && <span aria-hidden className="absolute -bottom-[5px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-ion shadow-[0_0_6px_var(--ion)]" />}
                <ChevronDownIcon aria-hidden className={cn("size-3.5 opacity-60 transition-transform duration-200", open === m.id && "rotate-180")} />
              </button>
            </li>
          )
        })}
        {direct.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href as Route}
              onPointerEnter={hide}
              aria-current={isOn(n.href) ? "page" : undefined}
              className={cn(
                "relative block rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isOn(n.href) ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={panel}
            id="nav-panel"
            layout={!reduce}
            onKeyDown={onPanelKey}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px) scale(0.98)" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            style={{ transformOrigin: "top center" }}
            // solid panel, no backdrop blur: it sits over the hero's canvas and must stay cheap to draw
            className="absolute top-[calc(100%+12px)] left-1/2 w-[36rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-popover p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.85),0_0_0_1px_rgb(143_180_255/0.06)]"
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.ul
                key={menu.id}
                custom={dir}
                aria-label={menu.label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * 32}px)` }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * -32}px)` }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="grid grid-cols-2 gap-1"
              >
                {menu.links.map((l) => {
                  const Icon = l.icon
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href as Route}
                        prefetch={false}
                        onPointerEnter={() => router.prefetch(l.href)}
                        onFocus={() => router.prefetch(l.href)}
                        aria-current={isOn(l.href) ? "page" : undefined}
                        onClick={() => setOpen(null)}
                        className="group flex items-start gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-white/[0.06]"
                      >
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105", l.tint)}>
                          <Icon aria-hidden className="size-4" />
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{l.label}</span>
                          <span className="text-xs text-muted-foreground">{l.blurb}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </motion.ul>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
