"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo } from "react"
import { CalendarDaysIcon, LayersIcon, SquarePenIcon, TrophyIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { ForumSearch } from "@/components/forum/forum-search"
import { PosterAvatar, primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { latestFirst, statsByCategory, type CategoryStats, type Topic } from "@/components/forum/topics"
import { useForumTopics } from "@/components/forum/use-member-topics"
import { ago, categoriesIn, categoryGroups, categoryPath, compact, getCategory, type Category } from "@/lib/data"

/** The forum's front page: category groups with counts and the newest post, a search box and the latest threads. */
export function ForumIndex() {
  const { topics, members } = useForumTopics()
  const stats = useMemo(() => statsByCategory(topics), [topics])
  const latest = useMemo(() => latestFirst(topics).slice(0, 6), [topics])
  const replies = topics.reduce((n, t) => n + t.replies, 0)
  const solved = topics.filter((t) => t.solved).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ForumSearch topics={topics} className="sm:max-w-md sm:flex-1" placeholder="Search thread titles" />
        <Link href="/forum/new" className={`${primaryButton} sm:ml-auto`}>
          <SquarePenIcon aria-hidden className="size-4" /> Start a thread
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {categoryGroups.map((g, gi) => (
            <section key={g.slug} id={g.slug} aria-labelledby={`${g.slug}-h`} className="scroll-mt-24">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-1">
                <h2 id={`${g.slug}-h`} className="font-sans text-base font-semibold tracking-normal">
                  {g.name}
                </h2>
                <p className="text-xs text-muted-foreground">{g.blurb}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card/40">
                <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_15rem] gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid">
                  <span>Category</span>
                  <span className="text-right">Topics</span>
                  <span className="text-right">Replies</span>
                  <span>Latest post</span>
                </div>
                <ul aria-label={`${g.name} categories`} className="divide-y divide-border">
                  {categoriesIn(g.slug).map((c, i) => (
                    <li key={c.slug} className={rise} style={riseDelay(gi * 3 + i)}>
                      <CategoryRow c={c} s={stats.get(c.slug)!} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <aside aria-label="Forum overview" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <section aria-labelledby="stats-h" className="glass rounded-xl p-4">
            <h2 id="stats-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
              Forum stats
            </h2>
            <dl className="grid grid-cols-2 gap-3">
              <Figure label="Topics" value={topics.length} />
              <Figure label="Replies" value={replies} />
              <Figure label="Solved" value={solved} />
              <Figure label="Categories" value={stats.size} />
            </dl>
            {members.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {members.every((m) => m.local) ? `Includes ${members.length} saved in this browser.` : `Includes ${members.length} started by members.`}
              </p>
            )}
          </section>

          <nav aria-labelledby="around-h" className="flex flex-col gap-1">
            <h2 id="around-h" className="px-1 pb-1 font-sans text-sm font-semibold tracking-normal">
              Around the community
            </h2>
            {[
              { href: "/events", label: "Events", hint: "Paper clubs, meetups, office hours", icon: CalendarDaysIcon },
              { href: "/collections", label: "Collections", hint: "Reading lists curated by members", icon: LayersIcon },
              { href: "/leaderboard", label: "Leaderboard", hint: "Who helped most this week", icon: TrophyIcon },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <l.icon aria-hidden className="size-4 shrink-0 text-ion" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{l.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{l.hint}</span>
                </span>
              </Link>
            ))}
          </nav>

          <section aria-labelledby="latest-h" className="flex flex-col gap-2">
            <h2 id="latest-h" className="px-1 font-sans text-sm font-semibold tracking-normal">
              Latest across the forum
            </h2>
            <ol className="flex flex-col">
              {latest.map((t, i) => (
                <li key={t.id} className={rise} style={riseDelay(i)}>
                  <LatestItem t={t} />
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}

function CategoryRow({ c, s }: { c: Category; s: CategoryStats }) {
  return (
    <div className="group relative grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_15rem] md:items-center md:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-ion/20 bg-ion/10 text-ion transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none">
          <CategoryIcon name={c.icon} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={categoryPath(c.slug)}
            className="w-fit rounded-sm text-[15px] font-medium after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset group-hover:text-ion"
          >
            {c.name}
          </Link>
          <p className="text-sm text-muted-foreground">{c.blurb}</p>
          <p className="text-xs text-muted-foreground tabular md:hidden">
            {compact(s.topics)} {s.topics === 1 ? "topic" : "topics"} · {compact(s.replies)} {s.replies === 1 ? "reply" : "replies"}
          </p>
        </div>
      </div>
      <p className="hidden text-right text-sm tabular md:block">
        {compact(s.topics)}
        <span className="sr-only"> {s.topics === 1 ? "topic" : "topics"}</span>
      </p>
      <p className="hidden text-right text-sm tabular md:block">
        {compact(s.replies)}
        <span className="sr-only"> {s.replies === 1 ? "reply" : "replies"}</span>
      </p>
      <div className="min-w-0 border-t border-border/60 pt-3 md:border-0 md:pt-0">
        {s.latest ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <PosterAvatar poster={s.latest.lastPoster} size={26} />
            <div className="flex min-w-0 flex-col">
              <span className="sr-only">Latest post: </span>
              <Link href={s.latest.href} lang={s.latest.lang} className="relative z-10 truncate rounded-sm text-sm hover:text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {s.latest.english ?? s.latest.title}
              </Link>
              <span className="truncate text-xs text-muted-foreground">
                {s.latest.lastPoster.name} · {ago(s.latest.activity)}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No posts yet</span>
        )}
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular">{compact(value)}</dd>
    </div>
  )
}

function LatestItem({ t }: { t: Topic }) {
  const cat = getCategory(t.category)
  return (
    <div className="relative flex items-start gap-2.5 rounded-lg p-2 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-white/[0.04] motion-reduce:transform-none">
      <PosterAvatar poster={t.lastPoster} size={24} className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={t.href} lang={t.lang} className="line-clamp-2 rounded-sm text-sm leading-snug after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {t.english ?? t.title}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {cat?.name ?? "Forum"} · {ago(t.activity)}
        </span>
      </div>
    </div>
  )
}

/** Links from before categories had pages (/forum?c=<slug>) land on the category's own page. */
export function LegacyCategoryRedirect() {
  const params = useSearchParams()
  const router = useRouter()
  const c = params.get("c")
  useEffect(() => {
    if (c && getCategory(c)) router.replace(categoryPath(c))
  }, [c, router])
  return null
}
