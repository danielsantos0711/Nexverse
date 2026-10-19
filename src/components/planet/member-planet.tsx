"use client"

import { useReducedMotion } from "motion/react"
import { useEffect, useId, useMemo, useRef } from "react"
import { seeded } from "@/components/hub/bits"
import { cn } from "@/lib/utils"

/** What a member has done. Every field is optional; a member with nothing yet is a small bare world. */
export type PlanetStats = {
  /** Reputation points: the planet grows with them. */
  points?: number
  /** Rings, inside out. */
  threads?: number
  replies?: number
  accepted?: number
  /** Moons. */
  projects?: number
  collections?: number
  events?: number
}

// The world's palettes: pairs of hues the deep-space ground can carry. Picked by handle, never by category.
const WORLDS = [
  { a: [222, 62, 64], b: [232, 40, 30], kind: "bands" }, // ion
  { a: [168, 44, 60], b: [196, 46, 26], kind: "marble" }, // tide
  { a: [38, 46, 72], b: [24, 34, 34], kind: "bands" }, // champagne
  { a: [265, 52, 70], b: [240, 34, 28], kind: "bands" }, // violet
  { a: [196, 58, 66], b: [214, 44, 24], kind: "marble" }, // ice
  { a: [12, 52, 66], b: [350, 32, 28], kind: "bands" }, // ember
  { a: [150, 30, 66], b: [180, 30, 22], kind: "marble" }, // moss
] as const

const RINGS = [
  { key: "threads", color: "#8fb4ff", label: "thread" },
  { key: "replies", color: "#c9d6f0", label: "reply" },
  { key: "accepted", color: "#d8c59e", label: "accepted answer" },
] as const
const MOONS = [
  { key: "projects", color: "#e9c79a", r: 4.2, label: "project" },
  { key: "collections", color: "#9fe3cf", r: 3.4, label: "collection" },
  { key: "events", color: "#d3b4ff", r: 3.8, label: "event" },
] as const

const C = 100 // centre of the 200×200 drawing
const TILT = -16 // the ring plane, degrees
const hsl = ([h, s, l]: readonly number[], dl = 0, alpha = 1) => `hsl(${h} ${s}% ${Math.round(Math.max(4, Math.min(92, l + dl)))}% / ${alpha.toFixed(2)})`
const say = (n: number, one: string) => `${n.toLocaleString("en")} ${n === 1 ? one : one === "reply" ? "replies" : `${one}s`}`

/** Everything about the drawing that follows from the handle and the numbers, so server and browser agree. */
function build(handle: string, stats: PlanetStats) {
  const r = seeded(`planet:${handle.toLowerCase()}`)
  const world = WORLDS[Math.floor(r() * WORLDS.length)]
  const points = Math.max(0, stats.points ?? 0)
  const grow = Math.min(1, Math.log10(points + 1) / Math.log10(5001))
  const R = Math.round((24 + 34 * grow) * 100) / 100

  // The surface is a strip twice the planet's width, drawn twice side by side, so sliding it loops seamlessly.
  const W = R * 4
  const bandCount = 7 + Math.floor(r() * 6)
  const bands = Array.from({ length: bandCount }, (_, i) => {
    const y = C - R + (i / bandCount) * 2 * R
    const h = (2 * R) / bandCount + 2
    const amp = 1 + r() * 3
    const waves = 2 + Math.floor(r() * 3)
    // a wavy top edge that repeats exactly every W
    let d = `M0 ${y + h}`
    for (let x = 0; x <= W; x += W / 24) d += ` L${x.toFixed(1)} ${(y + Math.sin((x / W) * Math.PI * 2 * waves + i) * amp).toFixed(1)}`
    d += ` L${W} ${y + h} Z`
    return { d, fill: hsl(r() > 0.5 ? world.a : world.b, -14 + r() * 30, 0.55 + r() * 0.4) }
  })
  const q = (n: number) => Math.round(n * 100) / 100
  const blobs = Array.from({ length: 9 + Math.floor(r() * 7) }, () => ({
    x: q(r() * W),
    y: q(C - R + r() * 2 * R),
    rx: q(R * (0.18 + r() * 0.42)),
    ry: q(R * (0.1 + r() * 0.22)),
    fill: hsl(r() > 0.4 ? world.a : world.b, -10 + r() * 24, 0.5 + r() * 0.4),
  }))
  const storm = r() > 0.45 ? { x: q(r() * W), y: q(C - R * 0.5 + r() * R), rx: q(R * 0.16), ry: q(R * 0.09) } : null

  const rings: { a: number; w: number; color: string; label: string; n: number }[] = []
  for (const k of RINGS) {
    const n = Math.max(0, Math.floor(stats[k.key] ?? 0))
    if (!n) continue
    rings.push({ a: R + 11 + rings.length * 9, w: Math.round(Math.min(6, 1.4 + Math.log2(n + 1) * 1.1) * 100) / 100, color: k.color, label: k.label, n })
  }
  const moonStart = Math.max(rings.length ? rings[rings.length - 1].a + 11 : 0, R + 16)
  const moons: { a: number; r: number; color: string; phase: number; speed: number }[] = []
  for (const m of MOONS) {
    const n = Math.min(3, Math.max(0, Math.floor(stats[m.key] ?? 0)))
    for (let j = 0; j < n; j++) {
      moons.push({ a: Math.min(95, moonStart + moons.length * 6), r: m.r, color: m.color, phase: r() * Math.PI * 2, speed: 0.12 + r() * 0.14 })
    }
  }
  // a few faint stars around the world, its own sky
  const stars = Array.from({ length: 14 }, () => {
    const th = r() * Math.PI * 2
    const d = R * 1.25 + r() * (98 - R * 1.25)
    return { x: q(C + Math.cos(th) * d), y: q(C + Math.sin(th) * d), o: q(0.15 + r() * 0.45), r: r() > 0.85 ? 0.9 : 0.5 }
  })
  const spin = 5 + r() * 5 // seconds for the surface to slide one planet width
  return { world, R, W, bands, blobs, storm, rings, moons, stars, spin, light: hsl(world.a, 18) }
}

