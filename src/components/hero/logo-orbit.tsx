"use client"

import Link from "next/link"
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
import { useRef, useState } from "react"
import { BoxIcon, DatabaseIcon, FolderGit2Icon, MessageSquareIcon, MessagesSquareIcon, WrenchIcon, type LucideIcon } from "lucide-react"
import DustVortex from "@/components/hero/dust-vortex"
import LiquidLogo from "@/components/hero/liquid-logo"
import { cn } from "@/lib/utils"

/** The places of Nexverse, orbiting the N. Each is a link, so the hero doubles as a map of the site. */
const MOONS: { href: string; label: string; icon: LucideIcon; ring: number; phase: number; tint: string }[] = [
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

/**
 * Daniel's own fluid N, the real artwork, floating in space: it leans toward the pointer, a band of light
 * runs across its metal, and the sections of the site orbit it as moons you can click.
 */
export function LogoOrbit({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 60, damping: 16 })
  const sy = useSpring(py, { stiffness: 60, damping: 16 })
  const rotY = useTransform(sx, [-1, 1], [-16, 16])
  const rotX = useTransform(sy, [-1, 1], [12, -12])
  const shiftX = useTransform(sx, [-1, 1], [-14, 14])
  const shiftY = useTransform(sy, [-1, 1], [-10, 10])

  return (
    <div
      ref={box}
      className={cn("relative [perspective:1100px]", className)}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const b = box.current!.getBoundingClientRect()
        px.set(((e.clientX - b.left) / b.width) * 2 - 1)
        py.set(((e.clientY - b.top) / b.height) * 2 - 1)
      }}
      onPointerLeave={() => {
        px.set(0)
        py.set(0)
      }}
    >
      {/* halo and the back half of each ring sit behind the N */}
      <div aria-hidden className="absolute inset-[18%] rounded-full bg-[radial-gradient(closest-side,rgb(143_180_255/0.28),rgb(143_180_255/0.06)_60%,transparent)] blur-2xl" />
      {/* a slow spiral of star dust, the galaxy the N sits in */}
      <div aria-hidden className="pointer-events-none absolute -inset-[6%] opacity-70 [mask-image:radial-gradient(closest-side,black_55%,transparent)]">
        <DustVortex />
      </div>
      <Rings half="back" />

      <motion.div
        className="absolute inset-[19%] [transform-style:preserve-3d]"
        style={reduce ? undefined : { rotateX: rotX, rotateY: rotY, x: shiftX, y: shiftY }}
      >
        <div className={cn("relative size-full", !reduce && "logo-float")}>
          {/* the official N in liquid metal: it flows under the pointer and drifts by itself when idle */}
          <div className="size-full [filter:drop-shadow(0_30px_60px_rgb(143_180_255/0.25))]">
            <LiquidLogo />
          </div>
          {!reduce && <div aria-hidden className="logo-sheen absolute inset-0" />}
        </div>
      </motion.div>

      <Rings half="front" />
      <Moons reduce={Boolean(reduce)} />
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

/** Where a moon sits at a moment: on its tilted ellipse, larger and brighter on the near side. */
function place(m: (typeof MOONS)[number], time: number) {
  const ring = RINGS[m.ring]
  const a = (m.phase + time / ring.period) * Math.PI * 2
  const tilt = (ring.tilt * Math.PI) / 180
  const ex = Math.cos(a) * ring.rx
  const ey = Math.sin(a) * ring.ry
  const x = 0.5 + ex * Math.cos(tilt) - ey * Math.sin(tilt)
  const y = 0.5 + ex * Math.sin(tilt) + ey * Math.cos(tilt)
  const depth = Math.sin(a) // 1 is nearest the viewer
  return {
    left: `${(x * 100).toFixed(2)}%`,
    top: `${(y * 100).toFixed(2)}%`,
    transform: `translate(-50%, -50%) scale(${(0.78 + (depth + 1) * 0.14).toFixed(3)})`,
    opacity: (0.45 + (depth + 1) * 0.275).toFixed(3),
    zIndex: depth > 0 ? "3" : "0",
  }
}

function Moons({ reduce }: { reduce: boolean }) {
  const [paused, setPaused] = useState(false)
  const refs = useRef<(HTMLAnchorElement | null)[]>([])
  const t = useRef(0)

  useAnimationFrame((_, delta) => {
    if (paused || reduce) return
    t.current += delta / 1000
    MOONS.forEach((m, i) => {
      const el = refs.current[i]
      if (el) Object.assign(el.style, place(m, t.current))
    })
  })

  return (
    <nav aria-label="Sections" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} className="absolute inset-0">
      {MOONS.map((m, i) => {
        const Icon = m.icon
        return (
          <Link
            key={m.href}
            href={m.href}
            ref={(el) => {
              refs.current[i] = el
            }}
            style={place(m, 0)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="moon group absolute flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 py-1 pr-3 pl-1 text-xs whitespace-nowrap text-foreground/90 backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 hover:border-white/30 hover:bg-black/70 hover:shadow-[0_0_30px_-4px_rgb(143_180_255/0.6)]"
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
