"use client"

import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from "lucide-react"
import { ICON_NAMES, NamedIcon, type IconName } from "@/components/site/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ACCENTS, type CategoryAccent } from "@/lib/forum-categories"
import { cn } from "@/lib/utils"

/*
 * Small editing controls the CMS screens share (forum, chat, pages, menus): move up and down, an icon picker
 * from the site's allow-list, an accent picker, and a select styled like the inputs.
 */

/** Up and down buttons for one item in an ordered list. Labels say what moves. */
export function MoveButtons({ index, count, label, onMove, disabled }: { index: number; count: number; label: string; onMove: (by: -1 | 1) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`Move ${label} up`} onClick={() => onMove(-1)}>
        <ArrowUpIcon aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === count - 1} aria-label={`Move ${label} down`} onClick={() => onMove(1)}>
        <ArrowDownIcon aria-hidden />
      </Button>
    </span>
  )
}

/** Returns a copy of the list with item i moved by one place. */
export function moved<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** A searchable grid of icons. */
export function IconPicker({ value, onChange, names = ICON_NAMES, label = "Icon" }: { value: string; onChange: (name: IconName) => void; names?: IconName[]; label?: string }) {
  const [q, setQ] = useState("")
  const shown = names.filter((n) => n.includes(q.trim().toLowerCase()))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter icons" aria-label="Filter icons" className="h-8 bg-background/60 text-sm" />
      <div role="radiogroup" aria-label={label} className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-border bg-background/40 p-1.5 sm:grid-cols-10">
        {shown.map((n) => {
          const on = value === n
          return (
            <label
              key={n}
              title={n}
              className={cn(
                "grid aspect-square cursor-pointer place-items-center rounded-md transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                on ? "bg-ion/15 text-ion ring-1 ring-ion/50" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              )}
            >
              <input type="radio" name={`icon-${label}`} value={n} checked={on} onChange={() => onChange(n)} className="sr-only" aria-label={n} />
              <NamedIcon name={n} className="size-4" />
            </label>
          )
        })}
        {!shown.length && <p className="col-span-full p-2 text-xs text-muted-foreground">No icon matches “{q}”.</p>}
      </div>
    </fieldset>
  )
}

/** The six site accents as swatches. */
export function AccentPicker({ value, onChange }: { value: CategoryAccent; onChange: (a: CategoryAccent) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Colour</legend>
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => {
          const on = value === a.id
          return (
            <label key={a.id} title={a.label} className="relative grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-background has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <input type="radio" name="accent" value={a.id} checked={on} onChange={() => onChange(a.id)} className="sr-only" aria-label={a.label} />
              <span aria-hidden className={cn("size-6 rounded-full ring-1 ring-white/20", a.dot, on && "ring-2 ring-white")} />
              {on && <CheckIcon aria-hidden className="absolute size-3.5 text-background" />}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select {...props} className={cn("h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} />
}

/** "my-new-page" from "My new page!". */
export const toSlug = (s: string, max = 40) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
