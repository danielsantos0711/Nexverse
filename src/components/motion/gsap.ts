"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"

/*
 * GSAP for the scroll system, registered once. ScrollTrigger reads the real window scroll, which is what the
 * smooth-scroll engine moves, so nothing needs a scroller proxy.
 */
gsap.registerPlugin(ScrollTrigger, useGSAP)

/** How far scroll motion travels for this visitor: Settings › Your experience › Motion while scrolling. */
export function scrollAmp(): number {
  if (typeof document === "undefined") return 1
  const v = document.documentElement.dataset.scrollFx
  return v === "subtle" ? 0.45 : v === "cinematic" ? 1.7 : 1
}

/** True when nothing should move: reduced motion, the member's Calm, or the "off" quality tier. */
export function motionOff(): boolean {
  if (typeof document === "undefined") return true
  const root = document.documentElement
  return matchMedia("(prefers-reduced-motion: reduce)").matches || root.hasAttribute("data-calm") || root.dataset.fx === "off"
}

export { gsap, ScrollTrigger, useGSAP }
