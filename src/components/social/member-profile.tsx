"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CalendarIcon, GlobeIcon, LayersIcon, MapPinIcon, MessageSquareIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CollectionCard } from "@/components/collections/collection-card"
import { CosmosLink } from "@/components/cosmos/cosmos-link"
import { PersonAvatar } from "@/components/hub/bits"
import { HubCard, NewsShareCard } from "@/components/hub/cards"
import { dailyCounts, Heatmap } from "@/components/hub/heatmap"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { TimeAgo } from "@/components/live/time"
import { MissionBadges } from "@/components/missions/mission-badges"
import { MemberPlanet, PlanetLegend } from "@/components/planet/member-planet"
import { ReputationCard } from "@/components/reputation/reputation-card"
import { FollowButton } from "@/components/social/follow-button"
import { ReportButton } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDate, getCategory } from "@/lib/data"
import { getMemberReputation, EMPTY_STATS, type RepStats } from "@/lib/community"
import { fromProject, fromShare } from "@/lib/hub"
import { getMember, getMemberActivity, type MemberActivity, type PublicMember } from "@/lib/people"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; m: PublicMember }

/** A member's public profile, by handle or id: who they are and everything they made, wrote and curated. */
export function MemberProfile({ memberRef }: { memberRef: string }) {
  const { ready } = useSession()
  const [found, setState] = useState<State>({ status: "loading" })
  // Without a database there are no accounts, so there is nothing to load.
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
          <EmptyTitle>{state.status === "error" ? "This profile could not be loaded" : "No member here"}</EmptyTitle>
          <EmptyDescription>
            {state.status === "error" ? state.message : live ? "Nobody on Nexverse goes by that name. They may have changed their handle." : "This copy of Nexverse has no accounts, so there are no profiles to show."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} variant="secondary" render={<Link href="/people" />}>
            See everyone
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return <Profile key={state.m.id} m={state.m} />
}

function Profile({ m }: { m: PublicMember }) {
  const { user } = useSession()
  const [activity, setActivity] = useState<MemberActivity | null>(null)
  const [rep, setRep] = useState<RepStats | null>(null)
  const [now, setNow] = useState<number | null>(null)
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
    return () => {
      stale = true
    }
  }, [m.id, user?.id])

  const days = useMemo(() => {
    if (!activity || now === null) return null
    const dates = [...activity.projects.map((p) => p.publishedAt ?? p.createdAt), ...activity.shares.map((s) => s.createdAt), ...activity.threads.map((t) => t.createdAt), ...activity.replyDates, ...activity.collections.map((c) => c.createdAt)]
    return dailyCounts(dates, now)
  }, [activity, now])
  const total = days?.reduce((a, b) => a + b, 0) ?? 0
  const handle = m.handle ?? m.id
  const site = m.website ? m.website.replace(/^https:\/\//, "").replace(/\/$/, "") : ""

  const list = (items: React.ReactNode[], empty: string) => (items.length ? <ul className="flex flex-col gap-2">{items}</ul> : <p className="text-muted-foreground">{empty}</p>)
  const first = m.name.split(/\s+/)[0]

  return (
    <div className="shell grid grid-cols-1 gap-10 pt-10 pb-16 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        {/* The member as a planet: it grows with reputation, rings for what they wrote, moons for what they made. */}
        <div className="relative -mx-2 -mt-4 flex flex-col items-center gap-1 lg:items-start">
          <MemberPlanet
            handle={handle}
            size={232}
            label={`${m.name} as a planet`}
            stats={{ points: rep?.points ?? 0, threads: rep?.threads ?? 0, replies: rep?.answers ?? 0, accepted: rep?.accepted ?? 0, projects: activity?.projects.length ?? 0, collections: activity?.collections.length ?? 0, events: rep?.eventsHosted ?? 0 }}
          />
          <PlanetLegend className="justify-center px-2 lg:justify-start" />
        </div>
        <div className="flex items-center gap-3">
          <PersonAvatar handle={handle} name={m.name} src={m.avatarUrl} size={44} />
          <div className="flex min-w-0 flex-col">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em] break-words">{m.name}</h1>
            {m.handle && <p className="truncate text-sm text-muted-foreground">@{m.handle}</p>}
          </div>
        </div>
        {m.bio && <p className="text-[15px]">{m.bio}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {you ? (
            <Button nativeButton={false} variant="secondary" size="sm" render={<Link href="/settings" />}>
              Edit profile
            </Button>
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
              <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 fill-current">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
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
        <section aria-labelledby="activity-h" className="glass rounded-2xl p-5">
          <h2 id="activity-h" className="mb-3 font-sans text-sm font-medium tracking-normal">
            {days ? `${total.toLocaleString("en")} ${total === 1 ? "contribution" : "contributions"} in the last year` : "Activity"}
          </h2>
          {days ? <Heatmap days={days} label={`${m.name}'s contributions over the last 52 weeks`} /> : <div className="h-[91px] animate-pulse rounded-lg bg-white/[0.03]" aria-busy="true" aria-label="Loading activity" />}
          <p className="mt-2 text-xs text-muted-foreground">Projects published, links shared, threads started, replies and collections, by day.</p>
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
                  you ? "You have not published a project yet." : `${first} has not published a project yet.`
                ),
              },
              {
                id: "shared",
                label: "Shared",
                count: activity.shares.length,
                content: list(
                  activity.shares.map((s) => <li key={s.id}>{s.kind === "news" ? <NewsShareCard s={s} /> : <HubCard e={fromShare(s)} />}</li>),
                  `${you ? "You have" : `${first} has`} not shared a link yet.`
                ),
              },
              {
                id: "threads",
                label: "Threads",
                count: activity.threads.length,
                content: list(
                  activity.threads.map((q) => (
                    <li key={q.id}>
                      <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
                  `${you ? "You have" : `${first} has`} not started a thread yet.`
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
                    <LayersIcon aria-hidden className="size-4" /> No public collections yet.
                  </p>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
