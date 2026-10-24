"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useQuality, type Quality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * The light behind a page's title: one of five HorizonX shaders, faded into the ground on every side.
 *
 *   "phosphor"  Phosphor Flow: folds of light drifting slowly (most pages)
 *   "topo"      Topographic Flow: silver contour lines over a slow terrain (Code, People, Trending, Leaderboard)
 *   "warp"      Light Warp: an hourglass of streaking light, off to the right (the hub's lists, Collections)
 *   "stream"    Silver Stream: ribbons of silver particles fanning past (News, Events, Crews, Missions, Launchpad:
 *               the areas where things happen and people gather)
 *   "pixels"    Pixel Beams: a dithered field of square pixels in slow plasma waves (Lab, Arena, Benchmarks,
 *               Compare: the machine rooms)
 *
 * Round 12c (Daniel: "as animaçoes agora estao todas pequenas, quero como estava antes"): back to the pre-round-12
 * size and strength, a little taller.
 * Round 12 removed it (Daniel saw a coloured "strange light" behind /repos); round 12b brings the motion back in
 * monochrome: graphite ground, silver folds and white streaks, low opacity, no blue, gold or violet. A still
 * neutral gradient is always there first; the shader starts once the browser is idle, so it never delays the
 * page. It scales with the quality tier and is skipped at "low" and "off" (src/lib/perf.ts), and holds one still
 * frame under reduced motion (inside the shader files). One per page.
 */

const PhosphorFlow = dynamic(() => import("./hx/phosphor-flow"), { ssr: false })
const LightWarp = dynamic(() => import("./hx/light-warp"), { ssr: false })
const TopographicFlow = dynamic(() => import("./hx/topographic-flow"), { ssr: false })
const SilverStream = dynamic(() => import("./hx/silver-stream"), { ssr: false })
const PixelBeams = dynamic(() => import("./hx/pixel-beams"), { ssr: false })

export type Backdrop = "phosphor" | "warp" | "topo" | "stream" | "pixels" | "none"

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
  // software-drawn WebGL and slow machines ("low") keep the still gradient: the shader costs them too much
  const live = idle && (quality === "high" || quality === "medium")
  return (
    <div aria-hidden className={cn("pointer-events-none absolute -top-16 left-1/2 -z-10 h-[28rem] w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_58%,transparent)] max-sm:h-[22rem]", className)}>
      <div className="page-backdrop-still absolute inset-0" />
      {live && variant === "phosphor" && (
        <div className="page-backdrop absolute inset-0 opacity-65 mix-blend-screen">
          <PhosphorFlow {...PHOSPHOR[quality as "high" | "medium"]} />
        </div>
      )}
      {live && variant === "topo" && (
        <div className="absolute inset-0 opacity-45 mix-blend-screen [mask-image:radial-gradient(80%_100%_at_70%_30%,#000_30%,transparent_85%)]">
          <TopographicFlow budget={quality === "high" ? 600_000 : 300_000} />
        </div>
      )}
      {live && variant === "warp" && (
        <div className="absolute inset-y-0 right-[-6%] w-[min(78rem,92%)] opacity-40 [mask-image:radial-gradient(65%_85%_at_60%_42%,#000_40%,transparent_85%)] max-sm:right-[-30%] max-sm:w-[130%]">
          <LightWarp {...WARP[quality as "high" | "medium"]} />
        </div>
      )}
      {live && variant === "stream" && (
        <div className="absolute inset-y-0 right-[-4%] w-[min(64rem,96%)] opacity-75 mix-blend-screen [mask-image:radial-gradient(70%_85%_at_50%_58%,#000_38%,transparent_88%)] max-sm:right-[-40%] max-sm:w-[150%]">
          <SilverStream {...STREAM[quality as "high" | "medium"]} scale={0.5} exposure={1.4} pointSize={2.8} />
        </div>
      )}
      {live && variant === "pixels" && (
        <div className="absolute inset-0 opacity-55 mix-blend-screen [mask-image:radial-gradient(70%_100%_at_68%_25%,#000_20%,transparent_78%)]">
          <PixelBeams budget={quality === "high" ? 900_000 : 450_000} pixelSize={quality === "high" ? 6 : 7} />
        </div>
      )}
    </div>
  )
}
