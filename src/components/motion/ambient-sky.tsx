"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { useUiPrefs, type UiBackdrop, type UiDensity } from "@/components/settings/ui-prefs"
import { useQuality } from "@/lib/perf"

/*
 * The sky behind every page, so no part of the site is flat black. Three things, all behind the content:
 *
 *   nebula  a few soft clouds of colour (ion blue, champagne, aurora, nova) that drift slowly and sink at their
 *           own depth as you scroll. Their colours follow the part of the site you are in, and the section in
 *           view: any element with data-sky="ion|gold|aurora|nova|rose" tints the sky while it holds the middle
 *           of the screen, cross-fading over a second.
 *   stars   three layers of stars at three depths. Each layer is one small tile drawn once on a canvas and
 *           repeated as a background; scrolling only moves the layers (transform), so parallax costs no painting.
 *           The nearest layer twinkles with an opacity animation.
 *   glow    a faint horizon of light at the bottom of the screen that brightens as you near the end of a page.
 *
 * Settings › Your experience picks the style (nebula, starfield, deep) and how many stars. Reduced motion,
 * "Calm" and the "off" quality tier keep the sky still (no parallax, no drift, no twinkle) but keep its colour.
 */

export type SkyTone = "ion" | "gold" | "aurora" | "nova" | "rose"

/** The tone of each part of the site, used until a section on the page asks for another. */
const ROUTE_TONE: [string, SkyTone][] = [
  ["/forum", "ion"],
  ["/chat", "ion"],
  ["/messages", "ion"],
  ["/events", "gold"],
  ["/launchpad", "gold"],
  ["/missions", "gold"],
  ["/leaderboard", "gold"],
  ["/lab", "aurora"],
  ["/datasets", "aurora"],
  ["/benchmarks", "aurora"],
  ["/arena", "nova"],
  ["/models", "nova"],
  ["/constellations", "nova"],
  ["/cosmos", "nova"],
  ["/collections", "rose"],
  ["/saved", "rose"],
  ["/notifications", "ion"],
  ["/explore", "ion"],
  ["/code", "nova"],
  ["/repos", "nova"],
  ["/tools", "gold"],
  ["/news", "gold"],
  ["/trending", "nova"],
  ["/for-you", "rose"],
  ["/people", "aurora"],
  ["/crews", "aurora"],
]
const toneFor = (path: string): SkyTone => ROUTE_TONE.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "ion"

const STARS: Record<UiDensity, number> = { sparse: 0.5, normal: 1, dense: 1.8 }
const STYLE: Record<UiBackdrop, number> = { nebula: 1, starfield: 1.2, deep: 0.55 }
/** Tile size and how far each layer moves per pixel scrolled: far stars barely move, near ones move most. */
const LAYERS = [
  { tile: 360, depth: 0.04, count: 70, size: [0.5, 1.0], alpha: [0.25, 0.55] },
  { tile: 480, depth: 0.1, count: 38, size: [0.7, 1.3], alpha: [0.35, 0.75] },
  { tile: 640, depth: 0.2, count: 16, size: [1.0, 1.8], alpha: [0.5, 0.95] },
] as const

/** One star tile as a data URL. Deterministic per layer, so every page and visit draws the same sky. */
function drawTile(layer: (typeof LAYERS)[number], scale: number, seed: number): string {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const c = document.createElement("canvas")
  c.width = c.height = Math.round(layer.tile * dpr)
  const g = c.getContext("2d")
  if (!g) return ""
  g.scale(dpr, dpr)
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const n = Math.round(layer.count * scale)
  for (let i = 0; i < n; i++) {
    const x = rnd() * layer.tile
    const y = rnd() * layer.tile
    const r = layer.size[0] + rnd() * (layer.size[1] - layer.size[0])
    const a = layer.alpha[0] + rnd() * (layer.alpha[1] - layer.alpha[0])
    // most stars are white; a few lean blue or champagne
    const hue = rnd()
    const col = hue > 0.85 ? `rgba(216,197,158,${a})` : hue > 0.65 ? `rgba(160,190,255,${a})` : `rgba(235,240,255,${a})`
    if (r > 1.3) {
      const halo = g.createRadialGradient(x, y, 0, x, y, r * 4)
      halo.addColorStop(0, col)
      halo.addColorStop(1, "rgba(0,0,0,0)")
      g.fillStyle = halo
      g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8)
    }
    g.fillStyle = col
    g.beginPath()
    g.arc(x, y, r / 2, 0, Math.PI * 2)
    g.fill()
  }
  return c.toDataURL("image/png")
}

