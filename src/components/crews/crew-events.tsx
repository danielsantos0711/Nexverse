"use client"

import { useEffect, useState } from "react"
import { CalendarPlusIcon, CheckIcon, DownloadIcon, MapPinIcon, RocketIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { canManage, crewTint, type Crew, type CrewRole } from "@/lib/crews"
import { createEvent, deleteEvent, eventIcs, listEvents, rsvp, validateEvent, type CrewEvent, type Rsvp } from "@/lib/crews-home"
import { cn } from "@/lib/utils"

const day = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" })
const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" })
const month = new Intl.DateTimeFormat("en", { month: "short" })

/** Upcoming launches: reading groups, demo days, paper sprints. Members add them and say whether they are going. */
export function CrewEvents({ crew, role, meId }: { crew: Crew; role: CrewRole | null; meId: string | null }) {
  const [list, setList] = useState<CrewEvent[] | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const tint = crewTint(crew)

  useEffect(() => {
    let stale = false
    listEvents(crew).then(
      (l) => !stale && setList(l),
      (e: Error) => !stale && (setError(e.message), setList([]))
    )
    return () => {
      stale = true
    }
  }, [crew])

  async function answer(e: CrewEvent, status: Rsvp | null) {
    try {
      const next = await rsvp(e, status)
      setList((l) => l?.map((x) => (x.id === e.id ? next : x)) ?? l)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(e: CrewEvent) {
    if (!confirm(`Cancel “${e.title}”?`)) return
    try {
      await deleteEvent(e)
      setList((l) => l?.filter((x) => x.id !== e.id) ?? l)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function download(e: CrewEvent) {
    const blob = new Blob([eventIcs(e, crew.name, `${location.origin}/crews/${crew.slug}`)], { type: "text/calendar" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${e.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "launch"}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="flex flex-col gap-3">
      {list === null ? (
        <p className="text-sm text-muted-foreground">Loading launches…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No launches planned. {role ? "Plan a reading group, a demo day or a paper sprint." : "Members plan them here."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((e) => {
            const start = new Date(e.startsAt)
            const mine = meId ? (e.going.includes(meId) ? "going" : e.maybe.includes(meId) ? "maybe" : null) : null
            return (
              <li key={e.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 text-center" style={{ background: `color-mix(in oklab, ${tint} 14%, transparent)` }}>
                  <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: tint }}>
                    {month.format(start)}
                  </span>
                  <span className="text-lg leading-tight font-semibold tabular">{start.getDate()}</span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm leading-snug font-semibold">{e.title}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="tabular">
                      {day.format(start)} · {time.format(start)}
                      {e.endsAt ? `–${time.format(new Date(e.endsAt))}` : ""}
                    </span>
                    {e.place && (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon aria-hidden className="size-3" /> {e.place}
                      </span>
                    )}
                    <span>
                      {e.going.length} going{e.maybe.length ? ` · ${e.maybe.length} maybe` : ""}
                    </span>
                  </p>
                  {e.body && <p className="line-clamp-2 text-sm text-foreground/85">{e.body}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {role && (
                      <>
                        <Button size="xs" variant={mine === "going" ? "default" : "secondary"} onClick={() => answer(e, mine === "going" ? null : "going")} aria-pressed={mine === "going"}>
                          {mine === "going" && <CheckIcon aria-hidden />} Going
                        </Button>
                        <Button size="xs" variant={mine === "maybe" ? "default" : "ghost"} onClick={() => answer(e, mine === "maybe" ? null : "maybe")} aria-pressed={mine === "maybe"}>
                          Maybe
                        </Button>
                      </>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => download(e)}>
                      <DownloadIcon aria-hidden /> Add to calendar
                    </Button>
                    {(e.createdBy === meId || canManage(role)) && (
                      <Button size="icon-xs" variant="ghost" aria-label={`Cancel ${e.title}`} className="ml-auto" onClick={() => remove(e)}>
                        <Trash2Icon aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {role && (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <CalendarPlusIcon aria-hidden /> Plan a launch
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RocketIcon aria-hidden className="size-4" style={{ color: tint }} /> Plan a launch
            </DialogTitle>
            <DialogDescription>Everyone in {crew.name} hears about it.</DialogDescription>
          </DialogHeader>
          {open && (
            <EventForm
              onCreate={async (input) => {
                const e = await createEvent(crew, input)
                setList((l) => [...(l ?? []), e].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))
                setOpen(false)
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventForm({ onCreate, onCancel }: { onCreate: (input: { title: string; body: string; place: string; startsAt: string; endsAt: string | null }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [place, setPlace] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit() {
    const input = { title, body, place, startsAt: start, endsAt: end || null }
    const problem = validateEvent(input)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      await onCreate(input)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Paper club: scaling laws" />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Starts
          <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="[color-scheme:dark]" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Ends <span className="sr-only">(optional)</span>
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="[color-scheme:dark]" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Where
        <Input value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} placeholder="The crew chat, a call link, a room" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What happens
        <Textarea value={body} maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className={cn("text-sm text-destructive")}>
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Planning…" : "Plan it"}
        </Button>
      </DialogFooter>
    </form>
  )
}
