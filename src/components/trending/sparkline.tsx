"use client"

import { motion, useReducedMotion } from "motion/react"
import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * A small line of real daily activity, drawn in as it appears. Flat (and labelled so) when nothing happened.
 * Pure SVG, no layout work per frame: the stroke is revealed with pathLength.
 */
export function Sparkline({ values, className, tone = "var(--color-ion)", label }: { values: number[]; className?: string; tone?: string; label?: string }) {
  const reduce = useReducedMotion()
  const id = useId().replace(/:/g, "")
  const w = 100
  const h = 28
  const max = Math.max(1, ...values)
  const pts = values.length > 1 ? values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 6)] as const) : [[0, h - 2], [w, h - 2]] as const
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`
  const total = values.reduce((s, v) => s + v, 0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label ?? `${total} actions over ${values.length} days`} className={cn("block h-7 w-24 overflow-visible", className)}>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.35" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill={`url(#sp-${id})`} initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }} />
      <motion.path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
      />
      {values.length > 1 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={tone} />}
    </svg>
  )
}
