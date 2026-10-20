"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { MapPinIcon, MonitorIcon } from "lucide-react"
import { KIND_ICON } from "@/components/events/event-bits"
import { formatRange, useMounted, zoneCity } from "@/components/events/event-time"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { createEvent, isTimeZone, validateEvent, zonedToUtc, type EventKind, type EventMode, type NewEvent } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"
import { useEventKinds } from "@/lib/lists/hooks"

const DURATIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 45, label: "45 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1½ hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 480, label: "8 hours" },
]

/** Create an event. The form only renders in the browser, because its defaults depend on your clock and zone. */
export function NewEventForm() {
  const mounted = useMounted()
  const { ready } = useSession()
  if (!mounted || (live && !ready)) {
    return (
      <div className="glass flex flex-col gap-4 rounded-2xl p-6" aria-busy="true" aria-label="Loading form">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }
  return (
    <Gate cap="event.create" action="host an event">
      <Form />
    </Gate>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

function Form() {
  const EVENT_KINDS = useEventKinds()
  const router = useRouter()
  const viewerZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
    return [...new Set([viewerZone, "UTC", ...all])]
  }, [viewerZone])
  // A week from now at 18:00, in the viewer's zone, is a sensible default.
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 864e5)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  const [today] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  const [time, setTime] = useState("18:00")
  const [duration, setDuration] = useState(90)
  const [timezone, setTimezone] = useState(viewerZone)
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<EventKind>("paper-club")
  const [mode, setMode] = useState<EventMode>("online")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [capacity, setCapacity] = useState("")
  const [errors, setErrors] = useState<Partial<Record<keyof NewEvent | "form", string>>>({})
  const [busy, setBusy] = useState(false)

  const start = isTimeZone(timezone) ? zonedToUtc(date, time, timezone) : null
  const input: NewEvent = {
    title,
    description,
    kind,
    mode,
    location,
    startsAt: start ? start.toISOString() : "",
    endsAt: start ? new Date(start.getTime() + duration * 60000).toISOString() : "",
    timezone,
    capacity: capacity.trim() ? Number(capacity) : null,
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const found = validateEvent(input)
    setErrors(found)
    const first = (["title", "startsAt", "endsAt", "location", "capacity", "description"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`ev-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const created = await createEvent(input)
      router.push(`/events/${created.id}`)
    } catch (err) {
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  const err = (k: keyof NewEvent) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `ev-${k}-error` } : {})

  return (
    <form onSubmit={submit} noValidate className="glass rounded-2xl p-5 md:p-7">
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Kind of event</FieldLegend>
          <div role="radiogroup" aria-label="Kind of event" className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(Object.keys(EVENT_KINDS) as EventKind[]).filter((k) => EVENT_KINDS[k].enabled).map((k) => {
              const Icon = KIND_ICON[k]
              const on = kind === k
              return (
                <label
                  key={k}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <input type="radio" name="kind" value={k} checked={on} onChange={() => setKind(k)} className="sr-only" />
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Icon aria-hidden className={cn("size-4", on ? "text-ion" : "text-muted-foreground")} />
                    {EVENT_KINDS[k].label}
                  </span>
                  <span className="text-xs text-muted-foreground">{EVENT_KINDS[k].blurb}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>

        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="ev-title"><Copy k="events-new.new-event.title">Title</Copy></FieldLabel>
          <Input id="ev-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Paper club: Mixture of depths" className="h-11 bg-background/60" {...err("title")} />
          {errors.title && <FieldError id="ev-title-error">{errors.title}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">When</FieldLegend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field data-invalid={errors.startsAt ? true : undefined}>
              <FieldLabel htmlFor="ev-startsAt"><Copy k="events-new.new-event.date">Date</Copy></FieldLabel>
              <Input id="ev-startsAt" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="h-10 bg-background/60" {...err("startsAt")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ev-time"><Copy k="events-new.new-event.starts-at">Starts at</Copy></FieldLabel>
              <Input id="ev-time" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} className="h-10 bg-background/60" />
            </Field>
            <Field data-invalid={errors.endsAt ? true : undefined}>
              <FieldLabel htmlFor="ev-endsAt"><Copy k="events-new.new-event.length">Length</Copy></FieldLabel>
              <select id="ev-endsAt" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" {...err("endsAt")}>
                {DURATIONS.map((d) => (
                  <option key={d.minutes} value={d.minutes} className="bg-popover">
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ev-zone"><Copy k="events-new.new-event.time-zone">Time zone</Copy></FieldLabel>
              <select id="ev-zone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {zones.map((z) => (
                  <option key={z} value={z} className="bg-popover">
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {errors.startsAt && <FieldError id="ev-startsAt-error">{errors.startsAt}</FieldError>}
          {errors.endsAt && <FieldError id="ev-endsAt-error">{errors.endsAt}</FieldError>}
          {start && (
            <FieldDescription aria-live="polite">
              {formatRange(input.startsAt, input.endsAt, timezone)} in {zoneCity(timezone)}
              {timezone !== viewerZone && ` · ${formatRange(input.startsAt, input.endsAt)} your time`}. Everyone sees it in their own time zone.
            </FieldDescription>
          )}
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Where</FieldLegend>
          <div role="radiogroup" aria-label="Online or in person" className="flex flex-wrap gap-2">
            {(["online", "in-person"] as const).map((m) => {
              const on = mode === m
              const Icon = m === "online" ? MonitorIcon : MapPinIcon
              return (
                <label
                  key={m}
                  className={cn(
                    "pressable inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <input type="radio" name="mode" value={m} checked={on} onChange={() => setMode(m)} className="sr-only" />
                  <Icon aria-hidden className="size-4" />
                  {m === "online" ? "Online" : "In person"}
                </label>
              )
            })}
          </div>
          <Field data-invalid={errors.location ? true : undefined}>
            <FieldLabel htmlFor="ev-location">{mode === "online" ? "Link to join" : "Venue and city"}</FieldLabel>
            <Input
              id="ev-location"
              value={location}
              maxLength={200}
              inputMode={mode === "online" ? "url" : undefined}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={mode === "online" ? "https://meet.example.com/your-room" : "Venue name, street address, city"}
              className="h-10 bg-background/60"
              {...err("location")}
            />
            {errors.location ? <FieldError id="ev-location-error">{errors.location}</FieldError> : <FieldDescription>{mode === "online" ? "Shown on the event page to everyone." : "Include step-free access details in the description if you can."}</FieldDescription>}
          </Field>
          {mode === "in-person" && (
            <Field data-invalid={errors.capacity ? true : undefined}>
              <FieldLabel htmlFor="ev-capacity"><Copy k="events-new.new-event.places-optional">Places (optional)</Copy></FieldLabel>
              <Input id="ev-capacity" type="number" inputMode="numeric" min={1} max={10000} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-10 bg-background/60 sm:max-w-40" {...err("capacity")} />
              {errors.capacity ? <FieldError id="ev-capacity-error">{errors.capacity}</FieldError> : <FieldDescription><Copy k="events-new.new-event.when-it-is-full-people">When it is full, people can still mark themselves as interested.</Copy></FieldDescription>}
            </Field>
          )}
        </FieldSet>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="ev-description"><Copy k="events-new.new-event.description">Description</Copy></FieldLabel>
          <MarkdownComposer id="ev-description" value={description} onChange={setDescription} maxLength={4000} rows={6} mentions={false} placeholder="What will happen, what to read or bring, who it is for." invalid={Boolean(errors.description)} />
          {errors.description && <FieldError id="ev-description-error">{errors.description}</FieldError>}
        </Field>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Creating…" : "Create event"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground"><Copy k="events-new.new-event.this-copy-has-no-database">This copy has no database, so the event stays in this browser.</Copy></span>}
        </div>
      </FieldGroup>
    </form>
  )
}
