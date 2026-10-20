"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CompassIcon, HomeIcon, MessageSquareIcon, PlusIcon, SearchIcon, type LucideIcon } from "lucide-react"
import { Glass } from "@/components/glass/glass"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { useCopy } from "@/lib/content"
import { isLinkVisible, useSiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

/*
 * The phone's tab bar: a floating capsule of Liquid Glass at the bottom of the screen, with the four places
 * people go most and Share in the middle. It slides away while you scroll down to read and comes back when you
 * scroll up (transform only). Phones and tablets; the desktop has the header.
 */

const isOn = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"))

export function MobileTabBar() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { settings } = useSiteSettings()
  const [hidden, setHidden] = useState(false)
  const home = useCopy("tabbar.home", "Home")
  const explore = useCopy("tabbar.explore", "Explore")
  const share = useCopy("tabbar.share", "Share")
  const forum = useCopy("tabbar.forum", "Forum")
  const search = useCopy("tabbar.search", "Search")

  // One passive listener; state changes only when the direction flips.
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setHidden(y > last && y > 120)
      last = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/", label: home, icon: HomeIcon },
    { href: "/explore", label: explore, icon: CompassIcon },
    { href: "/forum", label: forum, icon: MessageSquareIcon },
  ].filter((l) => isLinkVisible(settings, l.href))
  const [first, second, third] = links

  const item = (l: (typeof links)[number]) => {
    const on = isOn(pathname, l.href)
    return (
      <Link
        key={l.href}
        href={l.href as Route}
        aria-current={on ? "page" : undefined}
        className={cn(
          "flex h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          on ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <l.icon aria-hidden className={cn("size-5", on && "text-ion drop-shadow-[0_0_6px_rgb(143_180_255/0.7)]")} />
        {l.label}
      </Link>
    )
  }

  return (
    <nav
      aria-label="Quick links"
      className={cn(
        "fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:hidden",
        hidden && "translate-y-[calc(100%+1.5rem)]"
      )}
    >
      <Glass variant="panel" refract className="flex w-full max-w-md items-center gap-1 rounded-full p-1.5">
        {first && item(first)}
        {second && item(second)}
        <Link href="/share" aria-label={share} className="halo-btn mx-1 size-12 shrink-0 px-0">
          <PlusIcon aria-hidden className="size-5" />
        </Link>
        {third && item(third)}
        <button
          type="button"
          onClick={openSearch}
          className="flex h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <SearchIcon aria-hidden className="size-5" />
          {search}
        </button>
      </Glass>
    </nav>
  )
}
