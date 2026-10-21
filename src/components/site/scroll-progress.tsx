"use client"

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react"

/** A thin line of light along the top edge of the screen that fills as you read down the page (it stays when the header slides away). */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 })
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden
      style={{ scaleX: reduce ? scrollYProgress : scaleX }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px origin-left bg-gradient-to-r from-ion/0 via-ion to-gold"
    />
  )
}
