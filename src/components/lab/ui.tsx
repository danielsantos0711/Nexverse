"use client"

import { NumberField } from "@base-ui/react/number-field"
import { Slider } from "@base-ui/react/slider"
import { Switch } from "@base-ui/react/switch"
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, MinusIcon, PlusIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export const EASE = [0.23, 1, 0.32, 1] as const

/* ------------------------------------------------------------------ hooks */

const noopSubscribe = () => () => {}
/** False on the server and during hydration, true after. Gate anything that reads browser-only state. */
export const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/* ------------------------------------------------------------- formatting */

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en")

export function fmtGB(gb: number) {
  if (!Number.isFinite(gb)) return "∞"
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`
  if (gb >= 100) return `${gb.toFixed(0)} GB`
  if (gb >= 10) return `${gb.toFixed(1)} GB`
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  return `${Math.max(0, gb * 1000).toFixed(0)} MB`
}

export function fmtCompact(n: number) {
  if (!Number.isFinite(n)) return "∞"
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`
  return fmtInt(n)
}

/* --------------------------------------------------------- animated number */

/**
 * A number that glides to its new value. The text is written through a motion value, so the
 * component does not re-render per frame. With reduced motion it jumps straight to the value.
 */
export function AnimatedNumber({
  value,
  format = fmtInt,
  className,
}: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, { stiffness: 170, damping: 26, mass: 0.6 })
  const display = useMotionValue(format(value))
  const fmt = useRef(format)

  useEffect(() => {
    fmt.current = format
    display.set(format(spring.get()))
  }, [format, display, spring])

  useEffect(() => spring.on("change", (v) => display.set(fmt.current(v))), [spring, display])

  useEffect(() => {
    if (reduce || !Number.isFinite(value)) spring.jump(Number.isFinite(value) ? value : 0)
    else spring.set(value)
    if (!Number.isFinite(value)) display.set(format(value))
  }, [value, reduce, spring, display, format])

  return <motion.span className={cn("tabular", className)}>{display}</motion.span>
}

/* ---------------------------------------------------------------- panels */

