import { AppWindowIcon, ArrowUpIcon, BoxIcon, DatabaseIcon, FileTextIcon, FlameIcon, HeartIcon, MessageSquareIcon } from "lucide-react"
import { compact } from "@/lib/data"
import { hfDailyPapers, hfTrending, hnAiStories, type HnStory, type HubRepo, type Paper } from "@/lib/live"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { hfHref, paperHref } from "@/lib/live/ids"
import { hnHref } from "./hn-story-row"

type Chip = { key: string; href: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string; metric: string; metricIcon: React.ComponentType<{ className?: string }> }

const HUB_CHIP = {
  model: { icon: BoxIcon, tone: "text-model" },
  dataset: { icon: DatabaseIcon, tone: "text-dataset" },
  space: { icon: AppWindowIcon, tone: "text-tool" },
} as const

/** Interleaves the lists so the strip alternates between sources. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i])
  return out
}

/**
 * A slow marquee of what is trending right now across the Hub, papers and Hacker News. It pauses on hover;
 * with reduced motion it stops and becomes a plain horizontally scrollable row.
 */
export function TrendingNow({ repos = [], papers = [], stories = [], className }: { repos?: HubRepo[]; papers?: Paper[]; stories?: HnStory[]; className?: string }) {
  const hub: Chip[] = repos.map((r) => ({
    key: `${r.kind}-${r.id}`,
    href: hfHref(r.kind, r.id),
    label: r.kind === "space" ? r.title || r.name : r.id,
    ...HUB_CHIP[r.kind],
    metric: compact(r.likes),
    metricIcon: HeartIcon,
  }))
  const pap: Chip[] = papers.map((p) => ({ key: `p-${p.id}`, href: paperHref(p.id), label: p.title, icon: FileTextIcon, tone: "text-gold", metric: compact(p.upvotes), metricIcon: ArrowUpIcon }))
  const hn: Chip[] = stories.map((s) => ({ key: `hn-${s.id}`, href: hnHref(s), label: s.title, icon: MessageSquareIcon, tone: "text-[#ff9a5c]", metric: compact(s.points), metricIcon: ArrowUpIcon }))
  const chips = interleave([hub, pap, hn])
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
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular">
            <c.metricIcon aria-hidden className="size-3" />
            {c.metric}
          </span>
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

/** TrendingNow with its own data: top models, Spaces, today's papers and HN threads. */
export async function TrendingNowLive({ className }: { className?: string }) {
  const [models, spaces, papers, stories] = await Promise.all([hfTrending("model", 8), hfTrending("space", 6), hfDailyPapers(6), hnAiStories(6)])
  return <TrendingNow className={className} repos={interleave([models.items, spaces.items])} papers={papers.items} stories={stories.items} />
}
