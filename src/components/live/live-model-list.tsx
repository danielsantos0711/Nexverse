import { DownloadIcon, HeartIcon, TrendingUpIcon } from "lucide-react"
import { Cover, KindTag, Stat } from "@/components/hub/bits"
import { Item, Spotlight, Stagger } from "@/components/hub/motion"
import type { HubRepo } from "@/lib/live"
import { cn } from "@/lib/utils"
import { ExternalLink } from "./bits"
import { TimeAgo } from "./time"

/** One trending model or dataset from the Hub, in the same dense row as ResourceCard. */
export function LiveRepoRow({ r, rank, className }: { r: HubRepo; rank?: number; className?: string }) {
  const kind = r.kind === "dataset" ? "dataset" : "model"
  return (
    <Spotlight className={cn("group rounded-xl border border-border bg-card/70 transition-colors hover:bg-card", className)}>
      <div className="flex gap-3.5 p-3.5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <Cover seed={`hf-${r.kind}-${r.id}`} kind={kind} />
          {rank !== undefined && <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">#{rank}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-0.5 text-[15px] leading-tight">
            <span className="truncate text-muted-foreground">{r.owner}/</span>
            <ExternalLink href={r.url} className="truncate font-medium text-foreground after:absolute after:inset-0">
              {r.name}
            </ExternalLink>
          </div>
          {(r.description || r.tags.length > 0) && (
            <p className="line-clamp-1 text-[13px] text-muted-foreground">{r.description || r.tags.map((t) => `#${t}`).join("  ")}</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <KindTag kind={kind} />
            {r.task && <span>{r.task}</span>}
            {r.library && <span className="font-mono">{r.library}</span>}
            <TimeAgo date={r.updatedAt || r.createdAt} prefix={r.updatedAt ? "Updated" : "Created"} />
            {r.downloads > 0 && <Stat icon={DownloadIcon} value={r.downloads} label="downloads last month" />}
            <Stat icon={HeartIcon} value={r.likes} label="likes" />
            <span className="inline-flex items-center gap-1 text-ion tabular" title="Trending score on Hugging Face">
              <TrendingUpIcon aria-hidden className="size-3.5" />
              {r.trendingScore}
              <span className="sr-only"> trending score</span>
            </span>
          </div>
        </div>
      </div>
    </Spotlight>
  )
}

/** Ranked list of trending models or datasets; rows rise in as the list scrolls into view. */
export function LiveModelList({ items, className, columns = 2 }: { items: HubRepo[]; className?: string; columns?: 1 | 2 }) {
  return (
    <Stagger as="ol" className={cn("grid gap-2.5", columns === 2 && "md:grid-cols-2", className)}>
      {items.map((r, i) => (
        <Item as="li" key={r.id}>
          <LiveRepoRow r={r} rank={i + 1} />
        </Item>
      ))}
    </Stagger>
  )
}
