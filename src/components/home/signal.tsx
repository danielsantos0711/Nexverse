import Link from "next/link"
import { ArrowUpRightIcon, FileTextIcon, FolderGit2Icon, MessageSquarePlusIcon, StarIcon, TagIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { discussHref, SOURCES } from "@/components/live/bits"
import { LiveBadge } from "@/components/live/live-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { areaInfo, arxivPapers, githubReleases, githubTrendingAi, type Feed, type GhReleaseItem, type GhRepo, type Paper } from "@/lib/live"
import { ghHref, paperHref } from "@/lib/live/ids"
import { cn } from "@/lib/utils"
import { FromTheHub } from "./from-the-hub"
import { CometStreaks, TextRing } from "./fx"
import { since } from "./time"

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
const parts = (ms: number) => {
  const d = new Date(ms)
  return {
    day: d.getUTCDate(),
    month: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
    long: DAY.format(d),
  }
}

const areaName = (cat: string | undefined) => (cat ? (areaInfo(cat)?.short ?? cat) : "Research")
const authorLine = (p: Paper) => (p.authors.length ? `${p.authors[0]}${p.authors.length > 1 ? ` and ${p.authors.length - 1} more` : ""}` : "")
/** The first two sentences of an abstract, so the lead reads as a summary rather than a wall. */
const gist = (s: string) => {
  const sentences = s.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) ?? [s]
  return sentences.slice(0, 2).join(" ").trim()
}

