"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { InfoIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { LEVEL_COLORS, LEVEL_ICONS, LevelRing } from "@/components/reputation/level-ring"
import { GROUP_TONE, pointIcon } from "@/components/reputation/point-kinds"
import { getMemberReputation, getPointsBreakdown, levelFor, POINT_CAPS, POINT_GROUPS, POINT_RULES, type PointGroup, type PointTally } from "@/lib/community"
import { compact } from "@/lib/data"
import { useLevels, useListRows, usePoints } from "@/lib/lists/hooks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/** The admins' daily caps (lists.rep.points), with the built-in ones for anything they left alone. */
export function usePointCaps(): Record<string, number> {
  const rows = useListRows("points")
  return useMemo(() => {
    const caps: Record<string, number> = { ...POINT_CAPS }
    for (const r of rows) if (typeof r.id === "string" && typeof r.cap === "number") caps[r.id] = r.cap
    return caps
  }, [rows])
}

/**
 * "Orbits and how to rise": every way to earn points, grouped, with the points and the daily cap of each, the
 * levels as an orbit track with you on it, and (signed in) how much of each cap you already used today.
 */
export function HowToRise({ className, id = "how-points" }: { className?: string; id?: string }) {
  const points = usePoints()
  const caps = usePointCaps()
  const levels = useLevels()
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const [group, setGroup] = useState<PointGroup | "all">("all")
  const [mine, setMine] = useState<{ points: number; tally: Record<string, PointTally> } | null>(null)

  useEffect(() => {
    if (!live || !ready || !user) return
    let stale = false
    Promise.all([getMemberReputation(user.id).catch(() => null), getPointsBreakdown(user.id)]).then(([rep, tally]) => {
      if (stale) return
      setMine({ points: rep?.points ?? 0, tally: Object.fromEntries((tally ?? []).map((t) => [t.kind, t])) })
    })
    return () => {
      stale = true
    }
  }, [ready, user])

  const rules = POINT_RULES.filter((r) => group === "all" || r.group === group)
  const you = user && mine ? levelFor(mine.points, levels) : null

  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-24 rounded-2xl border border-border bg-card p-4 sm:p-6", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-xl flex-col gap-1">
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            <Copy k="rise.eyebrow">Orbits and how to rise</Copy>
          </p>
          <h2 id={`${id}-h`} className="text-lg font-semibold tracking-[-0.01em]">
            <Copy k="rise.title">Every way to earn points</Copy>
          </h2>
          <p className="text-sm text-muted-foreground">
            <Copy k="rise.lead" multiline>
              Points come from helping, building and showing up. Each kind earns a few times a day at most, so steady work beats bursts.
            </Copy>
          </p>
        </div>
        {you && mine && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
            <LevelRing points={mine.points} size={56} stroke={5} label={false} />
            <div className="flex flex-col text-sm">
              <span className="font-medium">
                {you.level.name} · <span className="tabular">{compact(mine.points)}</span> pts
              </span>
              <span className="text-xs text-muted-foreground">{you.next ? `${compact(you.toNext)} to ${you.next.name}` : "The highest orbit"}</span>
            </div>
          </div>
        )}
      </div>

      <OrbitTrack points={you ? mine?.points ?? 0 : null} />

      <div role="radiogroup" aria-label="Kinds of contribution" className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ id: "all" as const, label: "Everything" }, ...POINT_GROUPS].map((g) => {
          const on = g.id === group
          const count = g.id === "all" ? POINT_RULES.length : POINT_RULES.filter((r) => r.group === g.id).length
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setGroup(g.id)}
              className={cn(
                "pressable relative shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && <motion.span layoutId={`${id}-group`} className="absolute inset-0 rounded-full bg-foreground" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }} />}
              <span className="relative whitespace-nowrap">
                {g.label} <span className="tabular opacity-60">{count}</span>
              </span>
            </button>
          )
        })}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rules.map((r, i) => {
            const Icon = pointIcon(r.id)
            const tone = GROUP_TONE[r.group]
            const cap = caps[r.id] ?? r.cap
            const pts = points[r.id] ?? r.points
            const t = mine?.tally[r.id]
            const used = t ? Math.min(cap || t.today, t.today) : 0
            return (
              <motion.li
                key={r.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.25, ease: EASE, delay: reduce ? 0 : Math.min(i, 10) * 0.02 }}
                className="group flex items-start gap-3 rounded-xl border border-border bg-background/30 p-3 transition-colors hover:border-white/15 hover:bg-background/60"
              >
                <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-lg border transition-transform duration-200 ease-out group-hover:-translate-y-0.5", tone.fill, tone.ring, tone.text)}>
                  <Icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.hint}</span>
                  {t && cap > 0 && (
                    <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                        <motion.span className={cn("block h-full origin-left rounded-full", used >= cap ? "bg-gold" : "bg-ion")} initial={{ scaleX: 0 }} animate={{ scaleX: used / cap }} transition={{ duration: 0.5, ease: EASE }} />
                      </span>
                      {used >= cap ? "Capped for today" : `${used} of ${cap} today`}
                      {t.points > 0 && <span>· {compact(t.points)} earned</span>}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={cn("text-base font-semibold tabular", pts > 0 ? "text-foreground" : "text-muted-foreground")}>+{pts}</span>
                  <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular">{cap > 0 ? `up to ${cap}× a day` : "no daily cap"}</span>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <Copy k="rise.fineprint" multiline>
            Nothing you do to your own work counts, hidden posts earn nothing, and daily caps reset at midnight UTC. Mission rewards are set by whoever posts the mission.
          </Copy>{" "}
          {user && (
            <Link href="/you#points" className="text-ion hover:underline">
              <Copy k="rise.history">See your points history</Copy>
            </Link>
          )}
        </span>
      </p>
    </section>
  )
}

/** The levels as stops along an orbit, with a marker where `points` puts you (no marker for guests). */
function OrbitTrack({ points }: { points: number | null }) {
  const levels = useLevels()
  const reduce = useReducedMotion()
  const n = levels.length
  // Even spacing between levels, so the marker moves fairly at every stage.
  let at = 0
  if (points !== null) {
    const info = levelFor(points, levels)
    at = n > 1 ? (info.index + (info.next ? info.progress : 0)) / (n - 1) : 0
  }
  return (
    <div className="relative mt-6 px-3 pb-2" aria-label={points === null ? "The levels" : "Where you are among the levels"} role="img">
      <div aria-hidden className="absolute top-3 right-3 left-3 h-px bg-gradient-to-r from-white/5 via-white/20 to-white/5" />
      {points !== null && (
        <motion.div
          aria-hidden
          className="absolute top-3 right-3 left-3 h-px origin-left bg-gradient-to-r from-ion/40 to-gold"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: at }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }}
        />
      )}
      <ol className="relative flex justify-between">
        {levels.map((l, i) => {
          const Icon = LEVEL_ICONS[l.name]
          const [from] = LEVEL_COLORS[l.name] ?? LEVEL_COLORS.Stardust
          const reached = points !== null && points >= l.min
          return (
            <li key={l.name} className="flex w-0 flex-col items-center gap-1.5">
              <span
                className={cn("grid size-6 place-items-center rounded-full border bg-card transition-transform duration-300", reached ? "scale-110" : "opacity-70")}
                style={{ borderColor: reached ? from : "rgb(255 255 255 / 0.15)", color: from, boxShadow: reached ? `0 0 14px ${from}55` : undefined }}
              >
                {Icon ? <Icon aria-hidden className="size-3" /> : <span className="text-[10px] tabular">{i + 1}</span>}
              </span>
              <span className="text-[11px] whitespace-nowrap">{l.name}</span>
              <span className="-mt-1 text-[10px] whitespace-nowrap text-muted-foreground tabular">{compact(l.min)}</span>
            </li>
          )
        })}
      </ol>
      {points !== null && (
        <span aria-hidden className="pointer-events-none absolute top-[7px] right-3 left-3">
          <motion.span
            className="absolute size-2.5 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_12px_rgb(216_197_158/0.9)]"
            style={{ left: `${at * 100}%` }}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.6 }}
          />
        </span>
      )}
    </div>
  )
}
