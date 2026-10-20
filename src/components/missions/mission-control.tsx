"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { SparklesIcon, UsersIcon } from "lucide-react"
import { STATUS_ICON, STATUS_TONE } from "@/components/missions/mission-bits"
import { STATUSES, type MissionCounts, type MissionStatus } from "@/lib/missions"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const EASE = [0.23, 1, 0.32, 1] as const

/** A number that rolls up or down when it changes. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {value.toLocaleString("en")}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

const TILES: MissionStatus[] = ["open", "in-progress", "review", "completed", "expired"]

/**
 * The strip at the top of /missions: live counts per status (each one a filter), points riding on running
 * missions and pilots on their crews. Counts update as missions change, wherever they change.
 */
export function MissionControl({ counts, status, onStatus, live }: { counts: MissionCounts | null; status: MissionStatus | "all"; onStatus: (s: MissionStatus | "all") => void; live: boolean }) {
  return (
    <section aria-label="Mission control" className="border border-border bg-card relative overflow-hidden rounded-2xl">
      {/* A thin scan line along the top edge, like a console that is switched on. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ion/60 to-transparent" />
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full rounded-full bg-ok/70 motion-safe:animate-ping" />}
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-ok" : "bg-muted-foreground")} />
          </span>
          Mission control
        </h2>
        <button
          type="button"
          onClick={() => onStatus("all")}
          aria-pressed={status === "all"}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            status === "all" ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Copy k="missions.mission-control.all-missions">All missions</Copy>
        </button>
      </div>
      <div className="overflow-hidden">
        <div className="-mr-px -mb-px grid grid-cols-6 sm:grid-cols-5 lg:grid-cols-7">
          {TILES.map((s) => {
            const Icon = STATUS_ICON[s]
            const on = status === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStatus(on ? "all" : s)}
                aria-pressed={on}
                title={STATUSES[s].blurb}
                className={cn(
                  "pressable group relative flex flex-col items-start gap-1 border-white/[0.06] px-4 py-3 text-left transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  s === "completed" || s === "expired" ? "col-span-3 border-r border-b sm:col-span-1" : "col-span-2 border-r border-b sm:col-span-1",
                  on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                )}
              >
                {on && <span aria-hidden className={cn("absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-current", STATUS_TONE[s])} />}
                <span className={cn("flex items-center gap-1.5 text-xs", on ? STATUS_TONE[s] : "text-muted-foreground group-hover:text-foreground")}>
                  <Icon aria-hidden className={cn("size-3.5", STATUS_TONE[s])} />
                  {STATUSES[s].label}
                </span>
                <span className="text-xl leading-none font-semibold">{counts ? <Ticker value={counts[s]} /> : <span className="text-muted-foreground">–</span>}</span>
              </button>
            )
          })}
          <div className="col-span-3 flex flex-col items-start gap-1 border-r border-b border-white/[0.06] px-4 py-3 sm:col-span-2 lg:col-span-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SparklesIcon aria-hidden className="size-3.5 text-gold" /> <Copy k="missions.mission-control.points-riding">Points riding</Copy>
            </span>
            <span className="text-xl leading-none font-semibold text-gold">{counts ? <Ticker value={counts.pledged} /> : "–"}</span>
          </div>
          <div className="col-span-3 flex flex-col items-start gap-1 border-r border-b border-white/[0.06] px-4 py-3 lg:col-span-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UsersIcon aria-hidden className="size-3.5 text-ion" /> <Copy k="missions.mission-control.pilots-flying">Pilots flying</Copy>
            </span>
            <span className="text-xl leading-none font-semibold">{counts ? <Ticker value={counts.pilots} /> : "–"}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
