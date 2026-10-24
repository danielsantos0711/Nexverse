"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useQuality, type Quality } from "@/lib/perf"
import { cn } from "@/lib/utils"
import * as fields from "./fields"

/*
 * The light behind a page's title: a slow monochrome shader, faded into the ground on every side. Every area has
 * its own (launch pass 2, Daniel: "queria que as paginas usassem um shader diferente ... para condizer com a
 * pagina em si"). Five are vendored from HorizonX; the rest are Nexverse's own, drawn by hx/field.jsx from
 * fields.js, each a picture of what its page is about:
 *
 *   "phosphor"      Phosphor Flow (HorizonX): folds of light (the default: chat, saved, settings, and the like)
 *   "topo"          Topographic Flow (HorizonX): contour lines (a live page)
 *   "warp"          Light Warp (HorizonX): an hourglass of streaking light (Collections, Tools)
 *   "stream"        Silver Stream (HorizonX): ribbons of silver particles (People, the members-only wall)
 *   "pixels"        Pixel Beams (HorizonX): dithered plasma pixels (Lab)
 *   "galaxy"        a spiral galaxy turning (Explore)
 *   "signal"        an oscilloscope, signals arriving (News)
 *   "orbits"        tilted orbits around a meeting point (Events)
 *   "constellation" stars linking to their neighbours (Crews)
 *   "trajectories"  dashed arcs with comets tracing them (Missions)
 *   "ascent"        streaks lifting off a glowing pad (Launchpad)
 *   "duel"          two wave fronts colliding (Arena)
 *   "spectrum"      an equaliser of LED bars (Benchmarks)
 *   "interference"  two ripple sources overlapping (Compare)
 *   "circuit"       circuit traces with running pulses (Code)
 *   "rising"        currents climbing up and to the right (Trending)
 *   "podium"        three pillars of light (Leaderboard)
 *   "threads"       braided threads with replies travelling along them (Forum)
 *   "halo"          a breathing ring of light (profiles, Your page)
 *   "neural"        a neural network firing (Models)
 *   "matrix"        a field of data points being scanned (Datasets)
 *
 * Every shader draws on a transparent canvas, so the page's ground and stars show through and no canvas edge can
 * ever show (the first Silver Stream drew its own dark ground and left a hard rectangle). A still neutral gradient
 * is always there first; the shader starts once the browser is idle, scales with the quality tier, is skipped at
 * "low" and "off" (src/lib/perf.ts), and holds one still frame under reduced motion. One per page.
 */

const PhosphorFlow = dynamic(() => import("./hx/phosphor-flow"), { ssr: false })
const LightWarp = dynamic(() => import("./hx/light-warp"), { ssr: false })
const TopographicFlow = dynamic(() => import("./hx/topographic-flow"), { ssr: false })
const SilverStream = dynamic(() => import("./hx/silver-stream"), { ssr: false })
const PixelBeams = dynamic(() => import("./hx/pixel-beams"), { ssr: false })
const Field = dynamic(() => import("./hx/field"), { ssr: false })

type FieldName = keyof typeof fields
export type Backdrop = "phosphor" | "warp" | "topo" | "stream" | "pixels" | FieldName | "none"

/** How strong each of Nexverse's own fields sits behind the title. */
const FIELD: Record<FieldName, number> = {
  galaxy: 0.7, signal: 0.75, orbits: 0.7, constellation: 0.7, trajectories: 0.75, ascent: 0.7, duel: 0.7, spectrum: 0.45,
  interference: 0.6, circuit: 0.42, rising: 0.7, podium: 0.75, threads: 0.7, halo: 0.75, neural: 0.75, matrix: 0.85,
}

