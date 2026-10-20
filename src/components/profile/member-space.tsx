"use client"

import type { Route } from "next"
import dynamic from "next/dynamic"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState, type ComponentType } from "react"
import { CalendarIcon, GlobeIcon, LayersIcon, MapPinIcon, MessageSquareIcon, PaletteIcon, PinIcon, SparklesIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CollectionCard } from "@/components/collections/collection-card"
import { OrbitCards, type OrbitItem } from "@/components/collections/orbit-cards"
import { Copy } from "@/components/content/copy"
import { CosmosLink } from "@/components/cosmos/cosmos-link"
import { Cover, PersonAvatar } from "@/components/hub/bits"
import { HubCard, NewsShareCard } from "@/components/hub/cards"
import { dailyCounts, Heatmap } from "@/components/hub/heatmap"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { TimeAgo } from "@/components/live/time"
import { MissionBadges } from "@/components/missions/mission-badges"
import { SpaceCover } from "@/components/missions/mission-cover"
import { ReportButton } from "@/components/moderation"
import { MemberPlanet, PlanetLegend } from "@/components/planet/member-planet"
import { CustomiseSpace } from "@/components/profile/customise-space"
import { planetSeed } from "@/components/profile/planet-seed"
import { PointsHistory } from "@/components/reputation/points-history"
import { ReputationCard } from "@/components/reputation/reputation-card"
import { FollowButton } from "@/components/social/follow-button"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { EMPTY_STATS, getMemberReputation, type Badge, type RepStats } from "@/lib/community"
import { formatDate, getCategory } from "@/lib/data"
import { fromProject, fromShare } from "@/lib/hub"
import { useBadges } from "@/lib/lists/hooks"
import { accentRgb } from "@/lib/missions-look"
import { getMember, getMemberActivity, type MemberActivity, type PublicMember } from "@/lib/people"
import { DEFAULT_SPACE, getMemberSpace, type MemberSpace } from "@/lib/profile"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type PixelProps = { colors?: string; active?: string; radius?: number; label?: string; className?: string; children?: React.ReactNode }
const PixelCard = dynamic<PixelProps>(() => import("@/components/profile/pixel-card") as Promise<{ default: ComponentType<PixelProps> }>, {
  ssr: false,
  loading: () => <div className="h-full rounded-2xl border border-border bg-card" />,
})

const EASE = [0.23, 1, 0.32, 1] as const

type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; m: PublicMember }

