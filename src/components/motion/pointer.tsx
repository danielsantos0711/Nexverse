"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

/*
 * Surfaces that answer the pointer. Desktop (a fine pointer) gets the hover effect; touch screens get the
 * equivalent on press, so both feel alive and neither is left out.
 *
 *   <Tilt>      tips towards the pointer in 3D with a soft glare where it points; on touch, it sinks and a ring
 *               of light spreads from the finger
 *   <Magnetic>  leans towards the pointer when it comes close (buttons, the Create pill); on touch, a press sinks
 *   <Ripple>    the touch ring alone, for any button or row (wrap it, or add it to a relative element)
 *
 * Writes only CSS variables on the element itself (globals.css .nx-tilt, .nx-magnetic, .nx-ripple), so nothing
 * else on the page restyles. Still with reduced motion and Calm.
 */

const fine = () => typeof window !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches

function ripple(el: HTMLElement, e: React.PointerEvent) {
  if (e.pointerType === "mouse") return
  const box = el.getBoundingClientRect()
  const dot = document.createElement("span")
  dot.className = "nx-ripple"
  dot.style.setProperty("--rx", `${e.clientX - box.left}px`)
  dot.style.setProperty("--ry", `${e.clientY - box.top}px`)
  el.appendChild(dot)
  dot.addEventListener("animationend", () => dot.remove(), { once: true })
  setTimeout(() => dot.remove(), 900)
}

export function Tilt({ max = 7, lift = -4, glare = true, className, children, ...rest }: { max?: number; lift?: number; glare?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || e.pointerType !== "mouse" || !fine()) return
    const b = el.getBoundingClientRect()
    const x = (e.clientX - b.left) / b.width
    const y = (e.clientY - b.top) / b.height
    el.dataset.tilting = ""
    el.style.setProperty("--tilt-x", `${((0.5 - y) * max).toFixed(2)}deg`)
    el.style.setProperty("--tilt-y", `${((x - 0.5) * max).toFixed(2)}deg`)
    el.style.setProperty("--tilt-lift", `${lift}px`)
    el.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`)
    el.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`)
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    delete el.dataset.tilting
    el.style.setProperty("--tilt-x", "0deg")
    el.style.setProperty("--tilt-y", "0deg")
    el.style.setProperty("--tilt-lift", "0px")
  }
  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      onPointerDown={(e) => ref.current && ripple(ref.current, e)}
      className={cn("nx-tilt relative overflow-hidden active:scale-[0.985]", className)}
      {...rest}
    >
      {children}
      {glare && <span aria-hidden className="nx-tilt-glare" />}
    </div>
  )
}

export function Magnetic({ strength = 0.3, className, children }: { strength?: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const move = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== "mouse" || !fine()) return
    const b = el.getBoundingClientRect()
    el.dataset.pulling = ""
    el.style.setProperty("--mag-x", `${((e.clientX - (b.left + b.width / 2)) * strength).toFixed(1)}px`)
    el.style.setProperty("--mag-y", `${((e.clientY - (b.top + b.height / 2)) * strength).toFixed(1)}px`)
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    delete el.dataset.pulling
    el.style.setProperty("--mag-x", "0px")
    el.style.setProperty("--mag-y", "0px")
  }
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={leave} className={cn("nx-magnetic inline-flex", className)}>
      {children}
    </span>
  )
}

export function Ripple({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} onPointerDown={(e) => ref.current && ripple(ref.current, e)} className={cn("relative overflow-hidden", className)} {...rest}>
      {children}
    </div>
  )
}
