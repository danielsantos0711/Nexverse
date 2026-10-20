"use client"

import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * A card edge that lights up where the pointer is, in the crew's colour (adapted from HorizonX "Border Glow": its
 * WebGL-free core, kept to two CSS layers). The pointer position goes into CSS variables at most once a frame and
 * only while the pointer is over the card; nothing runs otherwise. Touch and reduced motion get the resting edge.
 */
export function BorderGlow({ tint, children, className }: { tint: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const point = useRef({ x: 0, y: 0 })

  function move(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    point.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      el.style.setProperty("--glow-x", `${point.current.x}px`)
      el.style.setProperty("--glow-y", `${point.current.y}px`)
    })
  }

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={() => {
        cancelAnimationFrame(frame.current)
        frame.current = 0
      }}
      style={{ "--glow": tint } as React.CSSProperties}
      className={cn("group/glow relative isolate rounded-xl", className)}
    >
      {children}
      {/* The lit edge: a 1px ring masked out of a radial light that follows the pointer. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] p-px opacity-0 transition-opacity duration-300 group-hover/glow:opacity-100 motion-reduce:hidden"
        style={{
          background: "radial-gradient(220px circle at var(--glow-x, 50%) var(--glow-y, 0%), var(--glow), transparent 65%)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/glow:opacity-100 motion-reduce:hidden"
        style={{ background: "radial-gradient(320px circle at var(--glow-x, 50%) var(--glow-y, 0%), color-mix(in oklab, var(--glow) 9%, transparent), transparent 70%)" }}
      />
    </div>
  )
}
