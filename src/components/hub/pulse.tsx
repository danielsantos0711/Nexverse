"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { PersonAvatar } from "@/components/hub/bits"
import { getPerson } from "@/lib/data"

export type PulseEvent = { who: string; verb: string; what: string; href: string }

/**
 * The community's heartbeat: what people are doing, a new event every few seconds. Shows a fixed
 * window of the sample events so the list never jumps in height.
 */
export function Pulse({ events, size = 6 }: { events: PulseEvent[]; size?: number }) {
  const [start, setStart] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setStart((s) => (s + 1) % events.length), 3200)
    return () => clearInterval(id)
  }, [events.length, reduce])
  const visible = Array.from({ length: Math.min(size, events.length) }, (_, i) => ({ e: events[(start + i) % events.length], k: (start + i) % events.length }))
  const seconds = [4, 19, 41, 58, 73, 96, 120, 150]

  return (
    <ol aria-live="off" className="relative flex flex-col gap-1">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map(({ e, k }, i) => (
          <motion.li
            key={k}
            layout
            initial={{ opacity: 0, transform: "translateY(-12px) scale(0.98)" }}
            animate={{ opacity: 1 - i * 0.1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
            transition={{ type: "spring", bounce: 0.1, duration: 0.6 }}
            className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
          >
            <PersonAvatar handle={e.who} size={26} />
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{getPerson(e.who)?.name ?? e.who}</span> <span className="text-muted-foreground">{e.verb}</span>{" "}
              <Link href={e.href} className="text-ion hover:underline">
                {e.what}
              </Link>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground tabular">{i === 0 ? "now" : `${seconds[i]}s`}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
