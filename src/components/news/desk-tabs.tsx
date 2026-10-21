"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type DeskTab = { id: string; label: string; count: number; tint: string | null; blurb: string; content: React.ReactNode }

/*
 * The desks of the newsroom as tabs: the active pill slides between them, the desk's own colour glows behind
 * the panel, and the panel slides in from the side the reader moved towards. On phones the row scrolls
 * sideways with snap points. Arrow keys move between tabs (WAI-ARIA tabs pattern).
 */
export function DeskTabs({ tabs, label }: { tabs: DeskTab[]; label: string }) {
  const [current, setCurrent] = useState(tabs[0]?.id)
  const [dir, setDir] = useState(1)
  const reduce = useReducedMotion()
  const uid = useId()
  const list = useRef<HTMLDivElement>(null)
  const index = Math.max(0, tabs.findIndex((t) => t.id === current))
  const tab = tabs[index]
  if (!tab) return null

  const pick = (i: number) => {
    const next = tabs[(i + tabs.length) % tabs.length]
    setDir(i >= index ? 1 : -1)
    setCurrent(next.id)
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)
    el?.focus()
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" })
  }

  return (
    <div className="relative flex flex-col gap-5">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") pick(index + 1)
          else if (e.key === "ArrowLeft") pick(index - 1)
          else return
          e.preventDefault()
        }}
      >
        {tabs.map((t, i) => {
          const on = i === index
          return (
            <button
              key={t.id}
              data-tab={t.id}
              type="button"
              role="tab"
              id={`${uid}-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(i)}
              className={cn(
                "relative shrink-0 snap-start rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "border-transparent text-[#05060a]" : "border-border text-muted-foreground hover:border-white/20 hover:text-foreground"
              )}
            >
              {on && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 rounded-full"
                  style={{ background: t.tint ?? "var(--color-primary)", boxShadow: `0 8px 30px -8px ${t.tint ?? "var(--color-primary)"}` }}
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.55 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5 font-medium">
                {t.label}
                <span className={cn("font-mono text-[11px] tabular-nums", on ? "opacity-70" : "opacity-60")}>{t.count}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <motion.div
          aria-hidden
          key={`${tab.id}-glow`}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-[min(60rem,100%)] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: `radial-gradient(closest-side, ${tab.tint ?? "#7aa2ff"}22, transparent)` }}
        />
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={tab.id}
            id={`${uid}-panel`}
            role="tabpanel"
            aria-labelledby={`${uid}-${tab.id}`}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 * dir, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40 * dir, filter: "blur(6px)" }}
            transition={{ duration: reduce ? 0.1 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex flex-col gap-4"
          >
            {tab.blurb && <p className="max-w-[70ch] text-sm text-muted-foreground">{tab.blurb}</p>}
            {tab.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
