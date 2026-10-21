"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import type { Route } from "next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon, GlobeIcon, RotateCcwIcon, SquareIcon, ThumbsDownIcon, ThumbsUpIcon, XIcon } from "lucide-react"
import { AiErrorText } from "@/components/ai/ai-bits"
import { Orb, type OrbState } from "@/components/assistant/orb"
import { toast } from "@/components/site/toaster"
import { sendFeedback, streamAi, type AiSource, type StreamDone } from "@/lib/ai/client"
import { cn } from "@/lib/utils"

/*
 * The streamed AI answer: the one look every inline AI moment shares (search answers, Lab explanations, model and
 * dataset explanations, drafts). While the model thinks, the HorizonX Assistant Pill's plasma orb swirls and a
 * band of Siri Wave runs behind the header; then the answer writes itself in, with [n] citations that become
 * links to the Nexverse items they cite once the answer is complete. Under it: sources as chips (Nexverse first,
 * then any web pages), Regenerate, Copy, Stop while writing, and "Was this useful?" (stored per member).
 * Every answer is labelled as AI output with the model that wrote it.
 */

const SiriWave = dynamic(() => import("@/components/assistant/siri-wave"), { ssr: false })

export type StreamPhase = "idle" | "thinking" | "writing" | "done" | "error"

/** One streamed AI request: its text as it arrives, the final details, and run/stop. Cancelled on unmount. */
export function useAiStream() {
  const [phase, setPhase] = useState<StreamPhase>("idle")
  const [text, setText] = useState("")
  const [done, setDone] = useState<StreamDone | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const buf = useRef("")
  const frame = useRef(0)
  useEffect(
    () => () => {
      ctrl.current?.abort()
      cancelAnimationFrame(frame.current)
    },
    []
  )

  const run = useCallback(async (body: Record<string, unknown>) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    buf.current = ""
    setText("")
    setDone(null)
    setError(null)
    setPhase("thinking")
    // Paint at most once a frame, however fast the tokens come.
    const flush = () => {
      frame.current = 0
      if (ctrl.current === c) setText(buf.current)
    }
    try {
      const d = await streamAi(
        body,
        {
          onText: (t) => {
            buf.current += t
            if (ctrl.current === c) setPhase("writing")
            if (!frame.current) frame.current = requestAnimationFrame(flush)
          },
          onReset: () => {
            buf.current = ""
            if (ctrl.current === c) setText("")
          },
        },
        c.signal
      )
      if (ctrl.current !== c) return
      cancelAnimationFrame(frame.current)
      frame.current = 0
      setText(buf.current)
      setDone(d)
      setPhase("done")
    } catch (e) {
      if ((e as Error).name === "AbortError" || ctrl.current !== c) return
      setError(e as Error)
      setPhase("error")
    }
  }, [])

  const stop = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
    setText(buf.current)
    setPhase(buf.current ? "done" : "idle")
  }, [])

  return { phase, text, done, error, run, stop, busy: phase === "thinking" || phase === "writing" }
}

// A small, safe Markdown renderer for AI answers: React elements only, never HTML.

