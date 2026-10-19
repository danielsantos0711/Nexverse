"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { MessagesSquareIcon, RotateCwIcon, SquarePenIcon, XIcon } from "lucide-react"
import { THREAD_LIMIT } from "@/components/forum/forum-data"
import { HiddenBadge, LockedBadge, PinnedBadge, PosterAvatar, primaryButton, rise, riseDelay, SolvedBadge } from "@/components/forum/forum-ui"
import { TagList } from "@/components/forum/tags"
import { isTopicSort, sortTopics, TOPIC_SORTS, type Topic, type TopicSort } from "@/components/forum/topics"
import { useForumThreads } from "@/components/forum/use-forum-threads"
import { LangTag } from "@/components/hub/bits"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { categoryPath, compact, plural } from "@/lib/data"
import { cn } from "@/lib/utils"

const PAGE = 20
const COLS = "md:grid-cols-[minmax(0,1fr)_4.5rem_9rem]"

/** A category's threads from the database: sort tabs, an optional tag filter, and twenty more at a time. */
export function CategoryTopics({ slug, name }: { slug: string; name: string }) {
  const params = useSearchParams()
  const reduce = useReducedMotion()
  const raw = params.get("sort")
  const sort: TopicSort = isTopicSort(raw) ? raw : "latest"
  const tag = params.get("tag")?.toLowerCase().slice(0, 24) || null
  const { topics, status, error, retry } = useForumThreads(slug)
  // How many rows show, per view; changing the sort or tag starts again at twenty.
  const [shownFor, setShownFor] = useState({ key: "", n: PAGE })
  const key = `${sort}|${tag ?? ""}`
  const limit = shownFor.key === key ? shownFor.n : PAGE

  const all = useMemo(() => (tag ? topics.filter((t) => t.tags.includes(tag)) : topics), [topics, tag])
  const list = useMemo(() => sortTopics(all, sort), [all, sort])
  const shown = list.slice(0, limit)
  const hint = TOPIC_SORTS.find((s) => s.value === sort)!.hint

  const href = (next: { sort?: TopicSort; tag?: string | null }) => {
    const s = next.sort ?? sort
    const tg = next.tag === undefined ? tag : next.tag
    const q = new URLSearchParams()
    if (tg) q.set("tag", tg)
    if (s !== "latest") q.set("sort", s)
    const qs = q.toString()
    return `${categoryPath(slug)}${qs ? `?${qs}` : ""}`
  }

  const unanswered = all.filter((t) => t.replies === 0).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={`Sort threads in ${name}`} className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
          {TOPIC_SORTS.map(({ value, label }) => {
            const on = value === sort
            return (
              <Link
                key={value}
                href={href({ sort: value })}
                scroll={false}
                replace
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`forum-sort-${slug}`}
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <span className="relative">
                  {label}
                  {value === "unanswered" && status === "ready" && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{unanswered}</span>}
                </span>
              </Link>
            )
          })}
        </nav>
        <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
          {hint}
        </p>
      </div>

      {tag && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          Showing threads tagged <span className="rounded-full bg-ion/10 px-2 py-0.5 text-ion">#{tag}</span>
          <Link
            href={href({ tag: null })}
            scroll={false}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <XIcon aria-hidden className="size-3" /> Clear
          </Link>
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card/40">
        <div aria-hidden className={cn("hidden gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid", COLS)}>
          <span>Thread</span>
          <span className="text-right">Replies</span>
          <span className="text-right">Last post</span>
        </div>
        {status === "loading" ? (
          <ul aria-busy="true" aria-label="Loading threads" className="divide-y divide-border">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3.5">
                <Skeleton className="hidden size-8 shrink-0 rounded-full sm:block" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm">
            <p className="text-muted-foreground">The threads could not be loaded. {error}</p>
            <Button size="sm" variant="secondary" onClick={retry}>
              <RotateCwIcon aria-hidden /> Try again
            </Button>
          </div>
        ) : shown.length > 0 ? (
          <ul aria-label={`Threads in ${name}`} className="divide-y divide-border">
            {shown.map((t, i) => (
              <li key={t.id} className={i < PAGE ? rise : undefined} style={i < PAGE ? riseDelay(i) : undefined}>
                <TopicRow t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyList slug={slug} name={name} sort={sort} tag={tag} hasThreads={topics.length > 0} />
        )}
      </div>

      {status === "ready" && list.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground tabular" aria-live="polite">
            Showing {shown.length} of {plural(list.length, "thread")}
          </p>
          {list.length > shown.length && (
            <Button variant="secondary" onClick={() => setShownFor({ key, n: limit + PAGE })}>
              Show {Math.min(PAGE, list.length - shown.length)} more
            </Button>
          )}
          {topics.length >= THREAD_LIMIT && list.length === shown.length && (
            <p className="text-xs text-muted-foreground">These are the {THREAD_LIMIT} newest threads in {name}. Search the forum to find older ones.</p>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyList({ slug, name, sort, tag, hasThreads }: { slug: string; name: string; sort: TopicSort; tag: string | null; hasThreads: boolean }) {
  const team = slug === "announcements"
  const text = !hasThreads && team
    ? "No announcements yet. The Nexverse team posts releases and forum news here."
    : !hasThreads
    ? `Nobody has started a thread in ${name} yet. The first one sets the tone.`
    : tag
      ? `No threads tagged #${tag} here${sort === "unanswered" ? " are waiting for a reply" : " yet"}.`
      : "Every thread here has at least one reply. Nice."
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-ion/10 text-ion ring-1 ring-ion/20">
        <MessagesSquareIcon aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {(!hasThreads || tag) && !team && (
        <Link href={`/forum/new?c=${slug}${tag ? `&tag=${tag}` : ""}`} className={primaryButton}>
          <SquarePenIcon aria-hidden className="size-4" /> {hasThreads ? "Start a thread" : "Start the first thread"}
        </Link>
      )}
    </div>
  )
}

function TopicRow({ t }: { t: Topic }) {
  return (
    <div className={cn("group relative grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-white/[0.03] md:items-center md:gap-4", COLS, (t.hidden || t.pinned) && "bg-gold/[0.03]")}>
      <div className="flex min-w-0 items-start gap-3">
        <PosterAvatar poster={t.author} size={32} className="mt-0.5 hidden transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none sm:inline-flex" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={t.href}
              lang={t.lang}
              className="rounded-sm text-[15px] leading-snug font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset group-hover:text-ion"
            >
              {t.title}
            </Link>
            {t.pinned && <PinnedBadge />}
            {t.locked && <LockedBadge />}
            {t.hidden && <HiddenBadge />}
            {t.solved && <SolvedBadge />}
          </div>
          <TagList tags={t.tags.slice(0, 4)} hrefBase={categoryPath(t.category)} />
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t.author.name} · <TimeAgo date={t.created} />
            </span>
            <LangTag lang={t.lang} />
            {t.local && <span>Saved in this browser</span>}
            {/* Phones get the numbers inline, since the columns are hidden. */}
            <span className="tabular md:hidden">{plural(t.replies, "reply", "replies")}</span>
            {t.replies > 0 && (
              <span className="md:hidden">
                Last post <TimeAgo date={t.activity} />
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="hidden text-right text-sm tabular md:block">
        {compact(t.replies)}
        <span className="sr-only"> {t.replies === 1 ? "reply" : "replies"}</span>
      </p>
      <div className="hidden min-w-0 items-center justify-end gap-2 text-right md:flex">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-foreground/80">
            <span className="sr-only">Last post by </span>
            {t.lastPoster.name}
          </span>
          <TimeAgo date={t.activity} className="text-xs text-muted-foreground" />
        </span>
        <PosterAvatar poster={t.lastPoster} size={24} />
      </div>
    </div>
  )
}
