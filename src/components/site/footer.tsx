"use client"

import Link from "next/link"
import type { Route } from "next"
import { Lockup } from "@/components/brand"
import { FEATURES, useSiteSettings } from "@/lib/site-settings"

/** Every link here is a page that exists; areas the admins switch off drop out of the footer too. */
const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Hub", links: [["Models", "/models"], ["Datasets", "/datasets"], ["Tools", "/tools"], ["Repos", "/repos"], ["Trending now", "/trending"], ["Papers", "/papers"], ["GitHub topics", "/gh/topics"]] },
  { title: "Community", links: [["Forum", "/forum"], ["Chat rooms", "/chat"], ["News", "/news"], ["Events", "/events"], ["Missions", "/missions"], ["Arena", "/arena"], ["Leaderboard", "/leaderboard"]] },
  { title: "Create", links: [["Publish a project", "/new/project"], ["Share a link", "/share"], ["Start a thread", "/forum/new"], ["Your studio", "/studio"], ["Lab", "/lab"], ["Collections", "/collections"]] },
  { title: "You", links: [["Your page", "/you"], ["For you", "/for-you"], ["Saved", "/saved"], ["Notifications", "/notifications"], ["Settings", "/settings"]] },
]

export function SiteFooter() {
  const { settings } = useSiteSettings()
  const name = settings.brand.name || "Nexverse"
  const off = FEATURES.filter((f) => f.key !== "ai" && settings.features[f.key] === false).map((f) => f.href)
  const hidden = (href: string) => settings.nav.hidden.includes(href) || off.some((h) => href === h || href.startsWith(h + "/"))
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
          {COLUMNS.map((c) => {
            const links = c.links.filter(([, href]) => !hidden(href))
            if (!links.length) return null
            return (
              <nav key={c.title} aria-label={c.title} className="flex flex-col gap-2.5 text-sm">
                <h2 className="mb-1 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.title}</h2>
                {links.map(([label, href]) => (
                  <Link key={href} href={href as Route} className="self-start rounded-sm text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {label}
                  </Link>
                ))}
              </nav>
            )
          })}
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
