"use client"

import { useSyncExternalStore } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import type { CommunityEvent } from "@/lib/community"
import { cn } from "@/lib/utils"

/*
 * Event times depend on the viewer's time zone, which the server cannot know. Everything here renders a
 * placeholder on the server and during hydration, then the viewer's own local time right after.
 */

const noop = () => () => {}

/** False on the server and during hydration, true afterwards. */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
}

/** The viewer's IANA time zone ("Europe/Lisbon"), or null before mount. */
export function useViewerZone(): string | null {
  const mounted = useMounted()
  if (!mounted) return null
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

const fmt = (opts: Intl.DateTimeFormatOptions, timeZone?: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone })
  } catch {
    return new Intl.DateTimeFormat(undefined, opts)
  }
}

const sameDay = (a: Date, b: Date, timeZone?: string) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, timeZone).format(a) === fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, timeZone).format(b)

/** "Thu 22 Oct, 18:00 – 19:30" in a time zone (the viewer's when omitted). */
export function formatRange(startIso: string, endIso: string, timeZone?: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const day = fmt({ weekday: "short", day: "numeric", month: "short" }, timeZone)
  const time = fmt({ hour: "2-digit", minute: "2-digit" }, timeZone)
  return sameDay(start, end, timeZone) ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}` : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`
}

/** "Lisbon" from "Europe/Lisbon"; "UTC" stays. */
export const zoneCity = (tz: string) => (tz.includes("/") ? tz.split("/").pop()!.replace(/_/g, " ") : tz)

/** When an event happens, in the viewer's time zone, with the host's local time alongside when it differs. */
export function EventWhen({ event, className, showHostZone = false }: { event: CommunityEvent; className?: string; showHostZone?: boolean }) {
  const zone = useViewerZone()
  if (!zone) return <Skeleton className={cn("inline-block h-4 w-44 align-middle", className)} />
  const local = formatRange(event.startsAt, event.endsAt)
  const host = showHostZone && event.timezone !== zone ? formatRange(event.startsAt, event.endsAt, event.timezone) : null
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <time dateTime={event.startsAt}>{local}</time>
      <span className="text-xs text-muted-foreground">
        Your time ({zoneCity(zone)}){host && ` · ${host} in ${zoneCity(event.timezone)}`}
      </span>
    </span>
  )
}

/** A calendar-page tile: month and day in the viewer's time zone. */
export function DateTile({ iso, past, className }: { iso: string; past?: boolean; className?: string }) {
  const mounted = useMounted()
  const d = new Date(iso)
  return (
    <span
      aria-hidden
      className={cn(
        "flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl border text-center",
        past ? "border-border bg-white/[0.02] text-muted-foreground" : "border-ion/25 bg-ion/[0.07]",
        className
      )}
    >
      <span className={cn("w-full py-0.5 text-[11px] font-medium tracking-wide uppercase", past ? "bg-white/[0.04]" : "bg-ion/15 text-ion")}>
        {mounted ? fmt({ month: "short" }).format(d) : " "}
      </span>
      <span className="py-1 text-xl leading-none font-semibold tabular">{mounted ? fmt({ day: "numeric" }).format(d) : " "}</span>
    </span>
  )
}
