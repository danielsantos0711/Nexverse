"use client"

import { useRef } from "react"
import { gsap, motionOff, scrollAmp, ScrollTrigger, useGSAP } from "@/components/motion/gsap"

/*
 * Scroll-scrubbed motion with GSAP ScrollTrigger: tied to the scroll position itself (it runs backwards when
 * you scroll back), not played once.
 *
 *   <Parallax speed={0.3}>   drifts at its own depth while it crosses the screen (negative: towards you)
 *   <ScrollProgress>         writes its own progress through the screen as --p (0 to 1) on itself, so CSS can
 *                            drive anything from it: transform: rotate(calc(var(--p) * 90deg)), a scaleX bar…
 *                            (the variable lives on this element only, so updating it restyles nothing else)
 */

export function Parallax({ speed = 0.25, className, children, as = "div" }: { speed?: number; className?: string; children?: React.ReactNode; as?: "div" | "span" }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const el = ref.current
      if (!el || motionOff()) return
      const d = speed * 160 * scrollAmp()
      gsap.fromTo(el, { y: d }, { y: -d, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 } })
    },
    { dependencies: [speed] }
  )
  const Tag = as as "div"
  return (
    <Tag ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </Tag>
  )
}

export function ScrollProgress({
  className,
  children,
  start = "top bottom",
  end = "bottom top",
  style,
  ...rest
}: { className?: string; children?: React.ReactNode; start?: string; end?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      if (motionOff()) {
        el.style.setProperty("--p", "1")
        return
      }
      const st = ScrollTrigger.create({ trigger: el, start, end, onUpdate: (s) => el.style.setProperty("--p", s.progress.toFixed(4)) })
      el.style.setProperty("--p", st.progress.toFixed(4))
    },
    { dependencies: [start, end] }
  )
  return (
    <div ref={ref} className={className} style={{ ...style, ["--p" as string]: 0 }} {...rest}>
      {children}
    </div>
  )
}