export function AmbientSky() {
  const pathname = usePathname()
  const { backdrop, density, motion } = useUiPrefs()
  const quality = useQuality()
  const root = useRef<HTMLDivElement>(null)
  // the "low" tier (software graphics, weak phones) keeps the sky still too: moving full-screen layers cost the most there
  const still = quality === "off" || quality === "low" || motion === "calm"

  // the stars: drawn once per style and density
  useEffect(() => {
    const el = root.current
    if (!el) return
    const scale = STARS[density] * STYLE[backdrop]
    el.querySelectorAll<HTMLElement>("[data-star-layer]").forEach((layer, i) => {
      const url = drawTile(LAYERS[i], scale, 1013 + i * 7919)
      layer.style.backgroundImage = url ? `url(${url})` : ""
      layer.style.backgroundSize = `${LAYERS[i].tile}px ${LAYERS[i].tile}px`
    })
  }, [backdrop, density])

  // parallax: stars and clouds sink at their own depth, the glow follows the page's end. Transform only.
  useEffect(() => {
    const el = root.current
    if (!el || still || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const layers = [...el.querySelectorAll<HTMLElement>("[data-star-layer]")]
    const clouds = [...el.querySelectorAll<HTMLElement>("[data-cloud]")]
    const glow = el.querySelector<HTMLElement>("[data-sky-glow]")
    let raf = 0
    const paint = () => {
      raf = 0
      const y = window.scrollY
      layers.forEach((l, i) => {
        const t = LAYERS[i].tile
        l.style.transform = `translate3d(0, ${-((y * LAYERS[i].depth) % t)}px, 0)`
      })
      clouds.forEach((c) => {
        const d = Number(c.dataset.cloud) || 0.05
        c.style.translate = `0 ${(-y * d).toFixed(1)}px`
      })
      if (glow) {
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? Math.min(1, y / max) : 0
        glow.style.opacity = String(0.5 + p * p * 0.5)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    paint()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
    }
  }, [still, pathname])

  // the tone: the route's, then whichever [data-sky] section holds the middle of the screen
  useEffect(() => {
    const el = root.current
    if (!el) return
    const base = toneFor(pathname)
    el.dataset.tone = base
    const inView = new Map<Element, boolean>()
    const pick = () => {
      const hit = [...inView].find(([, on]) => on)?.[0] as HTMLElement | undefined
      el.dataset.tone = (hit?.dataset.sky as SkyTone | undefined) ?? base
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inView.set(e.target, e.isIntersecting)
        pick()
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    const watch = () => document.querySelectorAll("[data-sky]").forEach((s) => !inView.has(s) && (inView.set(s, false), io.observe(s)))
    watch()
    // sections that stream in later (Suspense) are picked up too
    const mo = new MutationObserver(watch)
    mo.observe(document.getElementById("main") ?? document.body, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [pathname])

  return (
    <div ref={root} aria-hidden data-backdrop={backdrop} data-still={still ? "" : undefined} className="nx-sky">
      <div className="nx-sky-cloud nx-sky-cloud-a" data-cloud="0.06" />
      <div className="nx-sky-cloud nx-sky-cloud-b" data-cloud="0.1" />
      <div className="nx-sky-cloud nx-sky-cloud-c" data-cloud="0.03" />
      <div className="nx-sky-stars">
        <i data-star-layer />
        <i data-star-layer />
        <i data-star-layer className="nx-sky-twinkle" />
      </div>
      <div className="nx-sky-glow" data-sky-glow />
    </div>
  )
}
