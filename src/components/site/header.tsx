"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDownIcon, HomeIcon, MailIcon, MenuIcon, PlusIcon, SearchIcon, ShieldIcon } from "lucide-react"
import { AccountButton } from "@/components/account/account-button"
import { NotificationBell } from "@/components/social/notification-bell"
import { OnlineNow } from "@/components/presence/online-now"
import { useUnreadMessages } from "@/lib/messages"
import { Lockup } from "@/components/brand"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { Button } from "@/components/ui/button"
import { Glass, GlassDefs } from "@/components/glass/glass"
import { GlassKeys } from "@/components/glass/glass-keys"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useRole } from "@/lib/roles"
import { useCopy } from "@/lib/content"
import { iconFor } from "@/components/site/icons"
import { useMenus as useMenuData, type MenuLink } from "@/lib/menus"
import { FEATURES, useSiteSettings, type SiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

type NavLink = { href: string; label: string; blurb: string; icon: string; tint: string }
type NavMenu = { id: string; label: string; links: NavLink[] }

const TINT: Record<string, string> = { ion: "text-ion", gold: "text-gold", model: "text-model", dataset: "text-dataset", tool: "text-tool", repo: "text-repo" }
const toNav = (l: MenuLink): NavLink => ({ href: l.href, label: l.label, blurb: l.description, icon: l.icon, tint: TINT[l.accent] ?? "text-ion" })

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

/** The menus the admins built (lib/menus.ts), with everything they switched off taken out. */
function useMenus() {
  const { settings } = useSiteSettings()
  const data = useMenuData()
  return useMemo(() => {
    const menus = (groups: typeof data.header): NavMenu[] => groups.map((g) => ({ id: g.id, label: g.label, links: g.links.map(toNav) }))
    return {
      menus: menus(data.header),
      mobile: menus(data.mobile),
      direct: data.headerLinks.map(toNav),
      hide: hiddenBy(settings),
      name: settings.brand.name || "Nexverse",
    }
  }, [settings, data])
}

export function SiteHeader() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { menus, mobile, direct, hide, name } = useMenus()
  const { isStaff } = useRole()
  const [scrolled, setScrolled] = useState(false)
  const searchLabel = useCopy("header.search", "Search")
  const shareLabel = useCopy("header.share", "Share")

  // A passive listener that only re-renders when the header crosses the 8px line, never per scroll event.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header className="sticky top-0 z-40 h-16">
      <GlassDefs />
      <div className="shell relative flex h-full items-center gap-3 lg:gap-6">
        {/* Once the page moves, the bar becomes a floating pane of Liquid Glass (refracting at its rim on
            Chromium). It fades in by opacity; the blur covers this 52px strip, never the page. */}
        <Glass
          aria-hidden
          sheen={false}
          refract
          className={cn(
            "pointer-events-none absolute inset-x-[max(0.25rem,calc(var(--gutter)-0.9rem))] inset-y-1.5 rounded-[1.4rem] transition-opacity duration-300",
            scrolled ? "opacity-100" : "opacity-0"
          )}
        />
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
            className="liquid-glass-pill flex h-9 items-center gap-2 px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <SearchIcon aria-hidden className="size-4" />
            <span className="hidden xl:inline">{searchLabel}</span>
            <GlassKeys keys={["mod", "K"]} className="hidden xl:inline-flex" />
            <span className="sr-only xl:hidden">{searchLabel}</span>
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
          <Link href="/share" className="halo-btn max-sm:hidden">
            <PlusIcon aria-hidden className="size-4" />
            {shareLabel}
          </Link>
          <MobileMenu pathname={pathname} menus={mobile} direct={direct} isStaff={isStaff} name={name} />
        </div>
      </div>
    </header>
  )
}

/** The menu sheet for phones and tablets: the lockup, then every place in its group, then the two things to do. */
function MobileMenu({ pathname, menus, direct, isStaff, name }: { pathname: string; menus: NavMenu[]; direct: NavLink[]; isStaff: boolean; name: string }) {
  const groups: NavMenu[] = [{ id: "top", label: "", links: [{ href: "/", label: "Home", blurb: "", icon: "house", tint: "text-ion" }, ...direct] }, ...menus]
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" className="liquid-glass-strong w-[min(22rem,88vw)] rounded-l-3xl border-y-0 border-r-0">
        <SheetTitle className="sr-only">{name} menu</SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Lockup size="sm" alt={name} />
        </div>
        <nav aria-label="Menu" className="flex flex-col gap-6 overflow-y-auto px-3 pt-2 pb-8">
          {groups.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5">
              {m.label && <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.label}</p>}
              {m.links.map((n, i) => {
                const Icon = iconFor(n.icon, HomeIcon)
                const on = isOnPath(pathname, n.href)
                return (
                  <SheetClose
                    key={`${n.href}-${i}`}
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
function MainNav({ pathname, menus, direct }: { pathname: string; menus: NavMenu[]; direct: NavLink[] }) {
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
      <ul className="liquid-glass flex items-center gap-1 rounded-full p-1">
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
            // Liquid Glass with a dense fill: readable over anything, and at the low quality tiers it turns solid
            className="liquid-glass-strong absolute top-[calc(100%+12px)] left-1/2 w-[36rem] -translate-x-1/2 overflow-hidden rounded-3xl p-2"
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
                {menu.links.map((l, i) => {
                  const Icon = iconFor(l.icon)
                  return (
                    <li key={`${l.href}-${i}`}>
                      <Link
                        href={l.href as Route}
                        prefetch={false}
                        onPointerEnter={() => l.href.startsWith("/") && router.prefetch(l.href)}
                        onFocus={() => l.href.startsWith("/") && router.prefetch(l.href)}
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
