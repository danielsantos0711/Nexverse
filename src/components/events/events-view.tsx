"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { CalendarDaysIcon, CalendarPlusIcon } from "lucide-react"
import { AvatarStack, KindBadge, ModeLabel } from "@/components/events/event-bits"
import { DateTile, EventWhen } from "@/components/events/event-time"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { useNow } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { EVENT_KINDS, type Attendees, type CommunityEvent, type EventKind } from "@/lib/community"
import { getAttendeesMany, listEvents } from "@/lib/events"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type View = "upcoming" | "past" | "mine"
const VIEWS: { value: View; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "mine", label: "Your RSVPs" },
]

/** Every event: upcoming soonest first, past most recent first, and the ones you RSVP'd to. */
export function EventsView() {
  const { ready, user } = useSession()
  const now = useNow()
  const reduce = useReducedMotion()
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [attendees, setAttendees] = useState<Record<string, Attendees>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [view, setView] = useState<View>("upcoming")
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState<EventKind | "all">("all")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listEvents()
      .then(async (list) => {
        if (stale) return
        setEvents(list)
        setError("")
        const a = await getAttendeesMany(list).catch(() => ({}))
        if (!stale) setAttendees(a)
      })
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoaded(true))
    return () => {
      stale = true
    }
  }, [ready, user?.id, attempt])

  const { upcoming, past, mine } = useMemo(() => {
    const t = now ?? 0
    const byKind = events.filter((e) => kind === "all" || e.kind === kind)
    return {
      upcoming: byKind.filter((e) => Date.parse(e.endsAt) >= t).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      past: byKind.filter((e) => Date.parse(e.endsAt) < t).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
      mine: byKind.filter((e) => attendees[e.id]?.mine).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }
  }, [events, attendees, kind, now])

  const list = view === "upcoming" ? upcoming : view === "past" ? past : mine
  const counts: Record<View, number> = { upcoming: upcoming.length, past: past.length, mine: mine.length }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Which events" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
          {VIEWS.map((v) => {
            const on = v.value === view
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="events-panel"
                onClick={() => setView(v.value)}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && <motion.span layoutId="events-view" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
                <span className="relative">
                  {v.label}
                  {now !== null && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{counts[v.value]}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="event-kind" className="sr-only">
            Kind of event
          </label>
          <select
            id="event-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind | "all")}
            className="h-9 rounded-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all" className="bg-popover">
              All kinds
            </option>
            {(Object.keys(EVENT_KINDS) as EventKind[]).map((k) => (
              <option key={k} value={k} className="bg-popover">
                {EVENT_KINDS[k].plural}
              </option>
            ))}
          </select>
          <Link href="/events/new" className={primaryButton}>
            <CalendarPlusIcon aria-hidden className="size-4" /> Create an event
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Events could not be loaded ({error}).{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      <div id="events-panel" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)?.label} aria-busy={now === null || !loaded}>
        {now === null || !loaded ? (
          <ul className="flex flex-col gap-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-28 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : list.length ? (
          <ol className="flex flex-col gap-3">
            {list.map((e, i) => (
              <li key={e.id} className={rise} style={riseDelay(i)}>
                <EventRow e={e} attendees={attendees[e.id]} past={Date.parse(e.endsAt) < now} live={Date.parse(e.startsAt) <= now && Date.parse(e.endsAt) >= now} />
              </li>
            ))}
          </ol>
        ) : error && events.length === 0 ? null : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ion/30 bg-ion/[0.04] px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <CalendarDaysIcon aria-hidden className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              {events.length === 0
                ? live
                  ? "No events yet. Host the first one: a paper club, a meetup, office hours or an AMA, online or in person."
                  : "Events you create in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can see them yet."
                : view === "mine"
                  ? "You have not RSVP’d to anything yet. Pick an event and say you’re going or interested."
                  : view === "past"
                    ? "No past events yet."
                    : kind === "all"
                      ? "Nothing on the calendar right now. Host the next one."
                      : `No upcoming ${EVENT_KINDS[kind].plural.toLowerCase()}. Host one.`}
            </p>
            {(view !== "mine" || events.length === 0) && (
              <Link href="/events/new" className={primaryButton}>
                <CalendarPlusIcon aria-hidden className="size-4" /> {events.length === 0 ? "Host the first event" : "Create an event"}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({ e, attendees, past, live: happening }: { e: CommunityEvent; attendees?: Attendees; past: boolean; live: boolean }) {
  const going = attendees?.going ?? []
  const interested = attendees?.interested.length ?? 0
  return (
    <article className={cn("group relative flex gap-4 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03]", past && "opacity-80")}>
      <DateTile iso={e.startsAt} past={past} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={e.kind} />
          {happening && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">Happening now</span>}
          {attendees?.mine && <span className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">{attendees.mine === "going" ? "You’re going" : "You’re interested"}</span>}
          {e.local && <span className="text-xs text-muted-foreground">Saved in this browser</span>}
        </div>
        <h2 className="font-sans text-base leading-snug font-semibold tracking-normal">
          <Link
            href={`/events/${e.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
          >
            {e.title}
          </Link>
        </h2>
        <EventWhen event={e} className="text-sm" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ModeLabel mode={e.mode} location={e.location} className="max-w-full sm:max-w-80" />
          <span className="text-xs text-muted-foreground">Hosted by {e.host.name}</span>
          <span className="text-xs text-muted-foreground tabular sm:hidden">
            {going.length} {past ? "went" : "going"}
          </span>
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end justify-center gap-1.5 sm:flex">
        <AvatarStack people={going} max={5} size={24} label={`${going.length} going`} />
        <span className="text-xs text-muted-foreground tabular">
          {going.length} {past ? "went" : "going"}
          {interested > 0 && ` · ${interested} interested`}
        </span>
      </div>
    </article>
  )
}
