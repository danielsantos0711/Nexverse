"use client"

import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/** Lights the card's border and surface under the pointer (see .spotlight in globals.css). */
export function Spotlight({ className, children, ...rest }: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null)
  function move(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    el.style.setProperty("--x", `${e.clientX - box.left}px`)
    el.style.setProperty("--y", `${e.clientY - box.top}px`)
  }
  return (
    <div ref={ref} onPointerMove={move} className={cn("spotlight", className)} {...rest}>
      {children}
    </div>
  )
}

/** Children rise in one after another as the group scrolls into view. Content is visible without script. */
export function Stagger({
  className,
  children,
  as = "div",
  delay = 0,
  gap = 0.06,
}: {
  className?: string
  children: React.ReactNode
  as?: "div" | "ul" | "ol" | "section"
  delay?: number
  gap?: number
}) {
  const reduce = useReducedMotion()
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      initial={reduce ? false : "hidden"}
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      variants={{ shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </Tag>
  )
}

export function Item({
  className,
  children,
  as = "div",
}: {
  className?: string
  children: React.ReactNode
  as?: "div" | "li" | "article"
}) {
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      variants={{
        hidden: { opacity: 0, transform: "translateY(18px)", filter: "blur(4px)" },
        shown: { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
      }}
    >
      {children}
    </Tag>
  )
}

/** A number that counts up the first time it is seen. */
export function CountUp({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("en"))
  useEffect(() => {
    const el = ref.current
    if (!el || !seen || reduce) return
    const controls = animate(0, value, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (v) => (el.textContent = fmt(v)),
    })
    return () => controls.stop()
  }, [seen, value, reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {fmt(value)}
    </span>
  )
}

/** Pulls its child a little toward the pointer, then springs back. For the one main call to action. */
export function Magnetic({ children, className, strength = 0.3 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 18 })
  const sy = useSpring(y, { stiffness: 220, damping: 18 })
  const transform = useTransform([sx, sy], ([a, b]) => `translate(${a}px, ${b}px)`)
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      style={reduce ? undefined : { transform }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const b = ref.current!.getBoundingClientRect()
        x.set((e.clientX - b.left - b.width / 2) * strength)
        y.set((e.clientY - b.top - b.height / 2) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}
