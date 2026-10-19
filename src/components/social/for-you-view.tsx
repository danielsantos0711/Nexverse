"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { MessageSquareIcon, SparklesIcon } from "lucide-react"
import { categoryIcon } from "@/components/forum/category-icon"
import { HubCard, NewsShareCard } from "@/components/hub/cards"
import { TimeAgo } from "@/components/live/time"
import { FollowButton } from "@/components/social/follow-button"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { categories, categoryPath, getCategory, KINDS, type ResourceKind } from "@/lib/data"
import { fromProject, fromShare, listHub, listShares, type HubEntry, type Share } from "@/lib/hub"
import { useProfile } from "@/lib/profile"
import { listProjects } from "@/lib/projects"
import { getMemberNames, listFollowing } from "@/lib/social"
import { listQuestions, useSession, type Question } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

type Item =
  | { key: string; kind: "thread"; date: string; why: string; q: Question }
  | { key: string; kind: "hub"; date: string; why: string; e: HubEntry }
  | { key: string; kind: "news"; date: string; why: string; s: Share }

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "thread", label: "Forum" },
  { id: "hub", label: "Hub" },
  { id: "news", label: "News" },
] as const
type Filter = (typeof FILTERS)[number]["id"]

/**
 * The personal feed, from real activity only: what the members you follow published, shared and asked, new
 * threads in the categories you follow, and new projects of the kinds you said you are into. Newest first, each
 * with a line saying why it is here.
 */
