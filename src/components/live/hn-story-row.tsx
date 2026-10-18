import { ArrowUpIcon, MessageSquareIcon } from "lucide-react"
import { Spotlight } from "@/components/hub/motion"
import { compact } from "@/lib/data"
import type { HnStory } from "@/lib/live"
import { cn } from "@/lib/utils"
import { ExternalLink } from "./bits"
import { TimeAgo } from "./time"

/** A Hacker News story, laid out like a forum thread row: points, title, domain, discussion. */
export function HnStoryRow({ story: s, className, tight = false }: { story: HnStory; className?: string; tight?: boolean }) {
  return (
    <Spotlight className={cn("relative rounded-xl transition-colors hover:bg-card/80", className)}>
      <div className={cn("flex gap-4", tight ? "p-3" : "p-4")}>
        <div className="hidden w-14 shrink-0 flex-col items-center self-start rounded-lg bg-secondary/70 py-1.5 sm:flex">
          <ArrowUpIcon aria-hidden className="size-3.5 text-[#ff9a5c]" />
          <span className="text-sm font-semibold tabular">{compact(s.points)}</span>
          <span className="sr-only">points</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ExternalLink href={s.url} className="text-[15px] leading-snug font-medium after:absolute after:inset-0">
            {s.title}
          </ExternalLink>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-[#ff9a5c]/90">{s.domain}</span>
            <span className="sm:hidden tabular">{compact(s.points)} points</span>
            {s.author && <span>by {s.author}</span>}
            <TimeAgo date={s.createdAt} />
            <ExternalLink href={s.hnUrl} className="relative z-10 inline-flex items-center gap-1 tabular hover:text-foreground hover:underline">
              <MessageSquareIcon aria-hidden className="size-3.5" />
              {compact(s.comments)} comments
            </ExternalLink>
          </div>
        </div>
      </div>
    </Spotlight>
  )
}
