"use client"

import { AlertCircleIcon, SparklesIcon } from "lucide-react"
import { useSession } from "@/lib/store"
import { useAiStatus, type AiJob, type AiRequestError } from "@/lib/ai-client"
import { cn } from "@/lib/utils"

/*
 * Small pieces shared by the AI assist components: the "AI suggestion" label, the error line, a word-level
 * diff for previews, and the gate that decides whether a member-facing AI control renders at all.
 */

/**
 * True when AI is configured (for `job`, when given, or any job) and a member is signed in. Member-facing
 * controls render nothing otherwise.
 */
export function useAiReady(job?: AiJob) {
  const status = useAiStatus()
  const { user } = useSession()
  const enabled = status.enabled && (!job || status.jobs[job] === true)
  return { ready: status.ready, usable: enabled && Boolean(user), enabled }
}

/** Marks text as machine-written and editable. Always shown next to AI output. */
export function AiLabel({ children = "AI suggestion. Check it and edit before using it.", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <SparklesIcon aria-hidden className="size-3.5 text-ion" />
      {children}
    </p>
  )
}

export function AiErrorText({ error, className }: { error: AiRequestError | Error; className?: string }) {
  const code = "code" in error ? error.code : undefined
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-sm", code === "rate_limited" ? "text-gold" : "text-destructive", className)}>
      <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{error.message}</span>
    </p>
  )
}

/** A quiet three-line placeholder while the AI works. Static under reduced motion. */
export function AiLoading({ label = "Working on it…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {[92, 78, 54].map((w) => (
        <span key={w} style={{ width: `${w}%` }} className="h-3 rounded-full bg-muted motion-safe:animate-pulse" />
      ))}
      <span aria-hidden className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export type DiffPart = { kind: "same" | "add" | "del"; text: string }

/** Word-level diff (LCS). Falls back to "all removed, all added" for very long texts to stay fast. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean)
  const b = after.split(/(\s+)/).filter(Boolean)
  if (a.length * b.length > 400_000) return [{ kind: "del", text: before }, { kind: "add", text: after }]
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * cols + j] = a[i] === b[j] ? dp[(i + 1) * cols + j + 1] + 1 : Math.max(dp[(i + 1) * cols + j], dp[i * cols + j + 1])
    }
  }
  const out: DiffPart[] = []
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i])
      i++
      j++
    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) push("del", a[i++])
    else push("add", b[j++])
  }
  while (i < a.length) push("del", a[i++])
  while (j < b.length) push("add", b[j++])
  return out
}

/** Renders a diff with removed words struck through and added words highlighted. */
export function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const parts = wordDiff(before, after)
  return (
    <div className={cn("text-sm leading-relaxed whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === "add" ? (
          <ins key={i} className="rounded-sm bg-ion/15 text-foreground no-underline decoration-ion">
            <span className="sr-only">[added: </span>
            {p.text}
            <span className="sr-only">]</span>
          </ins>
        ) : (
          <del key={i} className="text-muted-foreground line-through decoration-destructive/70">
            <span className="sr-only">[removed: </span>
            {p.text}
            <span className="sr-only">]</span>
          </del>
        )
      )}
    </div>
  )
}
