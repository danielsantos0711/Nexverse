import { ViewTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpIcon, CheckCircle2Icon, DownloadIcon, EyeIcon, GitForkIcon, HeartIcon, MessageSquareIcon, PinIcon, UsersIcon } from "lucide-react"
import { Cover, KindTag, LangTag, PersonAvatar, PersonLink, Stat } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import {
  ago,
  compact,
  getCategory,
  getPerson,
  getResource,
  NEWS_KINDS,
  resourcePath,
  type Constellation,
  type NewsItem,
  type Resource,
  type Thread,
} from "@/lib/data"
import { cn } from "@/lib/utils"

const REACH = { model: [DownloadIcon, "downloads"], dataset: [DownloadIcon, "downloads"], tool: [UsersIcon, "monthly users"], repo: [GitForkIcon, "forks"] } as const

/** The dense row card used in every list of resources, with a drawn cover. */
export function ResourceCard({ r, className, rank }: { r: Resource; className?: string; rank?: number }) {
  const [ReachIcon, reachLabel] = REACH[r.kind]
  return (
    <Spotlight className={cn("group @container rounded-xl border border-border bg-card/70 transition-colors hover:bg-card", className)}>
      <div className="flex gap-3.5 p-3.5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          {/* Same name as the detail page's cover, so opening a card morphs its cover into place. */}
          <ViewTransition name={`cover-${r.kind}-${r.slug}`} share="morph" default="none">
            <Cover seed={r.slug} kind={r.kind} />
          </ViewTransition>
          {rank !== undefined && (
            <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">#{rank}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-1 text-[15px] leading-tight">
            <span className="truncate text-muted-foreground">{r.owner}/</span>
            <Link href={resourcePath(r)} className="truncate font-medium text-foreground after:absolute after:inset-0">
              {r.name}
            </Link>
            {r.featured && <span className="ml-1 size-1.5 shrink-0 self-center rounded-full bg-gold" title="Community pick" />}
          </div>
          <p className="line-clamp-1 text-[13px] text-muted-foreground">{r.summary}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <KindTag kind={r.kind} />
            <span>{r.task}</span>
            <span className="font-mono">{r.spec}</span>
            {/* the date gives way first when the card is narrow, so the numbers stay on one line */}
            <span className="hidden @[34rem]:inline">Updated {ago(r.updated)}</span>
            <Stat icon={ReachIcon} value={r.reach} label={reachLabel} />
            <Stat icon={HeartIcon} value={r.likes} label="likes" />
          </div>
        </div>
      </div>
    </Spotlight>
  )
}

/** A big card for a featured resource: the cover is the hero. */
export function FeatureCard({ r, className }: { r: Resource; className?: string }) {
  return (
    <Spotlight className={cn("group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="relative aspect-[16/9] overflow-hidden">
        <Cover seed={r.slug + "x"} kind={r.kind} className="transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        <KindTag kind={r.kind} className="absolute top-3 left-3 rounded-full bg-black/50 px-2 py-1 backdrop-blur" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
        <Link href={resourcePath(r)} className="text-lg leading-tight font-semibold after:absolute after:inset-0">
          {r.name}
        </Link>
        <p className="line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
          <PersonLink handle={r.owner} />
          <Stat icon={HeartIcon} value={r.likes} label="likes" />
        </div>
      </div>
    </Spotlight>
  )
}

export function ThreadRow({ t, compact: tight = false }: { t: Thread; compact?: boolean }) {
  const cat = getCategory(t.category)
  const solved = t.replies.some((r) => r.accepted)
  return (
    <Spotlight className="relative rounded-xl transition-colors hover:bg-card/80">
      <div className={cn("flex gap-4", tight ? "p-3" : "p-4")}>
        <div className="hidden w-14 shrink-0 flex-col items-center rounded-lg bg-secondary/70 py-1.5 sm:flex">
          <ArrowUpIcon aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold tabular">{compact(t.votes)}</span>
          <span className="sr-only">votes</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start gap-2">
            {t.pinned && <PinIcon aria-label="Pinned" className="mt-1 size-3.5 shrink-0 text-gold" />}
            <Link href={`/forum/${t.id}`} lang={t.lang} className="text-[15px] leading-snug font-medium after:absolute after:inset-0">
              {t.title}
            </Link>
          </div>
          {t.en?.title && !tight && <p className="line-clamp-1 text-[13px] text-muted-foreground">{t.en.title}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cat && <span className="text-ion">{cat.name}</span>}
            <LangTag lang={t.lang} />
            <PersonLink handle={t.author} avatar={16} />
            <span>{ago(t.date)}</span>
            <Stat icon={MessageSquareIcon} value={t.replies.length} label="replies" />
            {!tight && <Stat icon={EyeIcon} value={t.views} label="views" />}
            {solved && (
              <span className="inline-flex items-center gap-1 text-ok">
                <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved
              </span>
            )}
          </div>
        </div>
      </div>
    </Spotlight>
  )
}

export function NewsCard({ n, big = false, className }: { n: NewsItem; big?: boolean; className?: string }) {
  return (
    <Spotlight className={cn("group relative flex overflow-hidden rounded-2xl border border-border bg-card", big ? "flex-col" : "flex-row", className)}>
      <div className={cn("relative shrink-0 overflow-hidden", big ? "aspect-[16/8]" : "w-28 sm:w-36")}>
        {n.image ? (
          <Image
            src={n.image}
            alt=""
            fill
            sizes={big ? "(min-width: 1024px) 50vw, 100vw" : "160px"}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          <Cover seed={n.id} kind="news" />
        )}
        {big && <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1.5", big ? "-mt-10 p-5 pt-0" : "p-4")}>
        <span className="relative text-xs text-gold">
          {NEWS_KINDS[n.kind]} · {ago(n.date)}
        </span>
        <Link
          href={`/news/${n.id}`}
          className={cn("relative leading-snug font-semibold after:absolute after:inset-0", big ? "text-xl md:text-2xl" : "line-clamp-2 text-[15px]")}
        >
          {n.title}
        </Link>
        {big && <p className="text-sm text-muted-foreground">{n.summary}</p>}
        <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
          <Stat icon={ArrowUpIcon} value={n.votes} label="votes" />
          <Stat icon={MessageSquareIcon} value={n.comments} label="comments" />
          <span className="truncate">{n.source}</span>
        </div>
      </div>
    </Spotlight>
  )
}

export function PersonCard({ handle, className }: { handle: string; className?: string }) {
  const p = getPerson(handle)
  if (!p) return null
  return (
    <Spotlight className={cn("relative flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3 hover:bg-card", className)}>
      <PersonAvatar handle={p.handle} size={40} />
      <div className="flex min-w-0 flex-col">
        <Link href={`/people/${p.handle}`} className="truncate font-medium after:absolute after:inset-0">
          {p.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {p.role} · {p.place}
        </span>
      </div>
      <span className="ml-auto text-xs text-muted-foreground tabular">{compact(p.followers)}</span>
    </Spotlight>
  )
}

export function ConstellationCard({ c, className }: { c: Constellation; className?: string }) {
  return (
    <Spotlight className={cn("group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        <div className="absolute inset-x-4 bottom-3 flex -space-x-1.5">
          {c.stars.map((s) => {
            const r = getResource(s)
            return r ? (
              <span key={s} className="size-7 overflow-hidden rounded-full ring-2 ring-card">
                <Cover seed={r.slug} kind={r.kind} />
              </span>
            ) : null
          })}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <Link href={`/constellations/${c.slug}`} className="text-lg leading-tight font-semibold after:absolute after:inset-0">
          {c.name}
        </Link>
        <p className="text-sm text-muted-foreground">{c.goal}</p>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <PersonLink handle={c.curator} />
          <span className="tabular">
            {c.stars.length} stars · {compact(c.saves)} saves
          </span>
        </div>
      </div>
    </Spotlight>
  )
}