/** The frame every part of the briefing shares: a quiet heading with its source, then the content. */
function Part({ title, icon: Icon, source, className, children, i = 0 }: { title: string; icon: React.ComponentType<{ className?: string }>; source?: string; className?: string; children: React.ReactNode; i?: number }) {
  return (
    <div className={cn("rise flex min-w-0 flex-col gap-3", className)} style={{ "--i": i } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2">
        <h3 className="inline-flex items-center gap-2 font-sans text-sm font-medium tracking-normal">
          <Icon aria-hidden className="size-4 text-ion" />
          {title}
        </h3>
        {source && <span className="text-xs text-muted-foreground">from {source}</span>}
      </div>
      {children}
    </div>
  )
}

function Lead({ p, now }: { p: Paper; now: number }) {
  return (
    <article className="rise group relative flex flex-col gap-4" style={{ "--i": 1 } as React.CSSProperties}>
      <h3 className="max-w-[34ch] font-display text-[1.4rem] leading-[1.18] font-semibold tracking-[-0.025em] text-balance md:text-[1.65rem]">
        <Link href={paperHref(p.id)} className="decoration-ion/60 underline-offset-[0.18em] hover:underline">
          {p.title}
        </Link>
      </h3>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-gold">
          <FileTextIcon aria-hidden className="size-4" /> Today&apos;s lead paper
        </span>
        <span className="text-muted-foreground">
          {areaName(p.categories[0])} · {since(p.published, now)}
        </span>
      </p>
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-foreground/85">{gist(p.summary)}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
        <span className="text-sm text-muted-foreground">{authorLine(p)}</span>
        <div className="flex items-center gap-2">
          <Link href={paperHref(p.id)} className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            Read it here <ArrowUpRightIcon aria-hidden className="size-4" />
          </Link>
          <Link href={discussHref(p.title)} className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
            <MessageSquarePlusIcon aria-hidden className="size-4" /> Discuss
          </Link>
        </div>
      </div>
    </article>
  )
}

function MorePapers({ items }: { items: Paper[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={paperHref(p.id)} className="press group flex flex-col gap-1 rounded-lg px-2 py-2.5 -mx-2 hover:bg-white/[0.035]">
            <span className="text-xs text-gold/90">{areaName(p.categories[0])}</span>
            <span className="line-clamp-2 text-[15px] leading-snug font-medium group-hover:text-foreground">{p.title}</span>
            <span className="truncate text-xs text-muted-foreground">{authorLine(p)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Rising({ repos }: { repos: GhRepo[] }) {
  const top = repos[0]?.stars || 1
  return (
    <ol className="flex flex-col">
      {repos.map((r) => (
        <li key={r.fullName}>
          <Link href={ghHref(r.owner, r.name)} className="press group relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.035]">
            <span className="relative size-9 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
              <Cover seed={`gh-${r.fullName}`} kind="repo" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline gap-1 text-sm">
                <span className="truncate text-muted-foreground">{r.owner}/</span>
                <span className="truncate font-medium">{r.name}</span>
              </span>
              {/* stars as a share of today's leader */}
              <span aria-hidden className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <span className="momentum block h-full rounded-full bg-repo/70" style={{ "--m": Math.max(0.04, r.stars / top) } as React.CSSProperties} />
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular">
              <StarIcon aria-hidden className="size-3" />
              {compact(r.stars)}
              <span className="sr-only"> stars</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Releases({ items, now }: { items: GhReleaseItem[]; now: number }) {
  return (
    <ol className="flex flex-col">
      {items.map((r) => (
        <li key={`${r.repo}@${r.tag}`}>
          <Link href={ghHref(r.owner, r.name)} className="press -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.035]">
            <TagIcon aria-hidden className="size-4 shrink-0 text-repo" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="truncate text-xs text-muted-foreground">{r.title || r.tag}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{since(r.publishedAt, now)}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-white/[0.03] px-3 py-3 text-sm text-muted-foreground">{children}</p>
}

/**
 * Signal: today's briefing. The lead paper and more from arXiv, what is rising on GitHub (or, when GitHub's
 * search is rate-limited, the latest releases of the projects Nexverse tracks), the launch of the day and the
 * news members shared. Data comes from cached feeds, so this prerenders; render it inside
 * <Suspense fallback={<SignalSkeleton />}>.
 */
export async function Signal({ launch }: { launch?: React.ReactNode }) {
  const [papers, repos, releases] = await Promise.all([arxivPapers("all", 30), githubTrendingAi(9), githubReleases(16)])
  const feeds: Feed<unknown>[] = [papers, repos.ok ? repos : releases]
  const live = feeds.filter((f) => f.ok)
  const fetchedAt = Math.max(...(live.length ? live : feeds).map((f) => f.fetchedAt))
  const oldest = Math.min(...(live.length ? live : feeds).map((f) => f.fetchedAt))
  const today = parts(fetchedAt)
  const [lead, ...more] = papers.items
  // Releases worth a line: real version tags (no branch markers), one per project.
  const seen = new Set<string>()
  const shipped = releases.items.filter((r) => /^v?\d|^b\d+$/.test(r.tag) && !r.tag.includes("/") && !seen.has(r.repo) && (seen.add(r.repo), true))

  return (
    <section aria-labelledby="signal-h" className="relative isolate">
      {/* comets falling through the band: what arrived today */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] opacity-80 [mask-image:radial-gradient(ellipse_70%_60%_at_78%_32%,#000_15%,transparent_72%)] max-lg:[mask-image:radial-gradient(ellipse_90%_45%_at_70%_18%,#000_10%,transparent_70%)]">
        <CometStreaks className="size-full" settings={{ coverage: 0.3 }} />
      </div>

      <div className="shell pt-20 md:pt-28">
        <header className="rise mb-10 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 md:mb-14 md:gap-x-8 lg:grid-cols-[auto_1fr_auto]">
          <div className="group relative grid size-[7.5rem] shrink-0 place-items-center md:size-[9.5rem]">
            <TextRing className="absolute inset-0 text-ion/80" words={["Signal", "today's briefing", "GitHub", "arXiv", "Nexverse"]} font={11} weight={500} ink="rgb(201 217 255 / 0.75)" tracking={0.14} />
            <span className="flex flex-col items-center leading-none">
              <span className="font-display text-4xl font-semibold tracking-[-0.04em] tabular md:text-5xl">{today.day}</span>
              <span className="mt-1 text-xs text-muted-foreground">{today.month}</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="signal-h" className="font-display text-2xl font-semibold tracking-[-0.035em] md:text-[2rem]">
              Signal
            </h2>
            <p className="max-w-[60ch] text-[15px] text-foreground/80 md:text-base">
              {today.long}. What moved on GitHub and arXiv, and what members shared, in one read.
            </p>
            <LiveBadge fetchedAt={oldest} ok={live.length > 0} />
          </div>
          <nav aria-label="More from the briefing" className="col-span-2 flex flex-wrap gap-2 lg:col-span-1">
            <Link href="/trending" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
              Everything trending
            </Link>
            <Link href="/papers" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
              All papers
            </Link>
          </nav>
        </header>

        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-10 lg:col-span-7">
            {lead ? (
              <Lead p={lead} now={fetchedAt} />
            ) : (
              <Part title="New on arXiv" icon={FileTextIcon} source={SOURCES.arxiv.name}>
                <Quiet>arXiv is not answering right now. The briefing fills in again in a few minutes.</Quiet>
              </Part>
            )}
            {more.length > 0 && (
              <Part title="More from arXiv" icon={FileTextIcon} source={SOURCES.arxiv.name} i={2}>
                <MorePapers items={more.slice(0, 4)} />
              </Part>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-10 lg:col-span-5">
            {launch}
            {repos.ok && repos.items.length ? (
              <Part title="Rising on GitHub" icon={FolderGit2Icon} source={SOURCES.github.name} i={3}>
                <Rising repos={repos.items.slice(0, 6)} />
              </Part>
            ) : releases.ok && shipped.length ? (
              <Part title="New releases" icon={TagIcon} source={SOURCES.github.name} i={3}>
                <Releases items={shipped} now={fetchedAt} />
              </Part>
            ) : (
              <Part title="Rising on GitHub" icon={FolderGit2Icon} source={SOURCES.github.name} i={3}>
                <Quiet>GitHub is not answering right now. Back in a few minutes.</Quiet>
              </Part>
            )}
          </div>

          <Part title="Shared by members" icon={ArrowUpRightIcon} className="lg:col-span-12" i={4}>
            <FromTheHub />
          </Part>
        </div>
      </div>
    </section>
  )
}

/** Same frame as Signal, for its <Suspense> fallback. */
export function SignalSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading today's briefing" className="shell pt-20 md:pt-28">
      <div className="mb-10 flex items-center gap-6 md:mb-14">
        <Skeleton className="size-[7.5rem] rounded-full md:size-[9.5rem]" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-11/12" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </section>
  )
}
