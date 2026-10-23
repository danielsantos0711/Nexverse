"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ChevronDownIcon, HomeIcon, MailIcon, MenuIcon, PlusIcon, SearchIcon, ShieldIcon } from "lucide-react"
import { AccountButton } from "@/components/account/account-button"
import { NotificationBell } from "@/components/social/notification-bell"
import { OnlineNow } from "@/components/presence/online-now"
import { useUnreadMessages } from "@/lib/messages"
import { Lockup } from "@/components/brand"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { Button } from "@/components/ui/button"
import { GlassDefs } from "@/components/glass/glass"
import { CreateSheet, openCreate } from "@/components/site/create-sheet"
import { GO_KEYS, isTyping } from "@/components/site/shortcuts"
import { Toaster } from "@/components/site/toaster"
import { shortcutsOn, UiPrefsApplier, useUiPrefs } from "@/components/settings/ui-prefs"
import { usePhoneBar, useScrollFacts } from "@/components/motion/scroll-state"
import { GlassKeys } from "@/components/glass/glass-keys"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useRole } from "@/lib/roles"
import { useCopy } from "@/lib/content"
import { iconFor } from "@/components/site/icons"
import { useMenus as useMenuData, type MenuLink } from "@/lib/menus"
import { FEATURES, useSiteSettings, type SiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

type NavLink = { href: string; label: string; blurb: string; icon: string; tint: string; section?: string }
type NavMenu = { id: string; label: string; blurb?: string; links: NavLink[] }

const TINT: Record<string, string> = { ion: "text-ion", gold: "text-gold", model: "text-model", dataset: "text-dataset", tool: "text-tool", repo: "text-repo" }
const toNav = (l: MenuLink): NavLink => ({ href: l.href, label: l.label, blurb: l.description, icon: l.icon, tint: TINT[l.accent] ?? "text-ion", section: l.section })

/** A group's links under their sub-headings, in the order the sub-headings first appear. */
function sectionsOf(links: NavLink[]): { title: string; links: NavLink[] }[] {
  const out: { title: string; links: NavLink[] }[] = []
  for (const l of links) {
    const title = l.section ?? ""
    const s = out.find((x) => x.title === title)
    if (s) s.links.push(l)
    else out.push({ title, links: [l] })
  }
  return out
}

type Section = { title: string; links: NavLink[] }

/**
 * Lays a menu's sub-headings out in two columns with no hole under the shorter one (Daniel, round 12b: "ha um
 * espaco muito grande nas categorias"). Each sub-heading goes to whichever column is shorter so far; when that
 * still leaves one column much longer, the last sub-heading runs full width under both, its links side by side.
 * Heights are counted in link rows, a sub-heading line being about half a row.
 */
function layoutOf(sections: Section[]): { cols: [Section[], Section[]]; wide: Section | null } {
  const size = (s: Section) => s.links.length + (s.title ? 0.55 : 0)
  const pack = (list: Section[]) => {
    const cols: [Section[], Section[]] = [[], []]
    const h = [0, 0]
    for (const s of list) {
      const i = h[1] < h[0] ? 1 : 0
      cols[i].push(s)
      h[i] += size(s)
    }
    return { cols, h }
  }
  const score = (h: number[], extra = 0) => Math.max(h[0], h[1]) + extra + 0.3 * Math.abs(h[0] - h[1])
  const a = pack(sections)
  if (sections.length < 3) return { cols: a.cols, wide: null }
  const last = sections[sections.length - 1]
  const b = pack(sections.slice(0, -1))
  const wideH = Math.ceil(last.links.length / 2) + (last.title ? 0.55 : 0)
  return score(b.h, wideH) < score(a.h) ? { cols: b.cols, wide: last } : { cols: a.cols, wide: null }
}

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
    const menus = (groups: typeof data.header): NavMenu[] => groups.map((g) => ({ id: g.id, label: g.label, blurb: g.blurb, links: g.links.map(toNav) }))
    return {
      menus: menus(data.header),
      mobile: menus(data.mobile),
      direct: data.headerLinks.map(toNav),
      hide: hiddenBy(settings),
      name: settings.brand.name || "Nexverse",
    }
  }, [settings, data])
}

/**
 * The site-wide keys: / opens search, G then a letter jumps to a place (GO_KEYS), J and K move through the page's
 * list. C (create) lives in the sheet.
 */
