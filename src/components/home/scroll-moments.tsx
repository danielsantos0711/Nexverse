"use client"

import Link from "next/link"
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react"
import { ArrowRightIcon, CompassIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { ScrollPortal } from "@/components/motion/sections"
import { Magnetic } from "@/components/motion/pointer"
import { useUiPrefs } from "@/components/settings/ui-prefs"
import { cn } from "@/lib/utils"

/*
 * Two scroll moments of the home page (round 11).
 *
 *   DriftMarquee     the band of languages under the hero: it keeps its slow drift and scrolling pushes it
 *                    further along (with a spring, so a flick of the wheel carries on a little after it stops)
 *   DeepFieldPortal  before the closing band, the Hubble deep field opens from a small window into the whole
 *                    screen as you scroll (HorizonX "Scroll Expand", see ScrollPortal) and a line appears over
 *                    it with the way to the map. The words are editable (home.portal.*).
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

export function DeepFieldPortal({ className }: { className?: string }) {
  return (
    <section aria-labelledby="portal-h" data-sky="nova" className={cn("relative", className)}>
      <ScrollPortal src="/space/deep-field.webp" alt="">
        <p className="inline-flex items-center gap-2 text-xs tracking-[0.18em] text-ion/90 uppercase">
          <Copy k="home.portal.kicker">Hubble deep field</Copy>
        </p>
        <h2 id="portal-h" className="max-w-[22ch] font-display text-2xl font-semibold tracking-[-0.03em] text-balance drop-shadow-[0_2px_24px_rgb(0_0_0/0.6)] md:text-4xl">
          <Copy k="home.portal.title">Every point of light here is a galaxy. Every corner of AI has a place on Nexverse.</Copy>
        </h2>
        <Copy as="p" k="home.portal.body" className="max-w-[46ch] text-sm text-foreground/80 md:text-base">
          Models, datasets, tools, code, the forum, missions and the news, drawn as one map you can wander.
        </Copy>
        <Magnetic strength={0.22}>
          <Link href="/explore" className="pressable group mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-[0_10px_40px_-12px_rgb(255_255_255/0.45)]">
            <CompassIcon aria-hidden className="size-4" />
            <Copy k="home.portal.cta">Open the map</Copy>
            <ArrowRightIcon aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Magnetic>
      </ScrollPortal>
    </section>
  )
}
