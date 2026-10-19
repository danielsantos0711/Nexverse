"use client"

import Link from "next/link"
import type { Route } from "next"
import { Lockup } from "@/components/brand"
import { useMenus } from "@/lib/menus"
import { useSiteSettings } from "@/lib/site-settings"

export function SiteFooter() {
  const { settings } = useSiteSettings()
  const name = settings.brand.name || "Nexverse"
  // The columns the admins built in /admin/menus (switched-off areas and hidden links already left out).
  const { footer } = useMenus()
  // Extra links the admins added (internal pages only, so the footer never sends anyone away by surprise).
  const extra = settings.footer.links.filter((l) => l.label && l.href.startsWith("/") && !l.href.startsWith("//"))

  return (
    <footer className="relative mt-24 border-t border-border">
      {/* a faint horizon of light along the top edge */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-ion/40 to-transparent" />
      <div className="shell grid gap-12 py-14 md:py-16 lg:grid-cols-[1.3fr_2fr]">
        <div className="flex flex-col gap-5">
          <Link href="/" aria-label={`${name} home`} className="self-start rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Lockup size="lg" alt="" />
          </Link>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">{settings.brand.tagline ? `${settings.brand.tagline}. ` : ""}{settings.brand.description}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/share" className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              Share something
            </Link>
            <Link href="/explore" className="pressable inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-foreground/85 hover:border-white/20 hover:text-foreground">
              Explore
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {footer.map((c) => (
            <nav key={c.id} aria-label={c.label || "Links"} className="flex flex-col gap-2.5 text-sm">
              {c.label && <h2 className="mb-1 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.label}</h2>}
              {c.links.map((l, i) =>
                l.href.startsWith("/") ? (
                  <Link key={`${l.href}-${i}`} href={l.href as Route} className="self-start rounded-sm text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
      <div className="shell flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
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
        <p>Space imagery: NASA, ESA, CSA, STScI and NASA/JPL-Caltech (public domain), graded for this site.</p>
      </div>
    </footer>
  )
}