type Cite = Record<string, AiSource>

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href
  try {
    const u = new URL(href)
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

function Inline({ text, cite }: { text: string; cite?: Cite }) {
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\](?!\()|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let k = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith("**")) out.push(<strong key={k++} className="font-semibold text-foreground">{t.slice(2, -2)}</strong>)
    else if (t.startsWith("`")) out.push(<code key={k++} className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>)
    else if (/^\[\d/.test(t)) {
      const n = t.slice(1, -1)
      const s = cite?.[n]
      out.push(
        s ? (
          <Link key={k++} href={s.url as Route} title={s.title} className="mx-0.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-ion/15 px-1 align-[0.15em] text-[10px] font-semibold text-ion no-underline transition-colors hover:bg-ion/25">
            {n}
          </Link>
        ) : (
          <span key={k++} className="mx-0.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-white/[0.08] px-1 align-[0.15em] text-[10px] font-semibold text-muted-foreground">
            {n}
          </span>
        )
      )
    } else {
      const mm = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      const href = mm ? safeHref(mm[2]) : null
      if (mm && href?.startsWith("/")) out.push(<Link key={k++} href={href as Route} className="text-ion underline-offset-4 hover:underline">{mm[1]}</Link>)
      else if (mm && href) out.push(<a key={k++} href={href} target="_blank" rel="noreferrer noopener" className="text-ion underline-offset-4 hover:underline">{mm[1]}</a>)
      else out.push(mm ? mm[1] : t)
    }
    last = m.index! + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/** Renders a streamed Markdown answer. Incomplete syntax at the end of a stream simply shows as text. */
export function AnswerText({ text, cite, className }: { text: string; cite?: Cite; className?: string }) {
  const blocks: React.ReactNode[] = []
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("```")) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[12.5px] leading-relaxed">
          <code>{code.join("\n")}</code>
        </pre>
      )
      continue
    }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) {
      blocks.push(
        <h4 key={k++} className="pt-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground">
          <Inline text={h[1]} cite={cite} />
        </h4>
      )
      i++
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""))
      const List = ordered ? "ol" : "ul"
      blocks.push(
        <List key={k++} className={cn("flex flex-col gap-1.5 pl-1", ordered && "list-decimal pl-5")}>
          {items.map((it, j) => (
            <li key={j} className={cn(!ordered && "flex gap-2")}>
              {!ordered && <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-ion" />}
              <span>
                <Inline text={it} cite={cite} />
              </span>
            </li>
          ))}
        </List>
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++])
    blocks.push(
      <p key={k++}>
        <Inline text={para.join(" ")} cite={cite} />
      </p>
    )
  }
  return <div className={cn("flex flex-col gap-2.5 text-sm leading-relaxed text-foreground/90", className)}>{blocks}</div>
}

