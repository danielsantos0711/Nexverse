"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FlameIcon, FolderGit2Icon, NewspaperIcon, OrbitIcon, StarIcon, TrendingUpIcon } from "lucide-react"
import { compact } from "@/lib/data"
import { listRising } from "@/lib/live/nexverse"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** One chip of the strip, built on the server for outside items (plain data, so it crosses to the client). */
export type MarqueeChip = { key: string; href: string; label: string; source: "nexverse" | "news" | "github"; metric?: string }

const ICONS = { nexverse: OrbitIcon, news: NewspaperIcon, github: FolderGit2Icon } as const
const TONES = { nexverse: "text-ion", news: "text-gold", github: "text-repo" } as const

/**
 * The slow marquee over Trending. Nexverse comes first: what is rising on the site leads the strip, then the
 * newsroom's latest stories, then GitHub. It pauses on hover; with reduced motion it becomes a scrollable row.
 */
export function TrendingMarquee({ outside, className }: { outside: MarqueeChip[]; className?: string }) {
  const { ready } = useSession()
  const [own, setOwn] = useState<MarqueeChip[]>([])

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listRising({ days: 7, limit: 8 })
      .then((r) => {
        if (stale) return
        setOwn(
          r.items.map((i) => ({
            key: `nx-${i.target}`,
            href: i.href,
            label: i.title,
            source: "nexverse",
            metric: i.views + i.likes + i.replies > 0 ? compact(i.views + i.likes * 4 + i.replies * 3) : undefined,
          }))
        )
      })
      .catch(() => null)
    return () => {
      stale = true
    }
  }, [ready])

  const chips = [...own, ...outside]
  if (chips.length < 3) return null

  const row = (hidden: boolean) =>
    chips.map((c) => {
      const Icon = ICONS[c.source]
      return (
        <li key={(hidden ? "dup-" : "") + c.key} className="shrink-0">
          <Link
            href={c.href as `/p/${string}`}
            tabIndex={hidden ? -1 : undefined}
            className={cn(
              "group inline-flex max-w-[22rem] items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-[13px] transition-colors",
              c.source === "nexverse" ? "border-ion/30 bg-ion/[0.08] hover:bg-ion/[0.14]" : "border-border bg-card/60 hover:bg-card"
            )}
          >
            <Icon aria-hidden className={cn("size-3.5 shrink-0", TONES[c.source])} />
            <span className="truncate text-foreground/90 group-hover:text-foreground">{c.label}</span>
            {c.metric && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular">
                {c.source === "github" ? <StarIcon aria-hidden className="size-3" /> : c.source === "nexverse" ? <TrendingUpIcon aria-hidden className="size-3" /> : null}
                {c.metric}
              </span>
            )}
          </Link>
        </li>
      )
    })

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
