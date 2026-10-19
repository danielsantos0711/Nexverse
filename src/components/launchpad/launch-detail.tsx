"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUpRightIcon, CalendarClockIcon, CrownIcon, RocketIcon, Trash2Icon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { AvatarStack } from "@/components/events/event-bits"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Breadcrumbs, PosterAvatar } from "@/components/forum/forum-ui"
import { PostBody } from "@/components/forum/post-body"
import { useNow } from "@/components/live/time"
import { BoostButton, boostState, Countdown, LaunchCover, PhaseBadge, shortCountdown } from "@/components/launchpad/launch-bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { Who } from "@/lib/community"
import {
  boostLaunch,
  currentMemberId,
  dayKey,
  deleteLaunch,
  getBoosters,
  getLaunch,
  LAUNCH_DAY_MS,
  launchOfTheDay,
  launchPhase,
  listLaunches,
  subjectOf,
  subscribeLaunchpad,
  type Launch,
} from "@/lib/launchpad"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** One launch: countdown before, the live board with boosts on the day, the result after, and comments. */
export function LaunchDetail({ id }: { id: string }) {
  const { ready, user } = useSession()
  const [launch, setLaunch] = useState<Launch | null | undefined>(undefined)
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getLaunch(id)
      .then((l) => {
        if (stale) return
        setLaunch(l)
        if (l) document.title = `${l.name} · Launchpad · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id, ready, user?.id])

  if (error) return <Missing title="This launch could not be loaded" detail={error} />
  if (launch === undefined) return <PageSkeleton />
  if (launch === null) return <Missing title="This launch is not here" detail="It may have been scrubbed before take-off." />
  return <LaunchPage key={launch.id} initial={launch} />
}

function LaunchPage({ initial }: { initial: Launch }) {
  const router = useRouter()
  const now = useNow()
  const { user, member } = useSession()
  const [l, setL] = useState(initial)
  const [incoming, setIncoming] = useState(0)
  const [boosters, setBoosters] = useState<Who[] | null>(null)
  const [rank, setRank] = useState<{
    place: number
    of: number
    crowned: boolean
  } | null>(null)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState(false)
  const meRef = useRef<string | null>(null)
  const phase = now === null ? null : launchPhase(l, now)
  const isOwner = l.local || Boolean(user && l.owner.memberId === user.id)
  const subject = subjectOf(l)

  const loadSide = useCallback(async (current: Launch) => {
    const [who, all] = await Promise.all([getBoosters(current).catch(() => []), listLaunches().catch(() => [] as Launch[])])
    setBoosters(who)
    const t = Date.now()
    const sameDay = all.filter((x) => dayKey(x.launchAt) === dayKey(current.launchAt) && launchPhase(x, t) !== "scheduled").map((x) => (x.id === current.id ? current : x))
    const sorted = [...sameDay].sort((a, b) => b.boosts - a.boosts || a.launchAt.localeCompare(b.launchAt))
    const place = sorted.findIndex((x) => x.id === current.id) + 1
    const crowned = launchPhase(current, t) === "landed" && launchOfTheDay(sameDay, dayKey(current.launchAt), t)?.id === current.id
    setRank(place ? { place, of: sorted.length, crowned } : null)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the database (or reads the address) once mounted; state is set when it answers
    void loadSide(initial)
    void currentMemberId().then((id) => (meRef.current = id))
    const stop = subscribeLaunchpad((s) => {
      if (s.type !== "boost") return
      if (live && s.userId === meRef.current) return
      setIncoming((n) => n + 1)
      setL((x) => ({
        ...x,
        boosts: x.boosts + 1,
        boosted: x.boosted || (!live && s.userId === "local"),
      }))
    }, initial.id)
    return stop
  }, [initial, loadSide])

  async function onBoost() {
    setError("")
    setL((x) => ({ ...x, boosted: true, boosts: x.boosts + 1 }))
    setBoosters((b) => [{ name: member?.name ?? "You", memberId: member?.id }, ...(b ?? [])])
    try {
      await boostLaunch(l)
    } catch (e) {
      setL((x) => ({
        ...x,
        boosted: false,
        boosts: Math.max(0, x.boosts - 1),
      }))
      setBoosters((b) => (b ?? []).slice(1))
      setError((e as Error).message)
    }
  }

  async function scrub() {
    setConfirm(false)
    try {
      await deleteLaunch(l.id)
      router.push("/launchpad")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const launchAt = new Date(l.launchAt)

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Launchpad", href: "/launchpad" }, { label: l.name }]} />

      <header className="relative isolate mt-5 overflow-hidden rounded-2xl border border-white/10">
        <LaunchCover launch={l} className="absolute inset-0 -z-10 opacity-80" rounded="rounded-none" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/75 to-background/5" />
        <div className="flex flex-col gap-3 p-5 pt-28 md:p-7 md:pt-36">
          <div className="flex flex-wrap items-center gap-2">
            {phase ? <PhaseBadge phase={phase} /> : <Skeleton className="h-5 w-20 rounded-full" />}
            {rank?.crowned && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                <CrownIcon aria-hidden className="size-3.5" /> Launch of the day
              </span>
            )}
            {l.local && <span className="text-xs text-muted-foreground">Saved in this browser only</span>}
          </div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.02em]">{l.name}</h1>
          <p className="max-w-[60ch] text-[15px] text-foreground/85">{l.tagline}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <PosterAvatar poster={l.owner} size={22} />
              {l.owner.handle ? (
                <Link href={`/people/${l.owner.handle}`} className="hover:text-foreground">
                  {l.owner.name}
                </Link>
              ) : (
                l.owner.name
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon aria-hidden className="size-4" />
              {now === null ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <time dateTime={l.launchAt}>
                  {launchAt.toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              )}
            </span>
            {subject && (
              <Link href={subject.href as never} className="inline-flex items-center gap-1 text-ion hover:underline">
                {subject.label} <ArrowUpRightIcon aria-hidden className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {l.description && (
            <section aria-labelledby="about-h" className="flex flex-col gap-2">
              <h2 id="about-h" className="font-sans text-base font-semibold tracking-normal">
                About this launch
              </h2>
              <PostBody source={l.description} />
            </section>
          )}

          {l.gallery.length > 0 && (
            <section aria-labelledby="gallery-h" className="flex flex-col gap-3">
              <h2 id="gallery-h" className="font-sans text-base font-semibold tracking-normal">
                Gallery
              </h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {l.gallery.map((src, i) => (
                  <li key={src}>
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-xl border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- member uploads from Supabase Storage; the host depends on the deployment */}
                      <img
                        src={src}
                        alt={`${l.name}, picture ${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="aspect-video w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                      />
                      <span className="sr-only">(opens full size in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ThreadDiscussion threadId={`launch-${l.id}`} heading="Comments" />

          {isOwner && phase === "scheduled" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
                <Trash2Icon aria-hidden /> Scrub this launch
              </Button>
            </div>
          )}
        </div>

        <aside aria-label="Launch board" className="order-first flex flex-col gap-4 lg:sticky lg:top-20 lg:order-none lg:self-start">
          <section aria-labelledby="pad-h" className={cn("glass flex flex-col gap-4 rounded-2xl p-5", phase === "live" && "border-ok/25 shadow-[0_0_40px_-12px_rgb(110_231_183/0.35)]")}>
            <h2 id="pad-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
              <RocketIcon aria-hidden className="size-4 -rotate-45 text-ion" />
              {phase === "scheduled" ? "Countdown" : phase === "live" ? "Launch day" : "Final count"}
            </h2>
            {phase === null ? (
              <Skeleton className="h-24 w-full" />
            ) : phase === "scheduled" ? (
              <>
                <Countdown to={l.launchAt} />
                <p className="text-xs text-muted-foreground">Boosting opens at launch time and stays open for 24 hours. Come back then, or share the page.</p>
              </>
            ) : (
              <>
                <BoostButton launch={l} state={boostState(l, now, { isOwner })} count={l.boosts} incoming={incoming} onBoost={() => void onBoost()} className="self-start" />
                <p className="text-sm text-muted-foreground tabular">
                  {rank ? (
                    rank.crowned ? (
                      <>Most boosted launch of its day.</>
                    ) : (
                      <>
                        {phase === "live" ? "Right now" : "Finished"} #{rank.place} of {rank.of} launched {dayKey(l.launchAt) === dayKey(now!) ? "today" : "that day"}.
                      </>
                    )
                  ) : (
                    " "
                  )}
                </p>
                {phase === "live" && <p className="text-xs text-muted-foreground">Boosting closes in {shortCountdown(Date.parse(l.launchAt) + LAUNCH_DAY_MS - now!)}. One boost per member.</p>}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </section>

          {phase !== "scheduled" && (
            <section aria-labelledby="boosters-h" className="flex flex-col gap-2 rounded-2xl border border-border p-4">
              <h2 id="boosters-h" className="font-sans text-sm font-semibold tracking-normal">
                Boosted by
              </h2>
              {boosters === null ? (
                <Skeleton className="h-7 w-2/3" />
              ) : boosters.length ? (
                <>
                  <AvatarStack people={boosters} max={12} size={28} label={`${l.boosts} boosts`} />
                  {l.boosts > boosters.length && <p className="text-xs text-muted-foreground tabular">and {l.boosts - boosters.length} more</p>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{phase === "live" ? "Nobody yet. Be the first." : "Nobody boosted it."}</p>
              )}
            </section>
          )}
        </aside>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scrub this launch?</DialogTitle>
            <DialogDescription>It comes off the calendar. You can schedule a new one any time. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={scrub}>
              Scrub launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Missing({ title, detail }: { title: string; detail: string }) {
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/launchpad" className="text-ion hover:underline">
          Back to the Launchpad
        </Link>
      </EmptyContent>
    </Empty>
  )
}
