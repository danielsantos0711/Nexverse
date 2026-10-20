"use client"

import Link from "next/link"
import type { Route } from "next"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { ArrowRightIcon, SearchIcon } from "lucide-react"
import { HeroStage } from "@/components/hero/hero-stage"
import { CountUp } from "@/components/hub/motion"
import { loadCounts, useLoad, type HubCounts } from "@/components/home/hub-data"
import { Kbd } from "@/components/ui/kbd"
import { useBlock, useCopy } from "@/lib/content"
import { useQuality } from "@/lib/perf"
import { DEFAULTS, useSiteSettings } from "@/lib/site-settings"

const EASE = [0.23, 1, 0.32, 1] as const
const DEFAULT_SUBTITLE = "Publish models, datasets, tools and repos, ask in a forum that speaks your language, and build alongside people who care about AI."
const WORDS = [{ word: "builders." }, { word: "researchers." }, { word: "makers." }, { word: "students." }]

/**
 * The home page's first screen: the brand film (the official N in its galaxy) with the places of the site
 * orbiting the N as links, then one short headline, search and the way in.
 *
 * Every word is editable (content keys "home.hero.*"); the admins' hero settings (Admin → Site) are the
 * defaults those keys fall back to. The admins' hero effect: "galaxy" plays the film and turns the orbit,
 * "orbit" keeps the film still and turns the orbit, "still" holds both. The site's motion level "calm" slows
 * the orbit; "off", the visitor's reduced motion and the "off" quality tier hold everything still.
 */
export function Hero() {
  const { settings } = useSiteSettings()
  const quality = useQuality()
  const effect = settings.theme.heroEffect
  const still = quality === "off"
  const hero = settings.hero

  const badge = useCopy("home.hero.badge", hero.badge.trim() || DEFAULTS.hero.badge)
  const titleLead = useCopy("home.hero.title.lead", "The open universe")
  const titleAccent = useCopy("home.hero.title.accent", "for AI")
  const words = useBlock("home.hero.words", WORDS)
    .map((w) => w.word?.trim())
    .filter(Boolean)
  const subtitle = useCopy("home.hero.subtitle", hero.subtitle.trim() || DEFAULT_SUBTITLE)
  const placeholder = useCopy("home.hero.search", "Search models, datasets, tools, threads…")
  const primaryLabel = useCopy("home.hero.primary", hero.primaryLabel.trim() || DEFAULTS.hero.primaryLabel)
  const secondaryLabel = useCopy("home.hero.secondary", "Ask the community")
  const primaryHref = (hero.primaryHref.trim().startsWith("/") ? hero.primaryHref.trim() : DEFAULTS.hero.primaryHref) as Route

  const rise = (delay: number) =>
    still
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(14px)" },
          animate: { opacity: 1, transform: "translateY(0px)" },
          transition: { duration: 0.8, delay, ease: EASE },
        }

  return (
    <section aria-labelledby="hero-h" className="relative isolate -mt-16 flex flex-col overflow-hidden">
      <HeroStage
        film={!still && effect === "galaxy"}
        orbit={!still && effect !== "still"}
        slow={settings.theme.motion === "calm" ? 2 : 1}
        className="h-[var(--stage-h)] [--stage-h:clamp(25rem,62svh,46rem)] max-sm:[--stage-h:clamp(24rem,54svh,30rem)]"
      />

      <div className="shell relative z-10 -mt-14 flex flex-col items-center pb-14 text-center sm:-mt-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-5">
          <motion.p {...rise(0.05)} className="inline-flex items-center gap-2 rounded-full border border-border bg-[#080a10]/80 px-3 py-1 text-xs text-muted-foreground">
            <span className="pulse-dot" aria-hidden /> {badge}
          </motion.p>
          <motion.h1 {...rise(0.12)} id="hero-h" className="text-[clamp(1.85rem,1.35rem+1.6vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance">
            {hero.title.trim() ? (
              <span className="chrome-text">{hero.title.trim()}</span>
            ) : (
              <>
                <span className="chrome-text">{titleLead} </span>
                <span className="ion-text">{titleAccent} </span>
                {words.length > 0 && <RotatingWord words={words} still={still} />}
              </>
            )}
          </motion.h1>
          <motion.p {...rise(0.2)} className="max-w-[54ch] text-[15px] leading-relaxed text-foreground/75 md:text-base">
            {subtitle}
          </motion.p>

          <motion.form {...rise(0.28)} action="/explore" role="search" className="flex w-full max-w-xl flex-col items-center gap-3">
            <label className="group flex h-13 w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0d14]/90 px-4 text-left shadow-[0_20px_60px_-30px_rgb(143_180_255/0.5)] transition-[border-color,box-shadow] duration-200 focus-within:border-ion/60 focus-within:shadow-[0_0_0_4px_rgb(143_180_255/0.12),0_20px_60px_-20px_rgb(143_180_255/0.45)]">
              <SearchIcon aria-hidden className="size-5 text-muted-foreground" />
              <span className="sr-only">Search {settings.brand.name || "Nexverse"}</span>
              <input name="q" type="search" autoComplete="off" placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80" />
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </label>
          </motion.form>

          <motion.div {...rise(0.36)} className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={primaryHref}
              className="pressable group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground shadow-[0_10px_40px_-12px_rgb(255_255_255/0.45)] transition-[box-shadow] hover:shadow-[0_10px_50px_-6px_rgb(143_180_255/0.7)]"
            >
              {primaryLabel}
              <ArrowRightIcon aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/forum" className="pressable inline-flex h-11 items-center rounded-full border border-border bg-[#080a10]/70 px-5 text-sm hover:border-white/25">
              {secondaryLabel}
            </Link>
          </motion.div>
        </div>
      </div>

      <HubTotals />
    </section>
  )
}

