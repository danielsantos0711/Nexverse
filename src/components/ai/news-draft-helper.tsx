"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { SparklesIcon } from "lucide-react"
import { AiErrorText, AiLabel, AiLoading, useAiReady } from "@/components/ai/ai-bits"
import { Button } from "@/components/ui/button"
import { ai, type NewsDraft } from "@/lib/ai-client"

/*
 * For the share form's News option: reads the page at the member's link (or their notes) and drafts a
 * neutral headline, a 2 to 4 sentence summary and tags. The draft is shown first; "Fill the form" hands it
 * to the form through `onApply`, where the member edits it before sharing. Renders nothing when AI is off.
 */

export function NewsDraftHelper({
  url,
  title,
  notes,
  onApply,
  className,
}: {
  /** The link field's current value. */
  url: string
  /** Optional: the title field's current value, used as a hint. */
  title?: string
  /** Optional: the summary field's current value, used as the member's notes. */
  notes?: string
  onApply: (draft: { title: string; summary: string; tags: string[] }) => void
  className?: string
}) {
  const { usable } = useAiReady()
  const reduce = useReducedMotion()
  const [draft, setDraft] = useState<NewsDraft | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  if (!usable) return null

  const link = url.trim()
  const hasLink = /^https:\/\/\S+\.\S+/.test(link)
  const canRun = hasLink || (notes?.trim().length ?? 0) >= 20

  async function run() {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setError(null)
    setDraft(null)
    try {
      const r = await ai.newsDraft({ url: hasLink ? link : undefined, title: title?.trim() || undefined, notes: notes?.trim() || undefined }, ctrl.signal)
      setDraft(r.data)
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  return (
    <section aria-label="Draft with AI" className={className}>
      <div className="flex flex-col gap-3 rounded-xl border border-ion/25 bg-ion/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Draft with AI.</span> Reads the page at your link and suggests a neutral headline, summary and tags. You review everything before sharing.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={run} disabled={!canRun || busy} title={canRun ? undefined : "Paste an https:// link first"}>
            <SparklesIcon aria-hidden data-icon="inline-start" className="text-ion" />
            {busy ? "Reading…" : draft ? "Draft again" : "Draft from link"}
          </Button>
        </div>

        {busy && <AiLoading label="Reading the page and drafting…" />}
        {error && !busy && <AiErrorText error={error} />}

        <AnimatePresence initial={false}>
          {draft && !busy && (
            <motion.div
              key="draft"
              initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(6px)" }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-3"
            >
              <AiLabel />
              <div className="flex flex-col gap-1.5">
                <p className="font-medium">{draft.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{draft.summary}</p>
                {draft.tags.length > 0 && (
                  <ul aria-label="Suggested tags" className="flex flex-wrap gap-1.5">
                    {draft.tags.map((t) => (
                      <li key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {draft.note && <p className="text-xs text-gold">{draft.note}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onApply({ title: draft.title, summary: draft.summary, tags: draft.tags })
                    setDraft(null)
                  }}
                >
                  Fill the form
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
