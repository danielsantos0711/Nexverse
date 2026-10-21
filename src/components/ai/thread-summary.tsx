"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import { RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react"
import { Feedback } from "@/components/ai/ai-answer"
import { askAi } from "@/lib/ai/client"
import { AiErrorText, AiLabel, useAiReady } from "@/components/ai/ai-bits"
import { AiPill } from "@/components/ai/inline-ai"
import { Button } from "@/components/ui/button"
import type { ThreadSummaryResult as BaseSummary } from "@/lib/ai-client"

/** The round 11 summary adds open questions and the thread's consensus (older cached ones lack them). */
type ThreadSummaryResult = BaseSummary & { open?: string[]; consensus?: string }
import { cn } from "@/lib/utils"

/*
 * "Catch me up" for long threads: summarizes on demand (never automatically, each run spends the member's
 * daily allowance) and keeps the result in sessionStorage per thread and post count, so reopening the thread
 * in this tab shows it again for free. A new reply means a new summary. Renders nothing when AI is off.
 */

const KEY = "nexverse.ai.summary2."
const SiriWave = dynamic(() => import("@/components/assistant/siri-wave"), { ssr: false })

const cacheListeners = new Set<() => void>()

function subscribeCache(l: () => void) {
  cacheListeners.add(l)
  return () => cacheListeners.delete(l)
}

function readRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeCache(key: string, value: ThreadSummaryResult) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {}
  cacheListeners.forEach((l) => l())
}

function parse(raw: string | null): ThreadSummaryResult | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as ThreadSummaryResult
    return typeof v?.tldr === "string" && Array.isArray(v.points) ? v : null
  } catch {
    return null
  }
}

export function ThreadSummary({
  threadId,
  title,
  posts,
  minPosts = 4,
  accepted,
  className,
}: {
  /** The accepted answer's text, when the thread has one, so the summary leads with it. */
  accepted?: string
  threadId: string
  title: string
  /** The opening post first, then replies oldest first. Bodies as Markdown or plain text. */
  posts: { author: string; body: string }[]
  /** Hide the control on short threads, where a summary adds nothing. */
  minPosts?: number
  className?: string
}) {
  const { usable } = useAiReady("summary")
  const cacheKey = `${KEY}${threadId}.${posts.length}`
  // A summary made earlier in this tab for exactly this thread state, or one made just now.
  const raw = useSyncExternalStore(subscribeCache, () => readRaw(cacheKey), () => null)
  const cached = useMemo(() => parse(raw), [raw])
  const [fresh, setFresh] = useState<{ key: string; data: ThreadSummaryResult } | null>(null)
  const summary = fresh?.key === cacheKey ? fresh.data : cached
  const [shown, setShown] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const open = (shown === cacheKey || summary !== null) && dismissed !== cacheKey
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const [model, setModel] = useState("")

  useEffect(() => () => abort.current?.abort(), [])

  if (!usable || posts.length < minPosts) return null

  async function run(regenerate = false) {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setShown(cacheKey)
    setDismissed(null)
    setBusy(true)
    setError(null)
    try {
      const r = await askAi<ThreadSummaryResult>("thread-summary", { title, posts, accepted: accepted?.slice(0, 6000), regenerate }, ctrl.signal)
      setModel(r.model)
      setFresh({ key: cacheKey, data: r.data })
      writeCache(cacheKey, r.data)
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  if (!open) {
    return <AiPill label={summary ? "Show the summary" : "Summarise this thread"} onClick={summary ? () => setDismissed(null) : () => void run()} className={cn("self-start", className)} />
  }

  return (
    <section aria-label="Thread summary" data-busy={busy ? "" : undefined} className={cn("ai-card nx-enter flex flex-col gap-3 p-4", className)}>
      <span aria-hidden className="ai-pill-wave">{busy && <SiriWave active speed={1} scale={1.1} exposure={0.6} />}</span>
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium">
          <SparklesIcon aria-hidden className="size-4 text-ion" />
          Catch up
        </h2>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Hide summary" onClick={() => {
            setDismissed(cacheKey)
            setShown(null)
          }}>
          <XIcon aria-hidden />
        </Button>
      </div>
      {busy && (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Reading the thread…</span>
          {[92, 74, 50].map((w) => (
            <span key={w} style={{ width: `${w}%` }} className="nx-skeleton h-3" />
          ))}
        </div>
      )}
      {error && !busy && (
        <div className="flex flex-wrap items-center gap-3">
          <AiErrorText error={error} />
          <Button type="button" variant="ghost" size="xs" onClick={() => void run(true)}>
            Try again
          </Button>
        </div>
      )}
      {summary && !busy && (
        <>
          <p className="text-sm leading-relaxed">{summary.tldr}</p>
          {summary.points.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground marker:text-ion">
              {summary.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {summary.consensus && (
            <p className="rounded-xl border border-ion/20 bg-ion/[0.06] px-3 py-2 text-sm">
              <span className="font-medium text-ion">Where it landed. </span>
              {summary.consensus}
            </p>
          )}
          {summary.open && summary.open.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Still open</p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {summary.open.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-gold">?</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 border-t border-white/[0.06] pt-2">
            <button type="button" onClick={() => void run(true)} className="pressable inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <RotateCcwIcon aria-hidden className="size-3.5" /> Regenerate
            </button>
            <span className="flex-1" />
            <Feedback feature="thread-summary" target={threadId} model={model} />
          </div>
          <AiLabel>{`AI summary of ${summary.postsRead} posts. It can miss nuance, so read the posts before replying.`}</AiLabel>
        </>
      )}
    </section>
  )
}