const TOTALS: { key: keyof HubCounts; one: string; many: string; href: Route }[] = [
  { key: "members", one: "member", many: "members", href: "/leaderboard" },
  { key: "threads", one: "forum thread", many: "forum threads", href: "/forum" },
  { key: "replies", one: "reply", many: "replies", href: "/forum" },
  { key: "projects", one: "published project", many: "published projects", href: "/explore" },
  { key: "links", one: "shared link", many: "shared links", href: "/share" },
]

/** Real totals from the database. A number that is zero (or a database that is not there) is simply not shown. */
function HubTotals() {
  const counts = useLoad(loadCounts, null)
  const live = useCopy("home.hero.totals", "Live in the community")
  const shown = counts ? TOTALS.filter((t) => counts[t.key] > 0) : []
  if (!shown.length) return null
  return (
    <div className="relative border-t border-white/[0.06] bg-background/85">
      <div className="shell flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-4 sm:justify-start">
        <p className="text-xs text-muted-foreground">
          <span className="pulse-dot mr-2 align-middle" aria-hidden />
          {live}
        </p>
        <ul className="contents">
          {shown.map((t) => {
            const n = counts![t.key]
            return (
              <li key={t.key}>
                <Link href={t.href} className="group flex items-baseline gap-2 rounded-sm">
                  <CountUp value={n} className="font-display text-xl font-semibold tracking-tight group-hover:text-ion" />
                  <span className="text-sm text-muted-foreground">{n === 1 ? t.one : t.many}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** The last word of the headline, cycling through who Nexverse is for. Static when motion is reduced. */
function RotatingWord({ words, still }: { words: string[]; still: boolean }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (still || words.length < 2) return
    const id = setInterval(() => setI((n) => (n + 1) % words.length), 2800)
    return () => clearInterval(id)
  }, [still, words.length])
  const word = words[i % words.length]
  return (
    <span className="relative inline-grid align-bottom">
      {/* the widest word holds the space so the line never jumps */}
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {words.reduce((a, b) => (b.length > a.length ? b : a))}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={word}
          initial={{ opacity: 0, transform: "translateY(40%)" }}
          animate={{ opacity: 1, transform: "translateY(0%)" }}
          exit={{ opacity: 0, transform: "translateY(-40%)" }}
          transition={{ duration: 0.45, ease: EASE }}
          className="ion-text col-start-1 row-start-1 text-left"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
