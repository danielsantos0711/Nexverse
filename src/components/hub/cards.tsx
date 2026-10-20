import { ViewTransition } from "react"
import Link from "next/link"
import { ExternalLinkIcon, HeartIcon, MessageSquareIcon } from "lucide-react"
import { Cover, KindTag, PersonAvatar, Stat } from "@/components/hub/bits"
import { GlowCard } from "@/components/hub/glow-card"
import { Spotlight } from "@/components/hub/motion"
import { PixelGlint } from "@/components/hub/pixel-glint"
import { TimeAgo } from "@/components/live/time"
import type { HubEntry, Share } from "@/lib/hub"
import { hostOf, ownerHref } from "@/lib/refs"
import type { ProjectStats } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * A project or shared link in any hub list: a cover drawn from its id, its name, who made or shared it, and only
 * real numbers (member likes, saves and replies on projects). A pane of glass; pointing at it scatters pixels
 * in its kind's colours (HorizonX Pixel Card), and a featured one carries a lamp on its rim (HorizonX Border Glow).
 */
export function HubCard({ e, stats, rank, className }: { e: HubEntry; stats?: ProjectStats; rank?: number; className?: string }) {
  const card = <HubCardBody e={e} stats={stats} rank={rank} className={className} />
  return e.featured ? <GlowCard className="rounded-xl">{card}</GlowCard> : card
}

function HubCardBody({ e, stats, rank, className }: { e: HubEntry; stats?: ProjectStats; rank?: number; className?: string }) {
  const host = e.url ? hostOf(e.url) : ""
  const by = ownerHref(e.owner)
  return (
    <Spotlight className={cn("group @container liquid-glass-flat relative overflow-hidden rounded-xl transition-colors", className)}>
      <PixelGlint kind={e.kind} />
      <div className="relative flex gap-3.5 p-3.5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <ViewTransition name={`cover-${e.key.replace(":", "-")}`} share="morph" default="none">
            <Cover seed={e.id} kind={e.kind} />
          </ViewTransition>
          {rank !== undefined && <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">#{rank}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-1.5 text-[15px] leading-tight">
            <Link href={e.href as `/p/${string}`} className="truncate font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
              {e.name}
            </Link>
            {e.featured && (
              <span className="shrink-0 self-center rounded-full bg-gold/15 px-1.5 text-[10px] font-medium text-gold" title="Featured by the Nexverse team">
                Featured
              </span>
            )}
          </div>
          <p className="line-clamp-1 text-[13px] text-muted-foreground">{e.summary || (host ? `A link to ${host}` : "")}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <KindTag kind={e.kind} />
            <span>{e.source === "project" ? "Project" : "Shared link"}</span>
            {e.owner &&
              (by ? (
                <Link href={by as `/people/${string}`} className="relative z-10 inline-flex items-center gap-1.5 hover:text-foreground">
                  <PersonAvatar handle={e.owner.handle ?? e.owner.id ?? e.owner.name} name={e.owner.name} src={e.owner.avatarUrl} size={16} />
                  <span className="max-w-[10rem] truncate">{e.owner.name}</span>
                </Link>
              ) : (
                <span className="truncate">{e.owner.name}</span>
              ))}
            {host && <span className="hidden truncate @[30rem]:inline">{host}</span>}
            <TimeAgo date={e.date} className="hidden @[34rem]:inline" />
            {stats && stats.likes > 0 && <Stat icon={HeartIcon} value={stats.likes} label="likes" />}
            {stats && stats.replies > 0 && <Stat icon={MessageSquareIcon} value={stats.replies} label="replies" />}
          </div>
        </div>
      </div>
    </Spotlight>
  )
}

/** A news story a member shared: headline, why it matters, who shared it, and the source it links to. */
export function NewsShareCard({ s, big = false, className }: { s: Share; big?: boolean; className?: string }) {
  const host = hostOf(s.url)
  return (
    <Spotlight className={cn("group liquid-glass-flat relative flex overflow-hidden rounded-2xl", big ? "flex-col" : "flex-row", className)}>
      <div className={cn("relative shrink-0 overflow-hidden", big ? "aspect-[16/7]" : "w-24 sm:w-32")}>
        <Cover seed={s.id} kind="news" className="transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transform-none" />
        {big && <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", big ? "-mt-8 p-5 pt-0" : "p-4")}>
        <span className="relative flex flex-wrap items-center gap-x-2 text-xs text-gold">
          {s.featuredAt && <span className="rounded-full bg-gold/15 px-1.5 font-medium">Featured</span>}
          <span>{host || "Link"}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <TimeAgo date={s.createdAt} className="text-muted-foreground" />
        </span>
        <Link
          href={`/news/${s.id}`}
          className={cn("relative leading-snug font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring", big ? "text-xl" : "line-clamp-2 text-[15px]")}
        >
          {s.title}
        </Link>
        {s.summary && <p className={cn("text-sm text-muted-foreground", big ? "line-clamp-3" : "line-clamp-1")}>{s.summary}</p>}
        <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {s.author ? (
            <>
              <PersonAvatar handle={s.author.handle ?? s.author.id} name={s.author.name} src={s.author.avatarUrl} size={16} />
              <span className="truncate">Shared by {s.author.name}</span>
            </>
          ) : (
            <span>{s.local ? "Shared from this browser" : "Shared by a member"}</span>
          )}
          <ExternalLinkIcon aria-hidden className="ml-auto size-3.5 shrink-0 opacity-60" />
        </div>
      </div>
    </Spotlight>
  )
}
