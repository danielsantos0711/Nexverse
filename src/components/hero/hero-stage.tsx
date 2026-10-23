"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useRef } from "react"
import {
  BookOpenIcon,
  BoxIcon,
  CalendarIcon,
  Code2Icon,
  DatabaseIcon,
  FlaskConicalIcon,
  FolderGit2Icon,
  GlobeIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  SwordsIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"
import { LoopVideo } from "@/components/fx/loop-video"
import "@/components/brand.css"
import { useBlock } from "@/lib/content"
import { LiquidN } from "@/components/liquid-n"
import { cn } from "@/lib/utils"

/*
 * The hero's stage: the brand film's turning galaxy with Daniel's liquid-metal N at its heart fills the top of the page,
 * and the places of Nexverse orbit the N as links. The orbit is drawn in pixels from the stage's measured size
 * and the film's geometry, so the moons always circle the N in the film, on any screen.
 */

/** Icons an admin can pick by name for an orbit link (Admin → content block "home.hero.orbit"). */
const ICONS: Record<string, LucideIcon> = {
  forum: MessageSquareIcon,
  chat: MessagesSquareIcon,
  models: BoxIcon,
  datasets: DatabaseIcon,
  tools: WrenchIcon,
  code: Code2Icon,
  repos: FolderGit2Icon,
  news: NewspaperIcon,
  lab: FlaskConicalIcon,
  launchpad: RocketIcon,
  missions: TargetIcon,
  arena: SwordsIcon,
  leaderboard: TrophyIcon,
  crews: UsersIcon,
  events: CalendarIcon,
  collections: StarIcon,
  docs: BookOpenIcon,
  explore: GlobeIcon,
  sparkles: SparklesIcon,
}

const TINTS: Record<string, string> = {
  ion: "text-ion",
  gold: "text-gold",
  model: "text-model",
  dataset: "text-dataset",
  tool: "text-tool",
  repo: "text-repo",
}

export type OrbitLink = { label: string; href: string; icon: string; tint: string }

export const ORBIT_DEFAULT: OrbitLink[] = [
  { label: "Forum", href: "/forum", icon: "forum", tint: "ion" },
  { label: "Models", href: "/models", icon: "models", tint: "model" },
  { label: "Chat", href: "/chat", icon: "chat", tint: "gold" },
  { label: "Datasets", href: "/datasets", icon: "datasets", tint: "dataset" },
  { label: "News", href: "/news", icon: "news", tint: "gold" },
  { label: "Tools", href: "/tools", icon: "tools", tint: "tool" },
  { label: "Lab", href: "/lab", icon: "lab", tint: "ion" },
  { label: "Code", href: "/code", icon: "code", tint: "repo" },
]

/** The N's centre in the film, as a share of its width and height (measured from the film's frames). */
const N_AT = { x: 0.5, y: 0.522 }
/** The film never grows past this width (it is 1600 px wide): wider screens see it framed by the night. */
const FILM_MAX = 1920

/** Two tilted rings: share of the orbit radius, flattening, tilt in degrees, seconds per turn. */
const RINGS = [
  { r: 0.72, flat: 0.3, tilt: -7, period: 64 },
  { r: 1, flat: 0.2, tilt: -12, period: 92 },
]

/** Where the N sits and how big it is (half width, half height), and the orbit's size, in px. */
type Geometry = { cx: number; cy: number; radius: number; nw: number; nh: number; narrow: boolean }

function measure(w: number, h: number): Geometry {
  const filmW = Math.max((h * 16) / 9, Math.min(w, FILM_MAX))
  const filmH = (filmW * 9) / 16
  const narrow = w < 640
  return {
    cx: w * N_AT.x,
    cy: h / 2 + (N_AT.y - 0.5) * filmH,
    // wide enough to clear the N, never so wide a chip leaves the screen
    radius: Math.min(filmW * 0.35, w / 2 - (narrow ? 44 : 76)),
    nw: filmW * 0.11,
    nh: filmH * 0.18,
    narrow,
  }
}

/** A moon's place on its ring at time t (seconds): x, y in px, and depth from -1 (far) to 1 (near). */
function place(i: number, count: number, t: number, g: Geometry) {
  let phase: number
  let ring: { r: number; flat: number; tilt: number; period: number }
  if (g.narrow) {
    // phones: one rounder ring with every moon, evenly spaced, so the labels never pile up
    ring = { r: 1, flat: 0.62, tilt: -8, period: 80 }
    phase = i / count
  } else {
    const ringIndex = i % 2
    const perRing = Math.ceil(count / 2)
    ring = RINGS[ringIndex]
    phase = Math.floor(i / 2) / perRing + ringIndex * (0.5 / perRing)
  }
  const a = (phase + t / ring.period) * Math.PI * 2
  const rx = g.radius * ring.r
  const ry = rx * ring.flat
  const tilt = (ring.tilt * Math.PI) / 180
  const ex = Math.cos(a) * rx
  const ey = Math.sin(a) * ry
  return { x: g.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: g.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt), depth: Math.sin(a) }
}

/** 1 when a moon on the far side of its orbit is right behind the N (so it passes behind it), 0 elsewhere. */
function behind(p: { x: number; y: number; depth: number }, g: Geometry) {
  if (p.depth >= 0) return 0
  const dx = Math.abs(p.x - g.cx) / g.nw
  const dy = Math.abs(p.y - g.cy) / g.nh
  const inside = Math.max(0, 1 - Math.max(dx, dy))
  return Math.min(1, inside * 2.5) * Math.min(1, -p.depth * 3)
}

