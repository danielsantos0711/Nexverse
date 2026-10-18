import Link from "next/link"
import { ArrowUpIcon, BoxIcon, DownloadIcon, FileTextIcon, HeartIcon, MessageSquareIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Item, Spotlight, Stagger } from "@/components/hub/motion"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { hfDailyPapers, hfTrending, hnAiStories, type Feed } from "@/lib/live"
import { cn } from "@/lib/utils"
import { hfHref, paperHref } from "@/lib/live/ids"
import { SOURCES } from "./bits"
import { hnHref } from "./hn-story-row"
import { LiveBadge } from "./live-badge"

function Column({
  title,
  icon: Icon,
  tone,
  feed,
  more,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  feed: Feed<unknown>
  more: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <Item className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className={cn("inline-flex items-center gap-1.5 font-sans text-sm font-medium tracking-normal", tone)}>
          <Icon aria-hidden className="size-4" />
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">from {SOURCES[feed.source].name}</span>
      </div>
      {feed.items.length ? (
        <ol className="flex flex-col gap-1">{children}</ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {SOURCES[feed.source].name} is not answering right now. Back in a few minutes.
        </p>
      )}
      <Link href={more.href} className="mt-auto px-1 pt-1 text-sm text-ion hover:underline">
        {more.label} →
      </Link>
    </Item>
  )
}

function Row({ href, rank, children, meta, cover }: { href: string; rank: number; children: React.ReactNode; meta: React.ReactNode; cover?: React.ReactNode }) {
  return (
    <li>
      <Spotlight className="relative flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-card/80">
        {cover ?? <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground tabular">{rank}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={href} className="line-clamp-2 text-sm leading-snug font-medium after:absolute after:inset-0">
            {children}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground tabular">{meta}</div>
        </div>
      </Spotlight>
    </li>
  )
}

const M = ({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1">
    <Icon aria-hidden className="size-3" />
    {children}
  </span>
)

/**
 * "Live from the ecosystem": trending models, today's papers and the hottest AI threads on Hacker News, in
 * three columns. Data comes from cached feeds, so this prerenders; render it inside
 * <Suspense fallback={<LiveHomeSkeleton />}> so a slow source never holds up the page.
 */
export async function LiveHomeSection({ className }: { className?: string }) {
  const [models, papers, stories] = await Promise.all([hfTrending("model", 5), hfDailyPapers(5), hnAiStories(5)])
  const all = [models, papers, stories]
  const live = all.filter((f) => f.ok)
  // The badge reports the oldest of the three, so "updated N min ago" is never flattering. (No Date.now()
  // here: this component is not cached, and reading the clock during prerender is an error.)
  const fetchedAt = Math.min(...(live.length ? live : all).map((f) => f.fetchedAt))
  return (
    <section aria-labelledby="live-home-title" className={cn("glass relative overflow-hidden rounded-3xl p-4 md:p-6", className)}>
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(circle,rgb(143_180_255/0.12),transparent_70%)]" />
      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
        <div className="flex flex-col gap-1">
          <h2 id="live-home-title" className="text-xl font-semibold">
            Live from the ecosystem
          </h2>
          <LiveBadge fetchedAt={fetchedAt} ok={live.length > 0} />
        </div>
        <nav aria-label="More live data" className="flex gap-4 text-sm">
          <Link href="/trending" className="text-ion hover:underline">
            Everything trending →
          </Link>
          <Link href="/papers" className="text-muted-foreground hover:text-foreground">
            Papers
          </Link>
        </nav>
      </div>
      <Stagger className="relative grid gap-6 lg:grid-cols-3 lg:gap-4">
        <Column title="Trending models" icon={BoxIcon} tone="text-model" feed={models} more={{ href: "/trending#models", label: "All trending models" }}>
          {models.items.map((m, i) => (
            <Row
              key={m.id}
              href={hfHref("model", m.id)}
              rank={i + 1}
              cover={
                <span className="relative size-9 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                  <Cover seed={`hf-model-${m.id}`} kind="model" />
                </span>
              }
              meta={
                <>
                  <span className="truncate">{m.owner}</span>
                  {m.downloads > 0 && <M icon={DownloadIcon}>{compact(m.downloads)}</M>}
                  <M icon={HeartIcon}>{compact(m.likes)}</M>
                </>
              }
            >
              {m.name}
            </Row>
          ))}
        </Column>
        <Column title="Today's papers" icon={FileTextIcon} tone="text-gold" feed={papers} more={{ href: "/papers", label: "All papers" }}>
          {papers.items.map((p, i) => (
            <Row
              key={p.id}
              href={paperHref(p.id)}
              rank={i + 1}
              meta={
                <>
                  <M icon={ArrowUpIcon}>{p.upvotes}</M>
                  {p.authors[0] && (
                    <span className="truncate">
                      {p.authors[0]}
                      {p.authors.length > 1 ? " et al." : ""}
                    </span>
                  )}
                </>
              }
            >
              {p.title}
            </Row>
          ))}
        </Column>
        <Column title="Hot on Hacker News" icon={MessageSquareIcon} tone="text-[#ff9a5c]" feed={stories} more={{ href: "/trending#discussions", label: "More discussions" }}>
          {stories.items.map((s, i) => (
            <Row
              key={s.id}
              href={hnHref(s)}
              rank={i + 1}
              meta={
                <>
                  <M icon={ArrowUpIcon}>{compact(s.points)}</M>
                  <M icon={MessageSquareIcon}>{compact(s.comments)}</M>
                  <span className="truncate font-mono">{s.domain}</span>
                </>
              }
            >
              {s.title}
            </Row>
          ))}
        </Column>
      </Stagger>
    </section>
  )
}

/** Same frame as LiveHomeSection, for its <Suspense> fallback. */
export function LiveHomeSkeleton({ className }: { className?: string }) {
  return (
    <section aria-busy="true" aria-label="Loading live data" className={cn("glass rounded-3xl p-4 md:p-6", className)}>
      <div className="mb-4 flex flex-col gap-2 px-1">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-4">
        {[0, 1, 2].map((c) => (
          <div key={c} className="flex flex-col gap-2">
            <Skeleton className="mx-1 h-4 w-32" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3 p-2.5">
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
