"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  BoxIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FlameIcon,
  FolderGit2Icon,
  MenuIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  PlusIcon,
  ScrollTextIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
  HeartIcon,
  FlaskConicalIcon,
  GitBranchIcon,
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
      { href: "/forum", label: "Forum", blurb: "Threads in any language, translated", icon: MessageSquareIcon, tint: "text-ion" },
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
      { href: "/lab", label: "Lab", blurb: "VRAM, token cost, licences, cards", icon: FlaskConicalIcon, tint: "text-dataset" },
      { href: "/collections", label: "Collections", blurb: "Curate your own constellation", icon: LibraryIcon, tint: "text-repo" },
      { href: "/forum/new", label: "Start a thread", blurb: "Ask, share or start a debate", icon: MessageSquareIcon, tint: "text-model" },
    ],
  },
]

const DIRECT: NavLink[] = [{ href: "/explore", label: "Explore", blurb: "Search everything", icon: SearchIcon, tint: "text-ion" }]

export function SiteHeader() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8))

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 border-b transition-[background-color,border-color] duration-300",
        scrolled ? "border-border bg-background/85 backdrop-blur-md" : "border-transparent bg-transparent"
      )}
    >
      <div className="shell flex h-full items-center gap-4">
        <Link href="/" className="pressable -m-1.5 flex shrink-0 items-center gap-2 rounded-md p-1.5" aria-label="Nexverse home">
          <Lockup />
        </Link>

        <MainNav pathname={pathname} />

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={openSearch}
            className="pressable glass flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <SearchIcon aria-hidden className="size-4" />
            <span className="hidden md:inline">Search</span>
            <Kbd className="hidden md:inline-flex">⌘K</Kbd>
            <span className="sr-only md:hidden">Search</span>
          </button>
          <OnlineNow className="hidden md:flex" />
          <MessagesLink />
          <NotificationBell />
          <AccountButton />
          <Link
            href="/share"
            className="pressable hidden h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground sm:inline-flex"
          >
            <PlusIcon aria-hidden className="size-4" />
            Share
          </Link>
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-background/95 backdrop-blur-xl">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col gap-6 overflow-y-auto px-3 pt-14 pb-8">
                {[{ id: "top", label: "", links: [{ href: "/", label: "Home", blurb: "", icon: SparklesIcon, tint: "text-ion" }, ...DIRECT] }, ...MENUS].map((m) => (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    {m.label && <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{m.label}</p>}
                    {m.links.map((n) => {
                      const Icon = n.icon
                      const on = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href + "/"))
                      return (
                        <SheetClose
                          key={n.href}
                          render={<Link href={n.href} />}
                          nativeButton={false}
                          className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium hover:bg-muted", on && "bg-muted")}
                        >
                          <Icon aria-hidden className={cn("size-4", n.tint)} />
                          {n.label}
                        </SheetClose>
                      )
                    })}
                  </div>
                ))}
                <SheetClose render={<Link href="/share" />} nativeButton={false} className="mx-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  <PlusIcon aria-hidden className="size-4" /> Share something
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

/** Direct messages, with the number of unread ones. */
function MessagesLink() {
  const unread = useUnreadMessages()
  return (
    <Link
      href="/messages"
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      className="pressable relative hidden size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground sm:grid"
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
 * Desktop navigation. Hovering a menu opens one shared panel that glides and resizes between menus
 * instead of closing one dropdown and opening another.
 */
function MainNav({ pathname }: { pathname: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [dir, setDir] = useState(0)
  const reduce = useReducedMotion()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const order = MENUS.map((m) => m.id)
  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const show = (id: string) => {
    clearTimeout(closeTimer.current)
    setDir(open ? Math.sign(order.indexOf(id) - order.indexOf(open)) : 0)
    setOpen(id)
  }
  const hide = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(null), 120)
  }
  const menu = MENUS.find((m) => m.id === open)

  return (
    <nav aria-label="Main" className="relative hidden flex-1 justify-center lg:flex" onPointerLeave={hide} onPointerEnter={() => clearTimeout(closeTimer.current)}>
      <ul className="flex items-center gap-0.5">
        {MENUS.map((m) => {
          const current = m.links.some((l) => isOn(l.href))
          return (
            <li key={m.id}>
              <button
                type="button"
                aria-expanded={open === m.id}
                aria-controls="nav-panel"
                onPointerEnter={(e) => e.pointerType === "mouse" && show(m.id)}
                onClick={() => (open === m.id ? setOpen(null) : show(m.id))}
                className={cn(
                  "relative flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150",
                  open === m.id || current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  current && "bg-white/[0.07]"
                )}
              >
                {m.label}
                <ChevronDownIcon aria-hidden className={cn("size-3.5 opacity-60 transition-transform duration-200", open === m.id && "rotate-180")} />
              </button>
            </li>
          )
        })}
        {DIRECT.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              onPointerEnter={hide}
              aria-current={isOn(n.href) ? "page" : undefined}
              className={cn(
                "block rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150",
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
            id="nav-panel"
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px) scale(0.98)" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            style={{ transformOrigin: "top center" }}
            className="absolute top-[calc(100%+12px)] left-1/2 w-[34rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-popover/95 p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(143_180_255/0.06)] backdrop-blur-2xl"
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.ul
                key={menu.id}
                custom={dir}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * 40}px)`, filter: "blur(4px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)", filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * -40}px)`, filter: "blur(4px)" }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="grid grid-cols-2 gap-1"
              >
                {menu.links.map((l) => {
                  const Icon = l.icon
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        prefetch={false}
                        onPointerEnter={() => router.prefetch(l.href)}
                        onFocus={() => router.prefetch(l.href)}
                        aria-current={isOn(l.href) ? "page" : undefined}
                        onClick={() => setOpen(null)}
                        className="group flex items-start gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-white/[0.05] aria-[current=page]:bg-white/[0.06]"
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
