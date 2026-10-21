"use client"

import { useEffect } from "react"
import { useUiPrefs } from "@/components/settings/ui-prefs"

/*
 * Smooth scrolling for the whole site, without a dependency. A mouse wheel moves the page in ~100px jumps; this
 * turns each notch into a target and eases the real window scroll towards it every frame, the way Lenis does.
 * Because it moves the window itself (no transformed wrapper), position: sticky, IntersectionObserver, GSAP
 * ScrollTrigger, CSS scroll-driven animations, find-in-page and the scrollbar all keep working untouched.
 *
 *   - Wheels and trackpads only. Touch screens keep the browser's own momentum, which is already smooth and
 *     which people's thumbs know; keyboard, scrollbar and find-in-page scroll natively and the engine follows.
 *   - It steps aside inside anything that scrolls on its own (a menu, a code block, a chat log), inside
 *     [data-native-scroll], while a dialog or sheet holds the page still, for horizontal wheels and pinch zoom.
 *   - Same-page anchors (#tip, #comments) glide to their target, honouring scroll-margin-top.
 *   - If something else moves the page (a route change, a restored position, scrollIntoView) the engine lets go
 *     on the next frame instead of fighting it.
 *   - Off with the visitor's reduced motion, their "Calm" motion, or "Native" scrolling (Settings › Your experience).
 *
 * `smoothScrollTo(y)` scrolls there through the engine when it is running (and natively otherwise).
 */

let engineTo: ((y: number) => void) | null = null

export function smoothScrollTo(y: number) {
  if (engineTo) engineTo(y)
  else window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
}

/** True when the wheel should scroll this element (or one of its parents) rather than the page. */
function scrollsItself(start: EventTarget | null, dy: number): boolean {
  let el = start instanceof Element ? start : null
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.hasAttribute("data-native-scroll")) return true
    const style = getComputedStyle(el)
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      const top = el.scrollTop <= 0
      const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if ((dy < 0 && !top) || (dy > 0 && !end)) return true
    }
    el = el.parentElement
  }
  return false
}

/** A dialog, sheet or menu has locked the page (Base UI sets overflow hidden on <html> or <body>). */
const pageLocked = () => {
  const h = getComputedStyle(document.documentElement).overflowY
  const b = getComputedStyle(document.body).overflowY
  return h === "hidden" || b === "hidden" || document.documentElement.hasAttribute("data-base-ui-scroll-locked")
}

export function SmoothScroll() {
  const { scroll, motion } = useUiPrefs()

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    const fine = matchMedia("(pointer: fine)")
    if (scroll === "native" || motion === "calm" || reduce.matches || !fine.matches) return

    // how much of the remaining distance is covered per 60fps frame: lower glides longer
    const ease = scroll === "silk" ? 0.07 : 0.11
    let target = window.scrollY
    let current = target
    let lastSet = target
    let raf = 0
    let prev = 0

    const max = () => document.documentElement.scrollHeight - window.innerHeight
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
      target = current = window.scrollY
    }
    const frame = (now: number) => {
      raf = 0
      // something else moved the page since our last frame: let it win
      if (Math.abs(window.scrollY - lastSet) > 2) return stop()
      const dt = prev ? Math.min(64, now - prev) : 16.7
      prev = now
      const k = 1 - Math.pow(1 - ease, dt / 16.7)
      current += (target - current) * k
      if (Math.abs(target - current) < 0.5) current = target
      window.scrollTo({ top: current, behavior: "instant" })
      lastSet = window.scrollY
      if (current !== target) raf = requestAnimationFrame(frame)
      else prev = 0
    }
    const glideTo = (y: number) => {
      if (!raf) {
        current = window.scrollY
        lastSet = current
        prev = 0
      }
      target = Math.max(0, Math.min(max(), y))
      if (!raf) raf = requestAnimationFrame(frame)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (pageLocked() || scrollsItself(e.target, e.deltaY)) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      const dy = e.deltaY * unit
      if (!dy) return
      e.preventDefault()
      glideTo((raf ? target : window.scrollY) + dy)
    }

    // Same-page anchors glide, minus the target's scroll-margin-top (the header's height, set in globals.css).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null
      if (!a || a.target === "_blank") return
      const url = new URL(a.href, location.href)
      if (url.pathname !== location.pathname || url.search !== location.search || !url.hash) return
      const id = decodeURIComponent(url.hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (!el) return
      e.preventDefault()
      const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
      history.pushState(null, "", url.hash)
      glideTo(el.getBoundingClientRect().top + window.scrollY - margin)
    }

    engineTo = glideTo
    window.addEventListener("wheel", onWheel, { passive: false })
    document.addEventListener("click", onClick)
    return () => {
      engineTo = null
      cancelAnimationFrame(raf)
      window.removeEventListener("wheel", onWheel)
      document.removeEventListener("click", onClick)
    }
  }, [scroll, motion])

  return null
}
