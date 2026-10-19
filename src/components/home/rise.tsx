"use client"

import { useEffect } from "react"

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)"

/**
 * Drives the `.rise` entrances: each part rises into place the first time it scrolls into view, staggered by
 * its `--i`. Parts are hidden with an adopted style sheet and revealed with the Web Animations API, so the
 * page's markup is never touched (no hydration mismatches, and a re-render cannot hide anything again).
 * Parts that stream in later (Suspense) are picked up as they arrive. Without script, or with reduced
 * motion, nothing is hidden. Renders nothing.
 */
export function RiseObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("adoptedStyleSheets" in document)) return
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(".rise { opacity: 0; transform: translateY(22px); } .rise .momentum { transform: scaleX(0); }")
    const done = new WeakSet<Element>()
    const animations: Animation[] = []

    const reveal = (el: Element, instant = false) => {
      if (done.has(el)) return
      done.add(el)
      const delay = instant ? 0 : (Number.parseFloat(getComputedStyle(el).getPropertyValue("--i")) || 0) * 70
      const duration = instant ? 0 : 700
      animations.push(el.animate([{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "none" }], { duration, delay, easing: EASE, fill: "forwards" }))
      for (const bar of el.querySelectorAll<HTMLElement>(".momentum")) {
        const share = bar.style.getPropertyValue("--m") || "1"
        animations.push(bar.animate([{ transform: "scaleX(0)" }, { transform: `scaleX(${share})` }], { duration: instant ? 0 : 900, delay: delay + 200, easing: EASE, fill: "forwards" }))
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          io.unobserve(e.target)
          reveal(e.target)
        }
      },
      { rootMargin: "0px 0px -6% 0px" }
    )
    const watched = new WeakSet<Element>()
    const scan = () => {
      for (const el of document.querySelectorAll(".rise")) {
        if (watched.has(el)) continue
        watched.add(el)
        // already scrolled past (a restored scroll position): show it without a show
        if (el.getBoundingClientRect().bottom < 0) reveal(el, true)
        else io.observe(el)
      }
    }
    scan()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet)
      for (const a of animations) a.cancel()
    }
  }, [])
  return null
}
