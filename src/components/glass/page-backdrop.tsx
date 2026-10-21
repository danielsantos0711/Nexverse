"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useQuality, type Quality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * The light behind a page's title: one of two HorizonX shaders, faded into the ground on every side.
 *
 *   "phosphor"  Phosphor Flow: folds of ion light drifting slowly (most pages)
 *   "warp"      Light Warp: an hourglass of streaking light, off to the right (the hub's lists)
 *
 * A still gradient is always there first; the shader starts once the browser is idle, so it never delays the
 * page. It scales with the quality tier and is skipped at "off". One per page.
 */

const PhosphorFlow = dynamic(() => import("./hx/phosphor-flow"), { ssr: false })
const LightWarp = dynamic(() => import("./hx/light-warp"), { ssr: false })

export type Backdrop = "phosphor" | "warp" | "none"

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
    <div aria-hidden className={cn("pointer-events-none absolute -top-16 left-1/2 -z-10 h-[22rem] w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]", className)}>
      <div className="page-backdrop-still absolute inset-0" />
      {live && variant === "phosphor" && (
        <div className="page-backdrop absolute inset-0 opacity-60 mix-blend-screen">
          <PhosphorFlow {...PHOSPHOR[quality as "high" | "medium"]} />
        </div>
      )}
      {live && variant === "warp" && (
        <div className="absolute inset-y-0 right-[-8%] w-[min(60rem,80%)] opacity-70 [mask-image:radial-gradient(60%_80%_at_60%_40%,#000_30%,transparent_80%)] max-sm:right-[-30%] max-sm:w-[130%]">
          <LightWarp {...WARP[quality as "high" | "medium"]} />
        </div>
      )}
    </div>
  )
}
