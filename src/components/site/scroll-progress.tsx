"use client"

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react"

/** A thin line of light under the header that fills as you read down the page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 })
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden
      style={{ scaleX: reduce ? scrollYProgress : scaleX }}
      className="pointer-events-none fixed inset-x-0 top-16 z-40 h-px origin-left bg-gradient-to-r from-ion/0 via-ion to-gold"
    />
  )
}
