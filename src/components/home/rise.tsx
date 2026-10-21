"use client"

import { useEffect } from "react"

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)"
const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)"

/** How far things travel for this visitor (Settings › Your experience › Motion while scrolling). */
const amp = () => {
  const v = document.documentElement.dataset.scrollFx
  return v === "subtle" ? 0.45 : v === "cinematic" ? 1.7 : 1
}

/**
 * The ways a part can arrive (data-rise on the .rise element; plain .rise is "up"). Round 11: not only a fade.
 *   up    lifts into place
 *   clip  wipes open from its bottom edge, rising as it opens
 *   tilt  tips up from lying back, like a card set down on a table
 *   fan   swings in from a tilt around a point below it (rows of cards: the tilt follows --i)
 *   warp  arrives from deep space: small, low and far, then settles with a long ease
 *   iris  opens as a circle from its centre
 */
function frames(kind: string, i: number): { from: Keyframe; to: Keyframe; duration: number; easing: string } {
  const a = amp()
  switch (kind) {
    case "clip":
      return { from: { opacity: 0.2, clipPath: `inset(${Math.min(60, 38 * a)}% 0% 0% 0% round 24px)`, transform: `translateY(${28 * a}px)` }, to: { opacity: 1, clipPath: "inset(0% 0% 0% 0% round 0px)", transform: "none" }, duration: 950, easing: EASE }
    case "tilt":
      return { from: { opacity: 0, transform: `perspective(900px) rotateX(${20 * a}deg) translateY(${44 * a}px)`, transformOrigin: "50% 100%" }, to: { opacity: 1, transform: "perspective(900px) rotateX(0deg) translateY(0px)", transformOrigin: "50% 100%" }, duration: 1000, easing: EASE }
    case "fan": {
      const turn = ((i % 4) - 1.5) * 5 * a
      return { from: { opacity: 0, transform: `translateY(${60 * a}px) rotate(${turn}deg) scale(0.92)`, transformOrigin: "50% 140%" }, to: { opacity: 1, transform: "none", transformOrigin: "50% 140%" }, duration: 1000, easing: EASE }
    }
    case "warp":
      return { from: { opacity: 0, transform: `translateY(${80 * a}px) scale(${1 - 0.16 * Math.min(a, 1.4)})` }, to: { opacity: 1, transform: "none" }, duration: 1300, easing: EXPO }
    case "iris":
      return { from: { opacity: 0.3, clipPath: "circle(10% at 50% 50%)" }, to: { opacity: 1, clipPath: "circle(80% at 50% 50%)" }, duration: 1100, easing: EASE }
    default:
      return { from: { opacity: 0, transform: `translateY(${40 * a}px) scale(${1 - 0.03 * a})` }, to: { opacity: 1, transform: "none" }, duration: 900, easing: EASE }
  }
}

/**
 * Drives the `.rise` entrances: each part arrives the first time it scrolls into view (in the way its data-rise
 * asks for, see frames above), staggered by its `--i`. Parts are hidden with an adopted style sheet and revealed with the Web Animations API, so the
 * page's markup is never touched (no hydration mismatches, and a re-render cannot hide anything again).
 * Parts that stream in later (Suspense) are picked up as they arrive. Without script, or with reduced
 * motion, nothing is hidden. Renders nothing.
 */
export function RiseObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-calm") || !("adoptedStyleSheets" in document)) return
    // Pages with .sd-flow animate their rows with CSS scroll timelines. Browsers without them (older Safari,
    // Firefox) get the same entrances here instead, so every visitor sees the motion.
    const flow = !CSS.supports("animation-timeline: view()")
    const SELECTOR = flow ? ".rise, .sd-flow [data-nav-item]" : ".rise"
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(
      ".rise:not([data-risen]) { opacity: 0; transform: translateY(22px); } .rise .momentum { transform: scaleX(0); }" +
        (flow ? " html:not([data-calm]) .sd-flow [data-nav-item]:not([data-risen]) { opacity: 0; }" : "")
    )
    const done = new WeakSet<Element>()
    const animations: Animation[] = []

    const reveal = (el: Element, instant = false) => {
      if (done.has(el)) return
      done.add(el)
      const row = !el.classList.contains("rise")
      const i = row ? Array.prototype.indexOf.call(el.parentElement?.children ?? [], el) % 4 : Number.parseFloat(getComputedStyle(el).getPropertyValue("--i")) || 0
      const delay = instant ? 0 : i * 70
      const kind = row ? ({ tilt: "tilt", fan: "fan", clip: "clip", zoom: "warp" } as Record<string, string>)[(el.closest(".sd-flow") as HTMLElement | null)?.dataset.flow ?? ""] ?? "up" : (el as HTMLElement).dataset.rise ?? "up"
      const f = frames(kind, i)
      const anim = el.animate([f.from, f.to], { duration: instant ? 0 : f.duration, delay, easing: f.easing, fill: "forwards" })
      // once it has arrived, mark it (an attribute React does not manage, so a re-render keeps it) and drop the
      // animation, which hands the element back to its own styles: hover lifts and tilts work again
      anim.onfinish = () => {
        el.setAttribute("data-risen", "")
        anim.cancel()
      }
      animations.push(anim)
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
      for (const el of document.querySelectorAll(SELECTOR)) {
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
