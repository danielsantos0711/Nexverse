"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { AiErrorText, AiLabel, useAiReady } from "@/components/ai/ai-bits"
import { Orb } from "@/components/assistant/orb"
import { toast } from "@/components/site/toaster"
import { AiRequestError, type AiErrorCode, type AiJob } from "@/lib/ai-client"
import { useSession } from "@/lib/store"
import { db } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * Inline AI helpers: small, on-demand AI right where it helps (no site chatbot). The trigger is a slim pill with
 * the HorizonX Assistant Pill's plasma orb on its left; while the model thinks, HorizonX Siri Wave runs behind
 * the label and the orb swirls. The orb's WebGL only runs during that moment: at rest it is the export's own CSS
 * sphere, so a page with several helpers holds no idle GPU work. Answers land in a card labelled as AI output.
 *
 *   <AiPill />         the trigger, for any helper
 *   <ExplainThis />    Lab tools: "Explain this result"
 *   <NewsTldr />       news stories: "TL;DR"
 *   <SuggestTitleTags /> the forum composer: "Suggest a title and tags"
 *
 * When AI is not switched on for the site the helpers are not shown; guests see the pill with "Sign in to use".
 * Calls go to /api/ai/helper (aiRoute: session, the ai.use power and the daily allowance).
 */

const SiriWave = dynamic(() => import("@/components/assistant/siri-wave"), { ssr: false })

type HelperData =
  | { task: "tags"; title: string; tags: string[] }
  | { task: "explain"; text: string; points: string[] }
  | { task: "tldr"; tldr: string; points: string[] }

async function askHelper<T extends HelperData>(body: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const c = db()
  const token = c ? (await c.auth.getSession()).data.session?.access_token : null
  if (!token) throw new AiRequestError("unauthorized", "Sign in to use the AI helpers.", 401)
  let res: Response
  try {
    res = await fetch("/api/ai/helper", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new AiRequestError("network", "Could not reach Nexverse. Check your connection and try again.", 0)
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: AiErrorCode; message: string } } | null
  if (!res.ok || !json?.data) throw new AiRequestError(json?.error?.code ?? "upstream", json?.error?.message ?? "The AI helper failed. Try again.", res.status)
  return json.data
}

/** One helper's request state, cancelled on unmount. */
function useHelper<T extends HelperData>() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<T | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  async function run(body: Record<string, unknown>) {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setBusy(true)
    setError(null)
    try {
      setData(await askHelper<T>(body, c.signal))
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e as Error)
    } finally {
      if (ctrl.current === c) setBusy(false)
    }
  }
  return { busy, error, data, run, clear: () => (setData(null), setError(null)) }
}

/** The trigger: plasma orb, label, and the Siri Wave while busy. A sign-in link for guests. */
export function AiPill({ label, busy, onClick, className, disabled }: { label: string; busy?: boolean; onClick: () => void; className?: string; disabled?: boolean }) {
  const { user } = useSession()
  const path = usePathname()
  if (!user) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={cn("ai-pill", className)}>
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
      <span>{busy ? "Thinking…" : label}</span>
    </button>
  )
}

/** Whether a helper should render: AI on for the site (and this job). Guests still see the pill. */
function useShown(job: AiJob) {
  const { enabled } = useAiReady(job)
  return enabled
}

/** The answer card: rises in, labelled as AI, with a dismiss button and a retry on errors. */
function AnswerCard({ busy, error, onClose, onRetry, children, label }: { busy: boolean; error: Error | null; onClose: () => void; onRetry: () => void; children?: React.ReactNode; label: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      aria-label={label}
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
      data-busy={busy ? "" : undefined}
      className="ai-card flex flex-col gap-3 p-4"
    >
      <span aria-hidden className="ai-pill-wave">{busy && <SiriWave active speed={1} scale={1.1} exposure={0.6} />}</span>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
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

/** Lab tools: what the result means. `result` is the tool's inputs and outputs as plain text (or a function that reads them when pressed). */
export function ExplainThis({ tool, result, className }: { tool: string; result: string | (() => string); className?: string }) {
  const shown = useShown("summary")
  const h = useHelper<Extract<HelperData, { task: "explain" }>>()
  const [open, setOpen] = useState(false)
  if (!shown) return null
  const go = () => {
    setOpen(true)
    void h.run({ task: "explain", tool, result: (typeof result === "function" ? result() : result).slice(0, 4000) })
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AiPill label="Explain this result" busy={h.busy} onClick={go} className="self-start" disabled={typeof result === "string" && !result.trim()} />
      <AnimatePresence>
        {open && (
          <AnswerCard label="What this means" busy={h.busy} error={h.error} onClose={() => setOpen(false)} onRetry={go}>
            {h.data && (
              <>
                <p className="text-sm leading-relaxed">{h.data.text}</p>
                <Points points={h.data.points} />
                <AiLabel>AI explanation of the numbers above. Check it against your own setup.</AiLabel>
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>
    </div>
  )
}

/** News stories: a TL;DR on demand, kept for this tab so reopening the story shows it for free. */
export function NewsTldr({ id, title, body, className }: { id: string; title: string; body: string; className?: string }) {
  const shown = useShown("summary")
  const h = useHelper<Extract<HelperData, { task: "tldr" }>>()
  const [open, setOpen] = useState(false)
  const key = `nexverse.ai.tldr.${id}`
  const [saved, setSaved] = useState<{ tldr: string; points: string[] } | null>(null)
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
  const go = () => {
    setOpen(true)
    if (!data) void h.run({ task: "tldr", title, body: body.slice(0, 24000) })
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!open && <AiPill label={data ? "Show the TL;DR" : "TL;DR"} busy={h.busy} onClick={go} className="self-start" />}
      <AnimatePresence>
        {open && (
          <AnswerCard label="TL;DR" busy={h.busy} error={h.error} onClose={() => setOpen(false)} onRetry={() => void h.run({ task: "tldr", title, body: body.slice(0, 24000) })}>
            {data && (
              <>
                <p className="text-sm leading-relaxed">{data.tldr}</p>
                <Points points={data.points} />
                <AiLabel>AI summary of this story. The story itself is the record.</AiLabel>
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Forum composer: a clearer title and tags for the draft. Nothing changes until the member applies it. */
export function SuggestTitleTags({ title, body, onApply, className }: { title: string; body: string; onApply: (s: { title?: string; tags?: string[] }) => void; className?: string }) {
  const shown = useShown("rewrite")
  const h = useHelper<Extract<HelperData, { task: "tags" }>>()
  const [open, setOpen] = useState(false)
  if (!shown) return null
  const go = () => {
    setOpen(true)
    void h.run({ task: "tags", title, body: body.slice(0, 8000) })
  }
  const enough = (title + body).trim().length >= 12
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AiPill label="Suggest a title and tags" busy={h.busy} onClick={go} disabled={!enough} className="self-start" />
      <AnimatePresence>
        {open && (
          <AnswerCard label="Suggested title and tags" busy={h.busy} error={h.error} onClose={() => setOpen(false)} onRetry={go}>
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
                <AiLabel />
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>
    </div>
  )
}
