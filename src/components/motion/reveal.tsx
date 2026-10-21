"use client"

import { useRef } from "react"
import { gsap, motionOff, scrollAmp, useGSAP } from "@/components/motion/gsap"
import { cn } from "@/lib/utils"

/*
 * <Reveal>: a part of a page arrives as it scrolls into view, in one of several ways (not only a fade):
 *
 *   rise   lifts into place                          the default, for text and small groups
 *   clip   wipes open from its bottom edge           images, cards, panels
 *   mask   each word slides up out of a slot        headings (use <SplitWords> inside)
 *   fan    its children fan in from a tilt, in turn  rows of cards
 *   tilt   tips up from lying back, like a card     single cards and tables
 *   warp   arrives from deep space: small and far    hero-like moments, empty states
 *   iris   opens as a circle from its centre         pictures, maps, orbs
 *
 * With `stagger`, the reveal runs on the element's direct children one after another (or on `targets`, a
 * selector inside it). Everything is visible without script, with reduced motion, with Calm, and to search
 * engines; a part already on screen when the page loads is left as it is (no flash). Distances scale with the
 * member's "Motion while scrolling". Once revealed, it stays.
 */

export type RevealVariant = "rise" | "clip" | "mask" | "fan" | "tilt" | "warp" | "iris"

type Props = {
  as?: "div" | "section" | "ul" | "ol" | "header" | "li" | "article"
  variant?: RevealVariant
  stagger?: boolean | number
  targets?: string
  delay?: number
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, "children">

function fromState(variant: RevealVariant, amp: number, i: number, n: number): gsap.TweenVars {
  switch (variant) {
    case "clip":
      return { clipPath: `inset(${Math.min(60, 40 * amp)}% 0% 0% 0% round 24px)`, y: 30 * amp, opacity: 0.2 }
    case "mask":
      return { yPercent: 115, opacity: 0, rotate: 4 * amp }
    case "fan":
      return { y: 70 * amp, rotate: (i - (n - 1) / 2) * 4 * amp, scale: 0.92, opacity: 0, transformOrigin: "50% 130%" }
    case "tilt":
      return { rotateX: 22 * amp, y: 50 * amp, opacity: 0, transformPerspective: 900, transformOrigin: "50% 100%" }
    case "warp":
      return { scale: 1 - 0.18 * Math.min(amp, 1.4), y: 90 * amp, opacity: 0 }
    case "iris":
      return { clipPath: "circle(8% at 50% 50%)", opacity: 0.3 }
    default:
      return { y: 44 * amp, opacity: 0 }
  }
}

const toState = (variant: RevealVariant): gsap.TweenVars =>
  variant === "clip" ? { clipPath: "inset(0% 0% 0% 0% round 0px)", y: 0, opacity: 1 } : variant === "iris" ? { clipPath: "circle(80% at 50% 50%)", opacity: 1 } : { y: 0, yPercent: 0, x: 0, rotate: 0, rotateX: 0, scale: 1, opacity: 1 }

export function Reveal({ as = "div", variant = "rise", stagger, targets, delay = 0, className, children, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el || motionOff()) return
      // already on screen at load: leave it (no flash, no wait)
      const box = el.getBoundingClientRect()
      if (box.top < window.innerHeight * 0.92 && box.bottom > 0) return
      const amp = scrollAmp()
      const items: HTMLElement[] = targets
        ? [...el.querySelectorAll<HTMLElement>(targets)]
        : variant === "mask"
          ? [...el.querySelectorAll<HTMLElement>("[data-word]")]
          : stagger || variant === "fan"
            ? ([...el.children] as HTMLElement[])
            : [el]
      if (!items.length) return
      const each = typeof stagger === "number" ? stagger : variant === "mask" ? 0.045 : 0.08
      items.forEach((t, i) => gsap.set(t, fromState(variant, amp, i, items.length)))
      gsap.to(items, {
        ...toState(variant),
        duration: variant === "mask" ? 0.9 : variant === "warp" ? 1.2 : 1,
        ease: variant === "warp" ? "expo.out" : "power4.out",
        delay,
        stagger: items.length > 1 ? each : 0,
        clearProps: "transform,clipPath,opacity,transformOrigin",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      })
    },
    { scope: ref, dependencies: [] }
  )

  const Tag = as as "div"
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={className} {...rest}>
      {children}
    </Tag>
  )
}

/** Text split into words, each in its own slot, for <Reveal variant="mask">. Screen readers read the sentence once. */
export function SplitWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <span className={cn("inline", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span data-word className="inline-block">
              {w}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </span>
  )
}
