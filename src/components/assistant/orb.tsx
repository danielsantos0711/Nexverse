"use client"

import { useEffect, useRef } from "react"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"
import { createRenderer, hexToRgb } from "./plasma-orb"

/*
 * The Plasma Orb from HorizonX "Assistant Pill", drawn in the pill's left circle. Its look follows the guide's
 * state: calm while idle, swirling inward while thinking, a burst as each answer lands. It draws at 30 frames a
 * second while closed and 60 while open, fewer ray-march steps at medium quality, and is a CSS sphere (the
 * export's own fallback) at low and off, under reduced motion, or without WebGL 2.
 */

export type OrbState = "idle" | "thinking" | "answering" | "error"

const LOOK: Record<OrbState, { energy: number; warm: number; swirl: number }> = {
  idle: { energy: 0.38, warm: 0, swirl: 0 },
  thinking: { energy: 0.72, warm: 0, swirl: 1 },
  answering: { energy: 0.58, warm: 0, swirl: 0.25 },
  error: { energy: 0.2, warm: 1, swirl: 0 },
}

// Ion and champagne in place of the export's blue and pink.
const COLORS = {
  Deep: hexToRgb("#2b4fd6"),
  Body: hexToRgb("#8fb4ff"),
  Glow: hexToRgb("#c9d9ff"),
  Plasma: hexToRgb("#8fb4ff"),
  Accent: hexToRgb("#d8c59e"),
  Bg: hexToRgb("#05060a"),
}

export function Orb({ state, open, className }: { state: OrbState; open: boolean; className?: string }) {
  const quality = useQuality()
  const canvas = useRef<HTMLCanvasElement>(null)
  const host = useRef<HTMLSpanElement>(null)
  const live = useRef({ state, open })
  live.current = { state, open }
  const gl = quality === "high" || quality === "medium"

  useEffect(() => {
    const cv = canvas.current
    const box = host.current
    if (!gl || !cv || !box || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const renderer = createRenderer(cv)
    if (!renderer) return
    box.setAttribute("data-gl", "")
    const steps = quality === "high" ? 24 : 16
    const cur = { energy: 0.38, warm: 0, swirl: 0, time: 5.7, spin: 0, pulse: 0 }
    let raf = 0
    let last = 0
    let lastDraw = 0
    let visible = true
    let was: OrbState = live.current.state

    const frame = (now: number) => {
      raf = 0
      const { state: s, open: o } = live.current
      const gap = o ? 0 : 1000 / 30
      if (now - lastDraw >= gap - 2) {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
        last = now
        lastDraw = now
        if (s === "answering" && was !== "answering") cur.pulse = 1
        was = s
        const want = LOOK[s]
        const e = 1 - Math.exp(-dt * 3.5)
        cur.energy += (want.energy - cur.energy) * e
        cur.warm += (want.warm - cur.warm) * e
        cur.swirl += (want.swirl - cur.swirl) * e
        cur.pulse *= Math.exp(-dt * 3)
        cur.time += dt * (0.55 + cur.energy * 1.1 + cur.pulse) * 2
        cur.spin += dt * (0.04 + cur.swirl * 0.9)
        const surge = 0.35 * (Math.pow(0.5 + 0.5 * Math.sin(cur.time * 0.9), 4) + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(cur.time * 2.3 + 1.7), 6))
        renderer.draw({
          time: cur.time,
          dt,
          level: cur.pulse * 0.6 + surge * 0.4,
          energy: cur.energy + surge,
          warm: cur.warm,
          swirl: cur.swirl,
          spin: cur.spin,
          colors: COLORS,
          sphere: 0.5,
          steps,
          maxSide: 200,
          bloom: 0.6,
          webScale: 0.5,
          strand: 1.5,
          core: 0.32,
        })
      }
      if (visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting
      wake()
    })
    io.observe(cv)
    document.addEventListener("visibilitychange", wake)
    wake()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      document.removeEventListener("visibilitychange", wake)
      renderer.dispose()
      box.removeAttribute("data-gl")
    }
  }, [gl, quality])

  return (
    <span ref={host} aria-hidden className={cn("apl-orb block shrink-0", className)}>
      {gl && <canvas ref={canvas} />}
    </span>
  )
}
