"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { SparklesIcon } from "lucide-react"
import { categoryIcon } from "@/components/forum/category-icon"
import { NewsCard, ResourceCard, ThreadRow } from "@/components/hub/cards"
import { FollowButton } from "@/components/social/follow-button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  byDateDesc,
  categories,
  categoryPath,
  constellationsWith,
  getCategory,
  getPerson,
  getResource,
  lastActivity,
  news,
  newsAbout,
  resources,
  resourcesBy,
  threads,
  threadsAbout,
  threadsBy,
  threadsIn,
  trending,
  type NewsItem,
  type Resource,
  type Thread,
} from "@/lib/data"
import { listFollowing, useBookmarks } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

type Item =
  | { key: string; kind: "thread"; date: string; why: string; t: Thread }
  | { key: string; kind: "resource"; date: string; why: string; r: Resource }
  | { key: string; kind: "news"; date: string; why: string; n: NewsItem }

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "thread", label: "Forum" },
  { id: "resource", label: "Hub" },
  { id: "news", label: "News" },
] as const
type Filter = (typeof FILTERS)[number]["id"]

/**
 * Builds the personal feed from what you follow (people, categories) and what you saved (resources):
 * their new topics and releases, the discussions and stories about what you saved, newest first,
 * each with a line saying why it is here.
 */
function buildFeed(follows: string[], saved: string[]): Item[] {
  const items = new Map<string, Item>()
  const add = (item: Item) => {
    if (!items.has(item.key)) items.set(item.key, item)
  }

  for (const f of follows) {
    const [type, id] = f.split(":")
    if (type === "person") {
      const name = getPerson(id)?.name ?? id
      for (const t of threadsBy(id)) add({ key: `thread:${t.id}`, kind: "thread", date: lastActivity(t), why: `${name} posted this`, t })
      for (const r of resourcesBy(id)) add({ key: `${r.kind}:${r.slug}`, kind: "resource", date: r.updated, why: `${name} published this`, r })
    }
    if (type === "category") {
      const name = getCategory(id)?.name ?? id
      for (const t of threadsIn(id)) add({ key: `thread:${t.id}`, kind: "thread", date: lastActivity(t), why: `New in ${name}, which you follow`, t })
    }
  }

  for (const s of saved) {
    const [kind, slug] = s.split(":")
    if (!["model", "dataset", "tool", "repo"].includes(kind)) continue
    const r = getResource(slug)
    if (!r) continue
    for (const t of threadsAbout(slug)) add({ key: `thread:${t.id}`, kind: "thread", date: lastActivity(t), why: `About ${r.name}, which you saved`, t })
    for (const n of newsAbout(slug)) add({ key: `news:${n.id}`, kind: "news", date: n.date, why: `Mentions ${r.name}, which you saved`, n })
    // Other stars of the constellations it belongs to: what people use alongside it.
    for (const c of constellationsWith(slug))
      for (const star of c.stars) {
        const other = getResource(star)
        if (other && star !== slug && !saved.includes(`${other.kind}:${star}`))
          add({ key: `${other.kind}:${star}`, kind: "resource", date: other.updated, why: `Used with ${r.name} in ${c.name}`, r: other })
      }
  }

  return [...items.values()].sort((a, b) => byDateDesc({ date: a.date }, { date: b.date }))
}

export function ForYouView() {
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const bookmarks = useBookmarks()
  const [follows, setFollows] = useState<string[] | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const userId = user?.id ?? null

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listFollowing(userId)
      .then((list) => !stale && setFollows(list.map((f) => f.followee)))
      .catch(() => !stale && setFollows([]))
    return () => {
      stale = true
    }
  }, [ready, userId])

  const saved = useMemo(() => bookmarks.list.map((b) => b.target), [bookmarks.list])
  const feed = useMemo(() => (follows ? buildFeed(follows, saved) : []), [follows, saved])
  const shown = filter === "all" ? feed : feed.filter((i) => i.kind === filter)

  if (!follows || !bookmarks.ready) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  if (feed.length === 0) return <StartHere />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1 rounded-full border border-border bg-card/60 p-1">
          {FILTERS.map((f) => {
            const on = f.id === filter
            const count = f.id === "all" ? feed.length : feed.filter((i) => i.kind === f.id).length
            return (
              <button
                key={f.id}
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.id)}
                className={cn("pressable relative rounded-full px-3 py-1 text-sm transition-colors", on ? "text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {on && <motion.span layoutId="for-you-filter" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: "spring", bounce: 0.15, duration: 0.4 }} />}
                <span className="relative">
                  {f.label} <span className="tabular opacity-70">{count}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Built from {follows.length} {follows.length === 1 ? "follow" : "follows"} and {saved.length} saved {saved.length === 1 ? "item" : "items"}.{" "}
          <Link href="/you" className="text-ion hover:underline">
            Manage
          </Link>
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((item, i) => (
            <motion.li
              key={item.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, transform: "translateY(12px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "scale(0.98)" }}
              transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.04 }}
              className="flex flex-col gap-1.5"
            >
              <span className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
                <SparklesIcon aria-hidden className="size-3 text-gold" />
                {item.why}
              </span>
              {item.kind === "thread" && (
                <div className="rounded-xl border border-border bg-card/60">
                  <ThreadRow t={item.t} />
                </div>
              )}
              {item.kind === "resource" && <ResourceCard r={item.r} />}
              {item.kind === "news" && <NewsCard n={item.n} />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}

/** First visit: nothing followed yet. Offer the busiest categories and what is rising, each one click to follow or save. */
function StartHere() {
  const busiest = [...categories].sort((a, b) => threadsIn(b.slug).length - threadsIn(a.slug).length).slice(0, 6)
  const rising = trending(resources).slice(0, 4)
  const latest = [...threads].sort((a, b) => byDateDesc({ date: lastActivity(a) }, { date: lastActivity(b) })).slice(0, 3)
  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-[62ch] text-muted-foreground">
        Your feed fills up as you follow categories and people, and save models, datasets, tools or repos. Here is a start.
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Follow a few categories</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {busiest.map((c) => {
            const Icon = categoryIcon(c.icon)
            return (
              <li key={c.slug} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
                <Icon aria-hidden className="size-5 shrink-0 text-ion" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={categoryPath(c.slug)} className="truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{c.blurb}</span>
                </div>
                <FollowButton followee={`category:${c.slug}`} showCount={false} name={c.name} />
              </li>
            )
          })}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Rising in the hub</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {rising.map((r) => (
            <ResourceCard key={r.slug} r={r} />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Talked about right now</h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-card/60">
          {latest.map((t) => (
            <ThreadRow key={t.id} t={t} compact />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Latest news</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[...news].sort(byDateDesc).slice(0, 2).map((n) => (
            <NewsCard key={n.id} n={n} />
          ))}
        </div>
      </section>
    </div>
  )
}
