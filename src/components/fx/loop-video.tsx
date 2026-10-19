"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

/** The brand loops in public/media, rendered from the hero's own scene (the official N, untouched, in its galaxy). */
export const LOOPS = {
  /** The N in its galaxy with orbits and light, 16:9, 8 s. For bands and closing calls to action. */
  brand: { webm: "/media/nexverse-loop.webm", mp4: "/media/nexverse-loop.mp4", poster: "/media/nexverse-loop-poster.webp", width: 1600, height: 900 },
  /** The galaxy alone on black, 3:2, 8 s. Meant to sit behind the N with `blend`, where WebGL is not available. */
  galaxy: { webm: "/media/galaxy-loop.webm", mp4: "/media/galaxy-loop.mp4", poster: "/media/galaxy-loop-poster.webp", width: 1200, height: 800 },
} as const
export type LoopName = keyof typeof LOOPS

/**
 * A decorative looping video that costs nothing until it is needed. It fills its parent (give the parent a
 * size, so the page never shifts), shows the poster until it comes near the screen, then loads with
 * preload="none" → "auto" and plays muted inline, only while it is on screen and the tab is visible. With
 * reduced motion (the visitor's or the site's `still`), or with Data Saver on, it stays a still poster.
 *
 * `blend` screens the video over what is behind it, for loops drawn on black (the galaxy).
 */
export function LoopVideo({ name, still = false, blend = false, className, position = "50% 50%" }: { name: LoopName; still?: boolean; blend?: boolean; className?: string; position?: string }) {
  const loop = LOOPS[name]
  const ref = useRef<HTMLVideoElement>(null)
  const reduce = useReducedMotion()
  const [near, setNear] = useState(false)
  const [saveData, setSaveData] = useState(false)
  const moving = !still && !reduce && !saveData

  useEffect(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (c?.saveData) setSaveData(true)
  }, [])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only reads refs
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only reads refs
  }, [moving])

  const cls = cn("pointer-events-none absolute inset-0 size-full object-cover select-none", blend && "mix-blend-screen", className)
  const style = { objectPosition: position }

  if (!moving) {
    // eslint-disable-next-line @next/next/no-img-element -- a fixed, already compressed poster; next/image would only re-encode it
    return <img src={loop.poster} alt="" aria-hidden width={loop.width} height={loop.height} loading="lazy" decoding="async" className={cls} style={style} />
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
          <source src={loop.mp4} type="video/mp4" />
        </>
      )}
    </video>
  )
}
