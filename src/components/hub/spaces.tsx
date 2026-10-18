"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { ArrowUpRightIcon, MessageSquareIcon, MessagesSquareIcon, NewspaperIcon, ScrollTextIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { KIND_ICONS, kindText } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import { KINDS, type ResourceKind } from "@/lib/data"
import { cn } from "@/lib/utils"

export type SpacesData = {
  kinds: Record<ResourceKind, number>
  top: { name: string; href: string; kind: ResourceKind }[]
  threads: string[]
  threadCount: number
  rooms: string[]
  news: string[]
  constellations: number
}

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * The map of the site, right under the hero: every space in one glance, each tile showing a little of
 * what is inside it, so nobody has to guess where to go.
 */
export function Spaces({ data }: { data: SpacesData }) {
  const reduce = useReducedMotion()
  return (
    <section aria-labelledby="spaces-h" className="shell pt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="spaces-h" className="text-xl font-semibold md:text-2xl">
            Where to go
          </h2>
          <p className="text-sm text-muted-foreground">Find things in the hub, talk in the forum and chat, keep up with news and papers.</p>
        </div>
      </div>
      <motion.ul
        initial={reduce ? false : "hidden"}
        whileInView="shown"
        viewport={{ once: true, margin: "0px 0px -80px 0px" }}
        variants={{ shown: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12"
      >
        <Tile className="lg:col-span-6 lg:row-span-2" href="/explore" title="The hub" icon={SparklesIcon} blurb="Models, datasets, tools and repos, filtered by task, language and licence." tint="text-ion">
          <div className="mt-6 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Rising today</p>
            <ul className="flex flex-wrap gap-1.5">
              {data.top.map((r, i) => {
                const Icon = KIND_ICONS[r.kind]
                return (
                  <motion.li
                    key={r.href}
                    initial={reduce ? false : { opacity: 0, transform: "scale(0.9)" }}
                    whileInView={{ opacity: 1, transform: "scale(1)" }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.05, type: "spring", duration: 0.4, bounce: 0.3 }}
                  >
                    <Link href={r.href} className="pressable relative z-10 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs hover:border-white/20">
                      <Icon aria-hidden className={cn("size-3", kindText(r.kind))} />
                      {r.name}
                    </Link>
                  </motion.li>
                )
              })}
            </ul>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
            {(Object.keys(KINDS) as ResourceKind[]).map((k, i) => {
              const Icon = KIND_ICONS[k]
              return (
                <Link
                  key={k}
                  href={KINDS[k].path}
                  className="pressable relative z-10 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                >
                  <motion.span
                    className={cn("grid size-9 place-items-center rounded-lg bg-white/[0.05]", kindText(k))}
                    animate={reduce ? undefined : { rotate: [0, -6, 0, 6, 0] }}
                    transition={{ duration: 6, repeat: Infinity, delay: i * 0.8, ease: "easeInOut" }}
                  >
                    <Icon aria-hidden className="size-4" />
                  </motion.span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{KINDS[k].plural}</span>
                    <span className="text-xs text-muted-foreground tabular">{data.kinds[k]} listed</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </Tile>

        <Tile className="lg:col-span-4" href="/forum" title="Forum" icon={MessageSquareIcon} blurb={`${data.threadCount} threads, in any language, translated in one click.`} tint="text-ion">
          <Ticker items={data.threads} />
        </Tile>

        <Tile className="lg:col-span-2" href="/constellations" title="Constellations" icon={SparklesIcon} blurb={`${data.constellations} stacks, mapped.`} tint="text-gold">
          <Orbitals reduce={Boolean(reduce)} />
        </Tile>
        <Tile className="lg:col-span-2" href="/chat" title="Chat" icon={MessagesSquareIcon} blurb="Live rooms." tint="text-gold">
          <ul className="mt-auto flex flex-col gap-1 pt-4 text-xs text-muted-foreground">
            {data.rooms.slice(0, 3).map((r, i) => (
              <li key={r} className="flex items-center gap-1.5">
                <span className="pulse-dot scale-75" style={{ animationDelay: `${i * 0.6}s` }} aria-hidden />#{r}
              </li>
            ))}
          </ul>
        </Tile>
        <Tile className="lg:col-span-2" href="/news" title="News" icon={NewspaperIcon} blurb="With why it matters." tint="text-model">
          <p className="mt-auto line-clamp-3 pt-4 text-xs text-muted-foreground">{data.news[0]}</p>
        </Tile>
        <Tile className="lg:col-span-2" href="/papers" title="Papers" icon={ScrollTextIcon} blurb="Today's research, live." tint="text-dataset">
          <p className="mt-auto pt-4 text-xs text-muted-foreground">From arXiv and Hugging Face, with a forum thread one click away.</p>
        </Tile>
      </motion.ul>
    </section>
  )
}

function Tile({
  href,
  title,
  blurb,
  icon: Icon,
  tint,
  className,
  children,
}: {
  href: string
  title: string
  blurb: string
  icon: LucideIcon
  tint: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <motion.li
      className={cn("min-w-0", className)}
      variants={{
        hidden: { opacity: 0, transform: "translateY(20px) scale(0.98)" },
        shown: { opacity: 1, transform: "translateY(0px) scale(1)", transition: { duration: 0.6, ease: EASE } },
      }}
    >
      <Spotlight className="group relative flex h-full min-h-40 flex-col rounded-2xl border border-border bg-card/60 p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/15">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] ring-1 ring-white/10", tint)}>
            <Icon aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link href={href} className="font-medium after:absolute after:inset-0">
              {title}
            </Link>
            <p className="text-sm text-muted-foreground">{blurb}</p>
          </div>
          <ArrowUpRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
        </div>
        {children}
      </Spotlight>
    </motion.li>
  )
}

/** Thread titles rolling past, one every few seconds. */
function Ticker({ items }: { items: string[] }) {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce || items.length < 2) return
    const id = setInterval(() => setI((n) => (n + 1) % items.length), 3200)
    return () => clearInterval(id)
  }, [items.length, reduce])
  return (
    <div className="relative mt-auto h-12 overflow-hidden pt-4" aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={i}
          initial={{ opacity: 0, transform: "translateY(100%)", filter: "blur(4px)" }}
          animate={{ opacity: 1, transform: "translateY(0%)", filter: "blur(0px)" }}
          exit={{ opacity: 0, transform: "translateY(-100%)", filter: "blur(4px)" }}
          transition={{ duration: 0.5, ease: EASE }}
          className="truncate text-sm text-foreground/85"
        >
          “{items[i]}”
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

/** A tiny planetary system, purely decorative. */
function Orbitals({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="relative mt-auto h-14 pt-4">
      {[18, 28, 38].map((r, i) => (
        <motion.span
          key={r}
          className="absolute top-1/2 left-1/2 rounded-full border border-white/10"
          style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r + 8 }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 8 + i * 5, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_10px_var(--color-gold)]" style={{ opacity: 1 - i * 0.25 }} />
        </motion.span>
      ))}
    </div>
  )
}
