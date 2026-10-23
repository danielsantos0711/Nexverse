"use client"

import { motion, useReducedMotion } from "motion/react"
import { useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * A section that arrives as you scroll to it: its frame opens from a thin horizon (clip-path) while the content
 * rises. Transform, opacity and clip only. (`tint` is kept for callers; the coloured light it drew was removed.)
 */
export function Reveal({ id, className, children, tint = "ion" }: { id?: string; className?: string; children: React.ReactNode; tint?: "ion" | "gold" | "repo" }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  void tint
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
      {children}
    </motion.section>
  )
}
