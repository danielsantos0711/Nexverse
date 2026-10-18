"use client"

import { useSyncExternalStore } from "react"

/*
 * Relative times ("12 min ago") depend on the viewer's clock, so they are computed in the browser only.
 * The server and the first client render show a fixed UTC date, which keeps prerendering deterministic
 * and hydration clean; the relative form replaces it right after hydration and then ticks every 30 s.
 */

const TICK = 30_000
const subscribe = (cb: () => void) => {
  const t = setInterval(cb, TICK)
  return () => clearInterval(t)
}
const getSnapshot = () => Math.floor(Date.now() / TICK) * TICK
const getServerSnapshot = () => null

/** The current time, rounded to 30 seconds; null on the server and during hydration. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot)
}

const DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })

export function absoluteDate(ts: number) {
  return DATE.format(ts)
}

export function relative(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return "yesterday"
  if (d < 30) return `${d} days ago`
  return absoluteDate(ts)
}

/** "3 h ago" for an ISO date or epoch milliseconds. Renders nothing for an empty date. */
export function TimeAgo({ date, prefix, className }: { date: string | number; prefix?: string; className?: string }) {
  const now = useNow()
  const ts = typeof date === "number" ? date : Date.parse(date)
  if (!Number.isFinite(ts) || ts <= 0) return null
  const iso = new Date(ts).toISOString()
  return (
    <time dateTime={iso} title={iso.slice(0, 16).replace("T", " ") + " UTC"} className={className} suppressHydrationWarning>
      {prefix ? `${prefix} ` : ""}
      {now === null ? absoluteDate(ts) : relative(ts, now)}
    </time>
  )
}
