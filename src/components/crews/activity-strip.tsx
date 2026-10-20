"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { getActivity, type ActivityDay, type Crew } from "@/lib/crews"
import { Copy } from "@/components/content/copy"

const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" })
const LONG = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })

/**
 * The crew's last seven days as a strip of small stacked bars: wall posts, chat messages and people joining.
 * The numbers are also in a table for screen readers.
 */
export function ActivityStrip({ crew, refreshKey = 0 }: { crew: Crew; refreshKey?: number }) {
  const [days, setDays] = useState<ActivityDay[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let stale = false
    getActivity(crew)
      .then((d) => {
        if (stale) return
        setDays(d)
        setError(false)
      })
      .catch(() => !stale && setError(true))
    return () => {
      stale = true
    }
  }, [crew, refreshKey])

  if (error) return <p className="text-sm text-muted-foreground"><Copy k="crew.activity-strip.activity-could-not-be-loaded">Activity could not be loaded.</Copy></p>
  if (!days) return <Skeleton className="h-24 w-full rounded-xl" />

  // Messages outnumber posts, so each kind is weighted to keep posts and joins visible next to them.
  const weight = (d: ActivityDay) => d.messages + d.posts * 4 + d.joins * 4
  const peak = Math.max(1, ...days.map(weight))
  const total = days.reduce((n, d) => ({ posts: n.posts + d.posts, messages: n.messages + d.messages, joins: n.joins + d.joins }), { posts: 0, messages: 0, joins: 0 })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-1.5" aria-hidden>
        {days.map((d) => {
          const h = (n: number) => `${(n / peak) * 100}%`
          const empty = weight(d) === 0
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5" title={`${LONG.format(new Date(`${d.day}T12:00:00Z`))}: ${d.posts} posts, ${d.messages} messages, ${d.joins} joined`}>
              <div className="flex h-16 w-full max-w-7 flex-col-reverse overflow-hidden rounded-md bg-white/[0.04]">
                {empty ? null : (
                  <>
                    <span className="w-full bg-ion/70" style={{ height: h(d.messages) }} />
                    <span className="w-full bg-gold/80" style={{ height: h(d.posts * 4) }} />
                    <span className="w-full bg-ok/80" style={{ height: h(d.joins * 4) }} />
                  </>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{WEEKDAY.format(new Date(`${d.day}T12:00:00Z`)).slice(0, 2)}</span>
            </div>
          )
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="This week">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-gold/80" /> {total.posts} posts
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-ion/70" /> {total.messages} messages
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-ok/80" /> {total.joins} joined
        </li>
      </ul>
      <table className="sr-only">
        <caption>Activity on each of the last seven days</caption>
        <thead>
          <tr>
            <th><Copy k="crew.activity-strip.day">Day</Copy></th>
            <th><Copy k="crew.activity-strip.posts">Posts</Copy></th>
            <th><Copy k="crew.activity-strip.messages">Messages</Copy></th>
            <th><Copy k="crew.activity-strip.joined">Joined</Copy></th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{LONG.format(new Date(`${d.day}T12:00:00Z`))}</td>
              <td>{d.posts}</td>
              <td>{d.messages}</td>
              <td>{d.joins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