/**
 * A member drawn as a planet, generated from their handle. It grows with reputation; its rings stand for
 * threads (ion), replies (silver) and accepted answers (champagne), thicker the more there are; its moons for
 * projects, collections and events (up to three of each). The surface turns and the moons orbit slowly while
 * it is on screen; with reduced motion it is a still picture.
 */
export function MemberPlanet({ handle, stats, size = 160, className, label }: { handle: string; stats: PlanetStats; size?: number; className?: string; label?: string }) {
  const uid = useId().replace(/:/g, "")
  const reduce = useReducedMotion()
  const key = JSON.stringify(stats)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const p = useMemo(() => build(handle, stats), [handle, key])
  const box = useRef<SVGSVGElement>(null)
  const surface = useRef<SVGGElement>(null)
  const moonEls = useRef<(SVGCircleElement | null)[]>([])

  useEffect(() => {
    const svg = box.current
    if (!svg || reduce) return
    let raf = 0
    let last = 0
    let t = 0
    let visible = false
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      // ~30 fps is plenty for something this slow
      if (now - last >= 32) {
        t += last ? Math.min(0.1, (now - last) / 1000) : 0
        last = now
        const shift = -((t / p.spin) * p.R * 2) % (p.W)
        surface.current?.setAttribute("transform", `translate(${shift.toFixed(2)} 0)`)
        p.moons.forEach((m, i) => {
          const el = moonEls.current[i]
          if (!el) return
          const th = m.phase + t * m.speed
          el.setAttribute("cx", (C + m.a * Math.cos(th)).toFixed(2))
          el.setAttribute("cy", (C + m.a * 0.3 * Math.sin(th)).toFixed(2))
          // behind the planet while on the far half of the orbit and inside the disc
          const behind = Math.sin(th) < 0 && Math.abs(m.a * Math.cos(th)) < p.R
          el.style.opacity = behind ? "0" : "1"
        })
      }
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else {
        cancelAnimationFrame(raf)
        raf = 0
      }
    })
    io.observe(svg)
    document.addEventListener("visibilitychange", start)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", start)
      cancelAnimationFrame(raf)
    }
  }, [p, reduce])

  const parts: string[] = []
  for (const g of p.rings) parts.push(say(g.n, g.label))
  for (const m of MOONS) {
    const n = Math.max(0, Math.floor(stats[m.key] ?? 0))
    if (n) parts.push(say(n, m.label))
  }
  const description = label ?? `${handle}'s planet: ${(stats.points ?? 0).toLocaleString("en")} reputation${parts.length ? `, ${parts.join(", ")}` : ", nothing posted yet"}.`
  const ringPath = (a: number, half: "back" | "front") => {
    const b = a * 0.3
    // the far half of an ellipse goes over the top, the near half under the planet
    return half === "back" ? `M${C - a} ${C} A${a} ${b} 0 0 1 ${C + a} ${C}` : `M${C - a} ${C} A${a} ${b} 0 0 0 ${C + a} ${C}`
  }
  const ring = (half: "back" | "front") => (
    <g transform={`rotate(${TILT} ${C} ${C})`} fill="none" strokeLinecap="round">
      {p.rings.map((g) => (
        <g key={g.label}>
          <path d={ringPath(g.a, half)} stroke={g.color} strokeOpacity={half === "back" ? 0.32 : 0.75} strokeWidth={g.w} />
          <path d={ringPath(g.a + g.w / 2 + 1.2, half)} stroke={g.color} strokeOpacity={0.18} strokeWidth={0.6} />
        </g>
      ))}
      {half === "back" && p.moons.map((m, i) => <ellipse key={i} cx={C} cy={C} rx={m.a} ry={m.a * 0.3} stroke="rgb(255 255 255 / 0.07)" strokeWidth={0.5} strokeDasharray="1 2.5" />)}
    </g>
  )

  return (
    <svg ref={box} role="img" aria-label={description} viewBox="0 0 200 200" width={size} height={size} className={cn("shrink-0 overflow-visible", className)}>
      <defs>
        <clipPath id={`${uid}-disc`}>
          <circle cx={C} cy={C} r={p.R} />
        </clipPath>
        <radialGradient id={`${uid}-shade`} cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="38%" stopColor="#fff" stopOpacity="0" />
          <stop offset="72%" stopColor="#05060a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#05060a" stopOpacity="0.92" />
        </radialGradient>
        <radialGradient id={`${uid}-air`} cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor={p.light} stopOpacity="0" />
          <stop offset="88%" stopColor={p.light} stopOpacity="0.16" />
          <stop offset="100%" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
      </defs>

      {p.stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      <circle cx={C} cy={C} r={p.R * 1.16} fill={`url(#${uid}-air)`} />
      {ring("back")}

      <g clipPath={`url(#${uid}-disc)`}>
        <circle cx={C} cy={C} r={p.R} fill={hsl(p.world.b, -6)} />
        <g transform={`rotate(${TILT} ${C} ${C})`}>
          <g ref={surface}>
            {[0, p.W].map((dx) => (
              <g key={dx} transform={`translate(${C - p.R * 2 + dx} 0)`}>
                {p.world.kind === "bands"
                  ? p.bands.map((b, i) => <path key={i} d={b.d} fill={b.fill} />)
                  : p.blobs.flatMap((b, i) => [
                      <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={b.fill} />,
                      // repeat what spills over the strip's right edge on its left, so the loop has no seam
                      <ellipse key={`w${i}`} cx={b.x - p.W} cy={b.y} rx={b.rx} ry={b.ry} fill={b.fill} />,
                    ])}
                {p.storm && <ellipse cx={p.storm.x} cy={p.storm.y} rx={p.storm.rx} ry={p.storm.ry} fill={hsl(p.world.a, 22, 0.8)} />}
              </g>
            ))}
          </g>
        </g>
        <circle cx={C} cy={C} r={p.R} fill={`url(#${uid}-shade)`} />
      </g>
      <circle cx={C} cy={C} r={p.R - 0.4} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={0.8} />

      {ring("front")}
      <g transform={`rotate(${TILT} ${C} ${C})`}>
        {p.moons.map((m, i) => {
          // rounded, so the server's and the browser's numbers print the same
          const x = Math.round((C + m.a * Math.cos(m.phase)) * 100) / 100
          const y = Math.round((C + m.a * 0.3 * Math.sin(m.phase)) * 100) / 100
          const behind = Math.sin(m.phase) < 0 && Math.abs(m.a * Math.cos(m.phase)) < p.R
          return (
            <circle
              key={i}
              ref={(el) => {
                moonEls.current[i] = el
              }}
              cx={x}
              cy={y}
              r={m.r}
              fill={m.color}
              stroke="#05060a"
              strokeOpacity={0.6}
              strokeWidth={0.8}
              style={{ opacity: behind ? 0 : 1, transition: "opacity 160ms ease" }}
            />
          )
        })}
      </g>
    </svg>
  )
}

/** What the rings and moons mean, in one quiet line. */
export function PlanetLegend({ className }: { className?: string }) {
  const dot = (c: string) => <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: c }} />
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="text-foreground/80">Rings</span>
      {RINGS.map((r) => (
        <span key={r.key} className="inline-flex items-center gap-1.5">
          {dot(r.color)}
          {r.key === "accepted" ? "solutions" : r.key}
        </span>
      ))}
      <span className="text-foreground/80">Moons</span>
      {MOONS.map((m) => (
        <span key={m.key} className="inline-flex items-center gap-1.5">
          {dot(m.color)}
          {m.key}
        </span>
      ))}
    </p>
  )
}
