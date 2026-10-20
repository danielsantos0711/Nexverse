"use client"

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react"
import { useSiteSettings } from "@/lib/site-settings"

/*
 * Visual quality for heavy effects (WebGL, canvas, big animations). Effects read the tier and scale their
 * particle counts, resolution and frame rate, so slower computers stay smooth without losing the design.
 *
 * The tier is the lowest of:
 *   - the hardware ceiling: CPU cores, device memory, a software GPU (SwiftShader, llvmpipe), a phone-sized
 *     touch screen, and Data Saver;
 *   - the measured tier: while any effect is mounted, a frame-rate probe watches the page in 2-second windows.
 *     Two slow windows in a row (under ~62% of the display's own rate) step it down one tier; a long run of
 *     smooth windows steps it back up, at most twice per visit so it cannot see-saw. It never measures its
 *     way to "off";
 *   - the admins' motion level (settings.theme.motion): "calm" caps at "medium", "off" is "off";
 *   - the visitor's reduced-motion setting: "off".
 *
 * What the tiers mean for an effect (helpers below):
 *   high    full particle count, pixel ratio up to 1.5, every frame
 *   medium  ~60% of the work, pixel ratio up to 1.25
 *   low     ~35% of the work, pixel ratio 1, 30 frames a second; full-screen shaders hold a still frame
 *   off     one still frame (or the effect's still fallback), no animation loop at all
 *
 * One heavy effect at a time: `useFxTurn(ref)` lets only the effect with the most visible area on screen
 * animate; the others hold their last frame until they become the biggest one in view. `useFx(ref)` combines
 * both and is what most effects want.
 */

export type Quality = "high" | "medium" | "low" | "off"

const ORDER: Quality[] = ["off", "low", "medium", "high"]
const rank = (q: Quality) => ORDER.indexOf(q)
const lowest = (...qs: Quality[]) => qs.reduce((a, b) => (rank(b) < rank(a) ? b : a))

/** Share of the full workload (particles, samples, lines) an effect should do at a tier. */
export function qualityScale(q: Quality): number {
  return q === "high" ? 1 : q === "medium" ? 0.6 : q === "low" ? 0.35 : 0
}

/** The device pixel ratio to draw at: capped at 1.5 and lower on lower tiers. Browser only. */
export function pixelRatio(q: Quality): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  const cap = q === "high" ? 1.5 : q === "medium" ? 1.25 : 1
  return Math.min(dpr, cap)
}

/** Minimum milliseconds between drawn frames: 0 means every frame; "low" draws at 30 fps. */
export function frameInterval(q: Quality): number {
  return q === "low" ? 1000 / 31 : 0
}

/* ------------------------------------------------------------------------------------------------------- */
/* The store: hardware ceiling, measured tier and reduced motion, shared by every effect on the page.       */

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }

let ceiling: Quality | null = null
let measured: Quality = "high"
let reduced = false
let started = false
const listeners = new Set<() => void>()
const emit = () => {
  // CSS can follow the device tier too (html[data-fx="low"] stops the drifting starfields)
  if (started) document.documentElement.dataset.fx = snapshot()
  listeners.forEach((l) => l())
}

/** True when WebGL is drawn by the CPU (no usable GPU): every shader then costs main-thread-like time. */
function softwareGpu(): boolean {
  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null
    if (!gl) return true
    const info = gl.getExtension("WEBGL_debug_renderer_info")
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return /swiftshader|llvmpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}

function hardwareCeiling(): Quality {
  const nav = navigator as Nav
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  let q: Quality = "high"
  if (cores <= 4 || memory <= 4) q = "medium"
  if (cores <= 2 || memory <= 2) q = "low"
  // phones: small touch screens at a high pixel ratio fill many pixels with a small GPU
  if (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820) q = lowest(q, "medium")
  if (nav.connection?.saveData) q = lowest(q, "low")
  if (softwareGpu()) q = lowest(q, "low")
  return q
}

/** The frame-rate probe. Runs only while effects are mounted, the tab is visible, and backs off once settled. */
let users = 0
let probeRaf = 0
let probeTimer = 0
let refresh = 60
let slow = 0
let smooth = 0
let ups = 0
let windows = 0

function probeWindow() {
  probeTimer = 0
  if (!users || document.hidden) return
  let frames = 0
  let first = 0
  let prev = 0
  let gap = false
  const tick = (now: number) => {
    probeRaf = 0
    if (!users) return
    if (!first) first = now
    else if (now - prev > 250) gap = true // a stall from outside (tab switch, debugger): not our frame rate
    prev = now
    frames++
    if (now - first < 2000) {
      probeRaf = requestAnimationFrame(tick)
      return
    }
    windows++
    if (!gap && !document.hidden) judge(((frames - 1) * 1000) / (now - first))
    // measure closely at first, then only now and then: the probe itself should cost nothing
    probeTimer = window.setTimeout(probeWindow, windows < 6 || slow || smooth ? 0 : 12000)
  }
  probeRaf = requestAnimationFrame(tick)
}

