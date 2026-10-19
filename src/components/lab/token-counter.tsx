"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { EraserIcon, LanguagesIcon } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { countTokens, FAMILIES, SCRIPT_LABEL, type FamilyId } from "@/lib/lab/tokenizers"
import { cn } from "@/lib/utils"
import { ActionButton, AnimatedNumber, CopyAction, fmtInt, Panel } from "./ui"

const SAMPLE = `Tokenizers cut text into pieces before a model reads it. Common English words are usually one token each; rarer words, numbers like 2026 or 3.14159, and code such as const total = items.reduce((a, b) => a + b, 0); split into more.
Outras línguas custam mais tokens pela mesma ideia.
同じ意味でも、言語によってトークン数は大きく変わります。`

const PALETTE = ["143 180 255", "127 224 176", "216 197 158", "211 180 255", "255 159 138", "127 214 224"]

export function TokenCounter() {
  const [text, setText] = useState(SAMPLE)
  const [focus, setFocus] = useState<FamilyId>("o200k")
  const deferred = useDeferredValue(text)

  const all = useMemo(() => FAMILIES.map((f) => ({ f, c: countTokens(deferred, f.id, 0) })), [deferred])
  const detail = useMemo(() => countTokens(deferred, focus, 3000), [deferred, focus])
  const max = Math.max(1, ...all.map((x) => x.c.high))
  const fam = FAMILIES.find((f) => f.id === focus)!

  const csv = () => ["family,used_by,tokens,low,high,characters", ...all.map(({ f, c }) => `${f.label},"${f.usedBy}",${c.tokens},${c.low},${c.high},${c.chars}`)].join("\n")

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Panel
          title="Your text"
          actions={
            <>
              <ActionButton onClick={() => setText(SAMPLE)}>
                <LanguagesIcon aria-hidden className="size-3.5" />
                Sample
              </ActionButton>
              <ActionButton onClick={() => setText("")} disabled={!text}>
                <EraserIcon aria-hidden className="size-3.5" />
                Clear
              </ActionButton>
            </>
          }
        >
          <label htmlFor="tk-text" className="sr-only">
            Text to count
          </label>
          <Textarea id="tk-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a prompt, a document or code…" className="max-h-[50vh] min-h-56 resize-y text-[14px] leading-relaxed" />
          <p className="mt-2 text-xs text-muted-foreground tabular">
            {fmtInt(detail.chars)} characters · about {fmtInt(detail.words)} words
          </p>
        </Panel>

        <Panel title="By tokenizer family" description="Estimated count, with the likely range." actions={<CopyAction text={csv} label="Copy CSV" />}>
          <ul className="flex flex-col gap-1" aria-label="Token estimates by family">
            {all.map(({ f, c }) => {
              const on = f.id === focus
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setFocus(f.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50",
                      on && "bg-white/[0.06] ring-1 ring-white/10"
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="text-sm font-medium">{f.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{f.usedBy}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular">≈{fmtInt(c.tokens)}</span>
                    </span>
                    <span aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <span className="absolute inset-y-0 rounded-full bg-ion/25" style={{ left: `${(c.low / max) * 100}%`, width: `${((c.high - c.low) / max) * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-full bg-ion transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(c.tokens / max) * 100}%` }} />
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular">
                      range {fmtInt(c.low)}–{fmtInt(c.high)} · {c.tokens ? (c.chars / c.tokens).toFixed(1) : "0"} chars per token
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>

      <Panel
        title={`How ${fam.label} might cut it`}
        description={`${fam.vocab}. ${fam.note}`}
        actions={
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Estimated tokens</div>
            <div className="text-2xl font-semibold tracking-tight">
              ≈<AnimatedNumber value={detail.tokens} />
            </div>
          </div>
        }
      >
        <div className="max-h-[50vh] overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-[1.9] break-words whitespace-pre-wrap" tabIndex={0} role="region" aria-label="Estimated token pieces">
          {detail.pieces.length === 0 ? (
            <span className="text-muted-foreground">Pieces appear here.</span>
          ) : (
            detail.pieces.map((p, i) => (
              <span key={i} className="rounded-[3px]" style={{ background: `rgb(${PALETTE[i % PALETTE.length]} / 0.16)`, boxShadow: `inset 0 -1px 0 rgb(${PALETTE[i % PALETTE.length]} / 0.45)` }}>
                {p.text}
              </span>
            ))
          )}
          {detail.truncated && <span className="block pt-2 font-sans text-xs text-muted-foreground">Showing the first 3,000 pieces.</span>}
        </div>
        {detail.byScript.length > 1 && (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {detail.byScript.map((s) => (
              <div key={s.script} className="flex gap-1.5">
                <dt>{SCRIPT_LABEL[s.script]}</dt>
                <dd className="text-foreground/85 tabular">≈{fmtInt(s.tokens)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Method: the text is split with the tiktoken-style pre-tokenizer pattern (words with their leading space, digit groups, punctuation, whitespace); each piece is costed with this family&rsquo;s calibrated rates and divided evenly for display. Real token boundaries inside a word can differ.
        </p>
      </Panel>
    </div>
  )
}
