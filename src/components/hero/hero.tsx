"use client"

import Image from "next/image"
import Link from "next/link"
import type { Route } from "next"
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ArrowRightIcon, SearchIcon } from "lucide-react"
import { LogoOrbit } from "@/components/hero/logo-orbit"
import { KIND_ICONS } from "@/components/hub/bits"
import { CountUp } from "@/components/hub/motion"
import { loadCounts, useLoad, type HubCounts } from "@/components/home/hub-data"
import { Kbd } from "@/components/ui/kbd"
import { KINDS, type ResourceKind } from "@/lib/data"
import { DEFAULTS, useSiteSettings } from "@/lib/site-settings"

const EASE = [0.23, 1, 0.32, 1] as const
const DEFAULT_SUBTITLE = "Publish models, datasets, tools and repos, ask in a forum that speaks your language, and build alongside people who care about AI."

/**
 * The home page's first screen: the official N in its galaxy, one short headline, search, and the way in.
 * Copy and the call to action come from the admins' hero settings, with this copy when a field is empty.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { settings } = useSiteSettings()
  const reduceOS = useReducedMotion()
  const level = settings.theme.motion
  const reduce = Boolean(reduceOS) || level === "off"
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const earthY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"])
  const textY = useTransform(scrollYProgress, [0, 1], ["0px", "-60px"])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const hero = settings.hero
  const badge = hero.badge.trim() || DEFAULTS.hero.badge
  const primaryLabel = hero.primaryLabel.trim() || DEFAULTS.hero.primaryLabel
  const primaryHref = (hero.primaryHref.trim().startsWith("/") ? hero.primaryHref.trim() : DEFAULTS.hero.primaryHref) as Route

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(16px)" },
          animate: { opacity: 1, transform: "translateY(0px)" },
          transition: { duration: 0.8, delay, ease: EASE },
        }

  return (
    <section ref={ref} aria-labelledby="hero-h" className="relative isolate -mt-16 flex min-h-[min(100svh,60rem)] flex-col overflow-hidden pt-16">
      <motion.div aria-hidden className="absolute inset-0 -z-20" style={reduce ? undefined : { y: earthY }}>
        <Image src="/space/earth.webp" alt="" fill priority sizes="100vw" className="object-cover object-[50%_85%] opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/40 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,transparent_0%,rgb(5_6_10/0.5)_60%)]" />
      </motion.div>
      <div aria-hidden className="starfield -z-10">
        <i />
        <i />
        <i />
      </div>

      <div className="shell relative flex flex-1 flex-col items-center pb-12 text-center">
        {/* the stage: Daniel's N at the heart of a galaxy, the sections of the site as its moons */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: EASE }}
          className="relative aspect-square w-[min(88vw,30rem)] sm:w-[min(70vw,32rem,50svh)]"
        >
          <LogoOrbit className="size-full" effect={settings.theme.heroEffect} motion={level} />
        </motion.div>

        <motion.div className="relative z-10 -mt-[min(12vw,4rem)] flex w-full max-w-2xl flex-col items-center gap-5" style={reduce ? undefined : { y: textY, opacity: fade }}>
          <motion.p {...rise(0.05)} className="inline-flex items-center gap-2 rounded-full border border-border bg-[#080a10]/80 px-3 py-1 text-xs text-muted-foreground">
            <span className="pulse-dot" aria-hidden /> {badge}
          </motion.p>
          <motion.h1 {...rise(0.12)} id="hero-h" className="text-[clamp(1.85rem,1.35rem+1.6vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance">
            {hero.title.trim() ? (
              <span className="chrome-text">{hero.title.trim()}</span>
            ) : (
              <>
                <span className="chrome-text">The open universe </span>
                <span className="ion-text">for AI </span>
                <RotatingWord words={["builders.", "researchers.", "makers.", "students."]} still={reduce} />
              </>
            )}
          </motion.h1>
          <motion.p {...rise(0.2)} className="max-w-[54ch] text-[15px] leading-relaxed text-foreground/75 md:text-base">
            {hero.subtitle.trim() || DEFAULT_SUBTITLE}
          </motion.p>

          <motion.form {...rise(0.28)} action="/explore" role="search" className="flex w-full max-w-xl flex-col items-center gap-3">
            <label className="group flex h-13 w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0d14]/90 px-4 text-left shadow-[0_20px_60px_-30px_rgb(143_180_255/0.5)] transition-[border-color,box-shadow] duration-200 focus-within:border-ion/60 focus-within:shadow-[0_0_0_4px_rgb(143_180_255/0.12),0_20px_60px_-20px_rgb(143_180_255/0.45)]">
              <SearchIcon aria-hidden className="size-5 text-muted-foreground" />
              <span className="sr-only">Search {settings.brand.name || "Nexverse"}</span>
              <input
                name="q"
                type="search"
                autoComplete="off"
                placeholder="Search models, datasets, tools, threads…"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80"
              />
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </label>
            <div className="flex flex-wrap justify-center gap-2">
              {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
                const Icon = KIND_ICONS[k]
                return (
                  <Link
                    key={k}
                    href={KINDS[k].path as Route}
                    className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-[#080a10]/70 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {KINDS[k].plural}
                  </Link>
                )
              })}
            </div>
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
              Ask the community
            </Link>
          </motion.div>
        </motion.div>
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
  const shown = counts ? TOTALS.filter((t) => counts[t.key] > 0) : []
  if (!shown.length) return null
  return (
    <div className="relative border-t border-white/[0.06] bg-background/85">
      <div className="shell flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-4 sm:justify-start">
        <p className="text-xs text-muted-foreground">
          <span className="pulse-dot mr-2 align-middle" aria-hidden />
          Live in the community
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
    if (still) return
    const id = setInterval(() => setI((n) => (n + 1) % words.length), 2800)
    return () => clearInterval(id)
  }, [still, words.length])
  return (
    <span className="relative inline-grid align-bottom">
      {/* the widest word holds the space so the line never jumps */}
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {words.reduce((a, b) => (b.length > a.length ? b : a))}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[i]}
          initial={{ opacity: 0, transform: "translateY(40%)" }}
          animate={{ opacity: 1, transform: "translateY(0%)" }}
          exit={{ opacity: 0, transform: "translateY(-40%)" }}
          transition={{ duration: 0.45, ease: EASE }}
          className="ion-text col-start-1 row-start-1 text-left"
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
