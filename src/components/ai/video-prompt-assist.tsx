"use client"

import { useRef, useState } from "react"
import { ClapperboardIcon } from "lucide-react"
import { AiErrorText, AiLabel, AiLoading, useAiReady } from "@/components/ai/ai-bits"
import { Button } from "@/components/ui/button"
import { ai, type VideoPromptResult } from "@/lib/ai-client"
import { cn } from "@/lib/utils"

/*
 * For the video studio: turns a rough idea into a filmable text-to-video prompt with a shot list (camera
 * move, lens, lighting per shot). The result is previewed here; "Use this prompt" passes it to the studio.
 * Renders nothing when AI is off or nobody is signed in.
 */

export function VideoPromptAssist({
  idea,
  style,
  camera,
  duration,
  onUse,
  className,
}: {
  idea: string
  style?: string
  camera?: string
  /** Target length in seconds, 2 to 60. Defaults to 8 on the server. */
  duration?: number
  onUse: (result: VideoPromptResult) => void
  className?: string
}) {
  const { usable } = useAiReady()
  const [result, setResult] = useState<VideoPromptResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  if (!usable) return null

  const ready = idea.trim().length >= 8

  async function run() {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await ai.videoPrompt({ idea: idea.trim(), style: style?.trim() || undefined, camera: camera?.trim() || undefined, duration }, ctrl.signal)
      setResult(r.data)
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err as Error)
    } finally {
      if (abort.current === ctrl) setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={!ready || busy} title={ready ? undefined : "Describe the idea in a few words first"} className="self-start">
        <ClapperboardIcon aria-hidden data-icon="inline-start" className="text-ion" />
        {busy ? "Writing the shot list…" : result ? "Write it again" : "Write a shot list with AI"}
      </Button>
      {busy && <AiLoading label="Writing the shot list…" />}
      {error && !busy && <AiErrorText error={error} />}
      {result && !busy && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4">
          <AiLabel />
          {result.title && <p className="font-medium">{result.title}</p>}
          <p className="text-sm leading-relaxed">{result.prompt}</p>
          {result.shots.length > 0 && (
            <ol className="flex flex-col gap-2">
              {result.shots.map((s, i) => (
                <li key={i} className="rounded-lg border border-border p-2.5 text-sm">
                  <p>
                    <span className="font-medium tabular-nums">
                      Shot {i + 1} · {s.duration}s
                    </span>{" "}
                    {s.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[s.camera && `Camera: ${s.camera}`, s.lens && `Lens: ${s.lens}`, s.lighting && `Light: ${s.lighting}`].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {result.style && <p className="text-xs text-muted-foreground">Look: {result.style}</p>}
          {result.negative && <p className="text-xs text-muted-foreground">Avoid: {result.negative}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onUse(result)}>
              Use this prompt
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResult(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
