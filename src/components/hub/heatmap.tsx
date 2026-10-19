"use client"

import { motion, useReducedMotion } from "motion/react"

const LEVELS = ["rgb(255 255 255 / 0.05)", "rgb(143 180 255 / 0.3)", "rgb(143 180 255 / 0.5)", "rgb(143 180 255 / 0.75)", "rgb(201 217 255 / 0.95)"]
const DAY = 864e5

/** Contributions per day for the last 52 weeks (364 days), oldest first, ending today. */
export function dailyCounts(dates: string[], now: number): number[] {
  const days = Array.from({ length: 364 }, () => 0)
  const today = Math.floor(now / DAY)
  for (const d of dates) {
    const t = Date.parse(d)
    if (!Number.isFinite(t)) continue
    const ago = today - Math.floor(t / DAY)
    if (ago >= 0 && ago < 364) days[363 - ago] += 1
  }
  return days
}

/** A year of real activity: one column per week, one cell per day, darker for more. Cells fade in week by week. */
export function Heatmap({ days, label = "Contributions over the last 52 weeks" }: { days: number[]; label?: string }) {
  const reduce = useReducedMotion()
  const max = Math.max(...days, 1)
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((n / max) * 4))))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${52 * 13} ${7 * 13}`} className="block min-w-[560px]" role="img" aria-label={label}>
        {days.map((n, i) => {
          const x = Math.floor(i / 7)
          const y = i % 7
          return (
            <motion.rect
              key={i}
              x={x * 13}
              y={y * 13}
              width={10}
              height={10}
              rx={2.5}
              fill={LEVELS[level(n)]}
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: reduce ? 0 : x * 0.012 }}
            >
              <title>{n === 0 ? "No contributions" : `${n} ${n === 1 ? "contribution" : "contributions"}`}</title>
            </motion.rect>
          )
        })}
      </svg>
    </div>
  )
}