const PHOSPHOR: Record<Exclude<Quality, "off">, { steps: number; budget: number; fps: number }> = {
  high: { steps: 56, budget: 180_000, fps: 40 },
  medium: { steps: 40, budget: 110_000, fps: 30 },
  low: { steps: 28, budget: 60_000, fps: 20 },
}
const WARP: Record<Exclude<Quality, "off">, { density: number; dust: number; budget: number; fps: number }> = {
  high: { density: 100, dust: 12_000, budget: 600_000, fps: 50 },
  medium: { density: 70, dust: 6_000, budget: 320_000, fps: 30 },
  low: { density: 44, dust: 2_500, budget: 160_000, fps: 20 },
}

const STREAM: Record<"high" | "medium", { density: number; budget: number; speed: number }> = {
  high: { density: 102, budget: 1_400_000, speed: 0.3 },
  medium: { density: 80, budget: 700_000, speed: 0.3 },
}

/** Waits for an idle moment after the first paint. */
function useIdle() {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: 1500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setIdle(true), 600)
    return () => clearTimeout(t)
  }, [])
  return idle
}

export function PageBackdrop({ variant = "phosphor", className }: { variant?: Backdrop; className?: string }) {
  const quality = useQuality()
  const idle = useIdle()
  if (variant === "none") return null
  // software-drawn WebGL and slow machines ("low") keep the still gradient: the shader costs them too much.
  // Each shader is keyed on the tier: a new tier mounts a fresh canvas (the old one's context is released on unmount).
  const live = idle && (quality === "high" || quality === "medium")
  return (
    <div aria-hidden className={cn("pointer-events-none absolute -top-16 left-1/2 -z-10 h-[28rem] w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_58%,transparent)] max-sm:h-[22rem]", className)}>
      <div className="page-backdrop-still absolute inset-0" />
      {live && variant === "phosphor" && (
        <div className="page-backdrop absolute inset-0 opacity-65">
          <PhosphorFlow key={quality} {...PHOSPHOR[quality as "high" | "medium"]} />
        </div>
      )}
      {live && variant === "topo" && (
        <div className="absolute inset-0 opacity-45 [mask-image:radial-gradient(80%_100%_at_70%_30%,#000_30%,transparent_85%)]">
          <TopographicFlow key={quality} budget={quality === "high" ? 600_000 : 300_000} />
        </div>
      )}
      {live && variant === "warp" && (
        <div className="absolute inset-y-0 right-[-6%] w-[min(78rem,92%)] opacity-40 [mask-image:radial-gradient(65%_85%_at_60%_42%,#000_40%,transparent_85%)] max-sm:right-[-30%] max-sm:w-[130%]">
          <LightWarp key={quality} {...WARP[quality as "high" | "medium"]} />
        </div>
      )}
      {live && variant === "stream" && (
        <div className="absolute inset-y-0 right-[-4%] w-[min(64rem,96%)] opacity-75 [mask-image:radial-gradient(closest-side_at_50%_55%,#000_40%,transparent)] max-sm:right-[-40%] max-sm:w-[150%]">
          <SilverStream key={quality} {...STREAM[quality as "high" | "medium"]} scale={0.5} exposure={1.4} pointSize={2.8} />
        </div>
      )}
      {live && variant in FIELD && (
        <div className="absolute inset-0 [mask-image:radial-gradient(78%_125%_at_72%_42%,#000_30%,transparent_80%)] max-sm:[mask-image:radial-gradient(90%_110%_at_60%_40%,#000_20%,transparent_85%)]" style={{ opacity: FIELD[variant as FieldName] }}>
          <Field key={quality} source={fields[variant as FieldName]} budget={quality === "high" ? 600_000 : 300_000} fps={quality === "high" ? 40 : 30} />
        </div>
      )}
      {live && variant === "pixels" && (
        <div className="absolute inset-0 opacity-55 [mask-image:radial-gradient(70%_100%_at_68%_25%,#000_20%,transparent_78%)]">
          <PixelBeams key={quality} budget={quality === "high" ? 900_000 : 450_000} pixelSize={quality === "high" ? 6 : 7} />
        </div>
      )}
    </div>
  )
}
