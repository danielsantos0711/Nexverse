"use client"

import { useEffect, useRef, type ElementType } from "react"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * Liquid Glass. The material itself is CSS (.liquid-glass, .liquid-glass-strong, .liquid-glass-pill in
 * globals.css), so any surface can wear it with a class name. <Glass> adds the two things CSS cannot do alone:
 *
 *   - a sheen that follows the pointer across the pane. One shared pointer listener serves every pane on the
 *     page; it only runs while the pointer is over one, at most once per frame, and moves the light by
 *     transform, so the browser composites it without repainting anything;
 *   - edge refraction (`refract`): the backdrop bends at the rim through the SVG filter in <GlassDefs>. Only on
 *     Chromium (the one engine that applies SVG filters to backdrops) and only at "high" quality.
 */

type Variant = "panel" | "strong" | "pill"

const VARIANT: Record<Variant, string> = {
  panel: "liquid-glass",
  strong: "liquid-glass-strong",
  pill: "liquid-glass-pill",
}

// The panes the pointer is over right now, and the one frame request that moves their light.
const lit = new Set<HTMLElement>()
let px = 0
let py = 0
let frame = 0
let listening = false

function paint() {
  frame = 0
  for (const el of lit) {
    const light = el.querySelector<HTMLElement>(":scope > .lg-sheen > i")
    if (!light) continue
    const box = el.getBoundingClientRect()
    light.style.transform = `translate3d(${(px - box.left).toFixed(1)}px, ${(py - box.top).toFixed(1)}px, 0)`
  }
}

function onMove(e: PointerEvent) {
  px = e.clientX
  py = e.clientY
  if (!frame && lit.size) frame = requestAnimationFrame(paint)
}

function track(el: HTMLElement) {
  if (!listening) {
    window.addEventListener("pointermove", onMove, { passive: true })
    listening = true
  }
  const enter = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    px = e.clientX
    py = e.clientY
    lit.add(el)
    el.setAttribute("data-glass-lit", "")
    paint()
  }
  const leave = () => {
    lit.delete(el)
    el.removeAttribute("data-glass-lit")
  }
  el.addEventListener("pointerenter", enter)
  el.addEventListener("pointerleave", leave)
  return () => {
    leave()
    el.removeEventListener("pointerenter", enter)
    el.removeEventListener("pointerleave", leave)
  }
}

/** Gives an element the pointer-led sheen. Put `<GlassSheen />` as its first child. */
export function useGlassSheen<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || matchMedia("(hover: none), (prefers-reduced-motion: reduce)").matches) return
    return track(el)
  }, [enabled])
  return ref
}

/** The layer that holds the light. Decorative. */
export function GlassSheen() {
  return (
    <span aria-hidden className="lg-sheen">
      <i />
    </span>
  )
}

export function Glass({
  as,
  variant = "panel",
  sheen = true,
  refract = false,
  className,
  children,
  ...rest
}: {
  as?: ElementType
  variant?: Variant
  /** The pointer-led light. On by default; off on touch screens and with reduced motion. */
  sheen?: boolean
  /** Bend the backdrop at the edges (header and pills only: it costs a filter pass). */
  refract?: boolean
  className?: string
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  // Round 10: plain blur only (Daniel's choice), so no pointer sheen and no edge refraction.
  void sheen
  void refract
  const on = false
  const ref = useGlassSheen<HTMLElement>(on)
  const Tag = as ?? "div"
  return (
    <Tag ref={ref} className={cn(VARIANT[variant], className)} {...rest}>
      {on && <GlassSheen />}
      {children}
    </Tag>
  )
}

/*
 * The refraction map: neutral grey in the middle, and toward each edge a ramp that makes the filter sample a
 * little further inside the pane (red for x, green for y), so the backdrop seems to bulge at the rim like the
 * thick edge of a lens. It stretches to every pane's own box.
 */
const MAP = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" preserveAspectRatio="none"><defs><linearGradient id="x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f00"/><stop offset=".14" stop-color="#800"/><stop offset=".86" stop-color="#800"/><stop offset="1" stop-color="#000"/></linearGradient><linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset=".22" stop-color="#080"/><stop offset=".78" stop-color="#080"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="200" height="200" fill="url(#x)"/><rect width="200" height="200" fill="url(#y)" style="mix-blend-mode:screen"/></svg>`
const MAP_URL = `data:image/svg+xml;utf8,${encodeURIComponent(MAP)}`

const isChromium = () => {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands
  return Boolean(brands?.some((b) => b.brand === "Chromium"))
}

/**
 * Mount once per page (the site header does): the SVG filter behind `refract`, and the quality tier on <html>
 * so the CSS can make the glass cheaper on slower machines.
 */
export function GlassDefs() {
  const quality = useQuality()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.glass = quality
    const refract = quality === "high" && isChromium() && !matchMedia("(prefers-reduced-transparency: reduce)").matches
    root.toggleAttribute("data-glass-refract", refract)
    return () => {
      delete root.dataset.glass
      root.removeAttribute("data-glass-refract")
    }
  }, [quality])
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute size-0 overflow-hidden" focusable="false">
      {/* The image fills the filter region (the pane's own box); the displacement is in pixels, so a wide header
          and a small pill bend by the same few pixels. */}
      <filter id="lg-refraction" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
        <feImage href={MAP_URL} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="14" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
