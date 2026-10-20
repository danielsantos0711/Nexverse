"use client"

import { useEffect, useState } from "react"
import { CalendarIcon, CrownIcon, FileTextIcon, FolderHeartIcon, LayoutGridIcon, LightbulbIcon, OrbitIcon, PinIcon, RocketIcon, ScrollTextIcon, TrophyIcon, UserPlusIcon } from "lucide-react"
import { CrewBoard } from "@/components/crews/crew-board"
import { CrewEvents } from "@/components/crews/crew-events"
import { CrewGalaxy } from "@/components/crews/crew-galaxy"
import { WhoAvatar } from "@/components/crews/emblem"
import { relative } from "@/components/chat/format"
import { useNow } from "@/components/live/time"
import { crewTint, HOME_LABEL, homeOf, listPosts, ROLE_LABEL, type Crew, type CrewMember, type CrewPost, type CrewRole, type HomeSection } from "@/lib/crews"
import { crewFeed, leaderboard, type FeedItem, type LeaderRow } from "@/lib/crews-home"
import { cn } from "@/lib/utils"

const SECTION_ICON: Record<HomeSection, typeof PinIcon> = {
  pinned: PinIcon,
  events: CalendarIcon,
  projects: LayoutGridIcon,
  leaderboard: TrophyIcon,
  feed: ScrollTextIcon,
  galaxy: OrbitIcon,
  rules: ScrollTextIcon,
  collections: FolderHeartIcon,
}

/**
 * The crew's home: the sections its captain and officers chose, in their order. The galaxy of members, pinned
 * posts, upcoming launches, the project board, the top crew this month, the mission log and the crew code.
 */
