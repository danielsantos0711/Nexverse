"use client"

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * A section that arrives as you scroll to it: its frame opens from a thin horizon (clip-path) while the content
 * rises, and a faint silver haze behind it drifts with the scroll (round 12b: the motion is back, the colour is
 * not; `tint` is kept for callers). Transform, opacity and clip only.
 */
export function Reveal({ id, className, children, tint = "ion" }: { id?: string; className?: string; children: React.ReactNode; tint?: "ion" | "gold" | "repo" }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  void tint
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const drift = useTransform(scrollYProgress, [0, 1], ["-12%", "12%"])
  return (
    <motion.section
      ref={ref}
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("relative isolate scroll-mt-28", className)}
      initial={reduce ? false : { clipPath: "inset(8% 4% 8% 4% round 28px)", opacity: 0.2, y: 40 }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0% round 0px)", opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div
        aria-hidden
        style={{ y: reduce ? 0 : drift, background: "radial-gradient(60% 50% at 20% 30%, rgb(220 222 228 / 0.05), transparent 70%)" }}
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10"
      />
      {children}
    </motion.section>
  )
}
