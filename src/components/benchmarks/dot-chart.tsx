"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { better, formatScore, reproSummary, type Benchmark, type BenchmarkResult } from "@/lib/benchmarks"
import { cn } from "@/lib/utils"

/*
 * Results by model as a dot plot, drawn as plain SVG. One row per model (best first, in the benchmark's own
 * direction), one dot per submitted result. A single series, so one hue (validated blue, ≥3:1 on the card);
 * fill carries the second channel: filled = reproduced by members, hollow = not yet. Only each row's best
 * score is labelled; every value is also in the table below and in the tooltip on hover or focus.
 */

const DOT = "#5b8ff0"
const ROW = 38
const TOP = 8
const AXIS = 30

type Tip = { r: BenchmarkResult; x: number; y: number }

function niceStep(span: number) {
  const raw = span / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag
}

export function DotChart({ bench, results }: { bench: Benchmark; results: BenchmarkResult[] }) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => {
    const by = new Map<string, BenchmarkResult[]>()
    for (const r of results) {
      const k = r.model.trim().toLowerCase()
      by.set(k, [...(by.get(k) ?? []), r])
    }
    return [...by.values()]
      .map((list) => {
        const best = list.reduce((a, b) => (better(bench, b.score, a.score) ? b : a))
        return { model: list[0].model, list, best }
      })
      .sort((a, b) => (better(bench, a.best.score, b.best.score) ? -1 : better(bench, b.best.score, a.best.score) ? 1 : 0))
  }, [results, bench])

  const [lo, hi, step] = useMemo(() => {
    const scores = results.map((r) => r.score)
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const s = niceStep(Math.max(max - min, bench.unit === "%" ? 10 : max * 0.2 || 1))
    return [Math.max(bench.min, Math.floor((min - s * 0.5) / s) * s), Math.min(bench.max, Math.ceil((max + s * 0.5) / s) * s), s]
  }, [results, bench])

  const phone = width > 0 && width < 520
  const labelW = phone ? 104 : 168
  const right = phone ? 44 : 64
  const plotW = Math.max(40, width - labelW - right)
  const height = TOP + rows.length * ROW + AXIS
  // Lower-is-better benchmarks run right to left, so "better" is always to the right.
  const x = (v: number) => labelW + ((bench.higherIsBetter ? v - lo : hi - v) / (hi - lo || 1)) * plotW
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Number(t.toFixed(6)))

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>{bench.metric[0].toUpperCase() + bench.metric.slice(1)} by model, best first. Each dot is one submitted result.</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4.5" fill={DOT} />
            </svg>
            Reproduced
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" fill="none" stroke={DOT} strokeWidth="2" />
            </svg>
            Not reproduced yet
          </span>
        </span>
      </figcaption>
      <div ref={box} className="relative w-full" style={{ height }} onPointerLeave={() => setTip(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Dot plot of ${results.length} ${bench.name} results across ${rows.length} models. The table below lists every value.`}>
            {/* Grid and axis: hairlines, recessive. */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={TOP} y2={height - AXIS + 4} stroke="rgb(255 255 255 / 0.07)" strokeWidth={1} />
                <text x={x(t)} y={height - AXIS + 18} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular">
                  {Number.isInteger(step) ? t : t.toFixed(step < 0.1 ? 2 : 1)}
                </text>
              </g>
            ))}
            {rows.map((row, i) => {
              const cy = TOP + i * ROW + ROW / 2
              const xs = row.list.map((r) => x(r.score))
              return (
                <g key={row.model}>
                  <text x={labelW - 12} y={cy} dy="0.35em" textAnchor="end" className="fill-foreground text-[12.5px]">
                    {row.model.length > (phone ? 13 : 22) ? `${row.model.slice(0, phone ? 12 : 21)}…` : row.model}
                  </text>
                  <line x1={labelW} x2={labelW + plotW} y1={cy} y2={cy} stroke="rgb(255 255 255 / 0.04)" strokeWidth={1} />
                  {row.list.length > 1 && <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={cy} y2={cy} stroke="rgb(255 255 255 / 0.22)" strokeWidth={2} strokeLinecap="round" />}
                  {row.list.map((r, j) => {
                    const verified = reproSummary(r).verified
                    const cx = x(r.score)
                    return (
                      <g
                        key={r.id}
                        tabIndex={0}
                        role="img"
                        aria-label={`${row.model}: ${formatScore(bench, r.score)}${r.quantisation ? `, ${r.quantisation}` : ""}${verified ? ", reproduced" : ", not reproduced yet"}`}
                        className="cursor-default outline-none [&:focus-visible>circle:last-child]:stroke-ring"
                        onPointerEnter={() => setTip({ r, x: cx, y: cy })}
                        onFocus={() => setTip({ r, x: cx, y: cy })}
                        onBlur={() => setTip(null)}
                      >
                        <circle cx={cx} cy={cy} r={12} fill="transparent" />
                        <motion.circle
                          initial={reduce ? false : { cx: labelW, opacity: 0 }}
                          animate={{ cx, opacity: 1 }}
                          transition={{
                            duration: reduce ? 0 : 0.7,
                            delay: reduce ? 0 : 0.05 * i + 0.04 * j,
                            ease: [0.23, 1, 0.32, 1],
                          }}
                          cy={cy}
                          r={verified ? 5.5 : 4.5}
                          fill={verified ? DOT : "var(--card)"}
                          stroke={verified ? "var(--card)" : DOT}
                          strokeWidth={2}
                        />
                      </g>
                    )
                  })}
                  <text x={Math.max(...xs) + 10} y={cy} dy="0.35em" className="fill-muted-foreground text-[11.5px] tabular">
                    {formatScore(bench, row.best.score)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {tip && <Tooltip tip={tip} bench={bench} width={width} />}
      </div>
      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
        {bench.higherIsBetter ? (
          <>
            Higher is better <ArrowRightIcon aria-hidden className="size-3" />
          </>
        ) : (
          <>
            <ArrowLeftIcon aria-hidden className="size-3" /> Lower is better, so the axis runs right to left and better is still to the right
          </>
        )}
      </p>
    </figure>
  )
}

function Tooltip({ tip, bench, width }: { tip: Tip; bench: Benchmark; width: number }) {
  const { r } = tip
  const s = reproSummary(r)
  const left = Math.min(Math.max(tip.x, 110), width - 110)
  const settings = [r.shots !== null ? `${r.shots}-shot` : null, r.quantisation, r.hardware].filter(Boolean).join(" · ")
  return (
    <div
      role="status"
      className={cn("pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl")}
      style={{ left, top: tip.y + 14 }}
    >
      <p className="text-sm font-semibold tabular">{formatScore(bench, r.score)}</p>
      <p className="truncate text-muted-foreground">{r.model}</p>
      {settings && <p className="mt-1 truncate text-muted-foreground">{settings}</p>}
      <p className="mt-1 text-muted-foreground">
        {s.verified ? `Reproduced by ${s.reproduced}${s.failed ? `, ${s.failed} could not` : ""}` : s.failed ? `${s.failed} could not reproduce` : "Not reproduced yet"}
      </p>
    </div>
  )
}
