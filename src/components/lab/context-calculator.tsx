"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckIcon, ClipboardPasteIcon, PlusIcon, RotateCcwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { loadModels, type AiModel } from "@/lib/lab/ai"
import { computeContext, DEFAULT_CONTEXT, WINDOW_PRESETS, type ContextInput } from "@/lib/lab/context"
import { quickTokens } from "@/lib/lab/tokenizers"
import { cn } from "@/lib/utils"
import { ActionButton, AnimatedNumber, CopyAction, fmtCompact, fmtInt, NativeSelect, NumberInput, Panel, RangeSlider, readStored, ToolSkeleton, useHydrated, writeStored } from "./ui"

const KEY = "nexverse:lab:context"
const uid = () => Math.random().toString(36).slice(2, 9)

export function ContextCalculator() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Inner />
}

function Inner() {
  const [i, setI] = useState<ContextInput>(() => ({ ...DEFAULT_CONTEXT, ...readStored<Partial<ContextInput>>(KEY, {}) }))
  const [models, setModels] = useState<AiModel[]>([])
  const [pasteFor, setPasteFor] = useState<string | null>(null)
  const [paste, setPaste] = useState("")
  const set = <K extends keyof ContextInput>(k: K, v: ContextInput[K]) => setI((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    const t = setTimeout(() => writeStored(KEY, i), 300)
    return () => clearTimeout(t)
  }, [i])
  useEffect(() => {
    let alive = true
    void loadModels().then((s) => alive && s.status === "ok" && setModels(s.models.filter((m) => m.context > 0)))
    return () => {
      alive = false
    }
  }, [])

  const r = useMemo(() => computeContext(i), [i])
  const scale = Math.max(i.window, r.used)
  const pct = (n: number) => `${(n / scale) * 100}%`
  const windowValue = models.find((m) => m.context === i.window)?.id ?? (WINDOW_PRESETS.includes(i.window) ? String(i.window) : "custom")

  const summary = () => [`Context window: ${fmtInt(i.window)} tokens`, ...r.parts.map((p) => `  ${p.label}: ${fmtInt(p.tokens)}`), r.fits ? `Free: ${fmtInt(r.free)} tokens (${r.turnsLeft} more turns)` : `Over by ${fmtInt(r.overflow)} tokens`].join("\n")

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={r.fits ? "It fits" : "It does not fit"}
        description={r.fits ? `${fmtInt(r.free)} tokens free, room for about ${fmtInt(r.turnsLeft)} more turns of history.` : `Over the window by ${fmtInt(r.overflow)} tokens. Trim documents, summarise history or reserve less for the answer.`}
        actions={<CopyAction text={summary} label="Copy summary" />}
      >
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-semibold tracking-tight", !r.fits && "text-destructive")}>
            <AnimatedNumber value={r.used} />
          </span>
          <span className="text-sm text-muted-foreground tabular">/ {fmtInt(i.window)} tokens</span>
          {r.fits ? <CheckIcon aria-label="Fits" className="size-5 text-ok" /> : <TriangleAlertIcon aria-label="Overflows" className="size-5 text-destructive" />}
        </div>
        <div className="relative mt-4" role="img" aria-label={`${fmtInt(r.used)} of ${fmtInt(i.window)} tokens used`}>
          <div className="flex h-8 w-full overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10">
            {r.parts.map((p) => (
              <span key={p.id} title={`${p.label}: ${fmtInt(p.tokens)}`} className="h-full border-r border-black/40 transition-[width] duration-500 last:border-r-0 motion-reduce:transition-none" style={{ width: pct(p.tokens), background: p.color, opacity: p.id === "margin" ? 0.5 : 0.85 }} />
            ))}
          </div>
          {!r.fits && <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded bg-destructive" style={{ left: pct(i.window) }} />}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {r.parts.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: p.color }} />
              <span className="text-muted-foreground">{p.label}</span>
              <span className="tabular">{fmtCompact(p.tokens)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Model and answer" actions={<ActionButton onClick={() => setI(DEFAULT_CONTEXT)}><RotateCcwIcon aria-hidden className="size-3.5" />Reset</ActionButton>}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cx-window" className="text-sm font-medium text-foreground/90">
                Context window
              </label>
              <NativeSelect
                id="cx-window"
                value={windowValue}
                onChange={(v) => {
                  const m = models.find((x) => x.id === v)
                  if (m) set("window", m.context)
                  else if (v !== "custom") set("window", Number(v))
                }}
              >
                {models.length > 0 && (
                  <optgroup label="Free models on this site">
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}: {fmtCompact(m.context)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Common sizes">
                  {WINDOW_PRESETS.map((n) => (
                    <option key={n} value={String(n)}>
                      {fmtCompact(n)} tokens
                    </option>
                  ))}
                </optgroup>
                <option value="custom">Custom</option>
              </NativeSelect>
            </div>
            <NumberInput label="Window size" value={i.window} onChange={(v) => set("window", Math.max(1, Math.round(v)))} min={1} step={1024} smallStep={1} suffix="tokens" />
            <NumberInput label="Reserved for the answer" value={i.output} onChange={(v) => set("output", Math.max(0, Math.round(v)))} min={0} step={500} suffix="tokens" />
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground/90">Safety margin</span>
                <span className="text-xs text-muted-foreground tabular">{i.margin}%</span>
              </div>
              <RangeSlider label="Safety margin" value={i.margin} onChange={(v) => set("margin", v)} min={0} max={30} step={1} valueText={(v) => `${v} percent`} />
              <p className="text-xs text-muted-foreground">Covers chat-template tokens and the gap between estimated and real token counts.</p>
            </div>
          </div>
        </Panel>

        <Panel title="What the request carries">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="System prompt" value={i.system} onChange={(v) => set("system", Math.max(0, Math.round(v)))} min={0} step={100} suffix="tokens" />
              <NumberInput label="Tools and schemas" value={i.tools} onChange={(v) => set("tools", Math.max(0, Math.round(v)))} min={0} step={100} suffix="tokens" />
              <NumberInput label="History turns" value={i.turns} onChange={(v) => set("turns", Math.max(0, Math.round(v)))} min={0} step={1} />
              <NumberInput label="Tokens per turn" value={i.perTurn} onChange={(v) => set("perTurn", Math.max(0, Math.round(v)))} min={0} step={50} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground/90">Documents</span>
              {i.docs.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <Input aria-label="Document name" value={d.name} onChange={(e) => set("docs", i.docs.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))} className="h-9 min-w-0 flex-1" />
                    <input
                      type="number"
                      aria-label={`${d.name} tokens`}
                      min={0}
                      value={d.tokens}
                      onChange={(e) => set("docs", i.docs.map((x) => (x.id === d.id ? { ...x, tokens: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)))}
                      className="h-9 w-28 rounded-lg border border-input bg-input/30 px-2 text-right text-base tabular outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                    />
                    <button type="button" aria-label={`Measure ${d.name} from text`} aria-expanded={pasteFor === d.id} onClick={() => { setPasteFor(pasteFor === d.id ? null : d.id); setPaste("") }} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                      <ClipboardPasteIcon aria-hidden className="size-4" />
                    </button>
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => set("docs", i.docs.filter((x) => x.id !== d.id))} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Trash2Icon aria-hidden className="size-3.5" />
                    </button>
                  </div>
                  {pasteFor === d.id && (
                    <div className="flex flex-col gap-2">
                      <Textarea aria-label={`Text of ${d.name}`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the document; its tokens are estimated here and nothing is kept." className="min-h-24 text-[13px] md:text-[13px]" />
                      <ActionButton
                        className="self-start"
                        disabled={!paste.trim()}
                        onClick={() => {
                          const n = quickTokens(paste)
                          set("docs", i.docs.map((x) => (x.id === d.id ? { ...x, tokens: n } : x)))
                          setPasteFor(null)
                          setPaste("")
                        }}
                      >
                        Use ≈{fmtInt(quickTokens(paste))} tokens
                      </ActionButton>
                    </div>
                  )}
                </div>
              ))}
              <ActionButton className="self-start" disabled={i.docs.length >= 12} onClick={() => set("docs", [...i.docs, { id: uid(), name: `Document ${i.docs.length + 1}`, tokens: 2000 }])}>
                <PlusIcon aria-hidden className="size-3.5" />
                Add document
              </ActionButton>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