function useSiteShortcuts(openSearch: () => void) {
  const router = useRouter()
  useEffect(() => {
    let g = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || !shortcutsOn()) return
      const k = e.key.toLowerCase()
      if (k === "/") {
        e.preventDefault()
        openSearch()
        return
      }
      // J and K walk the page's main list (any element marked data-nav-item); Enter opens the focused one.
      if (k === "j" || k === "k") {
        const items = [...document.querySelectorAll<HTMLElement>("[data-nav-item]")].filter((el) => el.offsetParent !== null)
        if (!items.length) return
        e.preventDefault()
        const at = items.indexOf(document.activeElement as HTMLElement)
        const next = items[at < 0 ? (k === "j" ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, at + (k === "j" ? 1 : -1)))]
        next.focus({ preventScroll: true })
        next.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
        return
      }
      if (g && Date.now() - g < 900) {
        g = 0
        const to = GO_KEYS.find((x) => x.key === k)
        if (to) {
          e.preventDefault()
          router.push(to.href as Route)
        }
        return
      }
      if (k === "g") g = Date.now()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openSearch, router])
}

export function SiteHeader() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { menus, mobile, direct, hide, name } = useMenus()
  const { isStaff } = useRole()
  const searchLabel = useCopy("header.search", "Search")
  const createLabel = useCopy("header.create", "Create")
  useSiteShortcuts(openSearch)
  const away = useHeaderAway()
  const scrolled = !useScrollFacts().atTop

  return (
    // No bar and no box behind the logo (Daniel, after round 12b: "gostava mais sem a barra longa... nem fundo no
    // logotipo"). The menu and the tools on the right are their own glass pills; once the page moves, a very soft
    // fade of the page colour (masked, so it has no edge) sits behind the whole header area and the logo carries its own
    // soft shadow, so it reads over anything. The header slides away while you read down and comes back when you
    // scroll up; on phones it takes turns with the tab bar so only one bar is ever on screen
    // (src/components/motion/scroll-state.ts).
    <header data-away={away ? "" : undefined} className="nx-header nx-bar-slide sticky top-0 z-40 h-16" onFocusCapture={(e) => headerFocus.set((e.target as Element).matches(":focus-visible"))} onBlurCapture={() => headerFocus.set(false)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,var(--background)_0%,color-mix(in_oklab,var(--background)_92%,transparent)_42%,color-mix(in_oklab,var(--background)_50%,transparent)_70%,transparent_100%)] backdrop-blur-[10px] [mask-image:linear-gradient(180deg,#000_55%,transparent)] [:root[data-glass=low]_&]:backdrop-filter-none [:root[data-glass=off]_&]:backdrop-filter-none opacity-0 transition-opacity duration-(--dur-slow)",
          // it is taller than the header, so it leaves with it
          scrolled && !away && "opacity-100"
        )}
      />
      <GlassDefs />
      <div className="shell relative flex h-full items-center gap-3 lg:gap-6">
        <Link
          href="/"
          aria-label={`${name} home`}
          className={cn(
            "pressable relative -mx-1.5 flex shrink-0 items-center rounded-full px-1.5 py-1 transition-[filter] duration-(--dur-slow) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            // a soft shadow on the metal itself, no shape behind it
            scrolled && "[filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.7))_drop-shadow(0_0_10px_rgb(0_0_0/0.55))] [:root.light_&]:[filter:drop-shadow(0_0_8px_rgb(255_255_255/0.9))]"
          )}
        >
          <Lockup size="sm" priority alt="" className="sm:hidden" />
          <Lockup size="md" priority alt="" className="hidden sm:flex" />
        </Link>

        <MainNav pathname={pathname} menus={menus} direct={direct} />

        <div className={cn("relative ml-auto flex items-center gap-1.5 rounded-full transition-[background-color,box-shadow,padding] duration-(--dur-slow) sm:gap-2 lg:ml-0", scrolled && "liquid-glass p-1")}>
          <button
            type="button"
            onClick={openSearch}
            aria-keyshortcuts="Control+K Meta+K /"
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
          {/* the halo button sets its own display, so the phone rule sits on a wrapper (the tab bar has Create) */}
          <span className="contents max-sm:hidden">
            <button type="button" onClick={openCreate} className="halo-btn" aria-keyshortcuts="c">
              <PlusIcon aria-hidden className="size-4" />
              {createLabel}
            </button>
          </span>
          <MobileMenu pathname={pathname} menus={mobile} direct={direct} isStaff={isStaff} name={name} />
        </div>
      </div>
      <CreateSheet />
      <Toaster />
      <UiPrefsApplier />
    </header>
  )
}

