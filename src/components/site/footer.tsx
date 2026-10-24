"use client"

import Link from "next/link"
import type { Route } from "next"
import { Lockup } from "@/components/brand"
import { useMenus } from "@/lib/menus"
import { useSiteSettings } from "@/lib/site-settings"
import { Copy } from "@/components/content/copy"
import { MobileTabBar } from "@/components/site/mobile-tab-bar"
import { openCreate } from "@/components/site/create-sheet"
import { iconFor } from "@/components/site/icons"
import { ArrowRightIcon, PlusIcon } from "lucide-react"

export function SiteFooter() {
  const { settings } = useSiteSettings()
  const name = settings.brand.name || "Nexverse"
  // The columns the admins built in /admin/menus (switched-off areas and hidden links already left out).
  const { footer } = useMenus()
  // Extra links the admins added (internal pages only, so the footer never sends anyone away by surprise).
  const extra = settings.footer.links.filter((l) => l.label && l.href.startsWith("/") && !l.href.startsWith("//"))

  return (
    // Bottom padding on phones keeps the last line clear of the floating tab bar.
    <footer className="relative mt-24 border-t border-border pb-24 lg:pb-0">
      {/* a faint horizon of light along the top edge */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-ion/40 to-transparent" />
      <div className="shell grid gap-12 py-14 md:py-16 lg:grid-cols-[1.3fr_2fr]">
        <div className="flex flex-col gap-5">
          <Link href="/" aria-label={`${name} home`} className="self-start rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Lockup size="lg" alt="" />
          </Link>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">{settings.brand.tagline ? `${settings.brand.tagline}. ` : ""}{settings.brand.description}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openCreate} className="halo-btn">
              <PlusIcon aria-hidden className="size-4" />
              <Copy k="footer.cta.share">Create something</Copy>
            </button>
            {/* HorizonX Interactive Hover Button (see .hx-hover-btn) */}
            <Link href="/explore" className="hx-hover-btn">
              <span aria-hidden className="hx-dot" />
              <span className="hx-label">
                <Copy k="footer.cta.explore">Explore the map</Copy>
              </span>
              <span aria-hidden className="hx-label-hover">
                Explore the map <ArrowRightIcon className="size-4" />
              </span>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {footer.map((c) => (
            <nav key={c.id} aria-label={c.label || "Links"} className="flex flex-col gap-2.5 text-sm">
              {c.label && <h2 className="mb-1 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.label}</h2>}
              {c.links.map((l, i) =>
                l.href.startsWith("/") ? (
                  <Link key={`${l.href}-${i}`} href={l.href as Route} className="group inline-flex items-center gap-2 self-start rounded-sm text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {(() => {
                      const Icon = iconFor(l.icon)
                      return <Icon aria-hidden className="size-3.5 text-muted-foreground transition-[color,transform] duration-(--dur-base) group-hover:-translate-y-px group-hover:text-ion" />
                    })()}
                    {l.label}
                  </Link>
                ) : (
                  <a key={`${l.href}-${i}`} href={l.href} target="_blank" rel="noopener noreferrer" className="self-start rounded-sm text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {l.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )
              )}
            </nav>
          ))}
        </div>
      </div>
      {/* The closing rule sits inside the gutter, aligned with the columns above it rather than the shell's padding. */}
      <div className="shell">
        <div className="flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {name}
            {settings.footer.note ? ` · ${settings.footer.note}` : ""}
          </p>
          {extra.length > 0 && (
            <nav aria-label="More" className="flex flex-wrap gap-x-4 gap-y-1">
              {extra.map((l) => (
                <Link key={l.href + l.label} href={l.href as Route} className="hover:text-foreground">
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          <p>
            <Copy k="footer.credit">Space imagery: NASA, ESA, CSA, STScI and NASA/JPL-Caltech (public domain), graded for this site.</Copy>
          </p>
        </div>
      </div>
      <MobileTabBar />
    </footer>
  )
}
