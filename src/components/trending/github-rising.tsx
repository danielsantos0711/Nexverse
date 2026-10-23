"use client"

import Link from "next/link"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { ArrowUpIcon, FlameIcon, GitForkIcon, HashIcon, RefreshCwIcon, StarIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import { TimeAgo, useNow } from "@/components/live/time"
import { Segmented } from "@/components/trending/segmented"
import { compact } from "@/lib/data"
import { ghHref, ghTopicHref } from "@/lib/live/ids"
import type { GhRepo } from "@/lib/live/types"
import { cn } from "@/lib/utils"

type Topic = { id: string; label: string; rotating: boolean }

const WINDOWS = [
  { value: "1", label: "Today" },
  { value: "7", label: "This week" },
  { value: "30", label: "This month" },
] as const
type Win = (typeof WINDOWS)[number]["value"]

const SORTS = [
  { value: "velocity", label: "Rising", title: "Stars per day since it was created" },
  { value: "stars", label: "Most stars" },
  { value: "new", label: "Newest" },
] as const
type Sort = (typeof SORTS)[number]["value"]

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * Rising on GitHub, live: repositories created in the chosen window across the topics Nexverse follows (two of
 * them rotate every six hours), ranked by star velocity. Changing the window, topic or order re-ranks in place:
 * cards glide to their new places and a flame marks the fastest risers. Every card opens on Nexverse.
 */
export function GithubRising({ repos, topics, fetchedAt }: { repos: GhRepo[]; topics: Topic[]; fetchedAt: number }) {
  const reduce = useReducedMotion()
  const now = useNow()
  const [win, setWin] = useState<Win>("7")
  const [topic, setTopic] = useState<string>("all")
  const [sort, setSort] = useState<Sort>("velocity")
  const [more, setMore] = useState(false)
  // Places before the last change of window, topic or order, for the "moved up" arrows.
  const [was, setWas] = useState<Map<string, number>>(new Map())

  const list = useMemo(() => {
    const at = now ?? fetchedAt
    const days = Number(win)
    const out = repos.filter((r) => (topic === "all" || r.topic === topic) && (!r.createdAt || at - Date.parse(r.createdAt) <= days * 864e5 + 3600e3))
    if (sort === "stars") out.sort((a, b) => b.stars - a.stars)
    else if (sort === "new") out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    else out.sort((a, b) => (b.starsPerDay ?? 0) - (a.starsPerDay ?? 0) || b.stars - a.stars)
    return out
  }, [repos, topic, win, sort, now, fetchedAt])

  const shown = list.slice(0, more ? 24 : 9)
  const fastest = Math.max(1, ...list.map((r) => r.starsPerDay ?? 0))
  const remember = <T,>(set: (v: T) => void) => (v: T) => {
    setWas(new Map(shown.map((r, i) => [r.fullName, i + 1])))
    set(v)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Created" value={win} onChange={remember(setWin)} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
          <Segmented label="Order" size="sm" value={sort} onChange={remember(setSort)} options={SORTS.map((s) => ({ value: s.value, label: s.label, title: "title" in s ? s.title : undefined }))} />
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCwIcon aria-hidden className="size-3" /> Refreshed every 30 minutes · updated <TimeAgo date={fetchedAt} />
        </span>
      </div>
      <div role="group" aria-label="Topic" className="-mx-[var(--gutter)] flex gap-1.5 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {[{ id: "all", label: "All topics", rotating: false }, ...topics].map((t) => {
          const on = topic === t.id
          const n = t.id === "all" ? repos.length : repos.filter((r) => r.topic === t.id).length
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => remember(setTopic)(t.id)}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "border-repo/40 bg-repo/15 text-foreground" : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {t.id !== "all" && <HashIcon aria-hidden className="size-3" />}
              {t.label.replace(/^#/, "")}
              {t.rotating && <span className="rounded-full bg-gold/15 px-1.5 text-[10px] text-gold" title="A topic that rotates every six hours">rotating</span>}
              <span className="text-[11px] text-muted-foreground tabular">{n}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {win === "1" ? "Nothing created today has gathered stars under this topic yet. Widen the window to this week." : "Nothing new under this topic in this window. Try another topic or a wider window."}
        </p>
      ) : (
        <LayoutGroup>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((r, i) => {
                const before = was.get(r.fullName)
                const moved = before ? before - (i + 1) : 0
                const share = Math.max(0.04, (r.starsPerDay ?? 0) / fastest)
                return (
                  <motion.li
                    key={r.fullName}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : Math.min(i, 9) * 0.02 }}
                  >
                    <Spotlight className="group relative flex h-full flex-col gap-2.5 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:bg-card">
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                          <Cover seed={`gh-${r.fullName}`} kind="repo" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="font-mono text-repo tabular">#{i + 1}</span>
                            {moved > 0 && (
                              <motion.span key={`${r.fullName}-${before}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center text-[10px] text-emerald-300">
                                <ArrowUpIcon aria-hidden className="size-2.5" />
                                {moved}
                                <span className="sr-only"> places up</span>
                              </motion.span>
                            )}
                            <span className="truncate">{r.owner}</span>
                          </span>
                          <Link href={ghHref(r.owner, r.name)} className="truncate leading-tight font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                            {r.name}
                          </Link>
                        </div>
                        {sort === "velocity" && i < 3 && (r.starsPerDay ?? 0) >= 20 && <FlameIcon aria-label="Among the fastest risers" className="size-4 shrink-0 text-gold" />}
                      </div>
                      <p className="line-clamp-2 text-[13px] text-muted-foreground">{r.description || "No description yet."}</p>
                      {r.topics.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
                          {r.topics.slice(0, 3).map((t) => (
                            <li key={t}>
                              <Link href={ghTopicHref(t)} className="relative z-10 inline-block rounded-full bg-repo/10 px-2 py-0.5 text-[11px] text-repo transition-colors hover:bg-repo/20">
                                {t}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex flex-col gap-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1 text-foreground/90 tabular" title="Stars per day since it was created">
                            <StarIcon aria-hidden className="size-3 text-gold" />
                            {(r.starsPerDay ?? 0) >= 10 ? Math.round(r.starsPerDay ?? 0) : (r.starsPerDay ?? 0).toFixed(1)}
                            <span className="text-muted-foreground">a day</span>
                          </span>
                          <span className="flex items-center gap-2.5 text-muted-foreground tabular">
                            <span className="inline-flex items-center gap-1" title={`${r.stars} stars`}>
                              <StarIcon aria-hidden className="size-3" />
                              {compact(r.stars)}
                            </span>
                            <span className="inline-flex items-center gap-1" title={`${r.forks} forks`}>
                              <GitForkIcon aria-hidden className="size-3" />
                              {compact(r.forks)}
                            </span>
                            {r.createdAt && <TimeAgo date={r.createdAt} />}
                          </span>
                        </div>
                        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div
                            className="h-full origin-left rounded-full bg-gradient-to-r from-repo via-ion to-gold"
                            initial={reduce ? false : { scaleX: 0 }}
                            animate={{ scaleX: share }}
                            transition={{ duration: 0.7, ease: EASE }}
                          />
                        </div>
                      </div>
                    </Spotlight>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
        </LayoutGroup>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {list.length > 9 && (
          <button type="button" onClick={() => setMore((m) => !m)} className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-[13px] text-foreground transition-[background-color,transform] hover:bg-card active:scale-[0.97]">
            {more ? "Show fewer" : `Show ${Math.min(24, list.length) - 9} more`}
          </button>
        )}
        <Link href={topic === "all" ? "/code?from=github" : ghTopicHref(topic)} className="text-ion hover:underline">
          {topic === "all" ? "Browse every topic" : `More on #${topic}`} →
        </Link>
      </div>
    </div>
  )
}