function judge(fps: number) {
  // the display's own rate (60, 90, 120, 144…) is the best rate seen, rounded down to a common value
  if (fps > refresh * 1.08) refresh = fps > 130 ? 144 : fps > 100 ? 120 : fps > 80 ? 90 : 60
  const limit = ceiling ?? "high"
  if (fps < refresh * 0.62) {
    smooth = 0
    if (++slow >= 2 && rank(measured) > rank("low")) {
      measured = ORDER[rank(measured) - 1]
      slow = 0
      emit()
    }
  } else if (fps >= refresh * 0.9) {
    slow = 0
    if (++smooth >= 6 && rank(measured) < rank(limit) && ups < 2) {
      measured = ORDER[rank(measured) + 1]
      smooth = 0
      ups++
      emit()
    }
  } else {
    slow = 0
    smooth = 0
  }
}

function onVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(probeRaf)
    probeRaf = 0
    clearTimeout(probeTimer)
    probeTimer = 0
  } else if (users && !probeRaf && !probeTimer) probeTimer = window.setTimeout(probeWindow, 500)
}

function start() {
  if (started || typeof window === "undefined") return
  started = true
  ceiling = hardwareCeiling()
  measured = ceiling
  const media = matchMedia("(prefers-reduced-motion: reduce)")
  reduced = media.matches
  media.addEventListener("change", () => {
    reduced = media.matches
    emit()
  })
  document.addEventListener("visibilitychange", onVisibility)
  document.documentElement.dataset.fx = snapshot()
}

function retain() {
  start()
  users++
  // wait for the page to settle (hydration, first images) before judging its frame rate
  if (users === 1 && !probeRaf && !probeTimer) probeTimer = window.setTimeout(probeWindow, 1500)
  emit()
  return () => {
    users--
    if (!users) {
      cancelAnimationFrame(probeRaf)
      clearTimeout(probeTimer)
      probeRaf = probeTimer = 0
    }
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const snapshot = (): Quality => (!started ? "high" : reduced ? "off" : lowest(ceiling ?? "high", measured))

/** The current quality tier for heavy effects. "off" means render the still fallback. */
export function useQuality(): Quality {
  const { settings } = useSiteSettings()
  useEffect(retain, [])
  const device = useSyncExternalStore(subscribe, snapshot, () => "high" as Quality)
  const motion = settings.theme.motion
  return motion === "off" ? "off" : motion === "calm" ? lowest(device, "medium") : device
}

/* ------------------------------------------------------------------------------------------------------- */
/* One heavy effect animating at a time.                                                                   */

const areas = new Map<Element, number>()
let leader: Element | null = null
const turnListeners = new Set<() => void>()
let observer: IntersectionObserver | null = null

function elect() {
  let best: Element | null = null
  let most = 0
  for (const [el, area] of areas) {
    if (area > most) {
      most = area
      best = el
    }
  }
  if (best !== leader) {
    leader = best
    turnListeners.forEach((l) => l())
  }
}

function watch(el: Element) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (areas.has(e.target)) areas.set(e.target, e.isIntersecting ? e.intersectionRect.width * e.intersectionRect.height : 0)
      elect()
    },
    { threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
  )
  areas.set(el, 0)
  observer.observe(el)
  return () => {
    areas.delete(el)
    observer?.unobserve(el)
    elect()
  }
}

/**
 * True while this effect may animate: it is the heavy effect with the most area on screen. The others hold
 * their last frame (they are still drawn, so nothing looks broken). Pass the effect's outer element.
 */
export function useFxTurn(ref: RefObject<Element | null>): boolean {
  const [mine, setMine] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const stop = watch(el)
    const update = () => setMine(leader === el)
    turnListeners.add(update)
    update()
    return () => {
      turnListeners.delete(update)
      stop()
    }
  }, [ref])
  return mine
}

/**
 * Everything a heavy effect needs: its quality tier, and whether it should be animating right now
 * (`run`: at or above `minimum`, and its turn among the effects on screen). When `run` is false, draw one
 * frame and stop.
 *
 * `minimum` is the lowest tier the effect animates at. Full-screen fragment shaders (ray marching, many noise
 * calls per pixel) pass "medium": on a "low" machine (2 cores, 2 GB, a software GPU, Data Saver, or a measured
 * slow frame rate) they hold one still frame, which still looks designed and costs nothing after it is drawn.
 */
export function useFx(ref: RefObject<Element | null>, { minimum = "low" }: { minimum?: Exclude<Quality, "off"> } = {}): { quality: Quality; run: boolean } {
  const quality = useQuality()
  const turn = useFxTurn(ref)
  return { quality, run: rank(quality) >= rank(minimum) && turn }
}
