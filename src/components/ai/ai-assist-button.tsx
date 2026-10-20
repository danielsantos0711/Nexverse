"use client"

import { useRef, useState } from "react"
import { EyeIcon, GitCompareIcon, LanguagesIcon, MinimizeIcon, SmileIcon, SparklesIcon, TypeIcon, WandSparklesIcon } from "lucide-react"
import { AiErrorText, AiLabel, AiLoading, DiffView, useAiReady } from "@/components/ai/ai-bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ai, AiRequestError, type ImproveGoal } from "@/lib/ai-client"
import { type LanguageCode } from "@/lib/data"
import { useLanguages } from "@/lib/lists/hooks"
import { cn } from "@/lib/utils"

/*
 * "Assist" for a composer: rewrite the draft clearer, shorter or friendlier, translate it, or suggest a title.
 * The suggestion opens in a dialog with a word diff; nothing changes until the member presses Accept.
 * Renders nothing when AI is not configured or nobody is signed in.
 */

const GOALS: Record<ImproveGoal, { label: string; title: string; icon: typeof SparklesIcon }> = {
  clearer: { label: "Clearer", title: "A clearer version", icon: WandSparklesIcon },
  shorter: { label: "Shorter", title: "A shorter version", icon: MinimizeIcon },
  friendlier: { label: "Friendlier", title: "A friendlier version", icon: SmileIcon },
  title: { label: "Suggest a title", title: "A suggested title", icon: TypeIcon },
}

type Job = { kind: "improve"; goal: ImproveGoal } | { kind: "translate"; to: LanguageCode }

export function AiAssistButton({
  value,
  onAccept,
  goals = ["clearer", "shorter", "friendlier"],
  translate = true,
  label = "Assist",
  className,
}: {
  /** The current draft text the AI works on. */
  value: string
  /** Called with the accepted text. For goals={["title"]} this is the suggested title. */
  onAccept: (text: string) => void
  goals?: ImproveGoal[]
  translate?: boolean
  label?: string
  className?: string
}) {
  const LANGUAGES = useLanguages()
  const { usable } = useAiReady("rewrite")
  const [job, setJob] = useState<Job | null>(null)
  const [result, setResult] = useState<{ text: string; before: string; note?: string } | null>(null)
  const [error, setError] = useState<AiRequestError | Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [clean, setClean] = useState(false)
  const abort = useRef<AbortController | null>(null)

  if (!usable) return null

  const empty = value.trim().length < 3
  const titleOnly = goals.length === 1 && goals[0] === "title" && !translate

  async function run(next: Job) {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    const before = value
    setJob(next)
    setResult(null)
    setError(null)
    setClean(false)
    setBusy(true)
    try {
      if (next.kind === "improve") {
        const r = await ai.improve({ text: value, goal: next.goal }, ctrl.signal)
        setResult({ text: r.data.text, before })
      } else {
        const r = await ai.translate({ text: value, to: next.to }, ctrl.signal)
        setResult({ text: r.data.text, before, note: r.data.from ? `Translated from ${r.data.from} into ${LANGUAGES[next.to].name}.` : undefined })
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  function close() {
    abort.current?.abort()
    setJob(null)
    setResult(null)
    setError(null)
    setBusy(false)
  }

  const heading = job ? (job.kind === "improve" ? GOALS[job.goal].title : `Translation into ${LANGUAGES[job.to].name}`) : ""
  const isTitle = job?.kind === "improve" && job.goal === "title"
  const hint = empty ? "Write a few words first" : undefined

  return (
    <>
      {titleOnly ? (
        <Button type="button" variant="ghost" size="sm" disabled={empty} title={hint} onClick={() => run({ kind: "improve", goal: "title" })} className={cn("text-ion", className)}>
          <SparklesIcon aria-hidden data-icon="inline-start" />
          {label === "Assist" ? "Suggest a title" : label}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={empty}
            render={
              <Button type="button" variant="ghost" size="sm" title={hint} aria-label={`${label}: AI writing help`} className={cn("text-ion", className)}>
                <SparklesIcon aria-hidden data-icon="inline-start" />
                {label}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            {goals.map((g) => {
              const Icon = GOALS[g].icon
              return (
                <DropdownMenuItem key={g} onClick={() => run({ kind: "improve", goal: g })}>
                  <Icon aria-hidden />
                  {GOALS[g].label}
                </DropdownMenuItem>
              )
            })}
            {translate && (
              <>
                {goals.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <LanguagesIcon aria-hidden />
                    Translate
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 w-48">
                    {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
                      <DropdownMenuItem key={code} onClick={() => run({ kind: "translate", to: code })}>
                        <span className="flex-1">{LANGUAGES[code].name}</span>
                        <span lang={code} className="text-xs text-muted-foreground">
                          {LANGUAGES[code].native}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={job !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="gap-5 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon aria-hidden className="size-4 text-ion" />
              {heading}
            </DialogTitle>
            <DialogDescription>Nothing in your draft changes until you press Accept.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-background/60 p-3">
            {busy && <AiLoading />}
            {error && !busy && <AiErrorText error={error} />}
            {result && !busy && (isTitle || job?.kind === "translate" || clean ? <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{result.text}</p> : <DiffView before={result.before} after={result.text} />)}
          </div>

          {result && !busy && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AiLabel>{result.note ?? "AI suggestion. You can still edit it after accepting."}</AiLabel>
              {job?.kind === "improve" && !isTitle && (
                <Button type="button" variant="ghost" size="xs" onClick={() => setClean(!clean)} aria-pressed={clean}>
                  {clean ? <GitCompareIcon aria-hidden /> : <EyeIcon aria-hidden />}
                  {clean ? "Show changes" : "Show result only"}
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Discard
            </Button>
            {error && !busy && job ? (
              <Button type="button" onClick={() => run(job)} disabled={"code" in error && (error.code === "rate_limited" || error.code === "forbidden" || error.code === "suspended")}>
                Try again
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!result || busy}
                onClick={() => {
                  if (result) onAccept(result.text)
                  close()
                }}
              >
                Accept
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
