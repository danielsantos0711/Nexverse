"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CalendarCheckIcon, CalendarPlusIcon, CheckIcon, ExternalLinkIcon, MapPinIcon, MonitorIcon, StarIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { AvatarStack, KindBadge } from "@/components/events/event-bits"
import { EventWhen, useMounted } from "@/components/events/event-time"
import { Breadcrumbs, PosterAvatar } from "@/components/forum/forum-ui"
import { PostBody } from "@/components/forum/post-body"
import { useNow } from "@/components/live/time"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteEvent, eventIcs, googleCalendarHref, setRsvp, type Attendees, type CommunityEvent, type RsvpStatus, type Who } from "@/lib/community"
import { getAttendees, getEvent } from "@/lib/events"
import { useSession } from "@/lib/store"
import { ModMenu, ReportButton } from "@/components/moderation"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/** One event: when (in your time zone), where, who is going, RSVP and add-to-calendar. */
export function EventDetail({ id }: { id: string }) {
  const [event, setEvent] = useState<CommunityEvent | null | undefined>(undefined)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    getEvent(id)
      .then((e) => {
        if (stale) return
        setEvent(e)
        if (e) document.title = `${e.title} · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id])

  if (error) return <Missing title="This event could not be loaded" detail={error} />
  if (event === undefined) return <PageSkeleton />
  if (event === null) return <Missing title="This event is not here" detail="It may have been cancelled by its host." />
  return <EventPage event={event} />
}

function EventPage({ event: e }: { event: CommunityEvent }) {
  const router = useRouter()
  const now = useNow()
  const { ready, user, member } = useSession()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState("")
  const past = now !== null && Date.parse(e.endsAt) < now
  const happening = now !== null && Date.parse(e.startsAt) <= now && !past
  const isHost = e.local || Boolean(user && e.host.memberId === user.id)

  async function remove() {
    setConfirmDelete(false)
    try {
      await deleteEvent(e.id)
      router.push("/events")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: e.title }]} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={e.kind} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {e.mode === "online" ? <MonitorIcon aria-hidden className="size-3" /> : <MapPinIcon aria-hidden className="size-3" />}
                {e.mode === "online" ? "Online" : "In person"}
              </span>
              {happening && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">Happening now</span>}
              {past && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">This event has ended</span>}
              {e.local && <span className="text-xs text-muted-foreground">Saved in this browser only</span>}
            </div>
            <h1 className="text-xl leading-snug font-semibold tracking-[-0.015em] md:text-2xl">{e.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HostLine host={e.host} />
              {!e.local && (
                <div className="flex items-center gap-1">
                  <ReportButton targetKind="event" targetId={e.id} targetUrl={`/events/${e.id}`} />
                  <ModMenu kind="event" id={e.id} onDone={(act) => act === "remove" && router.push("/events")} />
                </div>
              )}
            </div>
          </header>

          <dl className="glass grid grid-cols-1 gap-4 rounded-xl p-4 sm:grid-cols-2 md:p-5">
            <div className="flex gap-3">
              <CalendarCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">When</dt>
                <dd className="text-sm">
                  <EventWhen event={e} showHostZone />
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              {e.mode === "online" ? <MonitorIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion" /> : <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion" />}
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Where</dt>
                <dd className="text-sm break-words">
                  {e.mode === "online" ? (
                    <a href={e.location} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-ion hover:underline">
                      Join online <ExternalLinkIcon aria-hidden className="size-3.5" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <>
                      <span className="block">{e.location}</span>
                      <a
                        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(e.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-ion hover:underline"
                      >
                        Open in a map <ExternalLinkIcon aria-hidden className="size-3" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </>
                  )}
                </dd>
              </div>
            </div>
          </dl>

          <section aria-labelledby="about-h" className="flex flex-col gap-2">
            <h2 id="about-h" className="font-sans text-base font-semibold tracking-normal">
              About this event
            </h2>
            {e.description ? <PostBody source={e.description} /> : <p className="text-sm text-muted-foreground">The host has not added a description.</p>}
          </section>

          {isHost && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon aria-hidden /> Cancel this event
              </Button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <aside aria-label="RSVP and attendees" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <RsvpPanel event={e} past={past} ready={!live || ready} signedIn={!live || Boolean(user)} me={{ name: member?.name ?? "You", memberId: member?.id }} />
          <CalendarButtons event={e} disabled={past} />
        </aside>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
            <DialogDescription>The event and everyone’s RSVPs are removed. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove}>
              Cancel event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HostLine({ host }: { host: Who }) {
  const inner = (
    <>
      <PosterAvatar poster={host} size={24} />
      <span>
        Hosted by <span className="font-medium text-foreground">{host.name}</span>
      </span>
    </>
  )
  return host.handle ? (
    <Link href={`/people/${host.handle}`} className="flex w-fit items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {inner}
    </Link>
  ) : (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">{inner}</p>
  )
}

function RsvpPanel({ event: e, past, ready, signedIn, me }: { event: CommunityEvent; past: boolean; ready: boolean; signedIn: boolean; me: Who }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [att, setAtt] = useState<Attendees | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!ready) return
    let stale = false
    getAttendees(e)
      .then((a) => !stale && setAtt(a))
      .catch((err: Error) => !stale && (setError(err.message), setAtt({ going: [], interested: [], mine: null })))
    return () => {
      stale = true
    }
  }, [e, ready, signedIn])

  const isMe = (w: Who) => (me.memberId ? w.memberId === me.memberId : !w.handle && !w.memberId && w.name === "You")
  const going = att?.going.length ?? 0
  const full = e.capacity !== null && going >= e.capacity && att?.mine !== "going"

  async function choose(next: RsvpStatus) {
    if (!att || busy) return
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const target: RsvpStatus | null = att.mine === next ? null : next
    const before = att
    const without = { going: att.going.filter((w) => !isMe(w)), interested: att.interested.filter((w) => !isMe(w)) }
    setAtt({ ...without, ...(target ? { [target]: [me, ...without[target]] } : {}), mine: target })
    setBusy(true)
    setError("")
    try {
      await setRsvp(e.id, target)
      setStatus(target === "going" ? "You’re going." : target === "interested" ? "Marked as interested." : "RSVP withdrawn.")
    } catch (err) {
      setAtt(before)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!att) {
    return (
      <div className="glass flex flex-col gap-3 rounded-xl p-4" aria-busy="true" aria-label="Loading RSVPs">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    )
  }

  const options: { value: RsvpStatus; label: string; icon: typeof CheckIcon; count: number }[] = [
    { value: "going", label: "Going", icon: CheckIcon, count: att.going.length },
    { value: "interested", label: "Interested", icon: StarIcon, count: att.interested.length },
  ]

  return (
    <section aria-labelledby="rsvp-h" className="glass flex flex-col gap-4 rounded-xl p-4">
      <h2 id="rsvp-h" className="font-sans text-sm font-semibold tracking-normal">
        {past ? "Who came" : "Are you coming?"}
      </h2>
      {!past && (
        <div role="group" aria-label="RSVP" className="grid grid-cols-2 gap-2">
          {options.map((o) => {
            const on = att.mine === o.value
            const disabled = busy || (o.value === "going" && full)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                aria-pressed={on}
                disabled={disabled}
                className={cn(
                  "pressable relative inline-flex h-10 items-center justify-center gap-1.5 overflow-hidden rounded-full border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
                  on ? "border-transparent text-primary-foreground" : "border-border bg-secondary/60 hover:bg-secondary"
                )}
              >
                {on && <motion.span layoutId={`rsvp-${e.id}`} className="absolute inset-0 bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }} />}
                <span className="relative inline-flex items-center gap-1.5">
                  <o.icon aria-hidden className={cn("size-4", on && o.value === "interested" && "fill-current")} />
                  {o.label}
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={o.count}
                      className="tabular opacity-70"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 0.7, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE }}
                    >
                      {o.count}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {e.capacity !== null && (
        <p className="text-xs text-muted-foreground tabular">
          {full ? "Full. Mark yourself as interested to hear if a place opens." : `${Math.max(0, e.capacity - going)} of ${e.capacity} places left`}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UsersIcon aria-hidden className="size-3.5" />
          {att.going.length} {past ? "went" : "going"} · {att.interested.length} interested
        </p>
        {att.going.length > 0 ? (
          <AvatarStack people={att.going} max={10} size={30} label={`${att.going.length} ${past ? "went" : "going"}`} />
        ) : (
          <p className="text-sm text-muted-foreground">{past ? "Nobody RSVP’d." : "Nobody yet. Be the first."}</p>
        )}
        {att.interested.length > 0 && <AvatarStack people={att.interested} max={8} size={22} label={`${att.interested.length} interested`} className="opacity-80" />}
      </div>
      {!signedIn && !past && <p className="text-xs text-muted-foreground">Sign in to RSVP. It takes an email address and nothing else.</p>}
      <p role="status" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
        {error || status}
      </p>
    </section>
  )
}

function CalendarButtons({ event: e, disabled }: { event: CommunityEvent; disabled: boolean }) {
  const mounted = useMounted()
  const [done, setDone] = useState(false)

  function download() {
    const url = `${location.origin}/events/${e.id}`
    const blob = new Blob([eventIcs(e, url)], { type: "text/calendar;charset=utf-8" })
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
    setDone(true)
  }

  if (disabled) return null
  return (
    <section aria-labelledby="cal-h" className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h2 id="cal-h" className="font-sans text-sm font-semibold tracking-normal">
        Add to your calendar
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={download} disabled={!mounted}>
          <CalendarPlusIcon aria-hidden /> Download .ics
        </Button>
        {mounted && (
          <a
            href={googleCalendarHref(e, `${location.origin}/events/${e.id}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Google Calendar <ExternalLinkIcon aria-hidden className="size-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {done ? "Downloaded. Open the file to add it to Apple Calendar, Outlook or any other calendar." : "Works with Apple Calendar, Outlook, Proton and most others."}
      </p>
    </section>
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
        <Link href="/events" className="text-ion hover:underline">
          Back to events
        </Link>
      </EmptyContent>
    </Empty>
  )
}
