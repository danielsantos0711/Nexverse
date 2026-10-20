import Link from "next/link"
import { CheckCircle2Icon } from "lucide-react"
import { HiddenBadge, LockedBadge, PinnedBadge, PosterAvatar, rise, riseDelay, SolvedBadge } from "@/components/forum/forum-ui"
import type { Poster, Topic } from "@/components/forum/topics"
import { TimeAgo } from "@/components/live/time"
import { plural } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/** The anchor every numbered post carries, so "#3" links to it. */
export const postId = (n: number) => `post-${n}`

const DAY = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/**
 * One numbered post. The thread's first post is #1; replies follow in order. Shared by threads and the reply
 * list, so every post on the forum reads the same way.
 */
export function Post({
  n,
  poster,
  date,
  accepted = false,
  original = false,
  hidden = false,
  note,
  actions,
  children,
  className,
  index = 0,
  animate = true,
}: {
  n: number
  poster: Poster
  date: string
  accepted?: boolean
  original?: boolean
  hidden?: boolean
  note?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  index?: number
  /** Off where the list animates its own items. */
  animate?: boolean
}) {
  return (
    <article
      id={postId(n)}
      aria-label={`Post ${n} by ${poster.name}`}
      style={animate ? riseDelay(index) : undefined}
      className={cn(
        "scroll-mt-24 rounded-xl border p-4 md:p-5",
        animate && rise,
        accepted ? "border-ok/35 bg-ok/[0.04]" : hidden ? "border-gold/25 bg-gold/[0.03]" : original ? "border-border bg-card/70" : "border-border bg-card/40",
        "target:ring-2 target:ring-ion/50",
        className
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <PosterAvatar poster={poster} size={28} />
          {poster.name}
        </span>
        {original && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground"><Copy k="thread.thread-parts.started-the-thread">Started the thread</Copy></span>}
        <TimeAgo date={date} className="text-xs text-muted-foreground" />
        {note}
        <span className="ml-auto flex items-center gap-2">
          {accepted && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
              <CheckCircle2Icon aria-hidden className="size-3.5" /> <Copy k="thread.thread-parts.solution">Solution</Copy>
            </span>
          )}
          <a
            href={`#${postId(n)}`}
            aria-label={`Link to post ${n}`}
            className="rounded-sm px-1 font-mono text-xs text-muted-foreground tabular hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            #{n}
          </a>
        </span>
      </header>
      {children}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </article>
  )
}

/** Replies, who took part, and when: the right rail of a thread on large screens. */
export function ThreadStats({ replies, participants, created, lastReply }: { replies: number; participants: Poster[]; created: string; lastReply: string | null }) {
  const shown = participants.slice(0, 8)
  return (
    <section aria-labelledby="stats-h" className="glass rounded-xl p-4">
      <h2 id="stats-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
        <Copy k="thread.thread-parts.about-this-thread">About this thread</Copy>
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground"><Copy k="thread.thread-parts.replies">Replies</Copy></dt>
          <dd className="text-lg font-semibold tabular">{replies}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground"><Copy k="thread.thread-parts.started">Started</Copy></dt>
          <dd className="pt-1">
            <time dateTime={created}>{DAY.format(new Date(created))}</time>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground"><Copy k="thread.thread-parts.last-reply">Last reply</Copy></dt>
          <dd>{lastReply ? <TimeAgo date={lastReply} /> : "None yet"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="mb-1.5 text-xs text-muted-foreground">{plural(participants.length, "participant")}</dt>
          <dd>
            <ul className="flex flex-wrap -space-x-1.5" aria-label="Participants">
              {shown.map((p) => (
                <li key={p.name} title={p.name} className="rounded-full ring-2 ring-background">
                  <PosterAvatar poster={p} size={28} />
                  <span className="sr-only">{p.name}</span>
                </li>
              ))}
              {participants.length > shown.length && (
                <li className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] text-muted-foreground ring-2 ring-background">+{participants.length - shown.length}</li>
              )}
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  )
}

/** Other threads in the same category, newest activity first. */
export function SimilarThreads({ topics, categoryName }: { topics: Topic[]; categoryName?: string }) {
  if (!topics.length) return null
  return (
    <section aria-labelledby="similar-h" className="flex flex-col gap-1.5">
      <h2 id="similar-h" className="px-1 font-sans text-sm font-semibold tracking-normal">
        More{categoryName && <span className="font-normal text-muted-foreground"> in {categoryName}</span>}
      </h2>
      <ul className="flex flex-col">
        {topics.map((t) => (
          <li key={t.id}>
            <div className="relative flex flex-col gap-1 rounded-lg p-2 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-white/[0.04] motion-reduce:transform-none">
              <Link
                href={t.href}
                lang={t.lang}
                className="line-clamp-2 rounded-sm text-sm leading-snug after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {t.title}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular">{plural(t.replies, "reply", "replies")}</span>
                <span>
                  · <TimeAgo date={t.activity} />
                </span>
                {t.pinned && <PinnedBadge className="py-0" />}
                {t.locked && <LockedBadge className="py-0" />}
                {t.hidden && <HiddenBadge className="py-0" />}
                {t.solved && <SolvedBadge className="py-0" />}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
