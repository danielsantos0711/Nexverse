"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useId, useState } from "react"
import { cn } from "@/lib/utils"

export type PillTab = { id: string; label: string; count?: number; icon?: React.ReactNode; content: React.ReactNode }

/** Glass pill tabs whose active pill slides (shared layoutId); panels are rendered on the server. */
export function PillTabs({ tabs, label, className }: { tabs: PillTab[]; label: string; className?: string }) {
  const [current, setCurrent] = useState(tabs[0]?.id)
  const reduce = useReducedMotion()
  const uid = useId()
  const tab = tabs.find((t) => t.id === current) ?? tabs[0]
  if (!tab) return null
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div role="tablist" aria-label={label} className="glass flex max-w-full self-start overflow-x-auto rounded-full p-1">
        {tabs.map((t) => {
          const on = t.id === tab.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${uid}-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              onClick={() => setCurrent(t.id)}
              className={cn("relative shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {on && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.5 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                {t.icon}
                {t.label}
                {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs tabular", on ? "bg-black/10" : "bg-secondary")}>{t.count}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab.id}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)", transform: "translateY(10px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: reduce ? 0.12 : 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            {tab.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
