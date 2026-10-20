"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

/*
 * Tabs on a strip of Liquid Glass with a glider that overshoots a little as it moves (adapted from HorizonX
 * "Glass Radio"; the glider is placed by transform, see .glass-tabs in globals.css). Keyboard: the arrow keys,
 * Home and End move between tabs, as the tabs pattern asks.
 */

export type GlassTab<V extends string> = { value: V; label: React.ReactNode; count?: number }

export function GlassTabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
  controls,
  className,
}: {
  tabs: GlassTab<V>[]
  value: V
  onChange: (v: V) => void
  /** What the tabs choose, for screen readers ("Period"). */
  label: string
  /** Id of the panel the tabs control. */
  controls?: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const i = Math.max(0, tabs.findIndex((t) => t.value === value))

  function onKey(e: React.KeyboardEvent, at: number) {
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null
    if (next === null) return
    e.preventDefault()
    const n = (next + tabs.length) % tabs.length
    onChange(tabs[n].value)
    refs.current[n]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cn("glass-tabs liquid-glass-pill overflow-x-auto [scrollbar-width:none]", className)} style={{ "--n": tabs.length, "--i": i } as React.CSSProperties}>
      <span aria-hidden className="glass-glider" />
      {tabs.map((t, at) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[at] = el
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, at)}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
