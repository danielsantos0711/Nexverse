"use client"

import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(useGSAP, ScrollTrigger)

/** A slow scale and drift on a picture as it passes through the viewport. */
export function Drift({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          root.current!.firstElementChild,
          { scale: 1.14, yPercent: -4 },
          {
            scale: 1,
            yPercent: 4,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true },
          }
        )
      })
    },
    { scope: root }
  )
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  )
}
