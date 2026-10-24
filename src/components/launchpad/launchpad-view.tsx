"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarClockIcon, CrownIcon, HistoryIcon, PlusIcon, RocketIcon } from "lucide-react"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { useNow } from "@/components/live/time"
import { BoostButton, boostState, Countdown, LaunchCover, PhaseBadge, shortCountdown } from "@/components/launchpad/launch-bits"
import { LaunchCalendar } from "@/components/launchpad/launch-calendar"
import { useLaunches } from "@/components/launchpad/use-launches"
import { Skeleton } from "@/components/ui/skeleton"
import { dailyWinners, dayKey, LAUNCH_DAY_MS, launchOfTheDay, launchPhase, type Launch } from "@/lib/launchpad"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const dayLabel = (
  day: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en", {
    ...opts,
    timeZone: "UTC",
  })

/** The Launchpad: today's Launch of the day and live board, upcoming launches on a calendar, and the archive. */
export function LaunchpadView() {
  const now = useNow()
  const { user } = useSession()
  const { launches, error, incoming, boost, reload } = useLaunches()
  const [boostError, setBoostError] = useState("")
  const [day, setDay] = useState<string | null>(null)

  const view = useMemo(() => {
    if (!launches || now === null) return null
    const today = dayKey(now)
    const board = launches
      .filter((l) => dayKey(l.launchAt) === today || launchPhase(l, now) === "live")
      .sort((a, b) => {
        const sa = launchPhase(a, now) === "scheduled"
        const sb = launchPhase(b, now) === "scheduled"
        if (sa !== sb) return sa ? 1 : -1
        return sa ? a.launchAt.localeCompare(b.launchAt) : b.boosts - a.boosts || a.launchAt.localeCompare(b.launchAt)
      })
    const upcoming = launches.filter((l) => launchPhase(l, now) === "scheduled" && dayKey(l.launchAt) !== today).sort((a, b) => a.launchAt.localeCompare(b.launchAt))
    return {
      today,
      board,
      winner: launchOfTheDay(launches, today, now),
      next: launches.filter((l) => launchPhase(l, now) === "scheduled").sort((a, b) => a.launchAt.localeCompare(b.launchAt))[0] ?? null,
      upcoming,
      archive: dailyWinners(launches, now).filter((d) => d.day !== today),
      calendar: launches.filter((l) => Date.parse(l.launchAt) >= now - 31 * LAUNCH_DAY_MS),
    }
  }, [launches, now])

  async function onBoost(l: Launch) {
    setBoostError("")
    try {
      await boost(l)
    } catch (e) {
      setBoostError((e as Error).message)
    }
  }

  const isOwner = (l: Launch) => l.local || Boolean(user && l.owner.memberId === user.id)
  const stateOf = (l: Launch) => boostState(l, now, { isOwner: isOwner(l) })

  if (!view) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading launches">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const selectedLaunches = day ? (launches ?? []).filter((l) => dayKey(l.launchAt) === day).sort((a, b) => a.launchAt.localeCompare(b.launchAt)) : null
  const empty = !launches?.length

  return (
    <div className="flex flex-col gap-10">
      {(error || boostError) && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {boostError || `Launches could not be loaded (${error}).`}{" "}
          {error && (
            <button type="button" onClick={() => void reload()} className="underline underline-offset-2">
              <Copy k="launchpad.launchpad-view.try-again">Try again</Copy>
            </button>
          )}
        </p>
      )}

      {empty ? (
        <div className="flex flex-col gap-5 rounded-2xl border border-dashed border-ion/30 bg-ion/[0.04] px-5 py-10 sm:px-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-ion/10 text-ion">
              <RocketIcon aria-hidden className="size-5 -rotate-45" />
            </span>
            <h2 className="font-sans text-base font-semibold tracking-normal"><Copy k="launchpad.launchpad-view.nothing-on-the-pad-yet">Nothing on the pad yet</Copy></h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {live
                ? <Copy k="launchpad.launchpad-view.schedule-the-first-launch-pick" multiline>Schedule the first launch: pick one of your published projects and a time, and members boost it on the day.</Copy>
                : <Copy k="launchpad.launchpad-view.launches-you-schedule-in-this" multiline>Launches you schedule in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can see or boost them.</Copy>}
            </p>
            <Link href="/launchpad/new" className={primaryButton}>
              <PlusIcon aria-hidden className="size-4" /> <Copy k="launchpad.launchpad-view.schedule-the-first-launch">Schedule the first launch</Copy>
            </Link>
          </div>
          <ol className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            {[
              ["Countdown", "Your launch gets a page with a countdown as soon as you schedule it, up to 90 days ahead."],
              ["Launch day", "For 24 hours from launch time, members boost it once each. Boosts arrive live."],
              ["Launch of the day", "The launch with the most boosts among those launched on a day (UTC) wins that day."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-lg border border-border bg-card/40 p-3">
                <p className="text-xs text-muted-foreground tabular">Step {i + 1}</p>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Spotlight
            winner={view.winner}
            next={view.next}
            now={now!}
            state={view.winner ? stateOf(view.winner) : "scheduled"}
            incoming={view.winner ? incoming[view.winner.id] : 0}
            onBoost={onBoost}
          />
          <section aria-labelledby="board-h" className="border border-border bg-card flex flex-col gap-3 rounded-2xl p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="board-h" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
                <RocketIcon aria-hidden className="size-4 -rotate-45 text-ion" /> <Copy k="launchpad.launchpad-view.todays-board">Today’s board</Copy>
              </h2>
              <span className="text-xs text-muted-foreground">{dayLabel(view.today, { day: "numeric", month: "short" })} · UTC</span>
            </div>
            {view.board.length ? (
              <ol className="flex flex-col gap-1">
                {view.board.map((l, i) => {
                  const phase = launchPhase(l, now!)
                  return (
                    <li key={l.id} className={cn("group relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]", rise)} style={riseDelay(i)}>
                      <span className={cn("w-5 shrink-0 text-center text-sm font-semibold tabular", i === 0 && phase !== "scheduled" ? "text-gold" : "text-muted-foreground")}>
                        {phase === "scheduled" ? "·" : i + 1}
                      </span>
                      <LaunchCover launch={l} className="size-10 shrink-0" rounded="rounded-lg" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Link
                          href={`/launchpad/${l.id}`}
                          className="truncate text-sm font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
                        >
                          {l.name}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {phase === "scheduled" ? `Launches in ${shortCountdown(Date.parse(l.launchAt) - now!)}` : dayKey(l.launchAt) !== view.today ? "Still flying from yesterday" : l.tagline}
                        </span>
                      </div>
                      {phase === "scheduled" ? (
                        <time dateTime={l.launchAt} className="shrink-0 text-xs text-ion tabular">
                          {new Date(l.launchAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      ) : (
                        <div className="relative z-[1]">
                          <BoostButton launch={l} state={stateOf(l)} count={l.boosts} incoming={incoming[l.id]} onBoost={() => void onBoost(l)} size="sm" />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No launches today. {view.next ? <Copy k="launchpad.launchpad-view.the-next-one-is-on">The next one is on the calendar below.</Copy> : ""}</p>
            )}
            <Link href="/launchpad/new" className={cn(primaryButton, "mt-auto w-fit")}>
              <PlusIcon aria-hidden className="size-4" /> <Copy k="launchpad.launchpad-view.schedule-a-launch">Schedule a launch</Copy>
            </Link>
          </section>
        </div>
      )}

      {!empty && (
        <section aria-labelledby="upcoming-h" className="flex flex-col gap-4">
          <h2 id="upcoming-h" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
            <CalendarClockIcon aria-hidden className="size-4 text-ion" /> <Copy k="launchpad.launchpad-view.coming-up">Coming up</Copy>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="border border-border bg-card rounded-2xl p-4">
              <LaunchCalendar launches={view.calendar} now={now!} selected={day} onSelect={setDay} />
            </div>
            <div className="flex flex-col gap-2">
              {day && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{dayLabel(day)}</span>
                  <button type="button" onClick={() => setDay(null)} className="text-xs text-ion hover:underline">
                    <Copy k="launchpad.launchpad-view.show-all-upcoming">Show all upcoming</Copy>
                  </button>
                </div>
              )}
              {(selectedLaunches ?? view.upcoming).length ? (
                <ol className="flex flex-col gap-2">
                  {(selectedLaunches ?? view.upcoming).slice(0, 12).map((l, i) => (
                    <li key={l.id} className={rise} style={riseDelay(i)}>
                      <UpcomingRow l={l} now={now!} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"><Copy k="launchpad.launchpad-view.no-launches-scheduled-after-today">No launches scheduled after today yet.</Copy></p>
              )}
            </div>
          </div>
        </section>
      )}

      {view.archive.length > 0 && (
        <section aria-labelledby="archive-h" className="flex flex-col gap-4">
          <h2 id="archive-h" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
            <HistoryIcon aria-hidden className="size-4 text-ion" /> <Copy k="launchpad.launchpad-view.past-launches">Past launches</Copy>
          </h2>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {view.archive.slice(0, 14).map(({ day: d, winner, others }) => (
              <li key={d} className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
                <p className="text-xs text-muted-foreground">{dayLabel(d)}</p>
                <Link href={`/launchpad/${winner.id}`} className="group flex items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <LaunchCover launch={winner} className="size-12 shrink-0" rounded="rounded-lg" />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gold">
                      <CrownIcon aria-hidden className="size-3.5" /> <Copy k="launchpad.launchpad-view.launch-of-the-day">Launch of the day</Copy>
                    </span>
                    <span className="truncate font-medium group-hover:text-ion">{winner.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {winner.boosts} {winner.boosts === 1 ? "boost" : "boosts"} · by {winner.owner.name}
                    </span>
                  </span>
                </Link>
                {others.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-white/[0.06] pt-2">
                    {others.slice(0, 3).map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/launchpad/${o.id}`} className="truncate text-muted-foreground hover:text-foreground">
                          {o.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground tabular">{o.boosts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function Spotlight({
  winner,
  next,
  now,
  state,
  incoming,
  onBoost,
}: {
  winner: Launch | null
  next: Launch | null
  now: number
  state: ReturnType<typeof boostState>
  incoming?: number
  onBoost: (l: Launch) => void
}) {
  const l = winner ?? next
  if (!l) {
    return (
      <section className="border border-border bg-card flex flex-col items-start justify-center gap-3 rounded-2xl p-6">
        <p className="text-sm text-muted-foreground"><Copy k="launchpad.launchpad-view.no-launch-today-and-nothing">No launch today and nothing scheduled.</Copy></p>
        <Link href="/launchpad/new" className={primaryButton}>
          <Copy k="launchpad.launchpad-view.schedule-a-launch">Schedule a launch</Copy>
        </Link>
      </section>
    )
  }
  const phase = launchPhase(l, now)
  return (
    <section aria-labelledby="spotlight-h" className="relative isolate flex flex-col overflow-hidden rounded-2xl border border-white/10">
      <LaunchCover launch={l} className="absolute inset-0 -z-10 opacity-70" rounded="rounded-none" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/10" />
      <div className="flex flex-1 flex-col justify-end gap-3 p-5 pt-24 md:p-6 md:pt-28">
        <div className="flex flex-wrap items-center gap-2">
          {winner ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
              <CrownIcon aria-hidden className="size-3.5" /> <Copy k="launchpad.launchpad-view.launch-of-the-day">Launch of the day</Copy>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ion/30 bg-ion/10 px-2 py-0.5 text-xs font-medium text-ion"><Copy k="launchpad.launchpad-view.next-launch">Next launch</Copy></span>
          )}
          <PhaseBadge phase={phase} />
        </div>
        <h2 id="spotlight-h" className="text-xl leading-tight font-semibold tracking-[-0.01em] md:text-2xl">
          <Link data-nav-link href={`/launchpad/${l.id}`} className="rounded-sm hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {l.name}
          </Link>
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground md:text-[15px]">{l.tagline}</p>
        <p className="text-xs text-muted-foreground">by {l.owner.name}</p>
        {phase === "scheduled" ? (
          <Countdown to={l.launchAt} size="sm" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <BoostButton launch={l} state={state} count={l.boosts} incoming={incoming} onBoost={() => onBoost(l)} />
            {phase === "live" && <span className="text-xs text-muted-foreground">Boosting closes in {shortCountdown(Date.parse(l.launchAt) + LAUNCH_DAY_MS - now)}</span>}
          </div>
        )}
      </div>
    </section>
  )
}

function UpcomingRow({ l, now }: { l: Launch; now: number }) {
  const phase = launchPhase(l, now)
  const at = new Date(l.launchAt)
  return (
    <article className="group relative flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3 transition-colors hover:bg-white/[0.03]">
      <LaunchCover launch={l} className="size-11 shrink-0" rounded="rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/launchpad/${l.id}`}
          className="truncate text-sm font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
        >
          {l.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{l.tagline}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        {phase === "scheduled" ? (
          <>
            <span className="text-xs font-medium text-ion tabular">in {shortCountdown(at.getTime() - now)}</span>
            <time dateTime={l.launchAt} className="hidden text-[11px] text-muted-foreground sm:block">
              {at.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </>
        ) : (
          <PhaseBadge phase={phase} />
        )}
      </div>
    </article>
  )
}
