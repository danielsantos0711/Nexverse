"use client"

import type { Route } from "next"
import Link from "next/link"
import { CalendarIcon, EyeOffIcon, MapPinIcon, MessageSquareIcon, MoreHorizontalIcon, NewspaperIcon, SparklesIcon, UsersIcon, VideoIcon, VolumeXIcon } from "lucide-react"
import { createElement, useState } from "react"
import { categoryIcon } from "@/components/forum/category-icon"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { GlowCard } from "@/components/hub/glow-card"
import { Cover, KindTag, PersonAvatar } from "@/components/hub/bits"
import { TimeAgo } from "@/components/live/time"
import { Reward } from "@/components/missions/mission-bits"
import { SpaceCover } from "@/components/missions/mission-cover"
import { FollowButton } from "@/components/social/follow-button"
import { EVENT_KINDS } from "@/lib/community"
import { getCategory } from "@/lib/data"
import { sharePath } from "@/lib/hub"
import { MISSION_KINDS } from "@/lib/missions-look"
import { memberHref } from "@/lib/people"
import { projectPath } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { FeedItem } from "./feed-data"

const card = "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)] active:scale-[0.99]"
const stretched = "rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"

/** The line above every card saying why it is in your feed. */
function Why({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <SparklesIcon aria-hidden className="size-3 shrink-0 text-gold" />
      <span className="truncate">{text}</span>
    </span>
  )
}

