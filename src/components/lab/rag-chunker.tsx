"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { EraserIcon, FileTextIcon } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { chunk, SPLITTERS, stats, type Chunk, type Splitter } from "@/lib/lab/chunk"
import { fmtMoney } from "@/lib/lab/cost"
import { cn } from "@/lib/utils"
import { ActionButton, CopyAction, downloadText, fmtInt, NumberInput, Panel, Segmented } from "./ui"

const SAMPLE = `# Retrieval-augmented generation

Retrieval-augmented generation (RAG) gives a language model passages from your own documents at question time. The model answers from those passages instead of only from what it learned in training.

## Why chunk at all

Embedding models have an input limit, and long passages blur many topics into one vector. Smaller chunks match questions more precisely. Chunks that are too small lose the context a reader needs.

## Overlap

Overlap repeats the end of one chunk at the start of the next. It keeps a sentence that straddles a boundary findable from both sides. It also stores some text twice, which costs embeddings and index space.

## Choosing a splitter

Fixed-size splitting is simple and predictable. Sentence splitting keeps thoughts whole. Splitting on Markdown headings keeps each section together, which suits manuals and documentation.`

const HUES = ["143 180 255", "127 224 176", "216 197 158", "211 180 255", "255 159 138", "127 214 224"]

type Seg = { start: number; end: number; ids: number[] }

/** Cuts the text into runs that are covered by the same set of chunks, so overlaps can be drawn. */
function segments(text: string, chunks: Chunk[]): Seg[] {
  const points = new Set<number>([0, text.length])
  for (const c of chunks) {
    points.add(c.start)
    points.add(c.end)
  }
  const sorted = [...points].sort((a, b) => a - b)
  const out: Seg[] = []
  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k]
    const b = sorted[k + 1]
    if (b <= a) continue
    out.push({ start: a, end: b, ids: chunks.filter((c) => c.start <= a && c.end >= b).map((c) => c.index) })
  }
  return out
}