/**
 * `film`: play the brand film (false shows its poster, a still frame of the same scene).
 * `orbit`: the moons turn (false: they rest evenly spaced on their rings). `slow` stretches every period.
 */
export function HeroStage({ film, orbit, slow = 1, className }: { film: boolean; orbit: boolean; slow?: number; className?: string }) {
  const links = useBlock<OrbitLink[]>("home.hero.orbit", ORBIT_DEFAULT)
  const moons = links.filter((l) => l.label?.trim() && l.href?.trim().startsWith("/")).slice(0, 12)
  const nav = useRef<HTMLElement>(null)
  const refs = useRef<(HTMLAnchorElement | null)[]>([])
  // the moons slow to a stop under the pointer or keyboard focus, and pick up again after
  const hold = useRef(false)

  useEffect(() => {
    const el = nav.current
    if (!el) return
    const items = refs.current
    const count = moons.length
    let g = measure(el.clientWidth, el.clientHeight)
    let raf = 0
    let last = 0
    let t = 0
    let speed = 1
    let visible = true

    const draw = () => {
      for (let i = 0; i < count; i++) {
        const moon = items[i]
        if (!moon) continue
        const p = place(i, count, t, g)
        const near = (p.depth + 1) / 2
        const hidden = behind(p, g)
        moon.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.84 + near * 0.2).toFixed(3)})`
        moon.style.opacity = ((0.5 + near * 0.5) * (1 - hidden * 0.85)).toFixed(3)
        moon.style.pointerEvents = hidden > 0.5 ? "none" : ""
        moon.style.zIndex = p.depth > 0 ? "2" : "1"
      }
    }
    const frame = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      speed += ((hold.current ? 0 : 1) - speed) * (1 - Math.exp(-dt * 5))
      t += (dt * speed) / slow
      draw()
      schedule()
    }
    const schedule = () => {
      if (orbit && visible && !document.hidden) {
        if (!raf) raf = requestAnimationFrame(frame)
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
        last = 0
      }
    }
    // a pause (offscreen, hidden tab) restarts the clock instead of jumping ahead
    const resume = () => {
      last = 0
      schedule()
    }
    const ro = new ResizeObserver(() => {
      g = measure(el.clientWidth, el.clientHeight)
      draw()
    })
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      resume()
    })
    ro.observe(el)
    io.observe(el)
    document.addEventListener("visibilitychange", resume)
    draw()
    el.dataset.ready = ""
    resume()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", resume)
    }
  }, [orbit, slow, moons.length])

  return (
    <div className={cn("relative", className)}>
      {/* the film, framed 16:9 and centred, as wide as the screen (up to FILM_MAX) or as tall as the stage */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_75%_90%_at_50%_45%,#000_55%,transparent_100%),linear-gradient(to_bottom,#000_60%,transparent)] [mask-composite:intersect]">
        <div className="absolute top-1/2 left-1/2 aspect-video w-[max(min(100%,120rem),calc(var(--stage-h)*16/9))] -translate-x-1/2 -translate-y-1/2">
          <LoopVideo name="brand" still={!film} eager />
          {/* Daniel's N in live liquid metal (LiquidN) sits exactly on the film's own N, the same size, so the
              galaxy's glow around it stays untouched; its nearly opaque body covers the film's chrome. */}
          <div className="absolute top-[52.2%] left-1/2 aspect-[551/512] h-[33%] -translate-x-1/2 -translate-y-1/2">
            <LiquidN big className="nx-hero-n size-full" />
          </div>
        </div>
      </div>

      <nav
        ref={nav}
        aria-label="Places in Nexverse"
        className="absolute inset-0 opacity-0 transition-opacity duration-700 data-[ready]:opacity-100"
        onFocus={() => {
          hold.current = true
        }}
        onBlur={() => {
          hold.current = false
        }}
      >
        {moons.map((m, i) => {
          const Icon = ICONS[m.icon?.toLowerCase()] ?? SparklesIcon
          return (
            <Link
              key={`${m.href}-${i}`}
              href={m.href as Route}
              ref={(el) => {
                refs.current[i] = el
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") hold.current = true
              }}
              onPointerLeave={() => {
                hold.current = false
              }}
              className="moon group absolute top-0 left-0 flex items-center gap-1.5 rounded-full border border-white/12 bg-[#0b0e16]/75 py-0.5 pr-2.5 pl-0.5 text-[11px] font-medium whitespace-nowrap text-foreground/90 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.8)] transition-[border-color,background-color,box-shadow] duration-200 will-change-transform hover:border-white/35 hover:bg-[#0b0e16]/95 hover:text-foreground hover:shadow-[0_0_32px_-4px_rgb(143_180_255/0.65)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:py-1 sm:pr-3.5 sm:pl-1 sm:text-[13px]"
            >
              <span className={cn("grid size-5 place-items-center rounded-full bg-white/[0.07] ring-1 ring-white/10 sm:size-7", TINTS[m.tint] ?? "text-ion")}>
                <Icon aria-hidden className="size-3 sm:size-3.5" />
              </span>
              {m.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
