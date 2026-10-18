import Link from "next/link"
import { TagIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Item, Spotlight, Stagger } from "@/components/hub/motion"
import type { GhReleaseItem } from "@/lib/live"
import { ghHref } from "@/lib/live/ids"
import { cn } from "@/lib/utils"
import { TimeAgo } from "./time"

/** Recent releases of well-known projects; each row opens the project's page on Nexverse. */
export function ReleaseList({ items, className }: { items: GhReleaseItem[]; className?: string }) {
  return (
    <Stagger as="ol" className={cn("grid gap-2.5 md:grid-cols-2", className)} gap={0.04}>
      {items.map((r) => (
        <Item as="li" key={`${r.repo}@${r.tag}`}>
          <Spotlight className="group relative flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 transition-colors hover:bg-card">
            <span className="relative size-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
              <Cover seed={`gh-${r.repo}`} kind="repo" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link href={ghHref(r.owner, r.name)} className="truncate text-sm leading-snug font-medium after:absolute after:inset-0">
                <span className="text-muted-foreground">{r.owner}/</span>
                {r.name}
              </Link>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1 text-repo">
                  <TagIcon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate font-mono">{r.tag}</span>
                </span>
                {r.title !== r.tag && <span className="truncate">{r.title}</span>}
                <TimeAgo date={r.publishedAt} className="ml-auto shrink-0" />
              </p>
            </div>
          </Spotlight>
        </Item>
      ))}
    </Stagger>
  )
}
