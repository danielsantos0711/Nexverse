"use client"

import Link from "next/link"
import { LayersIcon, LockIcon } from "lucide-react"
import { useItemInfo } from "@/components/collections/describe-item"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { KIND_ICONS } from "@/components/hub/bits"
import { PixelGlint } from "@/components/hub/pixel-glint"
import type { Collection } from "@/lib/community"
import { cn } from "@/lib/utils"

/** A collection in a grid: title, curator, how many items and a peek at the first few. */
export function CollectionCard({ c, className }: { c: Collection; className?: string }) {
  const first = c.items.slice(0, 3).map((i) => i.target)
  const { get } = useItemInfo(first)
  const peek = first.map((target) => ({ target, ...get(target) })).filter((p) => p.found)
  return (
    <article className={cn("liquid-glass-flat group relative h-full overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none", className)}>
      <PixelGlint kind="collection" />
      <div className="relative flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-sans text-base leading-snug font-semibold tracking-normal">
          <Link href={`/collections/${c.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion">
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
                <span className={cn("truncate", !p.type && "text-muted-foreground")}>{p.label}</span>
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
          {c.items.length} {c.items.length === 1 ? "star" : "stars"}
        </span>
        {c.local && <span className="shrink-0">· in this browser</span>}
      </div>
      </div>
    </article>
  )
}
