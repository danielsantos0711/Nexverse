"use client"

import { useEffect, useRef } from "react"
import type { SkyTone } from "@/components/motion/ambient-sky"
import { motionOff } from "@/components/motion/gsap"
import { cn } from "@/lib/utils"

/*
 * Section transitions in the universe language.
 *
 *   <SkySection tone="gold">  a section that tints the sky behind the page while it holds the middle of the
 *                              screen (see AmbientSky); with `horizon`, its top edge rises in like dawn over a planet
 *   <WarpDivider />           between sections: a band of stars that stretch into light-speed streaks while you
 *                              scroll past it, then settle back into points (CSS scroll timeline, transform only)
 *   <ScrollPortal>            a picture that opens from a small window into the full width as you scroll, holding
 *                              its overlay (children) at the end. Adapted from HorizonX "Scroll Expand": the page's
 *                              own scroll drives it, sticky (no pinning library), cleaned up on unmount, still and
 *                              fully open with reduced motion or Calm.
 */

export function SkySection({ tone, horizon, className, children, ...rest }: { tone: SkyTone; horizon?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section data-sky={tone} className={cn(horizon && "sd-horizon", className)} {...rest}>
      {children}
    </section>
  )
}

// fixed star positions (no random in render): x %, y px, length factor
const STREAKS = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37.7) % 100, y: ((i * 53) % 44) + 2, w: 0.4 + ((i * 29) % 10) / 10, o: 0.25 + ((i * 17) % 7) / 10 }))

export function WarpDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("nx-warp relative mx-auto h-12 w-full max-w-6xl overflow-hidden", className)}>
      {STREAKS.map((s, i) => (
        <i key={i} style={{ left: `${s.x}%`, top: s.y, "--w": s.w, opacity: s.o } as React.CSSProperties} />
      ))}
      <span className="nx-warp-line" />
    </div>
  )
}

export function ScrollPortal({ src, alt, className, children, length = 1.4 }: { src: string; alt: string; className?: string; children?: React.ReactNode; length?: number }) {
  const track = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const media = useRef<HTMLImageElement>(null)
  const overlay = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = track.current
    const f = frame.current
    const m = media.current
    const o = overlay.current
    if (!t || !f || !m || !o) return
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    const smooth = (x: number, a: number, b: number) => {
      const k = clamp((x - a) / (b - a || 1e-6))
      return k * k * (3 - 2 * k)
    }
    const apply = (p: number) => {
      const a = 1 - Math.pow(1 - clamp(p), 2.4)
      const w = 40 + 60 * a
      const h = 58 + 42 * a
      f.style.clipPath = `inset(${(100 - h) / 2}% ${(100 - w) / 2}% ${(100 - h) / 2}% ${(100 - w) / 2}% round ${28 - 4 * a}px)`
      m.style.transform = `scale(${1.28 - 0.28 * a})`
      const inn = smooth(a, 0.7, 1)
      o.style.opacity = String(inn)
      o.style.transform = `translate3d(0, ${22 * (1 - inn)}px, 0)`
    }
    if (motionOff()) {
      t.style.height = "auto"
      apply(1)
      return
    }
    let raf = 0
    let current = 0
    let target = 0
    const read = () => clamp(-t.getBoundingClientRect().top / (window.innerHeight * length))
    const tick = () => {
      current += (target - current) * 0.16
      if (Math.abs(target - current) < 0.0005) current = target
      apply(current)
      raf = current !== target ? requestAnimationFrame(tick) : 0
    }
    const onScroll = () => {
      target = read()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    target = current = read()
    apply(current)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [length])

  return (
    <div ref={track} className={cn("relative", className)} style={{ height: `${(1 + length + 0.35) * 100}svh` }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        <div ref={frame} className="absolute inset-0 will-change-[clip-path]" style={{ clipPath: "inset(21% 30% 21% 30% round 28px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a decorative still behind real text; sized by the frame */}
          <img ref={media} src={src} alt={alt} draggable={false} decoding="async" loading="lazy" className="absolute inset-0 size-full object-cover will-change-transform" style={{ transform: "scale(1.28)" }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#05060c]/85 via-[#05060c]/30 to-[#05060c]/40" />
        </div>
        <div ref={overlay} className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ opacity: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
