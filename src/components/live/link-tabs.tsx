"use client"

import Link, { useLinkStatus } from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useId } from "react"
import { cn } from "@/lib/utils"

export type LinkTab = { id: string; label: string; href: string; title?: string }

/** A small spinner shown inside the tab being opened, without shifting the layout. */
function Pending() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 shrink-0 rounded-full border-2 border-current border-t-transparent opacity-0 transition-opacity motion-safe:animate-spin",
        pending && "opacity-70"
      )}
    />
  )
}

/**
 * Glass pill tabs that are links (each tab has its own address, so it can be shared and bookmarked). The
 * active pill slides between tabs; with reduced motion it jumps.
 */
export function LinkTabs({ tabs, current, label, className }: { tabs: LinkTab[]; current: string; label: string; className?: string }) {
  const reduce = useReducedMotion()
  const uid = useId()
  return (
    <nav aria-label={label} className={cn("glass flex max-w-full self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none]", className)}>
      <ul className="flex">
        {tabs.map((t) => {
          const on = t.id === current
          return (
            <li key={t.id} className="shrink-0">
              <Link
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                title={t.title}
                className={cn(
                  "relative inline-flex rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`${uid}-pill`}
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.5 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {t.label}
                  <Pending />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
