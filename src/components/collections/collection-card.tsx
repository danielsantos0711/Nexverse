import Link from "next/link"
import { LayersIcon, LockIcon } from "lucide-react"
import { describeItem } from "@/components/collections/describe-item"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { KIND_ICONS } from "@/components/hub/bits"
import type { Collection } from "@/lib/community"
import { cn } from "@/lib/utils"

/** A collection in a grid: title, curator, how many items and a peek at the first few. */
export function CollectionCard({ c, className }: { c: Collection; className?: string }) {
  const peek = c.items.slice(0, 3).map((i) => ({ target: i.target, ...describeItem(i.target) }))
  return (
    <article className={cn("group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.03] motion-reduce:transform-none", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-sans text-base leading-snug font-semibold tracking-normal">
          <Link href={`/collections/${c.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion">
            {c.title}
          </Link>
        </h3>
        {!c.isPublic && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
            <LockIcon aria-hidden className="size-3" /> Private
          </span>
        )}
      </div>
      {c.description && <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
      {peek.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="First items">
          {peek.map((p) => {
            const Icon = p.kind ? KIND_ICONS[p.kind] : LayersIcon
            return (
              <li key={p.target} className="flex min-w-0 items-center gap-2 text-sm">
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{p.label}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
        <PosterAvatar poster={c.owner} size={20} />
        <span className="truncate">{c.owner.name}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0 tabular">
          {c.items.length} {c.items.length === 1 ? "item" : "items"}
        </span>
        {c.local && <span className="shrink-0">· in this browser</span>}
      </div>
    </article>
  )
}
