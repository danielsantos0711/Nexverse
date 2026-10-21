"use client"

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useRef } from "react"

/*
 * The story's cover as a scroll-driven hero: while the reader scrolls past it the picture drifts slower than
 * the page (depth), zooms in a little, and a dusk gradient rises over it, so the page hands over from the
 * picture to the text instead of cutting. Still for readers who ask for reduced motion.
 */
export function StoryHero({ children, caption }: { children: React.ReactNode; caption?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-6%", "10%"])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], reduce ? [1, 1, 1] : [1.08, 1.04, 1.14])
  const dusk = useTransform(scrollYProgress, [0.45, 0.95], reduce ? [0.25, 0.25] : [0.15, 0.85])
  const tilt = useTransform(scrollYProgress, [0, 0.5, 1], reduce ? [0, 0, 0] : [6, 0, -4])
  return (
    <figure className="mt-8 [perspective:1400px]">
      <motion.div ref={ref} style={{ rotateX: tilt }} className="relative aspect-[16/10] origin-bottom overflow-hidden rounded-3xl shadow-[0_40px_120px_-40px] shadow-ion/30 ring-1 ring-white/10 sm:aspect-[16/9] md:aspect-[21/9]">
        <motion.div style={{ y, scale }} className="absolute inset-[-8%_0] will-change-transform">
          {children}
        </motion.div>
        <motion.div aria-hidden style={{ opacity: dusk }} className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,transparent_40%,rgba(0,0,0,0.35))]" />
      </motion.div>
      {caption && <figcaption className="mt-2 flex flex-wrap items-center justify-end gap-2">{caption}</figcaption>}
    </figure>
  )
}
