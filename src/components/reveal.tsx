"use client"

import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(useGSAP, ScrollTrigger)

/**
 * Staggered entrance for every [data-reveal] child, grouped by the nearest section, once per visit.
 * Content is visible without script; with reduced motion only opacity changes.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const scope = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const { motion } = ctx.conditions as { motion: boolean }
          const groups = new Map<Element, Element[]>()
          scope.current?.querySelectorAll("[data-reveal]").forEach((el) => {
            const group = el.closest("section") ?? scope.current!
            groups.set(group, [...(groups.get(group) ?? []), el])
          })
          groups.forEach((els, group) => {
            gsap.from(els, {
              opacity: 0,
              y: motion ? 24 : 0,
              duration: motion ? 0.7 : 0.3,
              ease: "expo.out",
              stagger: 0.075,
              scrollTrigger: { trigger: group, start: "top 92%", once: true },
            })
          })
        }
      )
    },
    { scope }
  )

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  )
}