/** Whether keyboard focus is inside the header (someone tabbing through the menus): it never slides away from them. */
const headerFocus = (() => {
  let on = false
  const ls = new Set<() => void>()
  return {
    set(v: boolean) {
      if (v === on) return
      on = v
      ls.forEach((l) => l())
    },
    subscribe(l: () => void) {
      ls.add(l)
      return () => ls.delete(l)
    },
    get: () => on,
  }
})()

/**
 * When the header steps aside. Phones and tablets: whenever the tab bar has the screen (usePhoneBar). Desktop:
 * while reading down, unless the member pinned it (Settings › Your experience), and never while focus is in it.
 */
function useHeaderAway() {
  const { header } = useUiPrefs()
  const facts = useScrollFacts()
  const phoneBar = usePhoneBar(header === "pinned")
  const focused = useSyncExternalStore(headerFocus.subscribe, headerFocus.get, () => false)
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)")
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  if (focused) return false
  if (!wide) return phoneBar === "tabs"
  return header !== "pinned" && facts.dir === "down" && !facts.atTop
}

/**
 * The menu sheet for phones and tablets: the same groups, icons and one-line descriptions as the desktop panel,
 * so nothing is phone-only or desktop-only. Rows rise in one after another; Create and Search sit at the top.
 */
function MobileMenu({ pathname, menus, direct, isStaff, name }: { pathname: string; menus: NavMenu[]; direct: NavLink[]; isStaff: boolean; name: string }) {
  const openSearch = useOpenCommandMenu()
  const groups: NavMenu[] = [{ id: "top", label: "", links: [{ href: "/", label: "Home", blurb: "", icon: "house", tint: "text-ion" }, ...direct] }, ...menus]
  const here = menus.find((m) => m.links.some((l) => isOnPath(pathname, l.href.split(/[?#]/)[0])))?.id ?? menus[0]?.id ?? null
  const [openGroup, setOpenGroup] = useState<string | null>(here)
  // a new page opens the group it belongs to
  const [openedFor, setOpenedFor] = useState(pathname)
  if (openedFor !== pathname) {
    setOpenedFor(pathname)
    setOpenGroup(here)
  }
  let row = 0
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" className="liquid-glass-strong w-[min(23rem,90vw)] rounded-l-3xl border-y-0 border-r-0">
        <SheetTitle className="sr-only">{name} menu</SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Lockup size="sm" alt={name} />
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pt-4">
          <SheetClose
            render={<button type="button" onClick={openCreate} />}
            className="pressable inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-medium text-primary-foreground"
          >
            <PlusIcon aria-hidden className="size-4" /> Create
          </SheetClose>
          <SheetClose
            render={<button type="button" onClick={openSearch} />}
            className="pressable liquid-glass-pill inline-flex h-11 items-center justify-center gap-1.5 text-sm font-medium"
          >
            <SearchIcon aria-hidden className="size-4" /> Search
          </SheetClose>
        </div>
        <nav aria-label="Menu" className="flex flex-col gap-2 overflow-y-auto px-3 pt-4 pb-8">
          {groups.map((m) => {
            // one group open at a time (the one you are in, at first), so the sheet stays short
            const expanded = !m.label || openGroup === m.id
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                {m.label && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenGroup(expanded ? null : m.id)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{m.label}</span>
                      {m.blurb && <span className="text-xs text-muted-foreground">{m.blurb}</span>}
                    </span>
                    <ChevronDownIcon aria-hidden className={cn("size-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
                  </button>
                )}
                {expanded &&
                  sectionsOf(m.links).map((s) => (
                    <div key={s.title || "links"} className="flex flex-col gap-0.5">
                      {s.title && <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{s.title}</p>}
                      {s.links.map((n, i) => {
                        const Icon = iconFor(n.icon, HomeIcon)
                        const on = isOnPath(pathname, n.href)
                        return (
                          <SheetClose
                            key={`${n.href}-${i}`}
                            render={<Link href={n.href as Route} aria-current={on ? "page" : undefined} />}
                            nativeButton={false}
                            style={{ "--i": row++ } as React.CSSProperties}
                            className={cn(
                              "nx-enter group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-ring active:bg-white/[0.07]",
                              on && "bg-white/[0.06] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-ion"
                            )}
                          >
                            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/10 transition-transform duration-(--dur-base) group-active:scale-95", n.tint)}>
                              <Icon aria-hidden className="size-4" />
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="text-[15px] font-medium">{n.label}</span>
                              {n.blurb && <span className="truncate text-xs text-muted-foreground">{n.blurb}</span>}
                            </span>
                          </SheetClose>
                        )
                      })}
                    </div>
                  ))}
              </div>
            )
          })}
          {isStaff && (
            <SheetClose
              render={<Link href={ADMIN} />}
              nativeButton={false}
              className="mx-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-gold/30 text-sm font-medium text-gold"
            >
              <ShieldIcon aria-hidden className="size-4" /> Admin
            </SheetClose>
          )}
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
    panel.current?.querySelector<HTMLAnchorElement>("ul a")?.focus()
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
  const [hot, setHot] = useState<string | null>(null)

  function onPanelKey(e: React.KeyboardEvent) {
    const links = [...(panel.current?.querySelectorAll<HTMLAnchorElement>("ul a") ?? [])]
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    // links run down each sub-heading, then on to the next one: Down/Right go forward, Up/Left back
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
    if (!step || i < 0) return
    e.preventDefault()
    links[Math.min(links.length - 1, Math.max(0, i + step))]?.focus()
  }

  return (
    <nav
      aria-label="Main"
      className="relative hidden flex-1 justify-center lg:flex"
      onPointerLeave={() => {
        hide()
        setHot(null)
      }}
      onPointerEnter={() => clearTimeout(closeTimer.current)}
    >
      <ul className="liquid-glass flex items-center gap-1 rounded-full p-1">
        {menus.map((m) => {
          const current = m.links.some((l) => isOn(l.href))
          const lit = (hot ?? open) === m.id || (!hot && !open && current)
          return (
            <li key={m.id} className="relative" onPointerEnter={() => setHot(m.id)}>
              {/* one highlight that glides to whichever menu the pointer is on (transform only, via layout) */}
              {lit && <motion.span layoutId="nav-hot" aria-hidden transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} className="absolute inset-0 rounded-full bg-white/[0.08]" />}
              <button
                ref={(el) => {
                  triggers.current[m.id] = el
                }}
                data-nav-trigger
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
                  open === m.id || current ? "text-foreground" : "text-muted-foreground hover:text-foreground"
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
            className="liquid-glass-strong absolute top-[calc(100%+12px)] left-1/2 w-[38rem] -translate-x-1/2 overflow-hidden rounded-3xl"
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={menu.id}
                custom={dir}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * 32}px)` }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateX(${dir * -32}px)` }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="flex flex-col gap-3 p-3"
              >
                {/* Short sub-headings with two to four links each, packed into two even columns (layoutOf). */}
                {(() => {
                  let n = 0
                  const { cols, wide } = layoutOf(sectionsOf(menu.links))
                  const block = (s: Section, two = false) => (
                    <div key={s.title || "links"} className="flex min-w-0 flex-col">
                      {s.title && <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{s.title}</p>}
                      <ul aria-label={s.title || menu.label} className={cn("grid", two ? "grid-cols-2 gap-x-2" : "grid-cols-1")}>
                        {s.links.map((l, i) => {
                          const Icon = iconFor(l.icon)
                          return (
                            <li key={`${l.href}-${i}`} className="nx-enter min-w-0" style={{ "--i": n++ } as React.CSSProperties}>
                              <Link
                                href={l.href as Route}
                                prefetch={false}
                                onPointerEnter={() => l.href.startsWith("/") && router.prefetch(l.href)}
                                onFocus={() => l.href.startsWith("/") && router.prefetch(l.href)}
                                aria-current={isOn(l.href) ? "page" : undefined}
                                onClick={() => setOpen(null)}
                                className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors duration-(--dur-fast) hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.98] aria-[current=page]:bg-white/[0.06]"
                              >
                                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/10 transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-110 group-hover:-rotate-6", l.tint)}>
                                  <Icon aria-hidden className="size-4" />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                  <span className="text-sm font-medium">{l.label}</span>
                                  {l.blurb && <span className="truncate text-xs text-muted-foreground">{l.blurb}</span>}
                                </span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-2">
                        {cols.map((c, i) => (
                          <div key={i} className="flex min-w-0 flex-col gap-3">
                            {c.map((s) => block(s))}
                          </div>
                        ))}
                      </div>
                      {wide && block(wide, true)}
                    </>
                  )
                })()}
              </motion.div>
            </AnimatePresence>
            <div aria-hidden className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-2 text-xs text-muted-foreground">
              {menu.blurb && <span className="truncate">{menu.blurb}</span>}
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
                <GlassKeys keys={["/"]} live={false} /> search
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <GlassKeys keys={["C"]} live={false} /> create
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