/** Sources as chips: Nexverse items (kind label) first, then web pages (host name). */
export function SourceChips({ sources, className }: { sources: AiSource[]; className?: string }) {
  if (!sources.length) return null
  return (
    <ul aria-label="Sources" className={cn("flex flex-wrap gap-1.5", className)}>
      {sources.map((s, i) => {
        const internal = s.url.startsWith("/")
        const inner = (
          <>
            {internal ? (
              <span className="rounded-full bg-ion/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ion">{s.kind ?? "Nexverse"}</span>
            ) : (
              <GlobeIcon aria-hidden className="size-3 text-muted-foreground" />
            )}
            <span className="max-w-[16rem] truncate">{s.title}</span>
            {!internal && <span className="text-muted-foreground">{hostOf(s.url)}</span>}
          </>
        )
        const cls = "pressable inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/70 pr-2.5 pl-1.5 text-xs transition-colors hover:border-ion/40 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        return (
          <li key={s.url} className="nx-enter" style={{ "--i": i } as React.CSSProperties}>
            {internal ? (
              <Link href={s.url as Route} className={cls}>
                {inner}
              </Link>
            ) : (
              <a href={s.url} target="_blank" rel="noreferrer noopener" className={cls}>
                {inner}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** "Was this useful?" with a thumbs pair. One vote per member and answer; voting again changes it. */
export function Feedback({ feature, target, model }: { feature: string; target: string; model?: string }) {
  const [vote, setVote] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  async function give(useful: boolean) {
    if (busy) return
    const before = vote
    setVote(useful)
    setBusy(true)
    try {
      await sendFeedback({ feature, target: target.slice(0, 200), useful, model })
      if (before === null) toast(useful ? "Thanks. Glad it helped." : "Thanks. That helps us pick better models.")
    } catch {
      setVote(before)
      toast("Could not save your feedback. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="group" aria-label="Was this useful?" className="flex items-center gap-1">
      <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">Useful?</span>
      {([true, false] as const).map((u) => {
        const Icon = u ? ThumbsUpIcon : ThumbsDownIcon
        const on = vote === u
        return (
          <button
            key={String(u)}
            type="button"
            aria-pressed={on}
            aria-label={u ? "Useful" : "Not useful"}
            onClick={() => void give(u)}
            className={cn(
              "pressable grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground",
              on && (u ? "bg-ion/15 text-ion" : "bg-destructive/15 text-destructive")
            )}
          >
            <motion.span key={String(on)} initial={on ? { scale: 0.6, rotate: u ? -12 : 12 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", duration: 0.35, bounce: 0.5 }} className="grid">
              <Icon aria-hidden className="size-3.5" />
            </motion.span>
          </button>
        )
      })}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="pressable inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
    >
      {copied ? <CheckIcon aria-hidden className="size-3.5 text-ion" /> : <CopyIcon aria-hidden className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

const STATUS: Record<StreamPhase, string> = { idle: "", thinking: "Thinking…", writing: "Writing…", done: "", error: "" }

/**
 * The answer card for one streamed AI moment. Give it the stream from `useAiStream()`; it renders the thinking
 * state, the streaming text, sources, actions and feedback. `actions` adds buttons that act on the final text
 * (for example "Insert" in an editor).
 */
export function AiAnswerCard({
  label,
  stream,
  onRegenerate,
  onClose,
  feature,
  target,
  note = "AI answer. Check the sources before relying on it.",
  actions,
  className,
}: {
  label: string
  stream: ReturnType<typeof useAiStream>
  onRegenerate: () => void
  onClose?: () => void
  feature: string
  target: string
  note?: string
  actions?: (text: string) => React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const { phase, text, done, error } = stream
  const orb: OrbState = phase === "thinking" ? "thinking" : phase === "writing" ? "answering" : phase === "error" ? "error" : "idle"
  const cite = (done?.extra?.cite as Cite | undefined) ?? undefined
  return (
    <motion.section
      aria-label={label}
      aria-busy={stream.busy || undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
      data-busy={phase === "thinking" ? "" : undefined}
      className={cn("ai-card flex flex-col gap-3 p-4", className)}
    >
      <span aria-hidden className="ai-pill-wave top-auto h-16">
        {phase === "thinking" && <SiriWave active speed={1.4} scale={1.1} exposure={0.75} />}
      </span>
      <header className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center">{stream.busy ? <Orb state={orb} open /> : <span aria-hidden className="apl-orb block size-7" />}</span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{label}</h3>
        <AnimatePresence mode="popLayout" initial={false}>
          {STATUS[phase] && (
            <motion.span key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-muted-foreground" role="status">
              {STATUS[phase]}
            </motion.span>
          )}
        </AnimatePresence>
        {stream.busy && (
          <button type="button" onClick={stream.stop} aria-label="Stop" className="pressable grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
            <SquareIcon aria-hidden className="size-3 fill-current" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="pressable grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
            <XIcon aria-hidden className="size-3.5" />
          </button>
        )}
      </header>

      {phase === "thinking" && (
        <div className="flex flex-col gap-2" aria-hidden>
          {[94, 78, 56].map((w, i) => (
            <span key={w} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} className="nx-skeleton h-3" />
          ))}
        </div>
      )}

      {text && (
        <div aria-live="polite" className="relative">
          <AnswerText text={text} cite={cite} />
          {phase === "writing" && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 rounded-sm bg-ion motion-safe:animate-pulse" />}
        </div>
      )}

      {error && phase === "error" && (
        <div className="flex flex-wrap items-center gap-3">
          <AiErrorText error={error} />
          <button type="button" onClick={onRegenerate} className="pressable inline-flex items-center gap-1 text-xs text-ion">
            <RotateCcwIcon aria-hidden className="size-3" /> Try again
          </button>
        </div>
      )}

      {phase === "done" && (
        <Fragment>
          {done?.sources && done.sources.length > 0 && <SourceChips sources={done.sources} />}
          <footer className="flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-white/[0.06] pt-2.5">
            <button type="button" onClick={onRegenerate} className="pressable inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <RotateCcwIcon aria-hidden className="size-3.5" /> Regenerate
            </button>
            {text && <CopyButton text={text} />}
            {text && actions?.(text)}
            <span className="flex-1" />
            {done && <Feedback feature={feature} target={target} model={done.model} />}
          </footer>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            {note}
            {done?.label ? ` · ${done.label}` : ""}
          </p>
        </Fragment>
      )}
    </motion.section>
  )
}
