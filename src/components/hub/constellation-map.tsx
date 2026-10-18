"use client"

import Link from "next/link"
import { motion, useInView, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { seeded } from "@/components/hub/bits"
import { getResource, KINDS, resourcePath, type Constellation } from "@/lib/data"
import { cn } from "@/lib/utils"

const W = 640
const H = 360
const COLORS = { model: "#a9c2ff", dataset: "#9fe3cf", tool: "#e9c79a", repo: "#d3b4ff" } as const

/** Where each star sits: spread across the sky left to right, lifted and dropped by a seeded wave. */
function layout(c: Constellation) {
  const r = seeded(c.slug)
  const n = c.stars.length
  return c.stars.map((_, i) => {
    const x = 70 + (i / Math.max(n - 1, 1)) * (W - 140) + (r() - 0.5) * 40
    const y = H / 2 + Math.sin(i * 1.7 + r() * 2) * (H * 0.28) + (r() - 0.5) * 30
    return { x, y }
  })
}

/**
 * A stack drawn as a star map: each resource is a star, each line says "this feeds that". Lines draw
 * themselves in when the map comes into view; pointing at a star lights what it connects to.
 */
export function ConstellationMap({ c, className, labels = true }: { c: Constellation; className?: string; labels?: boolean }) {
  const pts = layout(c)
  const [hot, setHot] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" }) || Boolean(reduce)
  const near = (i: number) => hot === null || hot === i || c.links.some(([a, b]) => (a === hot && b === i) || (b === hot && a === i))

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className={cn("block w-full", className)} role="img" aria-label={`Star map of ${c.name}`}>
      <defs>
        <radialGradient id="star-glow">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#8fb4ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8fb4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: 70 }, (_, i) => {
        const r = seeded(c.slug + i)
        return <circle key={i} cx={r() * W} cy={r() * H} r={r() > 0.9 ? 1.1 : 0.6} fill="#fff" opacity={0.15 + r() * 0.4} />
      })}
      {c.links.map(([a, b], i) => {
        const on = hot === null || hot === a || hot === b
        const p = pts[a]
        const q = pts[b]
        const mx = (p.x + q.x) / 2
        const my = (p.y + q.y) / 2 - 30
        return (
          <motion.path
            key={i}
            d={`M ${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}`}
            fill="none"
            stroke="#8fb4ff"
            strokeOpacity={on ? 0.7 : 0.15}
            strokeWidth={on && hot !== null ? 1.6 : 1}
            initial={false}
            animate={{ pathLength: seen ? 1 : 0 }}
            transition={{ duration: 1.2, delay: 0.3 + i * 0.18, ease: [0.77, 0, 0.175, 1] }}
            style={{ transition: "stroke-opacity 200ms ease" }}
          />
        )
      })}
      {c.stars.map((slug, i) => {
        const r = getResource(slug)
        if (!r) return null
        const { x, y } = pts[i]
        const color = COLORS[r.kind]
        return (
          <Link key={slug} href={resourcePath(r)} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
            <motion.g
              initial={false}
              animate={{ opacity: seen ? (near(i) ? 1 : 0.35) : 0, scale: seen ? 1 : 0.6 }}
              transition={{ duration: 0.5, delay: hot === null && !reduce ? i * 0.12 : 0 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              <circle cx={x} cy={y} r={hot === i ? 34 : 24} fill="url(#star-glow)" style={{ transition: "r 250ms ease" }} />
              <circle cx={x} cy={y} r={5} fill={color} />
              <circle cx={x} cy={y} r={9} fill="none" stroke={color} strokeOpacity={0.5} />
              {labels && (
                <>
                  <text x={x} y={y + 28} textAnchor="middle" fill="#e9ebf1" fontSize="12" fontWeight="500" style={{ fontFamily: "var(--font-geist)" }}>
                    {r.name}
                  </text>
                  <text x={x} y={y + 43} textAnchor="middle" fill={color} fontSize="10" style={{ fontFamily: "var(--font-geist)" }}>
                    {KINDS[r.kind].label}
                  </text>
                </>
              )}
            </motion.g>
          </Link>
        )
      })}
    </svg>
  )
}
