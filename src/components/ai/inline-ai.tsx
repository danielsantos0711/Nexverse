"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { CheckIcon, CornerDownLeftIcon, FileTextIcon, ListTreeIcon, PenLineIcon, RotateCcwIcon, SparklesIcon, WandSparklesIcon, XIcon } from "lucide-react"
import { AiErrorText, AiLabel, useAiReady } from "@/components/ai/ai-bits"
import { AiAnswerCard, Feedback, SourceChips, useAiStream } from "@/components/ai/ai-answer"
import { Orb } from "@/components/assistant/orb"
import { toast } from "@/components/site/toaster"
import { askAi, type AiSource } from "@/lib/ai/client"
import type { AiJob } from "@/lib/ai-client"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

/*
 * Inline AI helpers: small, on-demand AI right where it helps (no site chatbot). The trigger is a slim pill with
 * the HorizonX Assistant Pill's plasma orb on its left; while the model thinks, HorizonX Siri Wave runs behind
 * the label and the orb swirls. The orb's WebGL only runs during that moment: at rest it is the export's own CSS
 * sphere, so a page with several helpers holds no idle GPU work. Answers stream into a card labelled as AI
 * output, with sources, Regenerate, Copy and "Was this useful?".
 *
 *   <AiPill />            the trigger, for any helper
 *   <ExplainThis />       Lab tools: "Explain this result" (streamed, uses the member's actual numbers)
 *   <NewsTldr />          news stories: TL;DR, why it matters, related Nexverse coverage
 *   <SuggestTitleTags />  the forum composer: title and tags in the site's vocabulary, plus similar threads
 *   <SmartAnswer />       the command menu: an answer from Nexverse content with citations
 *   <ExplainItem />       model, dataset and project pages: what it is, uses, how to start, limits
 *   <DraftHelper />       editors: outline, continue, expand, intro, polish; the member inserts what they want
 *
 * When AI is not switched on for the site the helpers are not shown; guests see the pill with "sign in to use".
 */

const SiriWave = dynamic(() => import("@/components/assistant/siri-wave"), { ssr: false })

/** One structured helper request's state, cancelled on unmount. */
function useHelper<T>() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<T | null>(null)
  const [model, setModel] = useState("")
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  async function run(body: Record<string, unknown>) {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setBusy(true)
    setError(null)
    try {
      const r = await askAi<T>("helper", body, c.signal)
      setData(r.data)
      setModel(r.model)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e as Error)
    } finally {
      if (ctrl.current === c) setBusy(false)
    }
  }
  return { busy, error, data, model, run, setData, clear: () => (setData(null), setError(null)) }
}