/** A member's space: their cover and colour, planet, pinned work, badges on display, everything they made and their points. */
export function MemberSpacePage({ memberRef }: { memberRef: string }) {
  const { ready } = useSession()
  const [found, setState] = useState<State>({ status: "loading" })
  const state: State = live ? found : { status: "missing" }

  useEffect(() => {
    if (!live || !ready) return
    let stale = false
    getMember(memberRef)
      .then((m) => {
        if (stale) return
        setState(m ? { status: "ready", m } : { status: "missing" })
        if (m) document.title = `${m.name} · Nexverse`
      })
      .catch((e: Error) => !stale && setState({ status: "error", message: e.message }))
    return () => {
      stale = true
    }
  }, [memberRef, ready])

  if (state.status === "loading") return <PageSkeleton />
  if (state.status !== "ready") {
    return (
      <Empty className="mx-auto max-w-xl py-24">
        <EmptyHeader>
          <EmptyTitle>{state.status === "error" ? <Copy k="profile.member-profile.this-profile-could-not-be">This profile could not be loaded</Copy> : <Copy k="profile.member-profile.no-member-here">No member here</Copy>}</EmptyTitle>
          <EmptyDescription>
            {state.status === "error" ? state.message : live ? <Copy k="profile.member-profile.nobody-on-nexverse-goes-by">Nobody on Nexverse goes by that name. They may have changed their handle.</Copy> : <Copy k="profile.member-profile.this-copy-of-nexverse-has">This copy of Nexverse has no accounts, so there are no profiles to show.</Copy>}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} variant="secondary" render={<Link href="/people" />}>
            <Copy k="profile.member-profile.see-everyone">See everyone</Copy>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return <Space key={state.m.id} m={state.m} />
}

export type Pin = { key: string; type: string; title: string; summary: string; href: string; date: string; tint: "model" | "dataset" | "tool" | "repo" | "news" | "thread" }

/** Everything a member can pin, from what they made and wrote. */
export function pinnable(a: MemberActivity | null): Pin[] {
  if (!a) return []
  return [
    ...a.projects.map((p): Pin => ({ key: `project:${p.id}`, type: p.kind, title: p.name, summary: p.summary, href: `/p/${p.id}`, date: p.publishedAt ?? p.createdAt, tint: p.kind })),
    ...a.shares.map((s): Pin => {
      const e = s.kind === "news" ? null : fromShare(s)
      return { key: `share:${s.id}`, type: s.kind === "news" ? "News" : s.kind, title: s.title, summary: s.summary, href: e?.href ?? `/news`, date: s.createdAt, tint: s.kind === "news" ? "news" : s.kind }
    }),
    ...a.threads.map((q): Pin => ({ key: `thread:${q.id}`, type: "Thread", title: q.title, summary: getCategory(q.orbit)?.name ?? q.orbit, href: `/forum/${q.id}`, date: q.createdAt, tint: "thread" })),
    ...a.collections.map((c): Pin => ({ key: `collection:${c.id}`, type: "Collection", title: c.title, summary: c.description, href: `/collections/${c.id}`, date: c.updatedAt, tint: "dataset" })),
  ]
}

function Space({ m }: { m: PublicMember }) {
  const { user } = useSession()
  const reduce = useReducedMotion()
  const badges = useBadges()
  const [activity, setActivity] = useState<MemberActivity | null>(null)
  const [rep, setRep] = useState<RepStats | null>(null)
  const [space, setSpace] = useState<MemberSpace | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const you = user?.id === m.id

  useEffect(() => {
    let stale = false
    getMemberActivity(m.id, user?.id ?? null).then((a) => {
      if (stale) return
      setActivity(a)
      setNow(Date.now())
    })
    getMemberReputation(m.id)
      .then((r) => !stale && setRep(r))
      .catch(() => !stale && setRep(EMPTY_STATS))
    getMemberSpace(m.id).then((s) => !stale && setSpace(s))
    return () => {
      stale = true
    }
  }, [m.id, user?.id])

  const look = space ?? DEFAULT_SPACE
  const handle = m.handle ?? m.id
  const days = useMemo(() => {
    if (!activity || now === null) return null
    const dates = [...activity.projects.map((p) => p.publishedAt ?? p.createdAt), ...activity.shares.map((s) => s.createdAt), ...activity.threads.map((t) => t.createdAt), ...activity.replyDates, ...activity.collections.map((c) => c.createdAt)]
    return dailyCounts(dates, now)
  }, [activity, now])
  const total = days?.reduce((a, b) => a + b, 0) ?? 0
  const site = m.website ? m.website.replace(/^https:\/\//, "").replace(/\/$/, "") : ""
  const first = m.name.split(/\s+/)[0]
  const all = pinnable(activity)
  const pins = look.pinned.map((k) => all.find((p) => p.key === k)).filter((p): p is Pin => Boolean(p))
  const earned = rep ? badges.filter((b) => b.earned(rep)) : []
  const shown = look.badges.length ? look.badges.map((id) => earned.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b)) : earned.slice(0, 6)
  const rgb = accentRgb(look.accent)
  const list = (items: React.ReactNode[], empty: string) => (items.length ? <ul className={cn(look.layout === "grid" ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-2")}>{items}</ul> : <p className="text-muted-foreground">{empty}</p>)

  return (
    <div style={{ "--accent-rgb": rgb } as React.CSSProperties} className="pb-16">
      <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: EASE }} className="shell pt-4">
        <SpaceCover seed={m.id} cover={look.cover} accent={look.accent} className="h-36 rounded-3xl border border-border sm:h-56">
          {you && (
            <Button size="sm" variant="secondary" className="absolute top-3 right-3 bg-black/50 text-white backdrop-blur-sm hover:bg-black/60" onClick={() => setEditing(true)}>
              <PaletteIcon aria-hidden /> Customise
            </Button>
          )}
          {look.status && (
            <span className="absolute bottom-3 left-3 inline-flex max-w-[80%] items-center gap-1.5 truncate rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
              <span className="size-1.5 shrink-0 rounded-full bg-[rgb(var(--accent-rgb))] shadow-[0_0_8px_rgb(var(--accent-rgb))]" />
              {look.status}
            </span>
          )}
        </SpaceCover>
      </motion.div>

      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[18rem_1fr]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:-mt-24 lg:self-start">
          <div className="relative -mx-2 flex flex-col items-center gap-1 lg:items-start">
            <MemberPlanet
              handle={planetSeed(handle, look.planet)}
              size={208}
              label={`${m.name} as a planet`}
              stats={{ points: rep?.points ?? 0, threads: rep?.threads ?? 0, replies: rep?.answers ?? 0, accepted: rep?.accepted ?? 0, projects: activity?.projects.length ?? 0, collections: activity?.collections.length ?? 0, events: rep?.eventsHosted ?? 0 }}
            />
            <PlanetLegend className="justify-center px-2 lg:justify-start" />
          </div>
          <div className="flex items-center gap-3">
            <PersonAvatar handle={handle} name={m.name} src={m.avatarUrl} size={48} className="ring-2 ring-[rgb(var(--accent-rgb)/0.6)]" />
            <div className="flex min-w-0 flex-col">
              <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em] break-words">{m.name}</h1>
              {m.handle && <p className="truncate text-sm text-muted-foreground">@{m.handle}</p>}
            </div>
          </div>
          {look.tagline && <p className="text-[15px] font-medium text-[rgb(var(--accent-rgb))]">{look.tagline}</p>}
          {m.bio && <p className="text-[15px]">{m.bio}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {you ? (
              <>
                <Button nativeButton={false} variant="secondary" size="sm" render={<Link href="/settings" />}>
                  <Copy k="profile.member-profile.edit-profile">Edit profile</Copy>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <PaletteIcon aria-hidden /> Customise
                </Button>
              </>
            ) : (
              <FollowButton followee={`member:${m.id}`} name={m.name} />
            )}
            <CosmosLink target={`member:${m.id}`} />
            {!you && <ReportButton targetKind="profile" targetId={m.id} targetUrl={m.handle ? `/people/${m.handle}` : undefined} />}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {m.location && (
              <li className="flex items-center gap-2">
                <MapPinIcon aria-hidden className="size-4 shrink-0" /> {m.location}
              </li>
            )}
            {site && (
              <li className="flex min-w-0 items-center gap-2">
                <GlobeIcon aria-hidden className="size-4 shrink-0" />
                <a href={m.website} target="_blank" rel="noopener noreferrer nofollow me" className="truncate hover:text-foreground hover:underline">
                  {site}
                </a>
              </li>
            )}
            {m.github && (
              <li className="flex items-center gap-2">
                <span aria-hidden className="grid size-4 shrink-0 place-items-center text-[10px] font-semibold">gh</span>
                <Link href={`/gh/${m.github}` as `/gh/${string}`} className="hover:text-foreground hover:underline">
                  {m.github}
                </Link>
              </li>
            )}
            <li className="flex items-center gap-2">
              <CalendarIcon aria-hidden className="size-4 shrink-0" /> Joined {formatDate(m.joinedAt)}
            </li>
          </ul>
          <ReputationCard memberId={m.id} />
          <MissionBadges who={{ memberId: m.id, name: m.name }} />
        </aside>

        <div className="flex min-w-0 flex-col gap-8">
          {shown.length > 0 && (
            <section aria-labelledby="badges-h" className="flex flex-col gap-3">
              <h2 id="badges-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
                <SparklesIcon aria-hidden className="size-4 text-gold" /> Constellations on display
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shown.map((b) => (
                  <li key={b.id} className="h-24">
                    <PixelCard label={b.name} active={`rgb(${rgb})`} colors={`rgb(${rgb}),#f3e3bd,#c9d6f0`}>
                      <div className="flex h-full flex-col justify-end gap-0.5 p-3">
                        <span className="text-sm font-semibold">{b.name}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{b.description}</span>
                      </div>
                    </PixelCard>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pins.length > 0 && <Pinned pins={pins} layout={look.layout} />}

          <section aria-labelledby="activity-h" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="activity-h" className="mb-3 font-sans text-sm font-medium tracking-normal">
              {days ? `${total.toLocaleString("en")} ${total === 1 ? "contribution" : "contributions"} in the last year` : "Activity"}
            </h2>
            {days ? <Heatmap days={days} label={`${m.name}'s contributions over the last 52 weeks`} /> : <div className="h-[91px] animate-pulse rounded-lg bg-white/[0.03]" aria-busy="true" aria-label="Loading activity" />}
            <p className="mt-2 text-xs text-muted-foreground">
              <Copy k="profile.member-profile.projects-published-links-shared-threads">Projects published, links shared, threads started, replies and collections, by day.</Copy>
            </p>
          </section>

          {!activity ? (
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.03]" aria-busy="true" aria-label="Loading" />
          ) : (
            <MotionTabs
              tabs={[
                {
                  id: "built",
                  label: "Built",
                  count: activity.projects.length,
                  content: list(
                    activity.projects.map((p) => (
                      <li key={p.id}>
                        <HubCard e={fromProject(p)} />
                      </li>
                    )),
                    you ? "You have not published a project yet." : `${first} has not published a project yet.`,
                  ),
                },
                {
                  id: "shared",
                  label: "Shared",
                  count: activity.shares.length,
                  content: list(
                    activity.shares.map((s) => <li key={s.id}>{s.kind === "news" ? <NewsShareCard s={s} /> : <HubCard e={fromShare(s)} />}</li>),
                    `${you ? "You have" : `${first} has`} not shared a link yet.`,
                  ),
                },
                {
                  id: "threads",
                  label: "Threads",
                  count: activity.threads.length,
                  content: list(
                    activity.threads.map((q) => (
                      <li key={q.id}>
                        <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-white/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          <span lang={q.lang} className="font-medium">
                            {q.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="text-ion">{getCategory(q.orbit)?.name ?? q.orbit}</span>
                            <TimeAgo date={q.createdAt} />
                            <span className="inline-flex items-center gap-1">
                              <MessageSquareIcon aria-hidden className="size-3" /> {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )),
                    `${you ? "You have" : `${first} has`} not started a thread yet.`,
                  ),
                },
                {
                  id: "collections",
                  label: "Collections",
                  count: activity.collections.length,
                  content: activity.collections.length ? (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {activity.collections.map((c) => (
                        <li key={c.id}>
                          <CollectionCard c={c} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <LayersIcon aria-hidden className="size-4" /> <Copy k="profile.member-profile.no-public-collections-yet">No public collections yet.</Copy>
                    </p>
                  ),
                },
                { id: "points", label: "Points", content: <PointsHistory memberId={m.id} self={you} /> },
              ]}
            />
          )}
        </div>
      </div>

      {you && editing && (
        <CustomiseSpace
          memberId={m.id}
          handle={handle}
          space={look}
          pins={all}
          badges={earned}
          stats={rep ?? EMPTY_STATS}
          onClose={() => setEditing(false)}
          onSaved={(s) => {
            setSpace(s)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

/** The member's pinned work: cards, a list, or riding an orbit (HorizonX Orbit Cards). */
function Pinned({ pins, layout }: { pins: Pin[]; layout: MemberSpace["layout"] }) {
  const reduce = useReducedMotion()
  return (
    <section aria-labelledby="pinned-h" className="flex flex-col gap-3">
      <h2 id="pinned-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
        <PinIcon aria-hidden className="size-4 text-[rgb(var(--accent-rgb))]" /> Pinned
      </h2>
      {layout === "orbit" && pins.length >= 3 ? (
        <OrbitCards items={pins.map((p): OrbitItem => ({ id: p.key, title: p.title, href: p.href as Route, meta: p.type, kind: p.tint }))} label="Pinned work" className="h-72" />
      ) : (
        <ul className={cn(layout === "list" ? "flex flex-col gap-2" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
          {pins.map((p, i) => (
            <motion.li key={p.key} initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : i * 0.04 }}>
              <Link
                href={p.href as Route}
                className={cn(
                  "group flex overflow-hidden rounded-xl border border-border bg-card transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[rgb(var(--accent-rgb)/0.45)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  layout === "list" ? "items-center gap-3 p-2" : "flex-col",
                )}
              >
                <span className={cn("block shrink-0 overflow-hidden", layout === "list" ? "size-12 rounded-lg" : "h-20")}>
                  <Cover seed={p.key} kind={p.tint} className="transition-transform duration-500 ease-out group-hover:scale-105" />
                </span>
                <span className={cn("flex min-w-0 flex-col gap-0.5", layout === "list" ? "" : "p-3")}>
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{p.type}</span>
                  <span className="truncate font-medium">{p.title}</span>
                  {p.summary && <span className="line-clamp-1 text-xs text-muted-foreground">{p.summary}</span>}
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )
}
