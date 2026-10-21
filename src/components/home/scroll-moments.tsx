"use client"

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { useUiPrefs } from "@/components/settings/ui-prefs"

/*
 * A scroll moment of the home page (round 11).
 *
 *   DriftMarquee     the band of languages under the hero: it keeps its slow drift and scrolling pushes it
 *                    further along (with a spring, so a flick of the wheel carries on a little after it stops)
 */

export function DriftMarquee({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  const { scrollFx, motion: mine } = useUiPrefs()
  const k = reduce || mine === "calm" ? 0 : scrollFx === "subtle" ? 0.4 : scrollFx === "cinematic" ? 1.4 : 0.8
  const { scrollY } = useScroll()
  const x = useSpring(useTransform(scrollY, (y) => -y * k), { stiffness: 120, damping: 28, mass: 0.6 })
  return (
    <div aria-hidden className="overflow-hidden border-b border-border py-3.5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <motion.div style={{ x }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  )
}
