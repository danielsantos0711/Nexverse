"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useMotionValueEvent, useScroll } from "motion/react"
import { useState } from "react"
import { MenuIcon, PlusIcon, SearchIcon } from "lucide-react"
import { AccountButton } from "@/components/account/account-button"
import { Lockup } from "@/components/brand"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/models", label: "Models" },
  { href: "/datasets", label: "Datasets" },
  { href: "/tools", label: "Tools" },
  { href: "/repos", label: "Repos" },
  { href: "/forum", label: "Forum" },
  { href: "/news", label: "News" },
  { href: "/constellations", label: "Constellations" },
  { href: "/people", label: "People" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const openSearch = useOpenCommandMenu()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8))
  const active = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.href

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 border-b transition-[background-color,border-color] duration-300",
        scrolled ? "border-border bg-background/70 backdrop-blur-xl" : "border-transparent bg-transparent"
      )}
    >
      <div className="shell flex h-full items-center gap-4">
        <Link href="/" className="pressable -m-1.5 flex shrink-0 items-center gap-2 rounded-md p-1.5" aria-label="Nexverse home">
          <Lockup />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 justify-center xl:flex" onPointerLeave={() => setHover(null)}>
          <ul className="flex items-center">
            {NAV.map((n) => {
              const on = (hover ?? active) === n.href
              return (
                <li key={n.href} className="relative">
                  {on && (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden
                      className={cn("absolute inset-0 rounded-full", hover ? "bg-white/[0.06]" : "bg-white/[0.09]")}
                      transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                    />
                  )}
                  <Link
                    href={n.href}
                    onPointerEnter={() => setHover(n.href)}
                    aria-current={active === n.href ? "page" : undefined}
                    className={cn(
                      "relative block rounded-full px-3 py-1.5 text-sm transition-colors duration-150",
                      active === n.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
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
          <AccountButton />
          <Link
            href="/share"
            className="pressable hidden h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground sm:inline-flex"
          >
            <PlusIcon aria-hidden className="size-4" />
            Share
          </Link>
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-background/95 backdrop-blur-xl">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <ul className="flex flex-col gap-0.5 px-3 pt-14">
                {[{ href: "/", label: "Home" }, { href: "/explore", label: "Explore" }, ...NAV, { href: "/share", label: "Share something" }].map((n) => (
                  <li key={n.href}>
                    <SheetClose
                      render={<Link href={n.href} />}
                      nativeButton={false}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 text-lg font-medium hover:bg-muted",
                        (active === n.href || pathname === n.href) && "bg-muted"
                      )}
                    >
                      {n.label}
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
