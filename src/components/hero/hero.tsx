"use client"

import Image from "next/image"
import Link from "next/link"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useRef } from "react"
import { SearchIcon } from "lucide-react"
import { LogoOrbit } from "@/components/hero/logo-orbit"
import { CountUp, Magnetic } from "@/components/hub/motion"
import { KIND_ICONS } from "@/components/hub/bits"
import { Kbd } from "@/components/ui/kbd"
import { KINDS, type ResourceKind } from "@/lib/data"

const EASE = [0.23, 1, 0.32, 1] as const

export function Hero({ counts }: { counts: { label: string; value: number }[] }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const earthY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"])
  const earthScale = useTransform(scrollYProgress, [0, 1], [1, 1.12])
  const textY = useTransform(scrollYProgress, [0, 1], ["0px", "-80px"])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(24px)", filter: "blur(8px)" },
          animate: { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" },
          transition: { duration: 0.9, delay, ease: EASE },
        }

  return (
    <section ref={ref} aria-labelledby="hero-h" className="relative isolate -mt-16 flex min-h-[100svh] flex-col overflow-hidden pt-16">
      <motion.div aria-hidden className="absolute inset-0 -z-20" style={reduce ? undefined : { y: earthY, scale: earthScale }}>
        <Image src="/space/earth.webp" alt="" fill priority sizes="100vw" className="object-cover object-[50%_70%] opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/40 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,transparent_0%,rgb(5_6_10/0.5)_60%)]" />
      </motion.div>
      <div aria-hidden className="starfield -z-10">
        <i />
        <i />
        <i />
      </div>

      <div className="shell relative grid grid-cols-1 flex-1 items-center gap-2 pt-2 pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-6 lg:pt-0 lg:pb-20">
        <motion.div className="relative z-10 flex flex-col gap-7" style={reduce ? undefined : { y: textY, opacity: fade }}>
          <motion.p {...rise(0.05)} className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-black/30 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="pulse-dot" aria-hidden /> Builders online in 40 languages right now
          </motion.p>
          <motion.h1 {...rise(0.12)} id="hero-h" className="text-[clamp(2.25rem,1.3rem+3.2vw,4.25rem)] leading-[1] font-semibold tracking-[-0.04em]">
            <span className="chrome-text">The open universe</span>
            <br />
            <span className="ion-text">for AI builders.</span>
          </motion.h1>
          <motion.p {...rise(0.22)} className="max-w-[48ch] text-base text-muted-foreground md:text-lg">
            Models, datasets, tools and repos, a forum that answers in your language, and constellations that show how it all fits together.
          </motion.p>

          <motion.form {...rise(0.32)} action="/explore" role="search" className="flex max-w-xl flex-col gap-3">
            <label className="glass group flex h-14 items-center gap-3 rounded-2xl px-4 transition-[border-color,box-shadow] duration-200 focus-within:border-ion/60 focus-within:shadow-[0_0_0_4px_rgb(143_180_255/0.12),0_20px_60px_-20px_rgb(143_180_255/0.45)]">
              <SearchIcon aria-hidden className="size-5 text-muted-foreground" />
              <span className="sr-only">Search Nexverse</span>
              <input
                name="q"
                type="search"
                autoComplete="off"
                placeholder="Search models, datasets, tools, threads…"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80"
              />
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
                const Icon = KIND_ICONS[k]
                return (
                  <Link
                    key={k}
                    href={KINDS[k].path}
                    className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-black/30 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-white/20 hover:text-foreground"
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {KINDS[k].plural}
                  </Link>
                )
              })}
              <Link
                href="/forum"
                className="pressable inline-flex items-center rounded-full border border-border bg-black/30 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-white/20 hover:text-foreground"
              >
                Forum
              </Link>
            </div>
          </motion.form>

          <motion.div {...rise(0.42)} className="flex flex-wrap items-center gap-4">
            <Magnetic>
              <Link
                href="/share"
                className="pressable inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground shadow-[0_10px_40px_-10px_rgb(255_255_255/0.5)] transition-[box-shadow] hover:shadow-[0_10px_50px_-6px_rgb(143_180_255/0.7)]"
              >
                Share what you built
              </Link>
            </Magnetic>
            <Link href="/constellations" className="text-sm text-muted-foreground hover:text-foreground">
              Explore constellations →
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: EASE }}
          className="relative order-first h-72 sm:h-96 lg:order-none lg:h-auto"
        >
          <LogoOrbit className="mx-auto aspect-square h-full max-w-full lg:h-auto lg:w-full lg:max-w-[640px]" />
          <div className="pointer-events-none absolute inset-x-[15%] bottom-[8%] h-20 rounded-[50%] bg-ion/25 blur-3xl" />
        </motion.div>
      </div>

      <div className="relative border-t border-border bg-background/60 backdrop-blur">
        <dl className="shell grid grid-cols-2 gap-y-4 py-5 sm:grid-cols-4 lg:grid-cols-6">
          {counts.map((c) => (
            <div key={c.label} className="flex flex-col">
              <dt className="order-2 text-xs text-muted-foreground">{c.label}</dt>
              <dd className="font-display text-2xl font-semibold tracking-tight">
                <CountUp value={c.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
