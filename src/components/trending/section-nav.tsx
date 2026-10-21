"use client"

import { motion } from "motion/react"
import { useEffect, useId, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * The page's sections as pills that stay under the header while you scroll; the pill of the section in view
 * lights up and glides along (scroll spy with IntersectionObserver, no scroll listeners).
 */
export function SectionNav({ sections, className }: { sections: { id: string; label: string }[]; className?: string }) {
  const uid = useId()
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const seen = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        const best = sections.map((s) => [s.id, seen.get(s.id) ?? 0] as const).filter(([, r]) => r > 0)
        if (best.length) setActive(best[0][0])
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.01, 0.25] }
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [sections])

  return (
    <nav aria-label="Sections" className={cn("sticky top-16 z-20 -mx-[var(--gutter)] px-[var(--gutter)] py-2", className)}>
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-background/70 p-1 backdrop-blur-md [scrollbar-width:none]">
        {sections.map((s) => {
          const on = s.id === active
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "true" : undefined}
              className={cn("relative shrink-0 rounded-full px-3 py-1 text-[13px] whitespace-nowrap transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {on && <motion.span layoutId={`${uid}-on`} className="absolute inset-0 rounded-full bg-white/[0.09] ring-1 ring-white/15" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
              <span className="relative">{s.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
