"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ListCollapseIcon, SparklesIcon, XIcon } from "lucide-react"
import { AiErrorText, AiLabel, AiLoading, useAiReady } from "@/components/ai/ai-bits"
import { Button } from "@/components/ui/button"
import { ai, type ThreadSummaryResult } from "@/lib/ai-client"
import { cn } from "@/lib/utils"

/*
 * "Catch me up" for long threads: summarizes on demand (never automatically, each run spends the member's
 * daily allowance) and keeps the result in sessionStorage per thread and post count, so reopening the thread
 * in this tab shows it again for free. A new reply means a new summary. Renders nothing when AI is off.
 */

const KEY = "nexverse.ai.summary."

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
  className,
}: {
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

  useEffect(() => () => abort.current?.abort(), [])

  if (!usable || posts.length < minPosts) return null

  async function run() {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setShown(cacheKey)
    setDismissed(null)
    setBusy(true)
    setError(null)
    try {
      const r = await ai.threadSummary({ title, posts }, ctrl.signal)
      setFresh({ key: cacheKey, data: r.data })
      writeCache(cacheKey, r.data)
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={summary ? () => setDismissed(null) : run} className={className}>
        <ListCollapseIcon aria-hidden data-icon="inline-start" className="text-ion" />
        {summary ? "Show the summary" : "Summarize this thread"}
      </Button>
    )
  }

  return (
    <section aria-label="Thread summary" className={cn("flex flex-col gap-3 rounded-xl border border-ion/25 bg-ion/5 p-4", className)}>
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
      {busy && <AiLoading label="Reading the thread…" />}
      {error && !busy && (
        <div className="flex flex-wrap items-center gap-3">
          <AiErrorText error={error} />
          <Button type="button" variant="ghost" size="xs" onClick={run}>
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
          <AiLabel>{`AI summary of ${summary.postsRead} posts. It can miss nuance, so read the posts before replying.`}</AiLabel>
        </>
      )}
    </section>
  )
}
