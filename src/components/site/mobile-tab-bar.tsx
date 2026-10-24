"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { motion, useReducedMotion } from "motion/react"
import { CompassIcon, HomeIcon, MessageSquareIcon, PlusIcon, UserIcon, type LucideIcon } from "lucide-react"
import { openCreate } from "@/components/site/create-sheet"
import { usePhoneBar } from "@/components/motion/scroll-state"
import { useUiPrefs } from "@/components/settings/ui-prefs"
import { useCopy } from "@/lib/content"
import { useSession } from "@/lib/store"
import { isLinkVisible, useSiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

/*
 * The phone's tab bar: a floating capsule of plain blur at the bottom of the screen, with the four places people
 * go most and Create in the middle (the same sheet as the header's Create button). The current tab carries a
 * light that glides between tabs, like the highlight in the desktop menu. It takes turns with the header so only
 * one bar is ever on screen (Daniel, round 11): the header at the top and while scrolling up, this bar while
 * reading down and at the end of a page (usePhoneBar). Transform only. Phones and tablets; the desktop has the header.
 */

const noop = () => () => {}
const isOn = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"))

export function MobileTabBar() {
  // The lit tab is chosen in the browser only: the home page's prerendered shell on Vercel does not carry "/" as its
  // path, so lighting it on the server made hydration fail there and React rebuilt the whole page.
  const pathname = usePathname()
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const { settings } = useSiteSettings()
  const { user } = useSession()
  const reduce = useReducedMotion()
  const { header } = useUiPrefs()
  const hidden = usePhoneBar(header === "pinned") !== "tabs"
  const home = useCopy("tabbar.home", "Home")
  const explore = useCopy("tabbar.explore", "Explore")
  const create = useCopy("tabbar.create", "Create")
  const forum = useCopy("tabbar.forum", "Forum")
  const you = useCopy("tabbar.you", "You")
  const signIn = useCopy("tabbar.sign-in", "Sign in")

  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/", label: home, icon: HomeIcon },
    { href: "/explore", label: explore, icon: CompassIcon },
    { href: "/forum", label: forum, icon: MessageSquareIcon },
    user ? { href: "/you", label: you, icon: UserIcon } : { href: "/sign-in", label: signIn, icon: UserIcon },
  ].filter((l) => isLinkVisible(settings, l.href))
  const [first, second, third, fourth] = links

  const item = (l: (typeof links)[number]) => {
    const on = hydrated && isOn(pathname, l.href)
    return (
      <Link
        key={l.href}
        href={l.href as Route}
        aria-current={on ? "page" : undefined}
        className={cn(
          "relative flex h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] transition-[color,transform] duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-ring active:scale-95",
          on ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {on && <motion.span layoutId="tab-on" aria-hidden transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.2 }} className="absolute inset-0 rounded-full bg-white/[0.07]" />}
        <l.icon aria-hidden className={cn("relative size-5", on && "text-ion drop-shadow-[0_0_6px_rgb(143_180_255/0.7)]")} />
        <span className="relative">{l.label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Quick links"
      data-away={hidden ? "" : undefined}
      inert={hidden}
      className="nx-tabbar nx-bar-slide fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:hidden"
    >
      <div className="liquid-glass flex w-full max-w-md items-center gap-1 rounded-full p-1.5">
        {first && item(first)}
        {second && item(second)}
        <button type="button" onClick={openCreate} aria-label={create} className="halo-btn mx-1 size-12 shrink-0 px-0">
          <PlusIcon aria-hidden className="size-5" />
        </button>
        {third && item(third)}
        {fourth && item(fourth)}
      </div>
    </nav>
  )
}