export function RagChunker() {
  const [text, setText] = useState(SAMPLE)
  const [splitter, setSplitter] = useState<Splitter>("markdown")
  const [size, setSize] = useState(400)
  const [overlap, setOverlap] = useState(40)
  const [price, setPrice] = useState(0.02)
  const [active, setActive] = useState<number | null>(null)
  const deferred = useDeferredValue(text)
  const sp = SPLITTERS.find((s) => s.id === splitter)!

  const chunks = useMemo(() => chunk(deferred, { splitter, size, overlap }), [deferred, splitter, size, overlap])
  const st = useMemo(() => stats(chunks, deferred.length), [chunks, deferred.length])
  const segs = useMemo(() => (deferred.length <= 60000 ? segments(deferred, chunks) : []), [deferred, chunks])
  const cost = (st.totalTokens * price) / 1e6

  function changeSplitter(v: Splitter) {
    setSplitter(v)
    if (v === "tokens") {
      setSize(256)
      setOverlap(32)
    } else if (v === "sentences") {
      setSize(400)
      setOverlap(1)
    } else {
      setSize(v === "markdown" ? 800 : 400)
      setOverlap(40)
    }
    setActive(null)
  }

  const jsonl = () => chunks.map((c) => JSON.stringify({ id: c.index, start: c.start, end: c.end, heading: c.heading, text: c.text })).join("\n")

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Panel
          title="Document"
          actions={
            <>
              <ActionButton onClick={() => setText(SAMPLE)}>
                <FileTextIcon aria-hidden className="size-3.5" />
                Sample
              </ActionButton>
              <ActionButton onClick={() => setText("")} disabled={!text}>
                <EraserIcon aria-hidden className="size-3.5" />
                Clear
              </ActionButton>
            </>
          }
        >
          <label htmlFor="rag-text" className="sr-only">
            Document text
          </label>
          <Textarea id="rag-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a document, Markdown works best…" className="max-h-[45vh] min-h-48 resize-y font-mono text-[13px] leading-relaxed md:text-[13px]" />
          <p className="mt-2 text-xs text-muted-foreground tabular">{fmtInt(text.length)} characters</p>
        </Panel>

        <Panel title="Splitter">
          <div className="flex flex-col gap-4">
            <Segmented<Splitter> label="Splitter" value={splitter} onChange={changeSplitter} options={SPLITTERS.map((s) => ({ value: s.id, label: s.label, hint: s.hint }))} itemClassName="flex-auto" />
            <p className="text-sm text-muted-foreground">{sp.hint}.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Chunk size" value={size} onChange={(v) => setSize(Math.max(splitter === "tokens" ? 8 : 50, Math.round(v)))} min={splitter === "tokens" ? 8 : 50} max={20000} step={splitter === "tokens" ? 32 : 100} smallStep={splitter === "tokens" ? 1 : 10} suffix={sp.sizeUnit} />
              <NumberInput label="Overlap" value={overlap} onChange={(v) => setOverlap(Math.max(0, Math.round(v)))} min={0} max={splitter === "sentences" ? 5 : Math.max(0, size - 1)} step={splitter === "sentences" ? 1 : 10} smallStep={1} suffix={sp.overlapUnit} />
            </div>
            <NumberInput label="Embedding price" value={price} onChange={setPrice} min={0} step={0.01} smallStep={0.001} suffix="$ / M tokens" hint="your model's price" />
            <p className="-mt-2 text-xs text-muted-foreground">
              Starts at OpenAI text-embedding-3-small&rsquo;s list price, $0.02 per million tokens (
              <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                checked 2026-10-19
              </a>
              ).
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="Chunk statistics">
        {[
          { k: "Chunks", v: fmtInt(st.count) },
          { k: "Tokens to embed", v: fmtInt(st.totalTokens) },
          { k: "Average chunk", v: `${fmtInt(st.avgTokens)} tokens` },
          { k: "Smallest / largest", v: `${fmtInt(st.minTokens)} / ${fmtInt(st.maxTokens)}` },
          { k: "Embedding cost", v: fmtMoney(cost) },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-border bg-card/60 px-4 py-3">
            <div className="text-xs text-muted-foreground">{x.k}</div>
            <div className="mt-0.5 text-lg font-semibold tracking-tight tabular">{x.v}</div>
          </div>
        ))}
      </div>

      <Panel
        title="Chunks in place"
        description={st.duplicatedChars > 0 ? `Overlaps repeat ${fmtInt(st.duplicatedChars)} characters. Striped text belongs to two chunks.` : "Each colour is one chunk. Hover or focus a chunk in the list to find it."}
        actions={
          <>
            <CopyAction text={jsonl} label="Copy JSONL" />
            <ActionButton onClick={() => downloadText("chunks.jsonl", jsonl(), "application/x-ndjson")} disabled={!chunks.length}>
              Download
            </ActionButton>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap" tabIndex={0} role="region" aria-label="Document coloured by chunk">
            {segs.length === 0 && deferred.length > 60000 ? (
              <span className="text-muted-foreground">The document is too long to colour in place; the chunk list still shows every chunk.</span>
            ) : segs.length === 0 ? (
              <span className="text-muted-foreground">Paste a document to see its chunks.</span>
            ) : (
              segs.map((s, k) => {
                const t = deferred.slice(s.start, s.end)
                if (!s.ids.length) return <span key={k} className="text-muted-foreground/60">{t}</span>
                const a = HUES[s.ids[0] % HUES.length]
                const b = HUES[s.ids[s.ids.length - 1] % HUES.length]
                const dim = active != null && !s.ids.includes(active)
                return (
                  <span
                    key={k}
                    className={cn("rounded-[2px] transition-opacity duration-150", dim && "opacity-35")}
                    style={{
                      background: s.ids.length > 1 ? `repeating-linear-gradient(135deg, rgb(${a} / 0.22) 0 6px, rgb(${b} / 0.22) 6px 12px)` : `rgb(${a} / 0.16)`,
                      boxShadow: `inset 0 -1px 0 rgb(${a} / 0.5)`,
                    }}
                  >
                    {t}
                  </span>
                )
              })
            )}
          </div>
          <ol className="flex max-h-[60vh] flex-col gap-1.5 overflow-auto pr-1" aria-label="Chunk list">
            {chunks.slice(0, 500).map((c) => (
              <li key={c.index}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(c.index)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(c.index)}
                  onBlur={() => setActive(null)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-border bg-white/[0.02] px-3 py-2 text-left outline-none hover:bg-white/[0.05] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: `rgb(${HUES[c.index % HUES.length]})` }} />
                      <span className="font-medium">#{c.index + 1}</span>
                      {c.heading && <span className="truncate text-muted-foreground">{c.heading}</span>}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {fmtInt(c.chars)} chars · ≈{fmtInt(c.tokens)} tok
                    </span>
                  </span>
                  <span className="line-clamp-2 font-mono text-[12px] text-foreground/75">{c.text.trim()}</span>
                </button>
              </li>
            ))}
            {chunks.length > 500 && <li className="px-1 text-xs text-muted-foreground">Showing 500 of {fmtInt(chunks.length)} chunks; download for all.</li>}
          </ol>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Token counts are estimates with the o200k family rates from the token counter. Your embedding model&rsquo;s tokenizer may count differently.</p>
      </Panel>
    </div>
  )
}