export function CrewHome({
  crew,
  role,
  meId,
  members,
  onTab,
}: {
  crew: Crew
  role: CrewRole | null
  meId: string | null
  members: CrewMember[]
  onTab: (tab: "wall" | "members" | "collections") => void
}) {
  const tint = crewTint(crew)
  const sections = homeOf(crew).filter((s) => s !== "rules" || crew.rules)
  const wide = new Set<HomeSection>(["projects"])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((s) => {
        const Icon = SECTION_ICON[s]
        return (
          <section key={s} aria-labelledby={`home-${s}`} className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-4", (wide.has(s) || s === "galaxy") && "md:col-span-2", s === "galaxy" && "md:col-span-1 md:row-span-2")}>
            <h2 id={`home-${s}`} className="flex items-center gap-2 font-sans text-sm font-medium tracking-normal">
              <Icon aria-hidden className="size-4" style={{ color: tint }} />
              {HOME_LABEL[s]}
            </h2>
            {s === "galaxy" ? (
              <CrewGalaxy crew={crew} members={members} onOpenMembers={() => onTab("members")} />
            ) : s === "pinned" ? (
              <Pinned crew={crew} onOpenWall={() => onTab("wall")} />
            ) : s === "events" ? (
              <CrewEvents crew={crew} role={role} meId={meId} />
            ) : s === "projects" ? (
              <CrewBoard crew={crew} role={role} meId={meId} />
            ) : s === "leaderboard" ? (
              <Leaderboard crew={crew} />
            ) : s === "feed" ? (
              <Feed crew={crew} />
            ) : s === "rules" ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">{crew.rules}</p>
            ) : (
              <button type="button" onClick={() => onTab("collections")} className="self-start text-sm text-ion hover:underline">
                Open the crew’s shared collections
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Pinned({ crew, onOpenWall }: { crew: Crew; onOpenWall: () => void }) {
  const [posts, setPosts] = useState<CrewPost[] | null>(null)
  const now = useNow()
  useEffect(() => {
    let stale = false
    listPosts(crew).then(
      (l) => !stale && setPosts(l.filter((p) => p.pinned).slice(0, 3)),
      () => !stale && setPosts([])
    )
    return () => {
      stale = true
    }
  }, [crew])
  if (posts === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!posts.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing pinned. Officers pin up to three posts from the{" "}
        <button type="button" onClick={onOpenWall} className="text-ion hover:underline">
          wall
        </button>
        .
      </p>
    )
  return (
    <ul className="flex flex-col gap-2">
      {posts.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={onOpenWall} className="flex w-full gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.04]">
            <WhoAvatar who={p.author} size={26} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{p.author.name}</span>
                {now !== null && <span>{relative(p.createdAt, now)}</span>}
              </span>
              <span className="line-clamp-3 text-sm text-foreground/90">{p.body.replace(/[#*_`>]/g, "").slice(0, 300)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Leaderboard({ crew }: { crew: Crew }) {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<LeaderRow[] | null>(null)
  const tint = crewTint(crew)
  useEffect(() => {
    let stale = false
    leaderboard(crew, days).then(
      (r) => !stale && setRows(r.slice(0, 8)),
      () => !stale && setRows([])
    )
    return () => {
      stale = true
    }
  }, [crew, days])
  const top = rows?.[0]?.score ?? 1
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Period" className="flex gap-1">
        {[7, 30, 365].map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={days === d}
            onClick={() => setDays(d)}
            className={cn("pressable h-7 rounded-full border px-2.5 text-xs", days === d ? "border-ion/50 bg-ion/10 text-ion" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {d === 7 ? "Week" : d === 30 ? "Month" : "Year"}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has scored in this period yet. Posts, chat, reactions and shipped cards all count.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.userId} className="flex items-center gap-2.5">
              <span className={cn("w-5 text-right text-xs font-semibold tabular", i === 0 ? "text-gold" : "text-muted-foreground")}>{i === 0 ? <CrownIcon aria-label="First" className="ml-auto size-3.5" /> : i + 1}</span>
              <WhoAvatar who={{ name: r.name, memberId: r.userId }} size={24} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {r.name}
                    {r.role !== "member" && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{ROLE_LABEL[r.role]}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular">{r.score} pts</span>
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full origin-left rounded-full" style={{ background: tint, transform: `scaleX(${r.score / top})` }} />
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {[r.posts && `${r.posts} posts`, r.messages && `${r.messages} messages`, r.reactions && `${r.reactions} reactions`, r.shipped && `${r.shipped} shipped`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-muted-foreground">Post 5 · chat message 1 · reaction on your post 2 · card landed 10</p>
    </div>
  )
}

const FEED_ICON: Record<FeedItem["kind"], typeof PinIcon> = { join: UserPlusIcon, post: FileTextIcon, event: CalendarIcon, project: LightbulbIcon, shipped: RocketIcon }
const FEED_VERB: Record<FeedItem["kind"], string> = { join: "came aboard", post: "posted", event: "planned a launch:", project: "added a card:", shipped: "landed" }

function Feed({ crew }: { crew: Crew }) {
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const now = useNow()
  useEffect(() => {
    let stale = false
    crewFeed(crew, 20).then(
      (l) => !stale && setItems(l),
      () => !stale && setItems([])
    )
    return () => {
      stale = true
    }
  }, [crew])
  if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!items.length) return <p className="text-sm text-muted-foreground">The mission log is empty. It fills as the crew posts, plans and ships.</p>
  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
      {items.map((f, i) => {
        const Icon = FEED_ICON[f.kind]
        return (
          <li key={`${f.kind}-${f.ref ?? f.actorId}-${i}`} className="relative text-sm">
            <span className="absolute top-0.5 -left-[1.4rem] grid size-5 place-items-center rounded-full border border-border bg-card">
              <Icon aria-hidden className={cn("size-3", f.kind === "shipped" ? "text-ok" : "text-muted-foreground")} />
            </span>
            <p className="leading-snug">
              <span className="font-medium">{f.actorName}</span> <span className="text-muted-foreground">{FEED_VERB[f.kind]}</span> {f.title && <span className="text-foreground/90">{f.title}</span>}
            </p>
            {now !== null && <p className="text-[11px] text-muted-foreground">{relative(f.at, now)}</p>}
          </li>
        )
      })}
    </ol>
  )
}
