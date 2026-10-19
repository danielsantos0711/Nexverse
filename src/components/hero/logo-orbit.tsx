"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { BoxIcon, DatabaseIcon, FolderGit2Icon, MessageSquareIcon, MessagesSquareIcon, WrenchIcon, type LucideIcon } from "lucide-react"
import type { HeroEffect, MotionLevel } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

// WebGL, client only and off the first paint: the N, its moons and the still galaxy show at once.
const Galaxy = dynamic(() => import("@/components/hero/particle-galaxy"), { ssr: false })

/** The places of Nexverse, orbiting the N. Each is a link, so the hero doubles as a map of the site. */
const MOONS: { href: "/models" | "/datasets" | "/tools" | "/repos" | "/forum" | "/chat"; label: string; icon: LucideIcon; ring: number; phase: number; tint: string }[] = [
  { href: "/models", label: "Models", icon: BoxIcon, ring: 0, phase: 0, tint: "text-model" },
  { href: "/datasets", label: "Datasets", icon: DatabaseIcon, ring: 1, phase: 0.33, tint: "text-dataset" },
  { href: "/tools", label: "Tools", icon: WrenchIcon, ring: 0, phase: 0.5, tint: "text-tool" },
  { href: "/repos", label: "Repos", icon: FolderGit2Icon, ring: 1, phase: 0.83, tint: "text-repo" },
  { href: "/forum", label: "Forum", icon: MessageSquareIcon, ring: 2, phase: 0.15, tint: "text-ion" },
  { href: "/chat", label: "Chat", icon: MessagesSquareIcon, ring: 2, phase: 0.65, tint: "text-gold" },
]

// Each ring: horizontal and vertical radius as a share of the box, its tilt, and seconds per turn.
const RINGS = [
  { rx: 0.42, ry: 0.15, tilt: -16, period: 50 },
  { rx: 0.49, ry: 0.21, tilt: 8, period: 70 },
  { rx: 0.45, ry: 0.3, tilt: -3, period: 90 },
]

type Status = "loading" | "ready" | "lost" | "failed"

/**
 * Daniel's own fluid N, the real artwork and never warped, at the heart of a galaxy: it leans toward the
 * pointer, a highlight follows the pointer across its metal, a band of light sweeps it, and the sections of
 * the site orbit it as moons you can click.
 *
 * `effect` is the admins' choice: "galaxy" (the WebGL galaxy turns behind the N), "orbit" (no WebGL: a still
 * galaxy, the moons still turn) or "still" (nothing moves). `motion` is the site's motion level; "calm" slows
 * everything down and "off", like the visitor's own reduced-motion setting, gives the still version.
 */
