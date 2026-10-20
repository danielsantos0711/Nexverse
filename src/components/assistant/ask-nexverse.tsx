"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react"
import { useAiStatus } from "@/lib/ai-client"
import { useCopy } from "@/lib/content"
import { useQuality } from "@/lib/perf"
import { useSession } from "@/lib/store"
import { db } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Orb, type OrbState } from "./orb"

/*
 * Ask Nexverse: a floating pill (HorizonX "Assistant Pill", its Plasma Orb inside) that opens a small guide to
 * the site. Questions go to /api/ai/assist, which answers from a map of the site with a free model; while it
 * thinks, HorizonX "Siri Wave" runs across the top of the panel. Signed-in members only. When AI is not
 * switched on for the site the pill still opens, and says so plainly instead of pretending.
 *
 * Anything can open it: window.dispatchEvent(new Event("nexverse:ask")).
 */

const SiriWave = dynamic(() => import("./siri-wave"), { ssr: false })

type Turn = { role: "user" | "assistant"; text: string; error?: boolean }

export const openAsk = () => window.dispatchEvent(new Event("nexverse:ask"))

async function ask(question: string, history: Turn[], page: string, signal: AbortSignal): Promise<string> {
  const c = db()
  const token = c ? (await c.auth.getSession()).data.session?.access_token : null
  if (!token) throw new Error("Sign in to ask Nexverse.")
  let res: Response
  try {
    res = await fetch("/api/ai/assist", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ question, page, history: history.filter((t) => !t.error).map(({ role, text }) => ({ role, text })) }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new Error("Could not reach Nexverse. Check your connection and try again.")
  }
  const json = (await res.json().catch(() => null)) as { data?: { answer?: string }; error?: { message?: string } } | null
  if (!res.ok || !json?.data?.answer) throw new Error(json?.error?.message ?? "The guide could not answer just now. Try again.")
  return json.data.answer
}

