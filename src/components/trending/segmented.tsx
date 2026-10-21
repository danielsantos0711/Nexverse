"use client"

import { motion } from "motion/react"
import { useId } from "react"
import { cn } from "@/lib/utils"

/** A row of choices with a pill that glides to the chosen one. Arrow keys move between choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
  label: string
  className?: string
  size?: "sm" | "md"
}) {
  const uid = useId()
  function key(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]
    onChange(next.value)
    ;(e.currentTarget.parentElement?.querySelectorAll("button")[options.indexOf(next)] as HTMLButtonElement | undefined)?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex shrink-0 items-center rounded-full border border-border bg-card/60 p-0.5", className)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => key(e, i)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {on && <motion.span layoutId={`${uid}-pill`} className="absolute inset-0 rounded-full bg-white/[0.09] ring-1 ring-white/15" transition={{ type: "spring", bounce: 0.18, duration: 0.4 }} />}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
