"use client"

import { motion, useReducedMotion } from "motion/react"
import { CheckIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { KIND_ICONS } from "@/components/hub/bits"
import { categories, categoryGroups, KINDS, type ResourceKind } from "@/lib/data"
import { cn } from "@/lib/utils"

/** Toggle chips for interests: the four kinds of thing on the hub, then forum categories by group. */
export function InterestPicker({ value, onChange, max = 30 }: { value: string[]; onChange: (next: string[]) => void; max?: number }) {
  const full = value.length >= max
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : full ? value : [...value, id])

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">What you build or use</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
            const Icon = KIND_ICONS[k]
            return (
              <Chip key={k} on={value.includes(`kind:${k}`)} onClick={() => toggle(`kind:${k}`)} disabled={full}>
                <Icon aria-hidden className="size-4" /> {KINDS[k].plural}
              </Chip>
            )
          })}
        </div>
      </fieldset>
      {categoryGroups.map((g) => (
        <fieldset key={g.slug} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">{g.name}</legend>
          <div className="flex flex-wrap gap-2">
            {categories
              .filter((c) => c.group === g.slug)
              .map((c) => (
                <Chip key={c.slug} on={value.includes(`category:${c.slug}`)} onClick={() => toggle(`category:${c.slug}`)} disabled={full} title={c.blurb}>
                  <CategoryIcon name={c.icon} className="size-4" /> {c.name}
                </Chip>
              ))}
          </div>
        </fieldset>
      ))}
      {full && <p className="text-sm text-muted-foreground">That is {max}, the most you can pick. Remove one to choose another.</p>}
    </div>
  )
}

function Chip({ on, onClick, disabled, title, children }: { on: boolean; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled && !on}
      title={title}
      className={cn(
        "pressable inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
        on ? "border-ion/50 bg-ion/15 text-foreground" : "border-border bg-card/60 text-muted-foreground hover:border-white/15 hover:text-foreground"
      )}
    >
      {children}
      {on && (
        <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 520, damping: 22 }} className="inline-flex text-ion">
          <CheckIcon aria-hidden className="size-3.5" />
        </motion.span>
      )}
    </button>
  )
}
