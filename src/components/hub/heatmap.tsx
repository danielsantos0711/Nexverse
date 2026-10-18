"use client"

import { motion, useReducedMotion } from "motion/react"
import { seeded } from "@/components/hub/bits"

const LEVELS = ["rgb(255 255 255 / 0.05)", "rgb(143 180 255 / 0.25)", "rgb(143 180 255 / 0.45)", "rgb(143 180 255 / 0.7)", "rgb(201 217 255 / 0.95)"]

/** A year of activity, one column per week and one cell per day; cells fade in week by week. */
export function Heatmap({ weeks, seed }: { weeks: number[]; seed: string }) {
  const reduce = useReducedMotion()
  const r = seeded(seed + "days")
  const max = Math.max(...weeks, 1)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${52 * 13} ${7 * 13}`} className="block min-w-[560px]" role="img" aria-label="Contribution heatmap for the last 52 weeks">
        {weeks.map((w, x) =>
          Array.from({ length: 7 }, (_, y) => {
            const v = Math.max(0, Math.round((w / max) * 4 * (0.4 + r() * 0.9)) - (r() > 0.7 ? 1 : 0))
            return (
              <motion.rect
                key={`${x}-${y}`}
                x={x * 13}
                y={y * 13}
                width={10}
                height={10}
                rx={2.5}
                fill={LEVELS[Math.min(v, 4)]}
                initial={reduce ? false : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: x * 0.012 }}
              />
            )
          })
        )}
      </svg>
    </div>
  )
}
