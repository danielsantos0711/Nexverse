"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { XIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { pointIcon } from "@/components/reputation/point-kinds"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getPointsBreakdown, getPointsHistory, LEDGER_LABELS, type PointEvent, type PointTally } from "@/lib/community"
import { compact } from "@/lib/data"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const
const PAGE = 120
const DAYS = 30

const dayKey = (iso: string) => iso.slice(0, 10)

function dayLabel(key: string, today: string) {
  if (key === today) return "Today"
  const y = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10)
  if (key === y) return "Yesterday"
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })
}

/**
 * Where a member's points came from: the last 30 days as bars (tap one to see that day), the kinds that earned
 * most, and every entry of the ledger grouped by day, newest first, with older pages on request.
 */
export function PointsHistory({ memberId, self = false, className }: { memberId: string; self?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const [events, setEvents] = useState<PointEvent[] | null>(null)
  const [tally, setTally] = useState<PointTally[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    Promise.all([getPointsHistory(memberId, PAGE).catch(() => []), getPointsBreakdown(memberId)]).then(([e, t]) => {
      if (stale) return
      setEvents(e)
      setTally(t)
      setMore(e.length === PAGE)
      setToday(new Date().toISOString().slice(0, 10))
    })
    return () => {
      stale = true
    }
  }, [memberId])

  async function loadMore() {
    if (!events?.length) return
    setBusy(true)
    const next = await getPointsHistory(memberId, PAGE, events[events.length - 1].at).catch(() => [])
    setEvents([...events, ...next])
    setMore(next.length === PAGE)
    setBusy(false)
  }

  const bars = useMemo(() => {
    if (!events || !today) return []
    const sums = new Map<string, number>()
    for (const e of events) sums.set(dayKey(e.at), (sums.get(dayKey(e.at)) ?? 0) + Math.max(0, e.points))
    const end = Date.parse(`${today}T00:00:00Z`)
    return Array.from({ length: DAYS }, (_, i) => {
      const key = new Date(end - (DAYS - 1 - i) * 864e5).toISOString().slice(0, 10)
      return { key, value: sums.get(key) ?? 0 }
    })
  }, [events, today])
  const peak = Math.max(1, ...bars.map((b) => b.value))
  const month = bars.reduce((a, b) => a + b.value, 0)
  const top = (tally ?? []).filter((t) => t.points > 0).sort((a, b) => b.points - a.points).slice(0, 6)
  const total = (tally ?? []).reduce((a, t) => a + t.points, 0)
  const week = (tally ?? []).reduce((a, t) => a + t.week, 0)

  const shown = useMemo(() => (day ? (events ?? []).filter((e) => dayKey(e.at) === day) : events ?? []), [day, events])
  const groups = useMemo(() => {
    const out: { key: string; items: PointEvent[] }[] = []
    for (const e of shown) {
      const k = dayKey(e.at)
      const last = out[out.length - 1]
      if (last?.key === k) last.items.push(e)
      else out.push({ key: k, items: [e] })
    }
    return out
  }, [shown])

  if (!live) {
    return (
      <p className={cn("rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground", className)}>
        <Copy k="points-history.offline">Points are counted by the site&apos;s database, which this copy of Nexverse is not connected to.</Copy>
      </p>
    )
  }

  return (
    <section id="points" aria-labelledby="points-history-h" className={cn("scroll-mt-24 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="points-history-h" className="font-sans text-base font-semibold tracking-normal">
            <Copy k="points-history.title">Points history</Copy>
          </h2>
          <p className="text-sm text-muted-foreground tabular">
            {tally ? `${compact(total)} in all · ${compact(week)} this week · ${compact(month)} in 30 days` : "Counting…"}
          </p>
        </div>
        <Link href="/leaderboard#how-points" className="text-sm text-ion hover:underline">
          <Copy k="points-history.how">How to earn more</Copy>
        </Link>
      </div>

      {events === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-20 items-end gap-[3px]" role="group" aria-label="Points per day, last 30 days">
            {bars.map((b, i) => {
              const on = day === b.key
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setDay(on ? null : b.key)}
                  aria-pressed={on}
                  aria-label={`${dayLabel(b.key, today ?? b.key)}: ${b.value} points`}
                  title={`${dayLabel(b.key, today ?? b.key)}: ${b.value} points`}
                  className="group relative flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
                >
                  <motion.span
                    className={cn(
                      "block w-full origin-bottom rounded-sm transition-colors",
                      b.value ? (on ? "bg-gold" : "bg-ion/70 group-hover:bg-ion") : "bg-white/[0.06]",
                      "group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    )}
                    style={{ height: `${Math.max(6, (b.value / peak) * 100)}%` }}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : i * 0.012 }}
                  />
                </button>
              )
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Where the points came from">
          {top.map((t) => {
            const Icon = pointIcon(t.kind)
            return (
              <li key={t.kind} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs">
                <Icon aria-hidden className="size-3.5 text-muted-foreground" />
                {LEDGER_LABELS[t.kind] ?? t.kind}
                <span className="font-medium tabular">{compact(t.points)}</span>
              </li>
            )
          })}
        </ul>
      )}

      {day && (
        <button type="button" onClick={() => setDay(null)} className="inline-flex w-fit items-center gap-1 rounded-full bg-gold/10 px-2.5 py-1 text-xs text-gold">
          {dayLabel(day, today ?? day)} <XIcon aria-hidden className="size-3" />
        </button>
      )}

      {events === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {day ? "No points that day." : self ? "No points yet. Start a thread, reply to someone or publish a project, and they show up here." : "No points yet."}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {groups.map((g) => (
              <motion.li key={g.key} layout={!reduce} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-1">
                <h3 className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>{dayLabel(g.key, today ?? g.key)}</span>
                  <span className="tabular">+{g.items.reduce((a, e) => a + Math.max(0, e.points), 0)}</span>
                </h3>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background/30">
                  {g.items.map((e, i) => {
                    const Icon = pointIcon(e.kind)
                    return (
                      <li key={`${e.at}-${e.kind}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{LEDGER_LABELS[e.kind] ?? e.kind}</span>
                        <time dateTime={e.at} className="hidden text-xs text-muted-foreground tabular sm:inline">
                          {new Date(e.at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                        <span className={cn("w-12 shrink-0 text-right font-medium tabular", e.points > 0 ? "text-ok" : e.points < 0 ? "text-muted-foreground" : "text-muted-foreground")}>
                          {e.points > 0 ? `+${e.points}` : e.points}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      {more && !day && (
        <Button variant="secondary" size="sm" className="w-fit" onClick={loadMore} disabled={busy}>
          {busy ? "Loading…" : "Older points"}
        </Button>
      )}
    </section>
  )
}