async function buildFeed(follows: string[], interests: string[]): Promise<Item[]> {
  const items = new Map<string, Item>()
  const add = (item: Item) => {
    if (!items.has(item.key)) items.set(item.key, item)
  }
  const members = follows.filter((f) => f.startsWith("member:")).map((f) => f.slice(7)).slice(0, 12)
  const cats = follows.filter((f) => f.startsWith("category:")).map((f) => f.slice(9)).slice(0, 12)
  const kinds = interests.filter((i) => i.startsWith("kind:")).map((i) => i.slice(5)).filter((k): k is ResourceKind => k in KINDS)
  const names = await getMemberNames(members).catch(() => ({}) as Record<string, string>)

  await Promise.all([
    ...members.map(async (id) => {
      const name = names[id] ?? "A member you follow"
      const [projects, shares, threads] = await Promise.all([
        listProjects({ owner: id, limit: 10 }).catch(() => []),
        listShares({ author: id, limit: 10 }).catch(() => [] as Share[]),
        listQuestions({ author: id, limit: 10 }).catch(() => [] as Question[]),
      ])
      for (const p of projects.filter((p) => p.status === "published")) add({ key: `project:${p.id}`, kind: "hub", date: p.publishedAt ?? p.updatedAt, why: `${name} published this`, e: fromProject(p) })
      for (const s of shares) {
        if (s.kind === "news") add({ key: `share:${s.id}`, kind: "news", date: s.createdAt, why: `${name} shared this`, s })
        else add({ key: `share:${s.id}`, kind: "hub", date: s.createdAt, why: `${name} shared this`, e: fromShare(s) })
      }
      for (const q of threads) add({ key: `thread:${q.id}`, kind: "thread", date: q.createdAt, why: `${name} asked this`, q })
    }),
    ...cats.map(async (slug) => {
      const name = getCategory(slug)?.name ?? slug
      for (const q of await listQuestions({ orbit: slug, limit: 10 }).catch(() => [] as Question[])) add({ key: `thread:${q.id}`, kind: "thread", date: q.createdAt, why: `New in ${name}, which you follow`, q })
    }),
    ...kinds.map(async (k) => {
      for (const p of await listProjects({ kind: k, limit: 6 }).catch(() => [])) add({ key: `project:${p.id}`, kind: "hub", date: p.publishedAt ?? p.updatedAt, why: `New ${KINDS[k].label.toLowerCase()}, one of your interests`, e: fromProject(p) })
    }),
  ])
  return [...items.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function ForYouView() {
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const { profile } = useProfile()
  const [follows, setFollows] = useState<string[] | null>(null)
  const [feed, setFeed] = useState<Item[] | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const userId = user?.id ?? null
  const interests = (profile?.interests ?? []).join(",")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listFollowing(userId)
      .then(async (list) => {
        const f = list.map((x) => x.followee)
        const items = await buildFeed(f, interests ? interests.split(",") : [])
        if (stale) return
        setFollows(f)
        setFeed(items)
      })
      .catch(() => {
        if (stale) return
        setFollows([])
        setFeed([])
      })
    return () => {
      stale = true
    }
  }, [ready, userId, interests])

  if (!follows || !feed) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your feed">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  if (feed.length === 0) return <StartHere followsSomething={follows.length > 0} />

  const shown = filter === "all" ? feed : feed.filter((i) => i.kind === filter)
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
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.id)}
                className={cn("pressable relative rounded-full px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on ? "text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {on && <motion.span layoutId="for-you-filter" className="absolute inset-0 rounded-full bg-foreground" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }} />}
                <span className="relative">
                  {f.label} <span className="tabular opacity-70">{count}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Built from {follows.length} {follows.length === 1 ? "follow" : "follows"} and your interests.{" "}
          <Link href="/you" className="text-ion hover:underline">
            Manage
          </Link>
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing of this kind in your feed yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((item, i) => (
              <motion.li
                key={item.key}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, transform: "translateY(12px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : Math.min(i, 8) * 0.04 }}
                className="flex flex-col gap-1.5"
              >
                <span className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
                  <SparklesIcon aria-hidden className="size-3 text-gold" />
                  {item.why}
                </span>
                {item.kind === "thread" && <ThreadRow q={item.q} />}
                {item.kind === "hub" && <HubCard e={item.e} />}
                {item.kind === "news" && <NewsShareCard s={item.s} />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  )
}

export function ThreadRow({ q }: { q: Question }) {
  return (
    <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span lang={q.lang} className="font-medium">
        {q.title}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="text-ion">{getCategory(q.orbit)?.name ?? q.orbit}</span>
        <span>{q.author?.name ?? (q.local ? "You" : "A member")}</span>
        <TimeAgo date={q.createdAt} />
        <span className="inline-flex items-center gap-1">
          <MessageSquareIcon aria-hidden className="size-3" /> {q.answerCount} <span className="sr-only">replies</span>
        </span>
      </span>
    </Link>
  )
}

/** Nothing in the feed yet: offer categories to follow and what is newest on the site, each from real data. */
function StartHere({ followsSomething }: { followsSomething: boolean }) {
  const { ready } = useSession()
  const [hub, setHub] = useState<HubEntry[] | null>(null)
  const [threads, setThreads] = useState<Question[] | null>(null)
  const [news, setNews] = useState<Share[] | null>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listHub({ limit: 4 }).then((h) => !stale && setHub(h.entries.slice(0, 4))).catch(() => !stale && setHub([]))
    listQuestions({ limit: 4 }).then((q) => !stale && setThreads(q)).catch(() => !stale && setThreads([]))
    listShares({ kind: "news", limit: 2, featuredFirst: true }).then((s) => !stale && setNews(s)).catch(() => !stale && setNews([]))
    return () => {
      stale = true
    }
  }, [ready])

  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-[62ch] text-muted-foreground">
        {followsSomething
          ? "The members and categories you follow have not posted anything yet. Follow a few more, or pick interests in settings, and your feed fills up."
          : "Your feed fills up as you follow members and forum categories and pick interests. Here is a start."}
      </p>
      <section aria-labelledby="fy-cats" className="flex flex-col gap-3">
        <h2 id="fy-cats" className="font-medium">
          Follow a few categories
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.slice(0, 9).map((c) => {
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
        <Link href="/people" className="text-sm text-ion hover:underline">
          Find members to follow →
        </Link>
      </section>
      {hub && hub.length > 0 && (
        <section aria-labelledby="fy-hub" className="flex flex-col gap-3">
          <h2 id="fy-hub" className="font-medium">
            New in the hub
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {hub.map((e) => (
              <HubCard key={e.key} e={e} />
            ))}
          </div>
        </section>
      )}
      {threads && threads.length > 0 && (
        <section aria-labelledby="fy-threads" className="flex flex-col gap-3">
          <h2 id="fy-threads" className="font-medium">
            New in the forum
          </h2>
          <div className="flex flex-col gap-2">
            {threads.map((q) => (
              <ThreadRow key={q.id} q={q} />
            ))}
          </div>
        </section>
      )}
      {news && news.length > 0 && (
        <section aria-labelledby="fy-news" className="flex flex-col gap-3">
          <h2 id="fy-news" className="font-medium">
            Latest news
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {news.map((s) => (
              <NewsShareCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}
      {hub?.length === 0 && threads?.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          <p className="flex-1">Nexverse is new and quiet. Start something people can follow.</p>
          <Button nativeButton={false} size="sm" render={<Link href="/forum/new" />}>
            Start a thread
          </Button>
          <Button nativeButton={false} size="sm" variant="secondary" render={<Link href="/new/project" />}>
            Publish a project
          </Button>
        </div>
      )}
    </div>
  )
}
