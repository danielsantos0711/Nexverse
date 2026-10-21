"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, HeartIcon, MessageSquareIcon, TrendingUpIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Sparkline } from "@/components/trending/sparkline"
import { compact, KINDS, type ResourceKind } from "@/lib/data"
import { listRising, type RisingItem } from "@/lib/live/nexverse"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * "Rising this week" over a hub list: the items of this kind gaining real attention on Nexverse, in a row you
 * swipe or step through. Shows nothing at all when nothing moved (the full list below is the honest state).
 */
export function RisingStrip({ kind }: { kind?: ResourceKind }) {
  const { ready } = useSession()
  const reduce = useReducedMotion()
  const [items, setItems] = useState<RisingItem[]>([])
  const row = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listRising({ days: 7, kind, limit: 12 })
      .then((r) => !stale && setItems(r.items.filter((i) => i.itemType === "project" || i.itemType === "share")))
      .catch(() => null)
    return () => {
      stale = true
    }
  }, [kind, ready])

  if (!items.length) return null
  const step = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * Math.max(240, row.current.clientWidth * 0.8), behavior: reduce ? "auto" : "smooth" })

  return (
    <section aria-labelledby="rising-h" className="mb-10 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rising-h" className="inline-flex items-center gap-2 text-base font-semibold">
          <TrendingUpIcon aria-hidden className="size-4 text-ion" /> Rising this week {kind ? `in ${KINDS[kind].plural.toLowerCase()}` : "on Nexverse"}
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="grid size-8 place-items-center rounded-full border border-border bg-card/60 transition-[background-color,transform] hover:bg-card active:scale-95">
            <ChevronLeftIcon aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="grid size-8 place-items-center rounded-full border border-border bg-card/60 transition-[background-color,transform] hover:bg-card active:scale-95">
            <ChevronRightIcon aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <ol ref={row} className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-[var(--gutter)] px-[var(--gutter)] pb-2 [scrollbar-width:none]">
        {items.map((i, n) => (
          <motion.li
            key={i.target}
            className="w-64 shrink-0 snap-start"
            initial={reduce ? false : { opacity: 0, x: 24, rotate: 1.5 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(n, 6) * 0.05 }}
          >
            <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-[background-color,transform] duration-300 hover:-translate-y-0.5 hover:bg-card">
              <div className="relative aspect-[16/8] overflow-hidden">
                {i.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers stored on Nexverse
                  <img src={i.cover} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05] motion-reduce:transform-none" />
                ) : (
                  <Cover seed={i.id} kind={i.kind in KINDS ? (i.kind as ResourceKind) : "thread"} />
                )}
                <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white/90 tabular">#{n + 1}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <Link href={i.href as `/p/${string}`} className="line-clamp-1 text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                  {i.title}
                </Link>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular">
                    {i.views > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <EyeIcon aria-hidden className="size-3" /> {compact(i.views)}
                      </span>
                    )}
                    {i.likes > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <HeartIcon aria-hidden className="size-3" /> {compact(i.likes)}
                      </span>
                    )}
                    {i.replies > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareIcon aria-hidden className="size-3" /> {compact(i.replies)}
                      </span>
                    )}
                  </span>
                  <Sparkline values={i.spark} className="w-16" />
                </div>
              </div>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}