export function LogoOrbit({ className, effect = "galaxy", motion: level = "full" }: { className?: string; effect?: HeroEffect; motion?: MotionLevel }) {
  const prefersReduced = useReducedMotion()
  const still = Boolean(prefersReduced) || level === "off" || effect === "still"
  const calm = level === "calm"
  const box = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>("loading")
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 60, damping: 16 })
  const sy = useSpring(py, { stiffness: 60, damping: 16 })
  const rotY = useTransform(sx, [-1, 1], [-14, 14])
  const rotX = useTransform(sy, [-1, 1], [10, -10])
  const shiftX = useTransform(sx, [-1, 1], [-12, 12])
  const shiftY = useTransform(sy, [-1, 1], [-8, 8])
  // A highlight that slides over the metal toward the pointer, clipped to the N's own silhouette.
  const lightX = useTransform(sx, [-1, 1], ["20%", "80%"])
  const lightY = useTransform(sy, [-1, 1], ["15%", "85%"])

  // A lost context keeps the canvas mounted (hidden) so it can come back; the still image covers meanwhile.
  const webgl = effect === "galaxy" && status !== "failed"

  return (
    <div
      ref={box}
      className={cn("relative [perspective:1100px]", className)}
      onPointerMove={(e) => {
        if (still || e.pointerType !== "mouse") return
        const b = box.current!.getBoundingClientRect()
        px.set(((e.clientX - b.left) / b.width) * 2 - 1)
        py.set(((e.clientY - b.top) / b.height) * 2 - 1)
      }}
      onPointerLeave={() => {
        px.set(0)
        py.set(0)
      }}
    >
      {/* halo behind the N: a soft gradient, no filter, so it costs nothing to keep on screen */}
      <div aria-hidden className="absolute inset-[10%] rounded-full bg-[radial-gradient(closest-side,rgb(143_180_255/0.22),rgb(143_180_255/0.06)_55%,transparent)]" />

      {/* the galaxy: a still image always (it is what shows before WebGL starts, without WebGL, and if the GPU
          drops the context), with the live one drawn over it when it runs */}
      <div aria-hidden className="galaxy-in pointer-events-none absolute -inset-x-[60%] -inset-y-[23%] opacity-80">
        <Image
          src="/space/galaxy-still.webp"
          alt=""
          fill
          sizes="(min-width: 640px) 80rem, 200vw"
          className={cn("object-cover transition-opacity duration-700", webgl && status === "ready" ? "opacity-0" : "opacity-100")}
        />
        {webgl && (
          <div className={cn("absolute inset-0 transition-opacity duration-700", status === "ready" ? "opacity-100" : "opacity-0")}>
            <Galaxy density={calm ? 40 : 55} speed={calm ? 20 : 45} turbulence={calm ? 30 : 60} still={still} onStatus={setStatus} />
          </div>
        )}
      </div>
      <Rings half="back" />

      <motion.div className="absolute inset-[19%] [transform-style:preserve-3d]" style={still ? undefined : { rotateX: rotX, rotateY: rotY, x: shiftX, y: shiftY }}>
        <div className={cn("relative size-full", !still && "logo-float")}>
          {/* Daniel's N, untouched: light moves over it, its shape never changes */}
          <div aria-hidden className={cn("logo-aura absolute inset-[8%]", (still || calm) && "[animation:none]")} />
          <Image
            src="/brand/n-chrome-alpha.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 640px) 22rem, 60vw"
            className="object-contain [filter:drop-shadow(0_24px_48px_rgb(143_180_255/0.25))]"
          />
          {!still && (
            <>
              <motion.div aria-hidden className="logo-light absolute inset-0" style={{ "--lx": lightX, "--ly": lightY } as React.CSSProperties} />
              {!calm && <div aria-hidden className="logo-sheen absolute inset-0" />}
            </>
          )}
        </div>
      </motion.div>

      <Rings half="front" />
      <Moons still={still} slow={calm ? 2 : 1} />
    </div>
  )
}

