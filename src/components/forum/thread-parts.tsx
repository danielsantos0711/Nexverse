import Link from "next/link"
import { ArrowDownIcon, CheckCircle2Icon } from "lucide-react"
import { PosterAvatar, rise, riseDelay, SolvedBadge } from "@/components/forum/forum-ui"
import type { Poster, Topic } from "@/components/forum/topics"
import { ago, compact, formatDate } from "@/lib/data"
import { cn } from "@/lib/utils"

/** The anchor every numbered post carries, so "#3" and "Jump to answer" can link to it. */
export const postId = (n: number) => `post-${n}`

/**
 * One numbered post. The original post is #1; replies follow in order. Shared by sample threads, members'
 * threads and the reply list, so every post on the forum reads the same way.
 */
export function Post({
  n,
  poster,
  date,
  accepted = false,
  original = false,
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
        accepted ? "border-ok/35 bg-ok/[0.04]" : original ? "border-border bg-card/70" : "border-border bg-card/40",
        "target:ring-2 target:ring-ion/50",
        className
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
        {poster.handle ? (
          <Link href={`/people/${poster.handle}`} className="flex items-center gap-2 rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <PosterAvatar poster={poster} size={28} />
            {poster.name}
          </Link>
        ) : (
          <span className="flex items-center gap-2 font-medium">
            <PosterAvatar poster={poster} size={28} />
            {poster.name}
          </span>
        )}
        {original && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">Original post</span>}
        <time dateTime={date} title={formatDate(date)} className="text-xs text-muted-foreground">
          {ago(date)}
        </time>
        {note}
        <span className="ml-auto flex items-center gap-2">
          {accepted && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
              <CheckCircle2Icon aria-hidden className="size-3.5" /> Accepted answer
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

/** The reply that solved the thread, shown right under the original post. */
export function AcceptedAnswer({ n, poster, date, children }: { n: number; poster: Poster; date: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="accepted-h" className={cn("rounded-xl border border-ok/40 bg-gradient-to-b from-ok/[0.08] to-ok/[0.02] p-4 md:p-5", rise)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="accepted-h" className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold tracking-normal text-ok">
          <CheckCircle2Icon aria-hidden className="size-4" /> Accepted answer
        </h2>
        <span className="flex items-center gap-2 text-sm">
          <PosterAvatar poster={poster} size={22} />
          {poster.name}
          <span className="text-xs text-muted-foreground">· {ago(date)}</span>
        </span>
        <a
          href={`#${postId(n)}`}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ok transition-colors hover:bg-ok/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Jump to answer <span className="sr-only">(post {n})</span>
          <ArrowDownIcon aria-hidden className="size-3.5" />
        </a>
      </div>
      <div className="line-clamp-6">{children}</div>
    </section>
  )
}

/** Replies, views, who took part, and when: the right rail of a thread on large screens. */
export function ThreadStats({ replies, views, participants, created, lastReply }: { replies: number; views: number | null; participants: Poster[]; created: string; lastReply: string | null }) {
  const shown = participants.slice(0, 8)
  return (
    <section aria-labelledby="stats-h" className="glass rounded-xl p-4">
      <h2 id="stats-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
        About this thread
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Replies</dt>
          <dd className="text-lg font-semibold tabular">{compact(replies)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Views</dt>
          <dd className="text-lg font-semibold tabular">{views === null ? "–" : compact(views)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Created</dt>
          <dd>
            <time dateTime={created}>{formatDate(created)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last reply</dt>
          <dd>{lastReply ? <time dateTime={lastReply}>{ago(lastReply)}</time> : "None yet"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="mb-1.5 text-xs text-muted-foreground">
            {participants.length} {participants.length === 1 ? "participant" : "participants"}
          </dt>
          <dd>
            <ul className="flex flex-wrap -space-x-1.5" aria-label="Participants">
              {shown.map((p) => (
                <li key={p.handle ?? p.name} title={p.name} className="rounded-full ring-2 ring-background">
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

export function SimilarThreads({ topics, categoryName }: { topics: Topic[]; categoryName?: string }) {
  if (!topics.length) return null
  return (
    <section aria-labelledby="similar-h" className="flex flex-col gap-1.5">
      <h2 id="similar-h" className="px-1 font-sans text-sm font-semibold tracking-normal">
        Similar threads{categoryName && <span className="font-normal text-muted-foreground"> in {categoryName}</span>}
      </h2>
      <ul className="flex flex-col">
        {topics.map((t) => (
          <li key={t.id}>
            <div className="relative flex flex-col gap-1 rounded-lg p-2 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-white/[0.04] motion-reduce:transform-none">
              <Link href={t.href} lang={t.lang} className="line-clamp-2 rounded-sm text-sm leading-snug after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring">
                {t.english ?? t.title}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular">
                  {compact(t.replies)} {t.replies === 1 ? "reply" : "replies"}
                </span>
                <span>· {ago(t.activity)}</span>
                {t.solved && <SolvedBadge className="py-0" />}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
