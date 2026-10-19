"use client"

import Link from "next/link"
import { motion, useInView, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { seeded } from "@/components/hub/bits"
import type { ItemGroup } from "@/lib/hub"
import { cn } from "@/lib/utils"

const W = 640
const H = 360

/** A star on a map: something in a collection, with where it leads. */
export type MapStar = { key: string; label: string; type: string; group: ItemGroup; href: string | null }

const GROUP_COLORS: Partial<Record<ItemGroup, string>> = {
  model: "#a9c2ff",
  dataset: "#9fe3cf",
  tool: "#e9c79a",
  repo: "#d3b4ff",
  ghrepo: "#d3b4ff",
  paper: "#d8c59e",
  news: "#d8c59e",
  thread: "#8fb4ff",
  collection: "#ffb8d9",
  lab: "#7fd8e8",
}
export const starColor = (g: ItemGroup) => GROUP_COLORS[g] ?? "#c9d6f0"

/** Where each star sits: spread across the sky left to right, lifted and dropped by a seeded wave. */
function place(seed: string, n: number) {
  const r = seeded(seed)
  return Array.from({ length: n }, (_, i) => {
    const x = 70 + (i / Math.max(n - 1, 1)) * (W - 140) + (r() - 0.5) * 40
    const y = H / 2 + Math.sin(i * 1.7 + r() * 2) * (H * 0.28) + (r() - 0.5) * 30
    // Rounded so the server and the browser print the same numbers (their Math.sin can differ in the last digit).
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
  })
}

const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)

/**
 * A collection drawn as a star map: each item is a star in the curator's reading order, joined one to the next.
 * Lines draw themselves in when the map comes into view; pointing at a star lights its neighbours. Stars link to
 * their pages. Up to 12 stars; the rest of the collection is in the list below the map.
 */
export function StarMap({ id, name, stars, className, labels = true }: { id: string; name: string; stars: MapStar[]; className?: string; labels?: boolean }) {
  const shown = stars.slice(0, 12)
  const pts = place(id, shown.length)
  const links: [number, number][] = shown.slice(1).map((_, i) => [i, i + 1])
  const [hot, setHot] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" }) || Boolean(reduce)
  const near = (i: number) => hot === null || hot === i || Math.abs(hot - i) === 1

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className={cn("block w-full", className)} role="img" aria-label={`Star map of ${name}: ${shown.map((s) => s.label).join(", ")}`}>
      <defs>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#8fb4ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8fb4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: 70 }, (_, i) => {
        const r = seeded(id + i)
        return <circle key={i} cx={Math.round(r() * W)} cy={Math.round(r() * H)} r={r() > 0.9 ? 1.1 : 0.6} fill="#fff" opacity={Math.round((0.15 + r() * 0.4) * 100) / 100} />
      })}
      {links.map(([a, b], i) => {
        const on = hot === null || hot === a || hot === b
        const p = pts[a]
        const q = pts[b]
        const mx = (p.x + q.x) / 2
        const my = Math.round(((p.y + q.y) / 2 - 30) * 10) / 10
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
            transition={{ duration: reduce ? 0 : 1.1, delay: reduce ? 0 : 0.3 + i * 0.15, ease: [0.77, 0, 0.175, 1] }}
            style={{ transition: "stroke-opacity 200ms ease" }}
          />
        )
      })}
      {shown.map((s, i) => {
        const { x, y } = pts[i]
        const color = starColor(s.group)
        const body = (
          <motion.g
            initial={false}
            animate={{ opacity: seen ? (near(i) ? 1 : 0.35) : 0, scale: seen ? 1 : 0.6 }}
            transition={{ duration: reduce ? 0 : 0.5, delay: hot === null && !reduce ? i * 0.1 : 0 }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          >
            <circle cx={x} cy={y} r={hot === i ? 34 : 24} fill={`url(#glow-${id})`} style={{ transition: "r 250ms ease" }} />
            <circle cx={x} cy={y} r={5} fill={color} />
            <circle cx={x} cy={y} r={9} fill="none" stroke={color} strokeOpacity={0.5} />
            {labels && (
              <>
                <text x={x} y={y + 28} textAnchor="middle" fill="#e9ebf1" fontSize="12" fontWeight="500" style={{ fontFamily: "var(--font-geist)" }}>
                  {short(s.label)}
                </text>
                <text x={x} y={y + 43} textAnchor="middle" fill={color} fontSize="10" style={{ fontFamily: "var(--font-geist)" }}>
                  {s.type}
                </text>
              </>
            )}
          </motion.g>
        )
        const events = { onPointerEnter: () => setHot(i), onPointerLeave: () => setHot(null), onFocus: () => setHot(i), onBlur: () => setHot(null) }
        return s.href ? (
          <Link key={s.key} href={s.href as "/"} aria-label={`${s.type}: ${s.label}`} {...events}>
            {body}
          </Link>
        ) : (
          <g key={s.key} {...events}>
            {body}
          </g>
        )
      })}
    </svg>
  )
}
