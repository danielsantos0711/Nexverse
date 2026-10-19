"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/*
 * Adapted from HorizonX "Particle Sphere". The original renders with three.js; this port keeps its behaviour
 * (points on a Fibonacci sphere that turn slowly, can be dragged, and part around the pointer, then settle
 * back) on a plain 2D canvas, so it adds no dependency. Decorative: aria-hidden, devicePixelRatio capped at
 * 1.5, paused offscreen and in hidden tabs, one still frame with reduced motion or `still`.
 */

type Props = {
  className?: string
  /** Points on the sphere. 1500 to 4000 reads well; it is drawn as squares, so a few thousand cost little. */
  count?: number
  /** Point colour as "r g b". */
  color?: string
  /** Radians per second around the vertical axis. */
  speed?: number
  /** Pixels around the pointer that points move away from (0 turns it off). */
  reach?: number
  still?: boolean
}

export function ParticleSphere({ className, count = 2600, color = "188 208 255", speed = 0.16, reach = 70, still = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const reduce = still || matchMedia("(prefers-reduced-motion: reduce)").matches
    const n = Math.max(100, Math.min(8000, Math.round(count)))
    const golden = Math.PI * (3 - Math.sqrt(5))
    const base = new Float32Array(n * 3)
    const shove = new Float32Array(n * 2) // displacement on screen, in sphere radii
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      base[i * 3] = Math.cos(golden * i) * r
      base[i * 3 + 1] = y
      base[i * 3 + 2] = Math.sin(golden * i) * r
    }

    let w = 0
    let h = 0
    let dpr = 1
    let yaw = 0
    let pitch = -0.25
    let spinV = 0
    let tiltV = 0
    let raf = 0
    let last = 0
    let visible = true
    const pointer = { x: 0, y: 0, in: false, down: false, lastX: 0, lastY: 0 }

    const size = () => {
      const b = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, b.width)
      h = Math.max(1, b.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }

    const draw = (dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const R = Math.min(w, h) * 0.42
      const cx = w / 2
      const cy = h / 2
      const cy0 = Math.cos(yaw)
      const sy0 = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const decay = Math.pow(0.9, dt * 60)
      const dot = Math.max(1, R / 120)
      for (let i = 0; i < n; i++) {
        const bx = base[i * 3]
        const by = base[i * 3 + 1]
        const bz = base[i * 3 + 2]
        // turn around y, then tilt around x
        const x1 = bx * cy0 + bz * sy0
        const z1 = -bx * sy0 + bz * cy0
        const y2 = by * cp - z1 * sp
        const z2 = by * sp + z1 * cp
        const persp = 2.6 / (2.6 - z2)
        let sx = cx + x1 * R * persp
        let sy = cy + y2 * R * persp
        if (!reduce && pointer.in && reach > 0 && z2 > 0) {
          const dx = sx + shove[i * 2] * R - pointer.x
          const dy = sy + shove[i * 2 + 1] * R - pointer.y
          const d = Math.hypot(dx, dy)
          if (d < reach && d > 0.01) {
            const f = (1 - d / reach) * 0.012 * dt * 60
            shove[i * 2] += (dx / d) * f
            shove[i * 2 + 1] += (dy / d) * f
          }
        }
        shove[i * 2] *= decay
        shove[i * 2 + 1] *= decay
        sx += shove[i * 2] * R
        sy += shove[i * 2 + 1] * R
        // far side faint, near side bright
        const a = 0.12 + ((z2 + 1) / 2) * 0.78
        ctx.fillStyle = `rgb(${color} / ${a.toFixed(2)})`
        const s = dot * (0.6 + (z2 + 1) * 0.35)
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s)
      }
    }

    const frame = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
      last = now
      if (!pointer.down) {
        yaw += (speed + spinV) * dt
        pitch += tiltV * dt
        spinV *= Math.pow(0.94, dt * 60)
        tiltV *= Math.pow(0.94, dt * 60)
      }
      pitch = Math.max(-1.2, Math.min(1.2, pitch))
      draw(dt)
      schedule()
    }
    const schedule = () => {
      if (!raf && !reduce && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const refresh = () => {
      cancelAnimationFrame(raf)
      raf = 0
      last = 0
      draw(0)
      schedule()
    }

    const local = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      pointer.x = e.clientX - b.left
      pointer.y = e.clientY - b.top
    }
    const onMove = (e: PointerEvent) => {
      local(e)
      pointer.in = e.pointerType === "mouse"
      if (pointer.down) {
        const dx = e.clientX - pointer.lastX
        const dy = e.clientY - pointer.lastY
        yaw += dx * 0.008
        pitch += dy * 0.008
        spinV = dx * 0.25
        tiltV = dy * 0.25
        pointer.lastX = e.clientX
        pointer.lastY = e.clientY
      }
    }
    const onDown = (e: PointerEvent) => {
      if (reduce) return
      pointer.down = true
      pointer.lastX = e.clientX
      pointer.lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const onUp = () => {
      pointer.down = false
    }
    const onLeave = () => {
      pointer.in = false
    }

    size()
    const ro = new ResizeObserver(() => {
      size()
      refresh()
    })
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        refresh()
      },
      { rootMargin: "80px" }
    )
    ro.observe(canvas)
    io.observe(canvas)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", refresh)
    refresh()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [count, color, speed, reach, still])

  return <canvas ref={ref} aria-hidden className={cn("block size-full touch-pan-y", className)} />
}