/** The trigger: plasma orb, label, and the Siri Wave while busy. A sign-in link for guests. */
export function AiPill({ label, busy, onClick, className, disabled, busyLabel = "Thinking…" }: { label: string; busy?: boolean; onClick: () => void; className?: string; disabled?: boolean; busyLabel?: string }) {
  const { user } = useSession()
  const path = usePathname()
  if (!user) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(path)}` as Route} className={cn("ai-pill", className)}>
        <span aria-hidden className="apl-orb block shrink-0" />
        {label}
        <span className="text-xs text-muted-foreground">· sign in to use</span>
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} data-busy={busy ? "" : undefined} className={cn("ai-pill", className)}>
      <span aria-hidden className="ai-pill-wave">{busy && <SiriWave active speed={1.2} scale={0.8} exposure={0.85} />}</span>
      {busy ? <Orb state="thinking" open /> : <span aria-hidden className="apl-orb block shrink-0" />}
      <span>{busy ? busyLabel : label}</span>
    </button>
  )
}

/** Whether a helper should render: AI on for the site (and this job). Guests still see the pill. */
function useShown(job: AiJob | "explain" | "answer" | "draft") {
  const { enabled } = useAiReady(job as AiJob)
  return enabled
}

/** The structured answer card: rises in, labelled as AI, with dismiss, regenerate and a retry on errors. */
function AnswerCard({
  busy,
  error,
  onClose,
  onRetry,
  children,
  label,
  footer,
}: {
  busy: boolean
  error: Error | null
  onClose: () => void
  onRetry: () => void
  children?: React.ReactNode
  label: string
  footer?: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      aria-label={label}
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
      data-busy={busy ? "" : undefined}
      className="ai-card flex flex-col gap-3 p-4"
    >
      <span aria-hidden className="ai-pill-wave top-auto h-16">{busy && <SiriWave active speed={1.3} scale={1.1} exposure={0.7} />}</span>
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center">{busy ? <Orb state="thinking" open /> : <span aria-hidden className="apl-orb block size-7" />}</span>
        <h3 className="min-w-0 flex-1 text-sm font-medium">{label}</h3>
        {busy && <span className="text-xs text-muted-foreground">Thinking…</span>}
        <button type="button" onClick={onClose} aria-label="Close" className="pressable grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
          <XIcon aria-hidden className="size-3.5" />
        </button>
      </div>
      {busy && (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Thinking…</span>
          {[92, 74, 50].map((w) => (
            <span key={w} style={{ width: `${w}%` }} className="nx-skeleton h-3" />
          ))}
        </div>
      )}
      {error && !busy && (
        <div className="flex flex-wrap items-center gap-3">
          <AiErrorText error={error} />
          <button type="button" onClick={onRetry} className="pressable inline-flex items-center gap-1 text-xs text-ion">
            <RotateCcwIcon aria-hidden className="size-3" /> Try again
          </button>
        </div>
      )}
      {!busy && !error && children}
      {!busy && !error && footer}
    </motion.section>
  )
}

function Points({ points }: { points: string[] }) {
  if (!points.length) return null
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
      {points.map((p, i) => (
        <li key={i} className="nx-enter flex gap-2" style={{ "--i": i } as React.CSSProperties}>
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ion" />
          {p}
        </li>
      ))}
    </ul>
  )
}

function CardFooter({ onRegenerate, feature, target, model }: { onRegenerate: () => void; feature: string; target: string; model?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-white/[0.06] pt-2.5">
      <button type="button" onClick={onRegenerate} className="pressable inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground">
        <RotateCcwIcon aria-hidden className="size-3.5" /> Regenerate
      </button>
      <span className="flex-1" />
      <Feedback feature={feature} target={target} model={model} />
    </div>
  )
}

/** Lab tools: what the result means. `result` is the tool's inputs and outputs as plain text (or a function that reads them when pressed). */
export function ExplainThis({ tool, result, className }: { tool: string; result: string | (() => string); className?: string }) {
  const shown = useShown("explain")
  const s = useAiStream()
  const [open, setOpen] = useState(false)
  const last = useRef("")
  if (!shown) return null
  const go = (regenerate = false) => {
    setOpen(true)
    if (!regenerate) last.current = (typeof result === "function" ? result() : result).slice(0, 6000)
    void s.run({ task: "explain", tool, result: last.current, regenerate })
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!open && <AiPill label="Explain this result" busy={s.busy} onClick={() => go()} className="self-start" disabled={typeof result === "string" && !result.trim()} />}
      <AnimatePresence>
        {open && (
          <AiAnswerCard
            label="What this means"
            stream={s}
            feature="lab-explain"
            target={tool}
            onRegenerate={() => go(true)}
            onClose={() => {
              s.stop()
              setOpen(false)
            }}
            note="AI explanation of the numbers above. Check it against your own setup."
          />
        )}
      </AnimatePresence>
    </div>
  )
}

type Tldr = { tldr: string; points: string[]; why?: string; related?: AiSource[] }

/** News stories: a TL;DR on demand, kept for this tab so reopening the story shows it for free. */
export function NewsTldr({ id, title, body, className }: { id: string; title: string; body: string; className?: string }) {
  const shown = useShown("summary")
  const h = useHelper<Tldr>()
  const [open, setOpen] = useState(false)
  const key = `nexverse.ai.tldr2.${id}`
  const [saved, setSaved] = useState<Tldr | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a cache that lives outside React
      if (raw) setSaved(JSON.parse(raw))
    } catch {}
  }, [key])
  useEffect(() => {
    if (!h.data) return
    try {
      sessionStorage.setItem(key, JSON.stringify(h.data))
    } catch {}
  }, [h.data, key])
  if (!shown || body.trim().length < 200) return null
  const data = h.data ?? saved
  const ask = (regenerate = false) => void h.run({ task: "tldr", title, body: body.slice(0, 40_000), url: `/news/${id}`, regenerate })
  const go = () => {
    setOpen(true)
    if (!data) ask()
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!open && <AiPill label={data ? "Show the TL;DR" : "TL;DR"} busy={h.busy} onClick={go} className="self-start" />}
      <AnimatePresence>
        {open && (
          <AnswerCard
            label="TL;DR"
            busy={h.busy}
            error={h.error}
            onClose={() => setOpen(false)}
            onRetry={() => ask(true)}
            footer={data ? <CardFooter onRegenerate={() => ask(true)} feature="news-tldr" target={id} model={h.model} /> : null}
          >
            {data && (
              <>
                <p className="text-sm leading-relaxed">{data.tldr}</p>
                <Points points={data.points} />
                {data.why && (
                  <p className="rounded-xl border border-ion/20 bg-ion/[0.06] px-3 py-2 text-sm">
                    <span className="font-medium text-ion">Why it matters. </span>
                    {data.why}
                  </p>
                )}
                {data.related && data.related.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">Related on Nexverse</p>
                    <SourceChips sources={data.related} />
                  </div>
                )}
                <AiLabel>AI summary of this story. The story itself is the record.</AiLabel>
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>
    </div>
  )
}

type TitleTags = { title: string; tags: string[]; similar?: AiSource[] }

/** Forum composer: a clearer title and tags for the draft, and similar threads. Nothing changes until the member applies it. */
export function SuggestTitleTags({ title, body, category, onApply, className }: { title: string; body: string; category?: string; onApply: (s: { title?: string; tags?: string[] }) => void; className?: string }) {
  const shown = useShown("rewrite")
  const h = useHelper<TitleTags>()
  const [open, setOpen] = useState(false)
  if (!shown) return null
  const go = (regenerate = false) => {
    setOpen(true)
    void h.run({ task: "tags", title, body: body.slice(0, 8000), category, regenerate })
  }
  const enough = (title + body).trim().length >= 12
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AiPill label="Suggest a title and tags" busy={h.busy} onClick={() => go()} disabled={!enough} className="self-start" />
      <AnimatePresence>
        {open && (
          <AnswerCard
            label="Suggested title and tags"
            busy={h.busy}
            error={h.error}
            onClose={() => setOpen(false)}
            onRetry={() => go(true)}
            footer={h.data ? <CardFooter onRegenerate={() => go(true)} feature="forum-tags" target={title.slice(0, 120)} model={h.model} /> : null}
          >
            {h.data && (
              <>
                <p className="text-sm font-medium">{h.data.title}</p>
                {h.data.tags.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {h.data.tags.map((t, i) => (
                      <li key={t} className="nx-enter rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground" style={{ "--i": i } as React.CSSProperties}>
                        #{t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApply({ title: h.data?.title, tags: h.data?.tags })
                      setOpen(false)
                      toast("Title and tags applied. Edit them as you like.")
                    }}
                    className="pressable inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground"
                  >
                    <CheckIcon aria-hidden className="size-3.5" /> Use both
                  </button>
                  <button type="button" onClick={() => (onApply({ title: h.data?.title }), setOpen(false))} className="pressable liquid-glass-pill inline-flex h-8 items-center px-3.5 text-xs">
                    Title only
                  </button>
                  <button type="button" onClick={() => (onApply({ tags: h.data?.tags }), setOpen(false))} className="pressable liquid-glass-pill inline-flex h-8 items-center px-3.5 text-xs">
                    Tags only
                  </button>
                </div>
                {h.data.similar && h.data.similar.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">Similar threads already on Nexverse. Check them before posting; yours may already have an answer.</p>
                    <SourceChips sources={h.data.similar} />
                  </div>
                )}
                <AiLabel />
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Command menu: "Ask AI" about what the member typed. Answers from Nexverse content first, with citations that
 * link to the items. Nothing is sent until the member asks (Enter on the row, or the button).
 */
export function SmartAnswer({ query, className, autoFocus }: { query: string; className?: string; autoFocus?: boolean }) {
  const shown = useShown("answer")
  const s = useAiStream()
  const path = usePathname()
  const [asked, setAsked] = useState<string | null>(null)
  const q = query.trim()
  if (!shown || q.length < 3) return null
  const go = (regenerate = false) => {
    const question = regenerate && asked ? asked : q
    setAsked(question)
    void s.run({ task: "answer", q: question.slice(0, 500), page: path, regenerate })
  }
  const stale = asked !== null && asked !== q && !s.busy
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(asked === null || stale) && (
        <button
          type="button"
          autoFocus={autoFocus}
          onClick={() => go()}
          className="pressable group flex w-full items-center gap-3 rounded-xl border border-ion/25 bg-ion/[0.06] px-3 py-2.5 text-left text-sm transition-colors hover:border-ion/45 hover:bg-ion/[0.1] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span aria-hidden className="apl-orb block size-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Ask Nexverse AI: <span className="text-muted-foreground">“{q}”</span>
          </span>
          <CornerDownLeftIcon aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
        </button>
      )}
      <AnimatePresence>
        {asked !== null && (
          <AiAnswerCard
            label={asked}
            stream={s}
            feature="search-answer"
            target={asked.slice(0, 200)}
            onRegenerate={() => go(true)}
            onClose={() => {
              s.stop()
              setAsked(null)
            }}
            note="AI answer from Nexverse content. Open the sources to read more."
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** Model, dataset and project pages: what it is, what it is good for, how to start, its limits. */
export function ExplainItem({
  kind,
  name,
  summary,
  readme,
  details,
  url,
  className,
}: {
  kind: string
  name: string
  summary?: string
  readme?: string
  /** Specs, licence, tags, sizes: anything the page shows, as "label: value" lines. */
  details?: string
  /** This page's own path, so related items exclude it. */
  url?: string
  className?: string
}) {
  const shown = useShown("explain")
  const s = useAiStream()
  const [open, setOpen] = useState(false)
  const enough = ((summary ?? "") + (readme ?? "") + (details ?? "")).length >= 20
  if (!shown || !enough) return null
  const what = kind === "dataset" ? "dataset" : kind === "model" ? "model" : kind
  const go = (regenerate = false) => {
    setOpen(true)
    void s.run({ task: "explain-item", kind, name, summary: summary?.slice(0, 1000), readme: readme?.slice(0, 24_000), details: details?.slice(0, 4000), url, regenerate })
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!open && <AiPill label={`Explain this ${what}`} busy={s.busy} onClick={() => go()} className="self-start" />}
      <AnimatePresence>
        {open && (
          <AiAnswerCard
            label={`About ${name}`}
            stream={s}
            feature="explain-item"
            target={url ?? name}
            onRegenerate={() => go(true)}
            onClose={() => {
              s.stop()
              setOpen(false)
            }}
            note={`AI explanation from this page's own details. The ${what}'s page is the record.`}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

const DRAFT_ACTIONS = [
  { mode: "outline", label: "Outline", icon: ListTreeIcon, needs: 6 },
  { mode: "intro", label: "Write an intro", icon: FileTextIcon, needs: 6 },
  { mode: "continue", label: "Continue", icon: PenLineIcon, needs: 20 },
  { mode: "expand", label: "Expand", icon: SparklesIcon, needs: 20 },
  { mode: "polish", label: "Polish", icon: WandSparklesIcon, needs: 20 },
] as const

export type DraftMode = (typeof DRAFT_ACTIONS)[number]["mode"]

/**
 * Editors: a row of drafting actions. The answer streams into a card; "Insert" hands it to the editor
 * (`onInsert(text, mode)`: the editor decides where it goes, e.g. "polish" replaces, the rest append).
 */
export function DraftHelper({
  kind = "post",
  title = "",
  text,
  selection = "",
  onInsert,
  className,
}: {
  kind?: string
  title?: string
  text: string
  selection?: string
  onInsert: (text: string, mode: DraftMode) => void
  className?: string
}) {
  const shown = useShown("draft")
  const s = useAiStream()
  const [mode, setMode] = useState<DraftMode | null>(null)
  const { user } = useSession()
  if (!shown) return null
  const size = (title + text).trim().length
  const go = (m: DraftMode) => {
    setMode(m)
    void s.run({ task: "draft", mode: m, kind, title: title.slice(0, 300), text: text.slice(0, 20_000), selection: selection.slice(0, 4000) })
  }
  if (!user) return <AiPill label="Drafting help" onClick={() => {}} className={className} />
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="toolbar" aria-label="AI drafting help" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
        <span aria-hidden className="apl-orb mr-1 block size-6 shrink-0" />
        {DRAFT_ACTIONS.map((a) => (
          <button
            key={a.mode}
            type="button"
            disabled={s.busy || size < a.needs}
            onClick={() => go(a.mode)}
            aria-pressed={mode === a.mode}
            className={cn(
              "pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 text-xs transition-colors hover:border-ion/40 disabled:opacity-45",
              mode === a.mode && "border-ion/45 bg-ion/10 text-foreground"
            )}
          >
            <a.icon aria-hidden className="size-3.5 text-ion" />
            {a.label}
          </button>
        ))}
      </div>
      <AnimatePresence>
        {mode && (
          <AiAnswerCard
            label={DRAFT_ACTIONS.find((a) => a.mode === mode)?.label ?? "Draft"}
            stream={s}
            feature={`draft-${mode}`}
            target={kind}
            onRegenerate={() => go(mode)}
            onClose={() => {
              s.stop()
              setMode(null)
            }}
            note="AI draft. Placeholders in [brackets] are facts only you can fill in."
            actions={(out) => (
              <button
                type="button"
                onClick={() => {
                  onInsert(out, mode)
                  setMode(null)
                  toast(mode === "polish" ? "Your draft now has the polished version." : "Inserted into your draft.")
                }}
                className="pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                <CheckIcon aria-hidden className="size-3.5" /> {mode === "polish" ? "Replace draft" : "Insert"}
              </button>
            )}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