export function Panel({
  title,
  description,
  actions,
  className,
  children,
  as: Tag = "section",
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
  as?: "section" | "div"
}) {
  return (
    <Tag className={cn("relative rounded-2xl border border-border bg-card/60 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="text-[15px] font-medium tracking-normal">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

export function FieldLabelText({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground/90">
        {children}
      </label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/* ------------------------------------------------------------- segmented */

export type SegmentOption<T extends string> = { value: T; label: React.ReactNode; hint?: string }

/** A single-choice control with a pill that slides to the chosen option. Arrow keys move between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  itemClassName,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  /** Accessible name for the group. */
  label: string
  className?: string
  itemClassName?: string
}) {
  const id = useId()
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => {
        const next = v[v.length - 1]
        if (next !== undefined) onChange(next as T)
      }}
      className={cn("flex w-full flex-wrap gap-1 rounded-xl border border-border bg-black/25 p-1", className)}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            title={o.hint}
            className={cn(
              "relative h-8 min-w-0 flex-1 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground aria-pressed:bg-transparent aria-pressed:text-foreground",
              itemClassName
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-lg bg-white/[0.09] shadow-[0_1px_8px_rgb(0_0_0/0.35)] ring-1 ring-white/15"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative truncate">{o.label}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

/* ------------------------------------------------------------ number input */

const stepper =
  "flex w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors outline-none select-none hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.08] focus-visible:text-foreground active:bg-white/10 data-disabled:opacity-40"

/**
 * A number field with steppers. Drag the label sideways to scrub the value; arrow keys step, Shift steps by ten.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  smallStep,
  largeStep,
  suffix,
  hint,
  format,
  className,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  smallStep?: number
  largeStep?: number
  suffix?: string
  hint?: React.ReactNode
  format?: Intl.NumberFormatOptions
  className?: string
}) {
  const id = useId()
  return (
    <NumberField.Root
      id={id}
      value={value}
      onValueChange={(v) => v != null && Number.isFinite(v) && onChange(v)}
      min={min}
      max={max}
      step={step}
      smallStep={smallStep ?? step / 10}
      largeStep={largeStep ?? step * 10}
      locale="en"
      format={format ?? { maximumFractionDigits: 3 }}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <NumberField.ScrubArea className="cursor-ew-resize">
          <label htmlFor={id} className="cursor-ew-resize text-sm font-medium text-foreground/90 select-none">
            {label}
          </label>
        </NumberField.ScrubArea>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <NumberField.Group className="flex h-9 items-stretch overflow-hidden rounded-lg border border-input bg-input/30 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <NumberField.Decrement aria-label={`Decrease ${label}`} className={cn(stepper, "border-r border-border")}>
          <MinusIcon aria-hidden className="size-3.5" />
        </NumberField.Decrement>
        <div className="flex min-w-0 flex-1 items-center">
          <NumberField.Input className="h-full w-full min-w-0 bg-transparent px-2 text-center text-base tabular outline-none md:text-sm" />
          {suffix && <span className="pr-2 text-xs text-muted-foreground">{suffix}</span>}
        </div>
        <NumberField.Increment aria-label={`Increase ${label}`} className={cn(stepper, "border-l border-border")}>
          <PlusIcon aria-hidden className="size-3.5" />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  )
}

/* ---------------------------------------------------------------- slider */

export function RangeSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  valueText,
  className,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  valueText?: (v: number) => string
  className?: string
}) {
  return (
    <Slider.Root
      value={value}
      onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      min={min}
      max={max}
      step={step}
      locale="en"
      className={cn("w-full", className)}
    >
      <Slider.Control className="flex w-full touch-none items-center py-3 select-none">
        <Slider.Track className="h-1.5 w-full rounded-full bg-white/[0.08]">
          <Slider.Indicator className="rounded-full bg-[linear-gradient(90deg,rgb(143_180_255/0.35),var(--ion))]" />
          <Slider.Thumb
            aria-label={label}
            getAriaValueText={valueText ? (_f, v) => valueText(v) : undefined}
            className="size-[18px] rounded-full bg-white shadow-[0_2px_10px_rgb(0_0_0/0.5)] ring-4 ring-ion/20 transition-[box-shadow,scale] duration-150 outline-none select-none has-[:focus-visible]:ring-ion/60 data-dragging:scale-110 data-dragging:ring-ion/40 motion-reduce:transition-none"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

/* ---------------------------------------------------------------- switch */

export function SwitchRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground/90">
          {label}
        </label>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v)}
        className="relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-white/10 bg-white/10 p-0.5 transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-ion/40 data-checked:bg-ion/70"
      >
        <Switch.Thumb className="size-[18px] rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-transform duration-200 ease-[var(--ease-out)] data-checked:translate-x-4 motion-reduce:transition-none" />
      </Switch.Root>
    </div>
  )
}

/* ---------------------------------------------------------------- select */

export function NativeSelect({
  id,
  value,
  onChange,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
  "aria-label"?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-input bg-input/30 pr-8 pl-3 text-base text-foreground transition-colors outline-none hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [&>optgroup]:bg-popover [&>option]:bg-popover"
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/* --------------------------------------------------------------- actions */

const actionBtn =
  "pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 text-sm text-foreground/90 transition-colors outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"

export function ActionButton({ className, ...props }: React.ComponentProps<"button">) {
  return <button type="button" className={cn(actionBtn, className)} {...props} />
}

/** Copies text, with a brief tick and a polite announcement for screen readers. */
export function CopyAction({ text, label = "Copy", doneLabel = "Copied", className }: { text: string | (() => string); label?: string; doneLabel?: string; className?: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <>
      <ActionButton
        className={className}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(typeof text === "function" ? text() : text)
            setDone(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setDone(false), 1600)
          } catch {}
        }}
      >
        {done ? <CheckIcon aria-hidden className="size-3.5 text-ok" /> : <CopyIcon aria-hidden className="size-3.5" />}
        {done ? doneLabel : label}
      </ActionButton>
      <span role="status" className="sr-only">
        {done ? doneLabel : ""}
      </span>
    </>
  )
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DownloadAction({ filename, text, label = "Download .md", className }: { filename: string; text: string | (() => string); label?: string; className?: string }) {
  return (
    <ActionButton className={className} onClick={() => downloadText(filename, typeof text === "function" ? text() : text)}>
      <DownloadIcon aria-hidden className="size-3.5" />
      {label}
    </ActionButton>
  )
}

/* -------------------------------------------------------------- skeleton */

export function ToolSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-2xl border border-border bg-card/40 motion-reduce:animate-none" />
      ))}
    </div>
  )
}

/** A thin animated meter, for completeness and shares. */
export function Meter({ value, label, className, tone = "ion" }: { value: number; label: string; className?: string; tone?: "ion" | "ok" | "gold" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)] motion-reduce:transition-none",
          tone === "ion" && "bg-[linear-gradient(90deg,rgb(143_180_255/0.5),var(--ion))]",
          tone === "ok" && "bg-[linear-gradient(90deg,rgb(127_224_176/0.5),var(--ok))]",
          tone === "gold" && "bg-[linear-gradient(90deg,rgb(216_197_158/0.5),var(--gold))]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
