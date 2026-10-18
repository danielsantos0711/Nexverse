"use client"

import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { KIND_ICONS } from "@/components/hub/bits"
import { ResourceCard } from "@/components/hub/cards"
import { KINDS, type Resource, type ResourceKind } from "@/lib/data"
import { cn } from "@/lib/utils"

/** Trending this week, one tab per kind of resource; the active pill slides between tabs. */
export function TrendingTabs({ lists }: { lists: Record<ResourceKind, Resource[]> }) {
  const [kind, setKind] = useState<ResourceKind>("model")
  const kinds = Object.keys(KINDS) as ResourceKind[]
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Trending by kind" className="glass flex max-w-full self-start overflow-x-auto rounded-full p-1">
        {kinds.map((k) => {
          const Icon = KIND_ICONS[k]
          const on = k === kind
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              aria-controls="trending-panel"
              onClick={() => setKind(k)}
              className={cn("relative rounded-full px-3.5 py-1.5 text-sm transition-colors", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {on && <motion.span layoutId="trend-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", bounce: 0.18, duration: 0.5 }} />}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon aria-hidden className="size-3.5" />
                {KINDS[k].plural}
              </span>
            </button>
          )
        })}
      </div>
      <div id="trending-panel" role="tabpanel" className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.ol
            key={kind}
            initial={{ opacity: 0, filter: "blur(6px)", transform: "translateY(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="grid gap-2.5 md:grid-cols-2"
          >
            {lists[kind].map((r, i) => (
              <li key={r.slug}>
                <ResourceCard r={r} rank={i + 1} />
              </li>
            ))}
          </motion.ol>
        </AnimatePresence>
      </div>
    </div>
  )
}
