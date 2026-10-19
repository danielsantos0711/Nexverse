import Link from "next/link"
import { FlameIcon, FolderGit2Icon, NewspaperIcon, StarIcon } from "lucide-react"
import { compact } from "@/lib/data"
import { githubTrendingAi, type GhRepo } from "@/lib/live"
import { ghHref } from "@/lib/live/ids"
import { categoryInfo, storyHref, type Story } from "@/lib/newsroom"
import { latestStories } from "@/lib/newsroom/public"
import { cn } from "@/lib/utils"

type Icon = React.ComponentType<{ className?: string }>
type Chip = { key: string; href: string; label: string; icon: Icon; tone: string; metric?: string; metricIcon?: Icon }

/** Interleaves the lists so the strip alternates between sources. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i])
  return out
}

/**
 * A slow marquee of what is rising on GitHub and the newest newsroom stories, every item opening on Nexverse. It pauses on
 * hover; with reduced motion it stops and becomes a plain horizontally scrollable row.
 */
export function TrendingNow({ repos = [], stories = [], className }: { repos?: GhRepo[]; stories?: Story[]; className?: string }) {
  const gh: Chip[] = repos.map((r) => ({ key: `gh-${r.fullName}`, href: ghHref(r.owner, r.name), label: r.fullName, icon: FolderGit2Icon, tone: "text-repo", metric: compact(r.stars), metricIcon: StarIcon }))
  const news: Chip[] = stories.map((s) => ({ key: `n-${s.id}`, href: storyHref(s), label: s.title, icon: NewspaperIcon, tone: "text-gold", metric: categoryInfo(s.category).one }))
  const chips = interleave([gh, news])
  if (chips.length < 3) return null

  const row = (hidden: boolean) =>
    chips.map((c) => (
      <li key={(hidden ? "dup-" : "") + c.key} className="shrink-0">
        <Link
          href={c.href}
          tabIndex={hidden ? -1 : undefined}
          className="glass group inline-flex max-w-[22rem] items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-[13px] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
        >
          <c.icon aria-hidden className={cn("size-3.5 shrink-0", c.tone)} />
          <span className="truncate text-foreground/90 group-hover:text-foreground">{c.label}</span>
          {c.metric && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular">
              {c.metricIcon && <c.metricIcon aria-hidden className="size-3" />}
              {c.metric}
            </span>
          )}
        </Link>
      </li>
    ))

  return (
    <section aria-label="Trending now" className={cn("flex items-center gap-3", className)}>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gold">
        <FlameIcon aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">Trending now</span>
      </span>
      <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)] motion-reduce:overflow-x-auto">
        <div className="marquee gap-2 pr-2 [animation-duration:90s]">
          <ul className="flex gap-2">{row(false)}</ul>
          <ul aria-hidden className="flex gap-2 motion-reduce:hidden">
            {row(true)}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** TrendingNow with its own data: rising GitHub repositories and the newest newsroom stories. */
export async function TrendingNowLive({ className }: { className?: string }) {
  // The same arguments as /news, so both share one cache entry.
  const [repos, news] = await Promise.all([githubTrendingAi(8), latestStories(60)])
  return <TrendingNow className={className} repos={repos.items} stories={news.items.slice(0, 6)} />
}
