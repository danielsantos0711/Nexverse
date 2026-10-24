"use client"

import { useEffect } from "react"

/*
 * <CardTilt />: every card in a .sd-flow grid (the list pages: Models, Datasets, Tools, Collections, Lab, Arena…)
 * leans towards the pointer in 3D and lifts a little, then settles back when the pointer leaves. One delegated
 * listener for the whole site, so no list has to opt in. Only cards (narrower than 640px), never full-width rows;
 * only a fine pointer that hovers; never with reduced motion or Calm. Writes `transform` on the card itself (no
 * inherited CSS variables, so the card's contents are not restyled each frame) and composes with the card's
 * scroll entrance, whose last frame is the card's own transform. Renders nothing.
 */

const SELECTOR = ".sd-flow li:has([data-nav-item]), .sd-flow [data-nav-item]:not(li [data-nav-item])"
const MAX = 6 // degrees at the card's edge
const LIFT = -4 // px

export function CardTilt() {
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)")
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    let current: HTMLElement | null = null
    let frame = 0
    let last: PointerEvent | null = null
    let pressed = false

    const calm = () => document.documentElement.hasAttribute("data-calm") || document.documentElement.dataset.fx === "off"
    const find = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      try {
        const el = target.closest<HTMLElement>(SELECTOR)
        return el && el.getBoundingClientRect().width < 640 ? el : null
      } catch {
        return null // a browser without :has()
      }
    }
    const release = (el: HTMLElement) => {
      el.dataset.cardTilt = "rest"
      el.style.removeProperty("transform")
    }
    const apply = () => {
      frame = 0
      const el = current
      const e = last
      if (!el || !e) return
      const b = el.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width))
      const y = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))
      el.dataset.cardTilt = "live"
      el.style.transform = `perspective(1100px) rotateX(${((0.5 - y) * MAX).toFixed(2)}deg) rotateY(${((x - 0.5) * MAX).toFixed(2)}deg) translate3d(0, ${LIFT}px, 0) scale(${pressed ? 0.985 : 1})`
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || reduce.matches || calm()) return
      const el = find(e.target)
      if (el !== current) {
        if (current) release(current)
        current = el
        pressed = false
      }
      if (!el) return
      last = e
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const leave = (e: PointerEvent) => {
      if (!current) return
      // leaving the window, or into something that is not this card
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null
      if (to && current.contains(to)) return
      release(current)
      current = null
    }
    const down = () => {
      if (!current) return
      pressed = true
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const up = () => {
      if (!current || !pressed) return
      pressed = false
      if (!frame) frame = requestAnimationFrame(apply)
    }
    document.addEventListener("pointermove", move, { passive: true })
    document.addEventListener("pointerout", leave, { passive: true })
    document.addEventListener("pointerdown", down, { passive: true })
    document.addEventListener("pointerup", up, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerout", leave)
      document.removeEventListener("pointerdown", down)
      document.removeEventListener("pointerup", up)
      if (current) release(current)
    }
  }, [])
  return null
}
