"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import gsap from "gsap"
import { useEffect, useRef } from "react"
import { Cover } from "@/components/hub/bits"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * Adapted from HorizonX "Orbit Cards": cards ride a great ring whose top arc rises over a horizon, turning
 * slowly; drag or use the arrow keys to turn it, and it pauses under the pointer or keyboard focus. Changes:
 * each card is a real place (a member's collection, or a part of the site to collect from) with a cover drawn
 * from its id, and opens it; the ring turns only while on screen, never with reduced motion or at quality "off";
 * the ring's radius follows the stage width; cards on the hidden half leave the tab order. Uses GSAP.
 */

export type OrbitItem = {
  id: string
  title: string
  href: Route
  meta: string
  kind?: "model" | "dataset" | "tool" | "repo" | "news" | "thread"
}

const CARD_GAP = 14

export function OrbitCards({ items, label, className }: { items: OrbitItem[]; label: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const quality = useQuality()
  const router = useRouter()
  const spinning = quality !== "off"
  // the ring is rebuilt only when the set of cards changes, not on every parent render
  const ids = items.map((i) => i.id).join("|")

  useEffect(() => {
    const el = root.current
    if (!el) return
    const cards = [...el.querySelectorAll<HTMLElement>("[data-orbit-card]")]
    if (!cards.length) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    const state = { rotation: 0 }
    let radius = 260
    let threshold = 0.2
    // Fewer than ten cards still ride a ring of ten slots, so a small set never spreads into a lone card.
    const step = 360 / Math.max(cards.length, 10)
    let spin: gsap.core.Tween | null = null
    let inertia: gsap.core.Tween | null = null
    let dragging = false
    let moved = 0
    let pointerId = -1
    let lastX = 0
    let lastTime = 0
    let velocity = 0
    let hovered = false
    let focused = false
    let visible = false

    const fit = () => {
      const w = el.clientWidth
      const card = cards[0].offsetWidth || 120
      const h = el.clientHeight
      const min = (card + CARD_GAP) / (2 * Math.sin(((step / 2) * Math.PI) / 180))
      radius = Math.max(min, Math.min(w * 0.42, 420))
      // ring centre below the stage, the top card's centre at 40% of its height; the horizon cuts the lower arc
      const cy = h * 0.4 + radius
      const horizon = Math.min(h - 36, cy - radius * 0.4)
      threshold = (cy - horizon) / radius + 0.08
      el.style.setProperty("--oc-cy", `${cy}px`)
      el.style.setProperty("--oc-floor", `${h - horizon}px`)
    }
    const render = () => {
      cards.forEach((card, i) => {
        const angle = state.rotation + i * step
        const upper = Math.cos((angle * Math.PI) / 180) >= threshold
        card.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(${-radius}px)`
        card.style.zIndex = String(100 + Math.round((Math.cos((angle * Math.PI) / 180) + 1) * 50))
        card.tabIndex = upper ? 0 : -1
        card.setAttribute("aria-hidden", String(!upper))
      })
    }
    const paused = () => reduced || !spinning || !visible || hovered || focused
    const stop = () => {
      spin?.kill()
      spin = null
    }
    const start = () => {
      stop()
      if (dragging || paused()) return
      spin = gsap.to(state, {
        rotation: "+=360",
        duration: 60,
        repeat: -1,
        ease: "none",
        onUpdate: render,
      })
    }
    const rotateBy = (deg: number) => {
      stop()
      inertia?.kill()
      if (reduced) {
        state.rotation += deg
        render()
      } else
        inertia = gsap.to(state, {
          rotation: state.rotation + deg,
          duration: 0.5,
          ease: "power3.out",
          onUpdate: render,
          onComplete: start,
        })
    }

    const onEnter = () => {
      hovered = true
      stop()
    }
    const onLeave = () => {
      hovered = false
      start()
    }
    const onFocusIn = () => {
      focused = true
      stop()
    }
    const onFocusOut = (e: FocusEvent) => {
      if (el.contains(e.relatedTarget as Node)) return
      focused = false
      start()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      e.preventDefault()
      rotateBy((e.key === "ArrowRight" ? -1 : 1) * step)
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      moved = 0
      pointerId = e.pointerId
      lastX = e.clientX
      lastTime = performance.now()
      velocity = 0
      inertia?.kill()
      stop()
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      const now = performance.now()
      const dx = e.clientX - lastX
      moved += Math.abs(dx)
      if (moved > 6 && !el.hasPointerCapture(pointerId)) el.setPointerCapture(pointerId)
      const delta = dx * 0.3
      state.rotation += delta
      velocity = (delta / Math.max(8, now - lastTime)) * 1000
      lastX = e.clientX
      lastTime = now
      render()
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      if (!reduced && Math.abs(velocity) > 8) {
        inertia = gsap.to(state, {
          rotation: state.rotation + Math.max(-240, Math.min(240, velocity)) * 0.42,
          duration: 0.75,
          ease: "power3.out",
          onUpdate: render,
          onComplete: start,
        })
      } else start()
    }
    // A drag must not also open the card it started on.
    const onClick = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    cards.forEach((c) => {
      c.addEventListener("pointerenter", onEnter)
      c.addEventListener("pointerleave", onLeave)
    })
    el.addEventListener("focusin", onFocusIn)
    el.addEventListener("focusout", onFocusOut)
    el.addEventListener("keydown", onKey)
    el.addEventListener("pointerdown", onDown)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onUp)
    el.addEventListener("click", onClick, true)
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting
        if (visible) start()
        else stop()
      },
      { threshold: 0.08 }
    )
    io.observe(el)
    const ro = new ResizeObserver(() => {
      fit()
      render()
    })
    ro.observe(el)
    fit()
    render()
    return () => {
      stop()
      inertia?.kill()
      io.disconnect()
      ro.disconnect()
      cards.forEach((c) => {
        c.removeEventListener("pointerenter", onEnter)
        c.removeEventListener("pointerleave", onLeave)
      })
      el.removeEventListener("focusin", onFocusIn)
      el.removeEventListener("focusout", onFocusOut)
      el.removeEventListener("keydown", onKey)
      el.removeEventListener("pointerdown", onDown)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onUp)
      el.removeEventListener("click", onClick, true)
    }
  }, [ids, spinning])

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${label}. Drag or use the arrow keys to turn it.`}
      className={cn("relative h-[17rem] cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing sm:h-[19rem]", className)}
    >
      {/* the horizon the ring rises over */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[var(--oc-floor,48px)] h-px bg-gradient-to-r from-transparent via-ion/50 to-transparent" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[10%] bottom-[calc(var(--oc-floor,48px)-3rem)] h-24 rounded-[50%] bg-[radial-gradient(closest-side,rgb(143_180_255/0.16),transparent)]"
      />
      <div className="absolute inset-0 [clip-path:inset(0_0_var(--oc-floor,48px)_0)] [mask-image:linear-gradient(to_top,transparent_var(--oc-floor,48px),#000_calc(var(--oc-floor,48px)+5rem))]">
        {items.map((it) => (
          <Link
            key={it.id}
            href={it.href}
            data-orbit-card=""
            draggable={false}
            onClick={(e) => {
              // keyboard and plain clicks navigate; the capture handler above cancels a drag
              if (e.defaultPrevented) return
              e.preventDefault()
              router.push(it.href)
            }}
            className="liquid-glass-flat absolute top-[var(--oc-cy,120%)] left-1/2 flex h-36 w-28 origin-center flex-col overflow-hidden rounded-2xl will-change-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-40 sm:w-32"
          >
            <span className="relative block h-[58%] shrink-0 overflow-hidden">
              <Cover seed={it.id} kind={it.kind ?? "thread"} />
            </span>
            <span className="flex min-h-0 flex-1 flex-col justify-between p-2">
              <span className="line-clamp-2 text-[12px] leading-snug font-medium">{it.title}</span>
              <span className="text-[10px] text-muted-foreground">{it.meta}</span>
            </span>
          </Link>
        ))}
      </div>
      <p aria-hidden className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.22em] text-muted-foreground/70 uppercase">
        Drag to turn the orbit
      </p>
    </div>
  )
}
