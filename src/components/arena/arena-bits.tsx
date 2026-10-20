"use client"

import { Fragment, useSyncExternalStore } from "react"
import { BrainIcon, Code2Icon, LanguagesIcon, MessageSquareIcon, PenLineIcon, type LucideIcon } from "lucide-react"
import { LANGUAGES, type LanguageCode } from "@/lib/data"
import { type DuelTask } from "@/lib/arena"
import { useDuelTasks, useLanguages } from "@/lib/lists/hooks"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/*
 * Small pieces shared by the arena pages. Chart colours follow the dataviz method: A and B are a blue and an
 * amber validated against the card surface (CVD ΔE 28); "tie" and "both bad" are neutral greys, and every
 * colour always sits beside a text label.
 */

export const SIDE_COLOR = { a: "#5b8ff0", b: "#c98500", tie: "#6b7385", bad: "#3d4352" } as const

export const TASK_ICON: Record<DuelTask, LucideIcon> = {
  code: Code2Icon,
  writing: PenLineIcon,
  reasoning: BrainIcon,
  translation: LanguagesIcon,
  other: MessageSquareIcon,
}

export function TaskBadge({ task, className }: { task: DuelTask; className?: string }) {
  const DUEL_TASKS = useDuelTasks()
  const Icon = TASK_ICON[task]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.03] px-2 py-0.5 text-xs text-muted-foreground", className)}>
      <Icon aria-hidden className="size-3" />
      {DUEL_TASKS[task].label}
    </span>
  )
}

export function LangList({ langs, className }: { langs: LanguageCode[]; className?: string }) {
  const langNames = useLanguages()
  return (
    <span className={cn("text-xs text-muted-foreground", className)} title={langs.map((l) => langNames[l]?.name ?? LANGUAGES[l]?.name ?? l).join(", ")}>
      {langs.map((l) => langNames[l]?.name ?? LANGUAGES[l]?.name ?? l).join(" · ")}
    </span>
  )
}

// ─── Output text ────────────────────────────────────────────────────────────────────────────────────────────

/** A model's answer: paragraphs with **bold** and `code`, and fenced code blocks. Never parsed as HTML. */
export function OutputText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/```[\w+-]*\n?([\s\S]*?)```/g)
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed break-words", className)}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="overflow-x-auto rounded-lg border border-border bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed">
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          part
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => (
              <p key={`${i}-${j}`} className="whitespace-pre-wrap">
                <Inline text={p.trim()} />
              </p>
            ))
        )
      )}
    </div>
  )
}

function Inline({ text }: { text: string }) {
  const bits = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {bits.map((b, i) =>
        b.startsWith("`") && b.endsWith("`") && b.length > 2 ? (
          <code key={i} className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.9em]">
            {b.slice(1, -1)}
          </code>
        ) : b.startsWith("**") && b.endsWith("**") && b.length > 4 ? (
          <strong key={i} className="font-semibold text-foreground">
            {b.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{b}</Fragment>
        )
      )}
    </>
  )
}

// ─── Sparkline ──────────────────────────────────────────────────────────────────────────────────────────────

/** A rating's recent path: one 2px line and an end dot, no axes (the number beside it carries the value). */
export function Sparkline({ values, width = 96, height = 28, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) {
    return (
      <span className={cn("inline-block text-xs text-muted-foreground", className)} style={{ width }}>
        <Copy k="arena.arena-bits.too-few-votes">Too few votes</Copy>
      </span>
    )
  }
  const pad = 4
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, 8)
  const mid = (hi + lo) / 2
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => height / 2 - ((v - mid) / span) * (height - pad * 2)
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")
  const last = values[values.length - 1]
  const first = values[0]
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Rating went from ${first} to ${last} over the last ${values.length} votes`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <path d={d} fill="none" stroke={SIDE_COLOR.a} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={3.5} fill={SIDE_COLOR.a} stroke="var(--card)" strokeWidth={2} />
    </svg>
  )
}

// ─── Per-session display order ──────────────────────────────────────────────────────────────────────────────

const SALT_KEY = "nexverse-arena-salt"
let salt: string | null = null
const noop = () => () => {}

function readSalt() {
  if (salt) return salt
  try {
    salt = sessionStorage.getItem(SALT_KEY)
    if (!salt) {
      salt = Math.random().toString(36).slice(2)
      sessionStorage.setItem(SALT_KEY, salt)
    }
  } catch {
    salt ??= Math.random().toString(36).slice(2)
  }
  return salt
}

/** A random string for this browser session (null on the server), which decides which output shows as A. */
export function useArenaSalt() {
  return useSyncExternalStore(noop, readSalt, () => null)
}

/** True when a key press is meant for a text field or comes with a modifier, so shortcuts should ignore it. */
export function typingTarget(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return true
  const t = e.target as HTMLElement | null
  return Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
}
