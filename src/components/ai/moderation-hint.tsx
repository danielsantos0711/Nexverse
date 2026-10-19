"use client"

import { useRef, useState } from "react"
import { ShieldCheckIcon, SparklesIcon } from "lucide-react"
import { AiErrorText, AiLoading } from "@/components/ai/ai-bits"
import { Button } from "@/components/ui/button"
import { ai, useAiStatus, type ModerationHintResult, type ModerationVerdict } from "@/lib/ai-client"
import { useRole } from "@/lib/roles"
import { cn } from "@/lib/utils"

/*
 * For the admin reports queue: a second opinion on reported content. It only suggests; the moderator still
 * decides and acts with the normal buttons. Staff only. When AI is not configured, staff see one quiet line
 * saying so (members never see this component).
 */

const VERDICTS: Record<ModerationVerdict, { label: string; className: string }> = {
  ok: { label: "Looks fine", className: "border-ok/40 bg-ok/10 text-ok" },
  review: { label: "Needs a look", className: "border-gold/40 bg-gold/10 text-gold" },
  remove: { label: "Likely breaks the rules", className: "border-destructive/40 bg-destructive/10 text-destructive" },
}

export function ModerationHint({
  text,
  context,
  className,
}: {
  /** The reported content itself (post body, message text, title and summary). */
  text: string
  /** Optional: the report reason and details, and where the content was posted. */
  context?: string
  className?: string
}) {
  const status = useAiStatus()
  const { isStaff, ready } = useRole()
  const [hint, setHint] = useState<ModerationHintResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  if (!ready || !isStaff || !status.ready) return null
  if (!status.enabled || status.jobs.moderation === false) return <AiSetupNotice compact className={className} />

  async function run() {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setError(null)
    try {
      const r = await ai.moderate({ text, context }, ctrl.signal)
      setHint(r.data)
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  const empty = !text.trim()

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!hint && !busy && (
        <Button type="button" variant="outline" size="xs" onClick={run} disabled={empty} className="self-start">
          <SparklesIcon aria-hidden className="text-ion" />
          AI triage
        </Button>
      )}
      {busy && <AiLoading label="Reading the reported content…" />}
      {error && !busy && <AiErrorText error={error} />}
      {hint && !busy && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium", VERDICTS[hint.verdict].className)}>{VERDICTS[hint.verdict].label}</span>
            {hint.categories.map((c) => (
              <span key={c} className="inline-flex h-5 items-center rounded-full border border-border px-2 text-xs text-muted-foreground">
                {c.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          <p className="text-sm">{hint.reason}</p>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <SparklesIcon aria-hidden className="size-3.5 text-ion" />
            AI suggestion only. Nothing has been changed; you decide.
          </p>
        </div>
      )}
    </div>
  )
}

/** Tells admins whether AI assist is switched on and how to turn it on. Renders nothing for non-staff. */
export function AiSetupNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  const status = useAiStatus()
  const { isStaff, ready } = useRole()
  if (!ready || !isStaff || !status.ready) return null

  if (compact) {
    return <p className={cn("text-xs text-muted-foreground", className)}>AI triage is not set up on this site yet.</p>
  }

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4", className)}>
      {status.enabled ? <ShieldCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" /> : <SparklesIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{status.enabled ? "AI assist is on" : "AI assist isn't set up on this site yet"}</p>
        <p className="text-muted-foreground">
          {status.enabled
            ? "Members can rewrite and translate drafts, summarize threads and draft news; staff get AI triage in the reports queue. Each member has a daily limit."
            : "It runs on free AI providers only. An admin adds at least one free key (Gemini, Groq, OpenRouter, Cloudflare or Mistral) in the Vercel project settings and redeploys; /admin/ai lists exactly which keys and where to get them. Until then, no AI buttons are shown to members."}
        </p>
      </div>
    </div>
  )
}
