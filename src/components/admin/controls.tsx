"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { createContext, use } from "react"
import { createPortal } from "react-dom"
import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * Small building blocks for the admin panel: a switch, a set of choice cards, a notice and a status line.
 * The switch is Base UI's (keyboard and screen reader behaviour included); the rest are styled native elements.
 */

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-input bg-white/[0.06] p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:border-ion/60 data-checked:bg-ion data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4.5 rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-(--ease-out) data-checked:translate-x-4 data-checked:bg-ion-foreground" />
    </SwitchPrimitive.Root>
  )
}

/** A labelled switch row: the label and its explanation on the left, the switch on the right. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string
  label: string
  description?: React.ReactNode
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} id={`${id}-label`} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined} className="mt-0.5" />
    </div>
  )
}

/** One-of-several choice as cards, with real radio inputs underneath for the keyboard and screen readers. */
export function ChoiceCards<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  columns = 3,
  swatch,
}: {
  name: string
  label: string
  value: T
  options: { id: T; label: string; blurb?: string }[]
  onChange: (v: T) => void
  columns?: 2 | 3 | 5
  swatch?: (id: T) => string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className={cn("grid grid-cols-1 gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3", columns === 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
        {options.map((o) => {
          const on = value === o.id
          return (
            <label
              key={o.id}
              className={cn(
                "pressable flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
              )}
            >
              <input type="radio" name={name} value={o.id} checked={on} onChange={() => onChange(o.id)} className="sr-only" />
              <span className="flex items-center gap-2 font-medium">
                {swatch && <span aria-hidden className="size-4 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: swatch(o.id) }} />}
                {o.label}
                {on && <CircleCheckIcon aria-hidden className="ml-auto size-4 text-ion" />}
              </span>
              {o.blurb && <span className="text-xs text-muted-foreground">{o.blurb}</span>}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** A calm box for things the admin should know: not connected, not set up yet, read only. */
export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn"; title: string; children?: React.ReactNode; className?: string }) {
  const Icon = tone === "warn" ? CircleAlertIcon : InfoIcon
  return (
    <div role="note" className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", tone === "warn" ? "border-gold/30 bg-gold/[0.06]" : "border-ion/25 bg-ion/[0.06]", className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-gold" : "text-ion")} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}

/** The result of the last action, read out by screen readers. */
export function StatusLine({ status, className }: { status: { ok: boolean; text: string } | null; className?: string }) {
  return (
    <p role="status" aria-live="polite" className={cn("text-sm", status ? (status.ok ? "text-ok" : "text-destructive") : "sr-only", className)}>
      {status && (status.ok ? <CircleCheckIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px]" /> : <CircleAlertIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px]" />)}
      {status?.text}
    </p>
  )
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function when(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  if (d === 1) return "yesterday"
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * What the admin frame already shows for the open page: its titles (so a page's own top heading is folded
 * away instead of repeating them) and the slot in the title row where that heading's buttons go.
 */
export const AdminFrameContext = createContext<{ covers: ReadonlySet<string>; actions: HTMLElement | null } | null>(null)

/** The bar under a form that stays in reach while it scrolls: what changed, Discard and Save. */
export function SaveBar({
  dirty,
  busy,
  status,
  disabled,
  onDiscard,
  children,
}: {
  dirty: boolean
  busy: boolean
  status: { ok: boolean; text: string } | null
  /** Saving cannot work here (no database, no permission). */
  disabled?: boolean
  onDiscard: () => void
  /** Extra buttons before Discard, such as "Reset to defaults". */
  children?: React.ReactNode
}) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-popover/95 py-2 pr-2 pl-4 backdrop-blur-sm">
      <div className="min-w-0 flex-1">{status ? <StatusLine status={status} /> : <p className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : "No changes"}</p>}</div>
      <div className="ml-auto flex flex-wrap justify-end gap-1.5">
        {children}
        <Button type="button" variant="ghost" size="sm" disabled={!dirty || busy} onClick={onDiscard}>
          Discard
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || busy || disabled}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  )
}

/**
 * A section heading inside an admin page. When the frame's title row already names the page, the heading
 * is not repeated: its buttons move up into the title row and its long explanation is left out.
 */
export function AdminHeading({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  const frame = use(AdminFrameContext)
  if (frame?.covers.has(title.toLowerCase())) {
    if (!children || !frame.actions) return null
    return createPortal(<div className="flex flex-wrap items-center gap-2">{children}</div>, frame.actions)
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        {lead && <p className="max-w-[68ch] text-sm text-muted-foreground">{lead}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
