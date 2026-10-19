"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CopyAction, fmtGB, NumberInput, Panel } from "./ui"
import { PRECISIONS } from "./vram"

/*
 * Weight size at each precision: parameters × bits per weight ÷ 8. The GGUF bit widths include the per-block
 * scales (for example Q4_K_M averages about 4.85 bits), so they match real file sizes closely.
 */
export function Quantization() {
  const [params, setParams] = useState(8)
  const [budget, setBudget] = useState(24)
  const rows = PRECISIONS.map((p) => ({ p, gb: (params * 1e9 * p.bits) / 8 / 1e9 }))
  const base = (params * 1e9 * 16) / 8 / 1e9
  const max = Math.max(...rows.map((r) => r.gb))
  const md = () => ["| Precision | Bits per weight | Size | vs 16-bit |", "|---|---|---|---|", ...rows.map(({ p, gb }) => `| ${p.label} | ${p.bits} | ${fmtGB(gb)} | ${Math.round((gb / base) * 100)}% |`)].join("\n")

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <Panel title="Model">
        <div className="flex flex-col gap-4">
          <NumberInput label="Parameters" value={params} onChange={(v) => setParams(Math.max(0.01, v))} min={0.01} max={2000} step={1} smallStep={0.1} suffix="B" />
          <NumberInput label="Memory budget" value={budget} onChange={(v) => setBudget(Math.max(0, v))} min={0} step={4} suffix="GB" hint="GPU or unified memory" />
          <p className="text-xs text-muted-foreground">
            Sizes cover the weights only. Running the model also needs the KV cache and runtime buffers; leave 10–20% headroom, or use the VRAM calculator for the full picture.
          </p>
        </div>
      </Panel>
      <Panel title="Size at each precision" actions={<CopyAction text={md} label="Copy table" />}>
        <ul className="flex flex-col gap-2.5">
          {rows.map(({ p, gb }) => {
            const fits = gb * 1.15 <= budget
            const tight = !fits && gb <= budget
            return (
              <li key={p.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_6rem]">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.label}</span>
                  <span className="block text-[11px] text-muted-foreground tabular">
                    {p.bits} bits · {p.group}
                  </span>
                </span>
                <span aria-hidden className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none", fits ? "bg-ok/80" : tight ? "bg-gold/80" : "bg-destructive/70")} style={{ width: `${(gb / max) * 100}%` }} />
                  {budget > 0 && budget < max && <span className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${(budget / max) * 100}%` }} />}
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular">{fmtGB(gb)}</span>
                  <span className={cn("block text-[11px]", fits ? "text-ok" : tight ? "text-gold" : "text-destructive")}>{fits ? "fits" : tight ? "tight" : "too big"}</span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Size = parameters × bits per weight ÷ 8. GGUF widths are the average including block scales, as llama.cpp reports them. &ldquo;Fits&rdquo; leaves 15% of the budget for everything else.
        </p>
      </Panel>
    </div>
  )
}