/** The answer's text with `/addresses` turned into links and "- " lines into a list. */
function Answer({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const lines = text.split(/\n+/).filter((l) => l.trim())
  const inline = (line: string) =>
    line.split(/(`[^`]+`)/g).map((part, i) => {
      const m = part.match(/^`(\/[a-z0-9\-/?=&#]*)`$/i)
      if (m)
        return (
          <Link key={i} href={m[1] as Route} onClick={onNavigate} className="rounded-sm font-mono text-[13px] text-ion underline-offset-2 hover:underline">
            {m[1]}
          </Link>
        )
      return <span key={i}>{part.replace(/`/g, "").replace(/\*\*/g, "")}</span>
    })
  const bullets = lines.filter((l) => /^\s*[-*•]\s+/.test(l))
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {lines.map((l, i) =>
        /^\s*[-*•]\s+/.test(l) ? (
          bullets[0] === l ? (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-ion">
              {bullets.map((b, j) => (
                <li key={j}>{inline(b.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          ) : null
        ) : (
          <p key={i}>{inline(l)}</p>
        )
      )}
    </div>
  )
}

export function AskNexverse() {
  const { ready, user } = useSession()
  const status = useAiStatus()
  const pathname = usePathname()
  const quality = useQuality()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<OrbState>("idle")
  const [idle, setIdle] = useState(0)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const thread = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const label = useCopy("assistant.pill", "Ask Nexverse")
  const title = useCopy("assistant.title", "Ask Nexverse")
  const lead = useCopy("assistant.lead", "Your guide to this universe: where things live, how features work, where to start.")
  const offText = useCopy("assistant.off", "AI is not switched on for this site yet, so the guide cannot answer. Search with ⌘K or ask the community in the forum.")
  const prompts = [
    useCopy("assistant.prompt1", "Where do I share a dataset?"),
    useCopy("assistant.prompt2", "How do levels and points work?"),
    useCopy("assistant.prompt3", "What is a constellation?"),
    useCopy("assistant.prompt4", "How do I start a collection?"),
  ]
  const enabled = status.ready && status.enabled && status.jobs.summary !== false

  // Other parts of the site (the phone tab bar) open the guide with an event.
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener("nexverse:ask", show)
    return () => window.removeEventListener("nexverse:ask", show)
  }, [])

  // The idle prompts in the pill rotate every few seconds while it is closed and empty.
  useEffect(() => {
    if (open || reduce) return
    const t = setInterval(() => setIdle((i) => (i + 1) % prompts.length), 3200)
    return () => clearInterval(t)
  }, [open, reduce, prompts.length])

  // Escape closes; focus moves into the field on open and back to the pill on close.
  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (busy) abort.current?.abort()
      else setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [turns, busy, reduce])

  if (!ready || !user) return null

  async function send(q: string) {
    const question = q.trim()
    if (!question || busy || !enabled) return
    const history = turns
    setTurns((t) => [...t, { role: "user", text: question }])
    setText("")
    setBusy(true)
    setState("thinking")
    abort.current = new AbortController()
    try {
      const answer = await ask(question, history, pathname, abort.current.signal)
      setTurns((t) => [...t, { role: "assistant", text: answer }])
      setState("answering")
      setTimeout(() => setState("idle"), 1600)
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setState("idle")
      } else {
        setTurns((t) => [...t, { role: "assistant", text: (e as Error).message, error: true }])
        setState("error")
        setTimeout(() => setState("idle"), 2200)
      }
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const waveOn = quality !== "off" && quality !== "low"

  return (
    <div className="apl pointer-events-none fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 lg:right-6 lg:bottom-6">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px) scale(0.97)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px) scale(0.98)" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
            style={{ transformOrigin: "bottom right" }}
            className="liquid-glass-strong pointer-events-auto flex max-h-[min(34rem,calc(100dvh-9rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem]"
          >
            <div className="relative h-14 shrink-0 overflow-hidden">
              {waveOn && (
                <div className={cn("absolute inset-0 transition-opacity duration-500", busy ? "opacity-100" : "opacity-35")}>
                  <SiriWave active={busy} speed={busy ? 1.2 : 0.4} scale={0.9} exposure={0.9} />
                </div>
              )}
              <div className="relative flex h-full items-center justify-between px-5">
                <h2 className="font-sans text-sm font-semibold tracking-normal">{title}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <XIcon aria-hidden className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>

            <div ref={thread} role="log" aria-live="polite" aria-busy={busy} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-1 pb-4">
              {!enabled ? (
                <p className="rounded-2xl border border-gold/20 bg-gold/[0.06] p-3 text-sm text-foreground/90">{status.ready ? offText : "Checking whether the guide is switched on…"}</p>
              ) : turns.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">{lead}</p>
                  <div className="flex flex-wrap gap-2">
                    {prompts.map((p) => (
                      <button key={p} type="button" onClick={() => send(p)} className="liquid-glass-pill px-3 py-1.5 text-left text-[13px] text-foreground/90 focus-visible:outline-2 focus-visible:outline-ring">
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                turns.map((t, i) =>
                  t.role === "user" ? (
                    <p key={i} className="apl-msg-user text-sm">
                      {t.text}
                    </p>
                  ) : t.error ? (
                    <p key={i} role="alert" className="text-sm text-gold">
                      {t.text}
                    </p>
                  ) : (
                    <Answer key={i} text={t.text} onNavigate={() => setOpen(false)} />
                  )
                )
              )}
              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="orbit-loader text-ion [--ol-size:1rem]" aria-hidden />
                  <span className="apl-step">Reading the star map…</span>
                </p>
              )}
            </div>
            {enabled && turns.length > 0 && <p className="px-5 pb-2 text-[11px] text-muted-foreground">AI answers can be wrong. Check the page it points to.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!open) setOpen(true)
          else void send(text)
        }}
        className={cn("apl-pill pointer-events-auto transition-[width] duration-300", open ? "w-[min(26rem,calc(100vw-2rem))]" : "w-[3.25rem] grid-cols-[var(--apl-orb)] lg:w-[15rem] lg:grid-cols-[var(--apl-orb)_minmax(0,1fr)]")}
      >
        <span className="apl-spill" aria-hidden />
        <button
          type="button"
          onClick={() => (open ? input.current?.focus() : setOpen(true))}
          aria-label={open ? "Type your question" : label}
          aria-expanded={open}
          className="relative grid size-[var(--apl-orb)] place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Orb state={state} open={open} />
        </button>
        {open ? (
          <>
            <label className="apl-field">
              <span className="sr-only">Your question</span>
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={600}
                enterKeyHint="send"
                disabled={!enabled}
                placeholder={label}
              />
              <span className="apl-idle" aria-hidden>
                <span key={`o${idle}`}>{enabled ? label + "…" : "Not switched on yet"}</span>
              </span>
            </label>
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="apl-send" aria-label="Stop">
                <SquareIcon aria-hidden className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" className="apl-send" disabled={!enabled || !text.trim()} aria-label="Send">
                <ArrowUpIcon aria-hidden className="size-4" />
              </button>
            )}
          </>
        ) : (
          <button type="submit" className="hidden min-w-0 items-center text-left text-sm lg:flex" aria-label={label}>
            <span className="apl-idle relative! inset-auto!" aria-hidden>
              <span key={idle}>{prompts[idle]}</span>
            </span>
          </button>
        )}
      </form>
    </div>
  )
}
