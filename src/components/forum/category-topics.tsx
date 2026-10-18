"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, MessagesSquareIcon, XIcon } from "lucide-react"
import { PinnedBadge, PosterAvatar, primaryButton, rise, riseDelay, SolvedBadge } from "@/components/forum/forum-ui"
import { TagList } from "@/components/forum/tags"
import { isTopicSort, sortTopics, TOPIC_SORTS, type Topic, type TopicSort } from "@/components/forum/topics"
import { useForumTopics } from "@/components/forum/use-member-topics"
import { LangTag } from "@/components/hub/bits"
import { ago, categoryPath, compact } from "@/lib/data"
import { cn } from "@/lib/utils"

const PER_PAGE = 20
const COLS = "md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_7.5rem]"

const EMPTY: Record<TopicSort, string> = {
  latest: "No threads here yet. Start the first one.",
  top: "No threads here yet. Start the first one.",
  unanswered: "Every thread here has at least one reply.",
  solved: "No thread here has an accepted answer yet.",
}

/** A category's threads: tabs, pinned threads first, columns for replies, views and activity, and pages of 20. */
export function CategoryTopics({ slug, name }: { slug: string; name: string }) {
  const params = useSearchParams()
  const reduce = useReducedMotion()
  const raw = params.get("sort")
  const sort: TopicSort = isTopicSort(raw) ? raw : "latest"
  const { topics, ready } = useForumTopics()
  const tag = params.get("tag")?.toLowerCase().slice(0, 24) || null

  const all = useMemo(() => topics.filter((t) => t.category === slug && (!tag || t.tags.includes(tag))), [topics, slug, tag])
  const list = useMemo(() => sortTopics(all, sort), [all, sort])
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1))
  const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // Rows rise in once, on the first render; switching tabs or pages swaps them without a replay.
  const [animate, setAnimate] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setAnimate(false), 1000)
    return () => clearTimeout(id)
  }, [])

  const href = (next: { sort?: TopicSort; page?: number; tag?: string | null }) => {
    const s = next.sort ?? sort
    const p = next.page ?? 1
    const tg = next.tag === undefined ? tag : next.tag
    const q = new URLSearchParams()
    if (tg) q.set("tag", tg)
    if (s !== "latest") q.set("sort", s)
    if (p > 1) q.set("page", String(p))
    const qs = q.toString()
    return `${categoryPath(slug)}${qs ? `?${qs}` : ""}`
  }

  const count = (s: TopicSort) => (s === "unanswered" ? all.filter((t) => t.replies === 0).length : s === "solved" ? all.filter((t) => t.solved).length : all.length)

  return (
    <div className="flex flex-col gap-4">
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
                {value !== "latest" && value !== "top" && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{count(value)}</span>}
              </span>
            </Link>
          )
        })}
      </nav>

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
          <span>Topic</span>
          <span className="text-right">Replies</span>
          <span className="text-right">Views</span>
          <span className="text-right">Activity</span>
        </div>
        {shown.length > 0 ? (
          <ul aria-label={`${name} threads, page ${page} of ${pages}`} className="divide-y divide-border">
            {shown.map((t, i) => (
              <li key={t.id} className={animate ? rise : undefined} style={animate ? riseDelay(i) : undefined}>
                <TopicRow t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <MessagesSquareIcon aria-hidden className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{!ready && sort === "latest" ? "Loading threads…" : tag ? `No threads tagged #${tag} here yet.` : EMPTY[sort]}</p>
            {(sort === "latest" || sort === "top") && (
              <Link href={`/forum/new?c=${slug}${tag ? `&tag=${tag}` : ""}`} className={primaryButton}>
                New thread in {name}
              </Link>
            )}
          </div>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, list.length)} of {list.length}
          </p>
          <ul className="flex items-center gap-1">
            <li>
              <PageLink href={href({ page: page - 1 })} disabled={page === 1} label="Previous page">
                <ChevronLeftIcon aria-hidden className="size-4" />
              </PageLink>
            </li>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <PageLink href={href({ page: p })} current={p === page} label={`Page ${p}`}>
                  {p}
                </PageLink>
              </li>
            ))}
            <li>
              <PageLink href={href({ page: page + 1 })} disabled={page === pages} label="Next page">
                <ChevronRightIcon aria-hidden className="size-4" />
              </PageLink>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}

function PageLink({ href, children, label, current, disabled }: { href: string; children: React.ReactNode; label: string; current?: boolean; disabled?: boolean }) {
  const cls = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm tabular transition-colors"
  if (disabled)
    return (
      <span aria-disabled="true" className={cn(cls, "text-muted-foreground/40")}>
        {children}
        <span className="sr-only">{label}</span>
      </span>
    )
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(cls, "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", current ? "bg-white/10 font-medium text-foreground" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
    >
      {children}
    </Link>
  )
}

function TopicRow({ t }: { t: Topic }) {
  return (
    <div className={cn("group relative grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-white/[0.03] md:items-center md:gap-4", COLS, t.pinned && "bg-gold/[0.03]")}>
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
            {t.solved && <SolvedBadge />}
          </div>
          {t.english && <p className="line-clamp-1 text-[13px] text-muted-foreground">{t.english}</p>}
          <TagList tags={t.tags.slice(0, 4)} hrefBase={categoryPath(t.category)} />
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span>{t.author.name}</span>
            <LangTag lang={t.lang} />
            {t.local && <span>Saved in this browser</span>}
            {/* Phones get the numbers inline, since the columns are hidden. */}
            <span className="tabular md:hidden">
              {compact(t.replies)} {t.replies === 1 ? "reply" : "replies"}
            </span>
            {t.views !== null && (
              <span className="tabular md:hidden">
                {compact(t.views)} {t.views === 1 ? "view" : "views"}
              </span>
            )}
            <span className="md:hidden">Active {ago(t.activity)}</span>
          </div>
        </div>
      </div>
      <p className="hidden text-right text-sm tabular md:block">
        {compact(t.replies)}
        <span className="sr-only"> {t.replies === 1 ? "reply" : "replies"}</span>
      </p>
      <p className="hidden text-right text-sm text-muted-foreground tabular md:block">
        {t.views === null ? <span aria-label="Views not counted">–</span> : compact(t.views)}
        {t.views !== null && <span className="sr-only"> views</span>}
      </p>
      <p className="hidden items-center justify-end gap-2 text-sm text-muted-foreground md:flex">
        <span className="sr-only">Last post by {t.lastPoster.name}, </span>
        <span>{ago(t.activity)}</span>
        <PosterAvatar poster={t.lastPoster} size={22} />
      </p>
    </div>
  )
}
