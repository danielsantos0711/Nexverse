"use client"

import { AnimatePresence, motion } from "motion/react"
import { useId, useState } from "react"
import { cn } from "@/lib/utils"

/** Underlined tabs whose indicator slides; the panel cross-fades. Panels are rendered on the server. */
export function MotionTabs({ tabs, className }: { tabs: { id: string; label: string; count?: number; content: React.ReactNode }[]; className?: string }) {
  const [current, setCurrent] = useState(tabs[0].id)
  const uid = useId()
  const tab = tabs.find((t) => t.id === current) ?? tabs[0]
  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const on = t.id === current
          return (
            <button
              key={t.id}
              role="tab"
              id={`${uid}-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              onClick={() => setCurrent(t.id)}
              className={cn("relative shrink-0 px-3 py-2.5 text-sm transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-xs tabular">{t.count}</span>}
              {on && <motion.span layoutId={`${uid}-bar`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ion" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
            </button>
          )
        })}
      </div>
      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab.id}`} className="pt-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab.id}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-4px)" }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {tab.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