function Rings({ half }: { half: "back" | "front" }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <defs>
        <linearGradient id={`ring-${half}`} x1="0" x2="1">
          <stop offset="0" stopColor="#8fb4ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8fb4ff" stopOpacity={half === "front" ? 0.55 : 0.25} />
          <stop offset="1" stopColor="#d8c59e" stopOpacity="0" />
        </linearGradient>
      </defs>
      {RINGS.map((r, i) => {
        const rx = r.rx * 100
        const ry = r.ry * 100
        // back half is the upper arc (further away), front half the lower arc
        const d = half === "back" ? `M ${50 - rx} 50 A ${rx} ${ry} 0 0 1 ${50 + rx} 50` : `M ${50 - rx} 50 A ${rx} ${ry} 0 0 0 ${50 + rx} 50`
        return <path key={i} d={d} transform={`rotate(${r.tilt} 50 50)`} fill="none" stroke={`url(#ring-${half})`} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}

/** Where a moon sits at a moment, as a share of the box: on its tilted ellipse, nearer (1) or further (-1). */
function orbitAt(m: (typeof MOONS)[number], time: number) {
  const ring = RINGS[m.ring]
  const a = (m.phase + time / ring.period) * Math.PI * 2
  const tilt = (ring.tilt * Math.PI) / 180
  const ex = Math.cos(a) * ring.rx
  const ey = Math.sin(a) * ring.ry
  return { x: 0.5 + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: 0.5 + ex * Math.sin(tilt) + ey * Math.cos(tilt), depth: Math.sin(a) }
}

/** The first frame, rendered on the server too, in percentages so it needs no measuring. */
function initialStyle(m: (typeof MOONS)[number]): React.CSSProperties {
  const p = orbitAt(m, 0)
  return {
    left: `${(p.x * 100).toFixed(2)}%`,
    top: `${(p.y * 100).toFixed(2)}%`,
    transform: `translate(-50%, -50%) scale(${(0.78 + (p.depth + 1) * 0.14).toFixed(3)})`,
    opacity: 0.45 + (p.depth + 1) * 0.275,
    zIndex: p.depth > 0 ? 3 : 0,
  }
}

/**
 * The moons. They move with transform and opacity only (no layout), from a size measured by a ResizeObserver,
 * and only while the hero is on screen, the tab is visible and nobody is pointing at or focused on them.
 */
function Moons({ still, slow }: { still: boolean; slow: number }) {
  const nav = useRef<HTMLElement>(null)
  const refs = useRef<(HTMLAnchorElement | null)[]>([])
  const held = useRef(false)

  useEffect(() => {
    const el = nav.current
    const moons = refs.current
    if (!el || still) return
    let w = el.clientWidth
    let h = el.clientHeight
    let raf = 0
    let last = 0
    let t = 0
    let visible = true
    const frame = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (!held.current) t += dt / slow
      for (let i = 0; i < MOONS.length; i++) {
        const moon = moons[i]
        if (!moon) continue
        const p = orbitAt(MOONS[i], t)
        // left/top stay at 0 once moving: the whole position is one transform
        moon.style.transform = `translate3d(${(p.x * w).toFixed(1)}px, ${(p.y * h).toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.78 + (p.depth + 1) * 0.14).toFixed(3)})`
        moon.style.opacity = (0.45 + (p.depth + 1) * 0.275).toFixed(3)
        moon.style.zIndex = p.depth > 0 ? "3" : "0"
      }
      run()
    }
    const run = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
      if ((!visible || document.hidden) && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      last = 0
    }
    for (const moon of moons) {
      if (!moon) continue
      moon.style.left = "0px"
      moon.style.top = "0px"
    }
    const ro = new ResizeObserver(() => {
      w = el.clientWidth
      h = el.clientHeight
    })
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      run()
    })
    ro.observe(el)
    io.observe(el)
    document.addEventListener("visibilitychange", run)
    run()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", run)
      // back to the server's first frame, so a switch to "still" lands somewhere sensible
      MOONS.forEach((m, i) => {
        const moon = moons[i]
        if (moon) Object.assign(moon.style, initialStyle(m) as Record<string, unknown>)
      })
    }
  }, [still, slow])

  return (
    <nav ref={nav} aria-label="Sections" onPointerEnter={() => {
        held.current = true
      }}
      onPointerLeave={() => {
        held.current = false
      }} className="absolute inset-0">
      {MOONS.map((m, i) => {
        const Icon = m.icon
        return (
          <Link
            key={m.href}
            href={m.href}
            ref={(el) => {
              refs.current[i] = el
            }}
            style={initialStyle(m)}
            onFocus={() => {
              held.current = true
            }}
            onBlur={() => {
              held.current = false
            }}
            className="moon group absolute flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0b0e16]/85 py-1 pr-3 pl-1 text-xs whitespace-nowrap text-foreground/90 transition-[border-color,background-color,box-shadow] duration-200 will-change-transform hover:border-white/30 hover:bg-[#0b0e16] hover:shadow-[0_0_30px_-4px_rgb(143_180_255/0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className={cn("grid size-6 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10", m.tint)}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            {m.label}
          </Link>
        )
      })}
    </nav>
  )
}
