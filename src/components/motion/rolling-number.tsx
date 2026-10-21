"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/*
 * <RollingNumber value={1284} />: a real number that rolls into place like an odometer the first time it is
 * seen, each digit spinning a little longer than the one to its right. When the value changes later (a live
 * count), the digits roll to the new one. Screen readers get the plain number. Still with reduced motion.
 */
export function RollingNumber({ value, className, format = (n: number) => n.toLocaleString("en") }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(false)
  const text = format(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        // a frame later, so the digits start from 0 and the roll is visible
        requestAnimationFrame(() => setSeen(true))
        io.disconnect()
      },
      { rootMargin: "0px 0px -8% 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const chars = [...text]
  let k = chars.filter((c) => /\d/.test(c)).length
  return (
    <span ref={ref} className={cn("nx-roll", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((c, i) => {
          if (!/\d/.test(c)) return <span key={i}>{c}</span>
          k--
          return (
            <span key={i} className="nx-roll-col">
              <span className="nx-roll-strip" style={{ "--d": seen ? Number(c) : 0, "--k": k } as React.CSSProperties}>
                {"0123456789".split("").map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
