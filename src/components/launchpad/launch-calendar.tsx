"use client"

import { useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { dayKey, type Launch } from "@/lib/launchpad"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const monthName = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

/**
 * A month of launch days (UTC, like the Launch of the day). Days with launches carry a dot per launch; picking
 * one shows that day's launches beside it. Arrow buttons move between this month and the next three.
 */
export function LaunchCalendar({ launches, now, selected, onSelect }: { launches: Launch[]; now: number; selected: string | null; onSelect: (day: string | null) => void }) {
  const today = dayKey(now)
  const base = new Date(now)
  const [offset, setOffset] = useState(0)
  const y = base.getUTCFullYear()
  const m0 = base.getUTCMonth() + offset
  const year = y + Math.floor(m0 / 12)
  const month = ((m0 % 12) + 12) % 12

  const byDay = useMemo(() => {
    const map = new Map<string, Launch[]>()
    for (const l of launches) {
      const d = dayKey(l.launchAt)
      map.set(d, [...(map.get(d) ?? []), l])
    }
    return map
  }, [launches])

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1))
    const lead = (first.getUTCDay() + 6) % 7
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const out: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= days; d++) out.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
    while (out.length % 7) out.push(null)
    return out
  }, [year, month])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {monthName(year, month)}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={offset >= 3} onClick={() => setOffset((o) => o + 1)}>
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>
      <div role="grid" aria-label={`Launches in ${monthName(year, month)}`} className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="pb-1 text-[11px] text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} role="gridcell" aria-hidden />
          const list = byDay.get(d) ?? []
          const past = d < today
          const on = selected === d
          const label = `${new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}: ${list.length ? `${list.length} ${list.length === 1 ? "launch" : "launches"}` : "no launches"}`
          return (
            <div key={d} role="gridcell">
              <button
                type="button"
                aria-label={label}
                aria-pressed={on}
                disabled={!list.length}
                onClick={() => onSelect(on ? null : d)}
                className={cn(
                  "pressable relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs tabular transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  list.length ? "hover:bg-white/[0.06]" : "cursor-default",
                  past && "text-muted-foreground/60",
                  d === today && "ring-1 ring-ion/60",
                  on && "bg-ion/20 text-foreground",
                )}
              >
                <span>{Number(d.slice(8))}</span>
                {list.length > 0 && (
                  <span aria-hidden className="flex gap-0.5">
                    {list.slice(0, 3).map((l) => (
                      <span key={l.id} className={cn("size-1 rounded-full", past ? "bg-muted-foreground/60" : "bg-ion")} />
                    ))}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground"><Copy k="launchpad.launch-calendar.days-follow-utc-like-the">Days follow UTC, like the Launch of the day.</Copy></p>
    </div>
  )
}
