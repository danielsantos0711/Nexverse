"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { EraserIcon, TriangleAlertIcon } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { matrix, norm, parseVectors, type Metric } from "@/lib/lab/vectors"
import { ActionButton, CopyAction, Panel, Segmented } from "./ui"

/* A tiny worked example (not real embeddings): three directions in four dimensions, so the maths is easy to check. */
const EXAMPLE = `north: 1, 0, 0, 0
north-east: 0.7071, 0.7071, 0, 0
east: 0, 1, 0, 0
south: -1, 0, 0, 0`

export function EmbeddingSimilarity() {
  const [text, setText] = useState(EXAMPLE)
  const [metric, setMetric] = useState<Metric>("cosine")
  const deferred = useDeferredValue(text)
  const parsed = useMemo(() => parseVectors(deferred), [deferred])
  const vs = parsed.vectors.slice(0, 24)
  const dims = new Set(vs.map((v) => v.values.length))
  const mismatch = dims.size > 1
  const m = useMemo(() => (vs.length && !mismatch ? matrix(vs, metric) : []), [vs, metric, mismatch])

  const flat = m.flatMap((r, i) => r.filter((_, j) => j !== i))
  const lo = flat.length ? Math.min(...flat) : 0
  const hi = flat.length ? Math.max(...flat) : 1
  // Higher is closer for cosine and dot; lower is closer for distance.
  const closeness = (x: number) => {
    if (metric === "cosine") return (x + 1) / 2
    const t = hi === lo ? 1 : (x - lo) / (hi - lo)
    return metric === "dot" ? t : 1 - t
  }
  const pairs = useMemo(() => {
    const out: { a: string; b: string; v: number }[] = []
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) out.push({ a: vs[i].label, b: vs[j].label, v: m[i][j] })
    return out.sort((x, y) => (metric === "euclidean" ? x.v - y.v : y.v - x.v))
  }, [m, vs, metric])
  const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(3))
  const csv = () => [["", ...vs.map((v) => v.label)].join(","), ...m.map((r, i) => [vs[i].label, ...r.map(fmt)].join(","))].join("\n")

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Panel
        title="Vectors"
        description="One per line as label: numbers, or JSON (an array of arrays, or an object of label to array). Up to 24 vectors."
        actions={
          <>
            <ActionButton onClick={() => setText(EXAMPLE)}>Example</ActionButton>
            <ActionButton onClick={() => setText("")} disabled={!text}>
              <EraserIcon aria-hidden className="size-3.5" />
              Clear
            </ActionButton>
          </>
        }
      >
        <label htmlFor="emb-text" className="sr-only">
          Vectors
        </label>
        <Textarea id="emb-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="max-h-[50vh] min-h-56 resize-y font-mono text-[12px] md:text-[12px]" />
        <div aria-live="polite" className="mt-2 flex flex-col gap-1 text-xs">
          {vs.length > 0 && !mismatch && (
            <p className="text-muted-foreground">
              {vs.length} vectors, {[...dims][0]} dimensions{vs.every((v) => Math.abs(norm(v.values) - 1) < 1e-3) ? ", all unit length (cosine equals dot product)" : ""}.
            </p>
          )}
          {mismatch && (
            <p className="flex items-center gap-1.5 text-destructive">
              <TriangleAlertIcon aria-hidden className="size-3.5" />
              Vectors have different lengths ({[...dims].join(", ")}). Compare vectors from the same model.
            </p>
          )}
          {parsed.errors.slice(0, 5).map((e) => (
            <p key={e} className="text-destructive">
              {e}
            </p>
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Pairwise" actions={m.length > 0 && <CopyAction text={csv} label="Copy CSV" />}>
          <Segmented<Metric>
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "cosine", label: "Cosine" },
              { value: "dot", label: "Dot product" },
              { value: "euclidean", label: "Distance" },
            ]}
            className="mb-4"
          />
          {m.length === 0 ? (
            <p className="text-sm text-muted-foreground">Paste at least two vectors of the same length.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0.5 text-[11px] tabular">
                <thead>
                  <tr>
                    <th />
                    {vs.map((v) => (
                      <th key={v.label} scope="col" className="max-w-20 truncate px-1 pb-1 text-left font-medium text-muted-foreground">
                        {v.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.map((r, i) => (
                    <tr key={i}>
                      <th scope="row" className="max-w-24 truncate pr-2 text-left font-medium text-muted-foreground">
                        {vs[i].label}
                      </th>
                      {r.map((x, j) => (
                        <td key={j} className="h-9 min-w-12 rounded-md px-1.5 text-center" style={{ background: i === j ? "rgb(255 255 255 / 0.04)" : `rgb(143 180 255 / ${0.06 + closeness(x) * 0.5})` }}>
                          {fmt(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Cosine = a·b ÷ (|a| |b|), from −1 to 1. Dot product = Σ aᵢbᵢ. Distance = √Σ (aᵢ − bᵢ)². Brighter cells are closer.
          </p>
        </Panel>
        {pairs.length > 0 && (
          <Panel title="Closest pairs">
            <ol className="flex flex-col gap-1 text-sm">
              {pairs.slice(0, 8).map((p, k) => (
                <li key={k} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {p.a} <span className="text-muted-foreground">↔</span> {p.b}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular">{fmt(p.v)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
    </div>
  )
}
