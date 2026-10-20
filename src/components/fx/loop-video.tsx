"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useReducedMotion } from "motion/react"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/** The brand loops in public/media, rendered from the hero's own scene (the official N, untouched, in its galaxy). */
export const LOOPS = {
  /** The N in its galaxy with orbits and light, 16:9, 8 s. For bands and closing calls to action. */
  brand: { webm: "/media/nexverse-loop.webm", mp4: "/media/nexverse-loop.mp4", poster: "/media/nexverse-loop-poster.webp", width: 1600, height: 900, alpha: false },
  /**
   * The galaxy alone on a transparent ground (VP9 with alpha), 3:2, 8 s, to sit behind the N where WebGL is not
   * available. Safari cannot draw WebM transparency, so there it stays the still galaxy.
   */
  galaxy: { webm: "/media/galaxy-loop.webm", mp4: null, poster: "/space/galaxy-still.webp", width: 900, height: 600, alpha: true },
} as const
export type LoopName = keyof typeof LOOPS

const noop = () => () => {}

/** Data Saver keeps the poster; so does WebKit (Safari, and every iOS browser) for a loop with transparency. */
function posterOnly(alpha: boolean) {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  const ua = navigator.userAgent
  const webkit = /iPhone|iPad|iPod/.test(ua) || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return Boolean(c?.saveData) || (alpha && webkit)
}

/**
 * A decorative looping video that costs nothing until it is needed. It fills its parent (give the parent a
 * size, so the page never shifts), shows the poster until it comes near the screen, then loads with
 * preload="none" → "auto" and plays muted inline, only while it is on screen and the tab is visible. With
 * reduced motion (the visitor's or the site's `still`), or with Data Saver on, it stays a still poster.
 *
 */
export function LoopVideo({
  name,
  still = false,
  eager = false,
  className,
  position = "50% 50%",
}: {
  name: LoopName
  still?: boolean
  /** Above the fold (the hero): fetch the poster at once and load the film without waiting to scroll near. */
  eager?: boolean
  className?: string
  position?: string
}) {
  const loop = LOOPS[name]
  const ref = useRef<HTMLVideoElement>(null)
  const reduce = useReducedMotion()
  const quality = useQuality()
  const [near, setNear] = useState(eager)
  const held = useSyncExternalStore(noop, () => posterOnly(loop.alpha), () => false)
  // a film is decoded by the video hardware, so it plays on every tier but "off" (reduced motion, motion off)
  const moving = !still && !reduce && !held && quality !== "off"

  const visible = useRef(false)
  const sync = () => {
    const v = ref.current
    if (!v || !v.currentSrc) return
    if (visible.current && !document.hidden) v.play().catch(() => {})
    else v.pause()
  }

  // sources are added once it is near: load them, then play if it is already on screen
  useEffect(() => {
    if (!near || !moving) return
    const v = ref.current
    if (!v) return
    v.load()
    v.addEventListener("loadeddata", sync, { once: true })
    return () => v.removeEventListener("loadeddata", sync)
  }, [near, moving])

  useEffect(() => {
    const v = ref.current
    if (!v || !moving) return
    // load a little before it scrolls in, play only while some of it shows
    const nearby = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "300px 0px" })
    const onScreen = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting
      sync()
    })
    nearby.observe(v)
    onScreen.observe(v)
    document.addEventListener("visibilitychange", sync)
    return () => {
      nearby.disconnect()
      onScreen.disconnect()
      document.removeEventListener("visibilitychange", sync)
      v.pause()
    }
  }, [moving])

  const cls = cn("pointer-events-none absolute inset-0 size-full object-cover select-none", className)
  const style = { objectPosition: position }

  if (!moving) {
    // eslint-disable-next-line @next/next/no-img-element -- a fixed, already compressed poster; next/image would only re-encode it
    return <img src={loop.poster} alt="" aria-hidden width={loop.width} height={loop.height} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" className={cls} style={style} />
  }

  return (
    <video
      ref={ref}
      aria-hidden
      tabIndex={-1}
      muted
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      preload={near ? "auto" : "none"}
      poster={loop.poster}
      width={loop.width}
      height={loop.height}
      className={cls}
      style={style}
    >
      {near && (
        <>
          <source src={loop.webm} type='video/webm; codecs="vp9"' />
          {loop.mp4 && <source src={loop.mp4} type="video/mp4" />}
        </>
      )}
    </video>
  )
}
