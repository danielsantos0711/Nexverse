"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/*
 * Adapted from HorizonX "Border Glow": the card's outline is a strip of glass with one lamp in it.
 * The lamp sits on the point of the border nearest the pointer, and burns dimmer the further away
 * the pointer is. Colour comes from a conic gradient fixed to the card, so each edge has its own hue.
 */

function nearestEdgePoint(w: number, h: number, radius: number, x: number, y: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const inX = x >= r && x <= w - r
  const inY = y >= r && y <= h - r
  if (!inX && !inY) {
    const cx = x < r ? r : w - r
    const cy = y < r ? r : h - r
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy)
    if (r === 0 || d === 0) {
      const px = x < r ? 0 : w
      const py = y < r ? 0 : h
      return { x: px, y: py, distance: Math.hypot(x - px, y - py) }
    }
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r, distance: Math.abs(d - r) }
  }
  let best = { x: 0, y: 0, distance: Infinity }
  const consider = (px: number, py: number) => {
    const distance = Math.hypot(x - px, y - py)
    if (distance < best.distance) best = { x: px, y: py, distance }
  }
  if (inX) {
    consider(x, 0)
    consider(x, h)
  }
  if (inY) {
    consider(0, y)
    consider(w, y)
  }
  return best
}

const falloff = (distance: number, reach: number) => {
  const t = Math.min(Math.max(1 - distance / reach, 0), 1)
  return t * t * (3 - 2 * t)
}

const approach = (current: number, target: number, elapsed: number, duration: number) =>
  current + (target - current) * (1 - Math.exp((-elapsed * 3) / duration))

export function GlowCard({ className, children, reach = 140 }: { className?: string; children: React.ReactNode; reach?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const card = ref.current
    if (!card || matchMedia("(hover: none)").matches) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    let lit = 0
    let target = 0
    let raf = 0
    let last = 0

    const write = () => card.style.setProperty("--glow-lit", lit.toFixed(4))
    const frame = (now: number) => {
      const elapsed = last ? now - last : 16
      last = now
      lit = approach(lit, target, elapsed, target > lit ? 180 : 540)
      if (Math.abs(lit - target) < 0.0005) lit = target
      write()
      raf = lit !== target ? requestAnimationFrame(frame) : 0
    }
    const wake = () => {
      if (reduce) {
        lit = target
        write()
        return
      }
      if (raf) return
      last = 0
      raf = requestAnimationFrame(frame)
    }
    // Listen on the window so the lamp starts to glow as the pointer approaches, not only once it is inside.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < -reach || y < -reach || x > rect.width + reach || y > rect.height + reach) {
        if (target !== 0) {
          target = 0
          wake()
        }
        return
      }
      const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0
      const p = nearestEdgePoint(rect.width, rect.height, radius, x, y)
      card.style.setProperty("--glow-x", `${p.x.toFixed(1)}px`)
      card.style.setProperty("--glow-y", `${p.y.toFixed(1)}px`)
      target = falloff(p.distance, reach)
      wake()
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reach])

  return (
    <div ref={ref} className={cn("glow-card", className)}>
      <span className="glow-lamp" aria-hidden>
        <span className="glow-wash" />
        <span className="glow-bloom" />
        <span className="glow-rim" />
      </span>
      {children}
    </div>
  )
}