/** "Not interested" and "See less from …", in a small menu on each card. */
function CardMenu({ item, onHide, onMute }: { item: FeedItem; onHide: () => void; onMute?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        type="button"
        aria-label="Options for this card"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-full bg-black/40 text-white/80 opacity-100 backdrop-blur-sm transition-opacity hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:aria-expanded:opacity-100"
      >
        <MoreHorizontalIcon aria-hidden className="size-4" />
      </button>
      {open && (
        <div role="menu" className="liquid-glass absolute top-9 right-0 w-52 origin-top-right animate-in rounded-xl border border-border p-1 text-sm shadow-xl duration-150 fade-in zoom-in-95">
          <button role="menuitem" type="button" onClick={onHide} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]">
            <EyeOffIcon aria-hidden className="size-4" /> Not interested
          </button>
          {onMute && item.source && (
            <button role="menuitem" type="button" onClick={onMute} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]">
              <VolumeXIcon aria-hidden className="size-4" /> See less {item.source.startsWith("category:") ? "of this category" : "from this member"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function FeedCard({ item, big, onHide, onMute }: { item: FeedItem; big?: boolean; onHide: () => void; onMute?: () => void }) {
  const menu = <CardMenu item={item} onHide={onHide} onMute={onMute} />
  if (item.kind === "project") {
    const p = item.p
    const inner = (
      <article className={card}>
        {menu}
        <div className={cn("relative overflow-hidden", big ? "h-48 sm:h-56" : "h-36")}>
          {p.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- project covers are members' https images
            <img src={p.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
          ) : (
            <Cover seed={p.id} kind={p.kind} className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
          )}
          <span className="absolute bottom-2 left-2">
            <KindTag kind={p.kind} className="bg-black/50 backdrop-blur-sm" />
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <Why text={item.why} />
          <h3 className={cn("font-semibold", big ? "text-lg" : "text-base")}>
            <Link href={projectPath(p.id) as Route} className={stretched}>
              {p.name}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
          <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            {p.owner && <PersonAvatar handle={p.owner.handle ?? p.owner.id} name={p.owner.name} size={18} />}
            <span className="truncate">{p.owner?.name}</span>
            <TimeAgo date={p.publishedAt ?? p.updatedAt} />
            {p.tags.slice(0, 2).map((t) => (
              <span key={t} className="hidden rounded-full bg-white/[0.04] px-1.5 sm:inline">
                #{t}
              </span>
            ))}
          </div>
        </div>
      </article>
    )
    return big ? <GlowCard className="h-full rounded-2xl">{inner}</GlowCard> : inner
  }
  if (item.kind === "thread") {
    const q = item.q
    const cat = getCategory(q.orbit)
    return (
      <article className={card}>
        {menu}
        <div className="relative flex flex-1 flex-col gap-2 p-4">
          <span className="flex items-center gap-2 text-xs text-ion">
            <span className="grid size-7 place-items-center rounded-lg border border-ion/25 bg-ion/10">
              {createElement(categoryIcon(cat?.icon ?? ""), { "aria-hidden": true, className: "size-3.5" })}
            </span>
            {cat?.name ?? q.orbit}
          </span>
          <Why text={item.why} />
          <h3 lang={q.lang} className="text-base leading-snug font-semibold">
            <Link href={`/forum/${q.id}`} className={stretched}>
              {q.title}
            </Link>
          </h3>
          {q.body && <p className="line-clamp-3 text-sm text-muted-foreground">{q.body.replace(/[#*_`>]/g, "").slice(0, 280)}</p>}
          <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            {q.author && <PosterAvatar poster={{ name: q.author.name }} size={18} />}
            <span className="truncate">{q.author?.name ?? "A member"}</span>
            <TimeAgo date={q.createdAt} />
            <span className="ml-auto inline-flex items-center gap-1 tabular">
              <MessageSquareIcon aria-hidden className="size-3.5" /> {q.answerCount}
            </span>
          </div>
        </div>
      </article>
    )
  }
  if (item.kind === "news") {
    const s = item.s
    return (
      <article className={card}>
        {menu}
        <div className="relative h-28 overflow-hidden">
          <Cover seed={s.id} kind="news" className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            <NewspaperIcon aria-hidden className="size-3" /> News
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <Why text={item.why} />
          <h3 className="text-base leading-snug font-semibold">
            <Link href={sharePath(s) as Route} className={stretched}>
              {s.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{s.summary}</p>
          <span className="mt-auto pt-2 text-xs text-muted-foreground">
            <TimeAgo date={s.createdAt} />
          </span>
        </div>
      </article>
    )
  }
  if (item.kind === "event") {
    const e = item.e
    const d = new Date(e.startsAt)
    return (
      <article className={card}>
        {menu}
        <div className="flex flex-1 gap-4 p-4">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-[#d3b4ff]/30 bg-[#d3b4ff]/10 py-2 text-[#d3b4ff]">
            <span className="text-[11px] uppercase">{d.toLocaleDateString("en", { month: "short" })}</span>
            <span className="text-2xl leading-none font-semibold tabular">{d.getDate()}</span>
            <span className="mt-0.5 text-[10px]">{d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Why text={item.why} />
            <h3 className="text-base leading-snug font-semibold">
              <Link href={`/events/${e.id}` as Route} className={stretched}>
                {e.title}
              </Link>
            </h3>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarIcon aria-hidden className="size-3.5" /> {EVENT_KINDS[e.kind]?.label ?? e.kind}
              </span>
              <span className="inline-flex items-center gap-1">
                {e.mode === "online" ? <VideoIcon aria-hidden className="size-3.5" /> : <MapPinIcon aria-hidden className="size-3.5" />}
                {e.mode === "online" ? "Online" : e.location}
              </span>
              <span>Hosted by {e.host.name}</span>
            </p>
          </div>
        </div>
      </article>
    )
  }
  if (item.kind === "mission") {
    const m = item.m
    return (
      <article className={card}>
        {menu}
        <SpaceCover seed={m.id} cover={m.cover} accent={m.accent} className="h-28">
          <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">Mission · {MISSION_KINDS[m.kind].label}</span>
          <span className="absolute right-2 bottom-2 rounded-full bg-black/50 px-2 py-0.5 backdrop-blur-sm">
            <Reward points={m.reward} />
          </span>
        </SpaceCover>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <Why text={item.why} />
          <h3 className="text-base leading-snug font-semibold">
            <Link href={`/missions/${m.id}`} className={stretched}>
              {m.title}
            </Link>
          </h3>
          <p className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <UsersIcon aria-hidden className="size-3.5" /> {m.crewCount} {m.crewCount === 1 ? "pilot" : "pilots"} · posted by {m.poster.name}
          </p>
        </div>
      </article>
    )
  }
  return (
    <section className="relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4" aria-label="People you might follow">
      <Why text={item.why} />
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {item.people.map((p) => (
          <li key={p.id} className="flex w-36 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border border-border bg-background/40 p-3 text-center transition-colors hover:border-white/15">
            <Link href={memberHref(p) as Route} className="flex flex-col items-center gap-1.5 focus-visible:outline-none">
              <PersonAvatar handle={p.handle ?? p.id} name={p.name} src={p.avatarUrl} size={44} />
              <span className="w-full truncate text-sm font-medium">{p.name}</span>
              <span className="line-clamp-2 min-h-8 text-[11px] text-muted-foreground">{p.bio || (p.location ? p.location : "New member")}</span>
            </Link>
            <FollowButton followee={`member:${p.id}`} name={p.name} showCount={false} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FeedSkeleton({ big }: { big?: boolean }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-hidden>
      <div className={cn("animate-pulse bg-white/[0.04]", big ? "h-48" : "h-32")} />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  )
}
