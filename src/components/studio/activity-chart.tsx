"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIcon } from "lucide-react"
import { CountUp } from "@/components/hub/motion"
import { Copy } from "@/components/content/copy"
import { Skeleton } from "@/components/ui/skeleton"
import { getProjectActivity, type ActivityDay } from "@/lib/projects"
import { cn } from "@/lib/utils"

/*
 * A project's activity from real counts only: page views (once a day per browser), downloads (once a day per
 * member and file) and new likes, per day. Series toggle on and off, the range switches between 30 and 90
 * days, and the pointer (or a finger) reads one day. With nothing counted yet it says so.
 */

const SERIES = [
  { id: "views", label: "Views", color: "#8fb4ff" },
  { id: "downloads", label: "Downloads", color: "#f3d58a" },
  { id: "likes", label: "Likes", color: "#ff8fa8" },
] as const

type SeriesId = (typeof SERIES)[number]["id"]

const W = 720
const H = 200
const PAD = { l: 34, r: 10, t: 12, b: 24 }

const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

export function ActivityChart({ projectId, compact = false, className }: { projectId: string; compact?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const [range, setRange] = useState<30 | 90>(compact ? 30 : 90)
  const [data, setData] = useState<{ range: number; days: ActivityDay[] | null } | null>(null)
  const [on, setOn] = useState<Record<SeriesId, boolean>>({ views: true, downloads: true, likes: true })
  const [hover, setHover] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let stale = false
    getProjectActivity(projectId, 90).then((days) => !stale && setData({ range: 90, days }))
    return () => {
      stale = true
    }
  }, [projectId])

  const days = useMemo(() => (data?.days ?? []).slice(-range), [data, range])
  const totals = useMemo(() => Object.fromEntries(SERIES.map((s) => [s.id, days.reduce((n, d) => n + d[s.id], 0)])) as Record<SeriesId, number>, [days])
  const max = Math.max(1, ...days.flatMap((d) => SERIES.filter((s) => on[s.id]).map((s) => d[s.id])))
  const x = (i: number) => PAD.l + (i / Math.max(1, days.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b)
  const path = (id: SeriesId) => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[id]).toFixed(1)}`).join(" ")
  const area = (id: SeriesId) => `${path(id)} L${x(days.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`
  const empty = data?.days && Object.values(totals).every((n) => n === 0)

  function pick(clientX: number) {
    const el = svg.current
    if (!el || !days.length) return
    const r = el.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days.length - 1)))))
  }

  if (!data) return <Skeleton className={cn("h-64 w-full rounded-2xl", className)} />
  if (data.days === null) {
    return (
      <p className={cn("rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground", className)}>
        <Copy k="project.activity.off">Activity charts are being switched on for this site. Counts start once the latest database update is in.</Copy>
      </p>
    )
  }

  const h = hover !== null ? days[hover] : null
  return (
    <section aria-label="Activity" className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {SERIES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={on[s.id]}
            onClick={() => setOn((o) => ({ ...o, [s.id]: !o[s.id] }))}
            className={cn(
              "pressable flex min-w-24 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on[s.id] ? "border-border bg-secondary/60" : "border-transparent opacity-50 hover:opacity-80"
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
            </span>
            <CountUp value={totals[s.id]} className="text-lg font-semibold tabular" />
          </button>
        ))}
        <div className="ml-auto flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Range">
          {([30, 90] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => {
                setRange(r)
                setHover(null)
              }}
              className={cn("relative rounded-full px-3 py-1 transition-colors", range === r ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {range === r && <motion.span layoutId={`range-${projectId}`} className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", duration: 0.35, bounce: 0.2 }} />}
              <span className="relative">{r} days</span>
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          <ActivityIcon aria-hidden className="size-5 text-ion" />
          <Copy k="project.activity.empty">Nothing counted in this range yet. Views, downloads and likes appear here as people find this project.</Copy>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-pan-y select-none"
            role="img"
            aria-label={`Activity over the last ${range} days: ${totals.views} views, ${totals.downloads} downloads, ${totals.likes} likes.`}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.id} id={`g-${projectId}-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" className="text-border" strokeDasharray={t ? "3 4" : undefined} />
                <text x={PAD.l - 6} y={y(max * t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular">
                  {Math.round(max * t)}
                </text>
              </g>
            ))}
            {days.length > 1 &&
              [0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => (
                <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
                  {short(days[i].day)}
                </text>
              ))}
            {SERIES.filter((s) => on[s.id]).map((s) => (
              <g key={`${s.id}-${range}`}>
                <motion.path d={area(s.id)} fill={`url(#g-${projectId}-${s.id})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} />
                <motion.path
                  d={path(s.id)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                />
              </g>
            ))}
            {h && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" className="text-foreground/30" />
                {SERIES.filter((s) => on[s.id]).map((s) => (
                  <circle key={s.id} cx={x(hover)} cy={y(h[s.id])} r={3.5} fill={s.color} stroke="var(--card)" strokeWidth={1.5} />
                ))}
              </g>
            )}
          </svg>
          {h && hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > days.length / 2 ? "-105%" : "5%"})` }}
            >
              <p className="font-medium">{short(h.day)}</p>
              {SERIES.filter((s) => on[s.id]).map((s) => (
                <p key={s.id} className="flex items-center gap-1.5 tabular text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.color }} /> {h[s.id]} {s.label.toLowerCase()}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        <Copy k="project.activity.note">Views count once a day per browser, downloads once a day per member and file. The authors&apos; own visits are not counted.</Copy>
      </p>
    </section>
  )
}
