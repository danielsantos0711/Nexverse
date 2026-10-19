"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo } from "react"
import { CalendarDaysIcon, EyeOffIcon, MessageCircleIcon, RotateCwIcon, SparklesIcon, SquarePenIcon, SwordsIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { ForumSearch } from "@/components/forum/forum-search"
import { PosterAvatar, primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { latestFirst, statsByCategory, type CategoryStats, type Topic } from "@/components/forum/topics"
import { useForumThreads } from "@/components/forum/use-forum-threads"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { categoriesIn, categoryGroups, categoryPath, compact, getCategory, plural, type Category } from "@/lib/data"
import { cn } from "@/lib/utils"

const COLS = "md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_16rem]"

/** The forum's front page: category groups with their real thread counts and newest thread, search, and the latest threads. */
export function ForumIndex() {
  const { topics, status, error, retry } = useForumThreads()
  const loading = status === "loading"
  const stats = useMemo(() => statsByCategory(topics), [topics])
  const latest = useMemo(() => latestFirst(topics).slice(0, 6), [topics])
  const replies = topics.reduce((n, t) => n + t.replies, 0)
  const active = [...stats.values()].filter((s) => s.threads > 0).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ForumSearch topics={topics} className="sm:max-w-md sm:flex-1" placeholder="Search thread titles and tags" />
        <Link href="/forum/new" className={`${primaryButton} sm:ml-auto`}>
          <SquarePenIcon aria-hidden className="size-4" /> Start a thread
        </Link>
      </div>

      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <span>The threads could not be loaded. {error}</span>
          <Button size="sm" variant="secondary" onClick={retry}>
            <RotateCwIcon aria-hidden /> Try again
          </Button>
        </div>
      )}

      {status === "ready" && topics.length === 0 && (
        <section aria-labelledby="fresh-h" className="relative isolate overflow-hidden rounded-2xl border border-ion/20 bg-gradient-to-br from-ion/[0.08] via-card/40 to-transparent p-5 md:p-6">
          <div aria-hidden className="starfield -z-10 opacity-50 [mask-image:linear-gradient(to_left,black,transparent)]">
            <i />
            <i />
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ion/15 text-ion">
                <SparklesIcon aria-hidden className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 id="fresh-h" className="font-sans text-base font-semibold tracking-normal">
                  The forum is brand new
                </h2>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                  Every category below is open and waiting for its first thread. Ask something you are stuck on, share what you built, or start a discussion about a paper.
                </p>
              </div>
            </div>
            <Link href="/forum/new" className={cn(primaryButton, "shrink-0 self-start md:self-auto")}>
              <SquarePenIcon aria-hidden className="size-4" /> Start the first thread
            </Link>
          </div>
        </section>
      )}

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
                <div aria-hidden className={cn("hidden gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid", COLS)}>
                  <span>Category</span>
                  <span className="text-right">Threads</span>
                  <span className="text-right">Replies</span>
                  <span>Latest</span>
                </div>
                <ul aria-label={`${g.name} categories`} className="divide-y divide-border">
                  {categoriesIn(g.slug).map((c, i) => (
                    <li key={c.slug} className={rise} style={riseDelay(gi * 3 + i)}>
                      <CategoryRow c={c} s={stats.get(c.slug)!} loading={loading} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <aside aria-label="Forum overview" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <section aria-labelledby="latest-h" className="flex flex-col gap-2">
            <h2 id="latest-h" className="px-1 font-sans text-sm font-semibold tracking-normal">
              Latest activity
            </h2>
            {loading ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading the latest threads">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : latest.length ? (
              <ol className="flex flex-col">
                {latest.map((t, i) => (
                  <li key={t.id} className={rise} style={riseDelay(i)}>
                    <LatestItem t={t} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">No threads yet. New threads and replies show up here as they happen.</p>
            )}
          </section>

          {topics.length > 0 && (
            <section aria-labelledby="stats-h" className="glass rounded-xl p-4">
              <h2 id="stats-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
                At a glance
              </h2>
              <dl className="grid grid-cols-3 gap-3">
                <Figure label="Threads" value={topics.length} />
                <Figure label="Replies" value={replies} />
                <Figure label="Active categories" value={active} />
              </dl>
              {topics.some((t) => t.local) && <p className="mt-3 text-xs text-muted-foreground">Saved in this browser: this copy of Nexverse has no database.</p>}
            </section>
          )}

          <section aria-labelledby="norms-h" className="rounded-xl border border-border bg-card/30 p-4">
            <h2 id="norms-h" className="mb-2 font-sans text-sm font-semibold tracking-normal">
              How the forum works
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground marker:text-white/25">
              <li>Anyone can read. Posting needs a free account.</li>
              <li>Write in the language you think in.</li>
              <li>Say what you tried and what happened. Links and code help.</li>
              <li>Quote the post you are answering, and keep it kind.</li>
              <li>Moderators can hide posts that break the rules.</li>
            </ul>
          </section>

          <nav aria-labelledby="around-h" className="flex flex-col gap-1">
            <h2 id="around-h" className="px-1 pb-1 font-sans text-sm font-semibold tracking-normal">
              Elsewhere on Nexverse
            </h2>
            {[
              { href: "/chat" as const, label: "Chat", hint: "Live rooms for quick questions", icon: MessageCircleIcon },
              { href: "/events" as const, label: "Events", hint: "Paper clubs, meetups, office hours", icon: CalendarDaysIcon },
              { href: "/arena" as const, label: "Arena", hint: "Blind duels between models", icon: SwordsIcon },
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
        </aside>
      </div>
    </div>
  )
}

function CategoryRow({ c, s, loading }: { c: Category; s: CategoryStats; loading: boolean }) {
  return (
    <div className={cn("group relative grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] md:items-center md:gap-4", COLS)}>
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
          {!loading && s.threads > 0 && (
            <p className="text-xs text-muted-foreground tabular md:hidden">
              {plural(s.threads, "thread")} · {plural(s.replies, "reply", "replies")}
            </p>
          )}
        </div>
      </div>
      <div className="hidden text-right text-sm tabular md:block">
        {loading ? <Skeleton className="ml-auto h-4 w-6" /> : compact(s.threads)}
        <span className="sr-only"> threads</span>
      </div>
      <div className="hidden text-right text-sm tabular md:block">
        {loading ? <Skeleton className="ml-auto h-4 w-6" /> : compact(s.replies)}
        <span className="sr-only"> replies</span>
      </div>
      <div className="min-w-0 border-t border-border/60 pt-3 md:border-0 md:pt-0">
        {loading ? (
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-[26px] shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ) : s.latest ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <PosterAvatar poster={s.latest.lastPoster} size={26} />
            <div className="flex min-w-0 flex-col">
              <span className="sr-only">Latest thread: </span>
              <Link
                href={s.latest.href}
                lang={s.latest.lang}
                className="relative z-10 truncate rounded-sm text-sm hover:text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {s.latest.title}
              </Link>
              <span className="truncate text-xs text-muted-foreground">
                {s.latest.lastPoster.name} · <TimeAgo date={s.latest.activity} />
              </span>
            </div>
          </div>
        ) : c.slug === "announcements" ? (
          <span className="text-sm text-muted-foreground">No announcements yet</span>
        ) : (
          <Link
            href={`/forum/new?c=${c.slug}`}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <SquarePenIcon aria-hidden className="size-3.5" /> No threads yet · start one
          </Link>
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
        <Link
          href={t.href}
          lang={t.lang}
          className="line-clamp-2 rounded-sm text-sm leading-snug after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {t.title}
        </Link>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {t.hidden && <EyeOffIcon aria-label="Hidden by moderators" className="size-3 shrink-0 text-gold" />}
          {cat?.name ?? "Forum"} · {t.replies ? `${t.lastPoster.name} replied` : `${t.author.name} posted`} <TimeAgo date={t.activity} />
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
