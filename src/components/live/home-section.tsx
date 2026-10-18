import Link from "next/link"
import { FileTextIcon, FolderGit2Icon, StarIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Item, Spotlight, Stagger } from "@/components/hub/motion"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { arxivPapers, githubTrendingAi, type Feed } from "@/lib/live"
import { cn } from "@/lib/utils"
import { ghHref, paperHref } from "@/lib/live/ids"
import { SOURCES } from "./bits"
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
 * "Live from the ecosystem": new open-source AI repositories rising on GitHub and the newest arXiv papers,
 * in two columns. Data comes from cached feeds, so this prerenders; render it inside
 * <Suspense fallback={<LiveHomeSkeleton />}> so a slow source never holds up the page.
 */
export async function LiveHomeSection({ className }: { className?: string }) {
  // The same arguments as /trending and /papers use, so the cache entries are shared.
  const [repos, papers] = await Promise.all([githubTrendingAi(9), arxivPapers("all", 30)])
  const all = [repos, papers]
  const live = all.filter((f) => f.ok)
  // The badge reports the older of the two, so "updated N min ago" is never flattering. (No Date.now()
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
      <Stagger className="relative grid gap-6 lg:grid-cols-2 lg:gap-4">
        <Column title="Rising on GitHub" icon={FolderGit2Icon} tone="text-repo" feed={repos} more={{ href: "/trending#repos", label: "All rising repositories" }}>
          {repos.items.slice(0, 5).map((r, i) => (
            <Row
              key={r.fullName}
              href={ghHref(r.owner, r.name)}
              rank={i + 1}
              cover={
                <span className="relative size-9 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                  <Cover seed={`gh-${r.fullName}`} kind="repo" />
                </span>
              }
              meta={
                <>
                  <span className="truncate">{r.owner}</span>
                  <M icon={StarIcon}>{compact(r.stars)}</M>
                  {r.language && <span className="truncate">{r.language}</span>}
                </>
              }
            >
              {r.name}
            </Row>
          ))}
        </Column>
        <Column title="New on arXiv" icon={FileTextIcon} tone="text-gold" feed={papers} more={{ href: "/papers", label: "All papers" }}>
          {papers.items.slice(0, 5).map((p, i) => (
            <Row
              key={p.id}
              href={paperHref(p.id)}
              rank={i + 1}
              meta={
                <>
                  {p.categories[0] && <span className="font-mono">{p.categories[0]}</span>}
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
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
        {[0, 1].map((c) => (
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
