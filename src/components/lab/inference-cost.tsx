"use client"

import { useEffect, useMemo, useState } from "react"
import { ExternalLinkIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { computeRow, DEFAULT_WORKLOAD, fmtMoney, fmtSeconds, PRICE_PRESETS, type PriceRow, type Workload } from "@/lib/lab/cost"
import { cn } from "@/lib/utils"
import { ActionButton, AnimatedNumber, CopyAction, downloadText, fmtCompact, NativeSelect, NumberInput, Panel, RangeSlider, readStored, ToolSkeleton, useHydrated, writeStored } from "./ui"
import { Copy } from "@/components/content/copy"

const KEY = "nexverse:lab:inference-cost"
const uid = () => Math.random().toString(36).slice(2, 10)
const START: PriceRow[] = [PRICE_PRESETS[1], PRICE_PRESETS[6]].map((p) => ({ ...p, id: uid() }))

type Saved = { rows: PriceRow[]; w: Workload }

export function InferenceCost() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Inner />
}

const cell = "h-9 w-full min-w-0 rounded-lg border border-input bg-input/30 px-2 text-base tabular outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"

function Num({ value, onChange, label, step = 0.01 }: { value: number; onChange: (n: number) => void; label: string; step?: number }) {
  return <input type="number" inputMode="decimal" min={0} step={step} aria-label={label} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className={cn(cell, "text-right")} />
}

function Inner() {
  const [state, setState] = useState<Saved>(() => {
    const s = readStored<Partial<Saved>>(KEY, {})
    return { rows: Array.isArray(s.rows) && s.rows.length ? s.rows : START, w: { ...DEFAULT_WORKLOAD, ...s.w } }
  })
  const [preset, setPreset] = useState("")
  const { rows, w } = state
  const setW = <K extends keyof Workload>(k: K, v: Workload[K]) => setState((s) => ({ ...s, w: { ...s.w, [k]: v } }))
  const setRow = (id: string, patch: Partial<PriceRow>) => setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch, ...(("inPrice" in patch || "outPrice" in patch) && r.source ? { source: undefined } : {}) } : r)) }))

  useEffect(() => {
    const t = setTimeout(() => writeStored(KEY, state), 300)
    return () => clearTimeout(t)
  }, [state])

  const results = useMemo(() => rows.map((r) => ({ r, x: computeRow(r, w) })), [rows, w])
  const maxMonth = Math.max(1e-9, ...results.map((x) => x.x.perMonth))
  const cheapest = results.length ? results.reduce((a, b) => (b.x.perMonth < a.x.perMonth ? b : a)) : null

  function add(name: string) {
    const p = PRICE_PRESETS.find((x) => x.name === name)
    const row: PriceRow = p ? { ...p, id: uid() } : { id: uid(), name: "My model", inPrice: 0, outPrice: 0, cachedPrice: 0, tps: 50, ttft: 1 }
    setState((s) => ({ ...s, rows: [...s.rows, row].slice(0, 12) }))
    setPreset("")
  }

  const csv = () =>
    [
      "model,input_usd_per_m,output_usd_per_m,cached_usd_per_m,tokens_per_s,ttft_s,cost_per_request,cost_per_day,cost_per_month,latency_s,avg_concurrency,peak_concurrency",
      ...results.map(({ r, x }) => [JSON.stringify(r.name), r.inPrice, r.outPrice, r.cachedPrice, r.tps, r.ttft, x.perReq.toFixed(6), x.perDay.toFixed(4), x.perMonth.toFixed(2), x.latency.toFixed(2), x.concurrency.toFixed(2), x.peakConcurrency.toFixed(2)].join(",")),
    ].join("\n")

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <Panel title="Your traffic" actions={<ActionButton onClick={() => setState((s) => ({ ...s, w: DEFAULT_WORKLOAD }))}><RotateCcwIcon aria-hidden className="size-3.5" />Reset</ActionButton>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <NumberInput label="Input tokens" value={w.inTokens} onChange={(v) => setW("inTokens", v)} min={0} step={100} hint="per request" />
            <NumberInput label="Output tokens" value={w.outTokens} onChange={(v) => setW("outTokens", v)} min={0} step={50} hint="per request" />
            <NumberInput label="Requests per day" value={w.perDay} onChange={(v) => setW("perDay", v)} min={0} step={100} />
            <NumberInput label="Days per month" value={w.days} onChange={(v) => setW("days", v)} min={1} max={31} step={1} />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground/90"><Copy k="lab-tool.inference-cost.cached-input-share">Cached input share</Copy></span>
              <span className="text-xs text-muted-foreground tabular">{Math.round(w.cachedShare * 100)}%</span>
            </div>
            <RangeSlider label="Cached input share" value={w.cachedShare} onChange={(v) => setW("cachedShare", v)} min={0} max={1} step={0.05} valueText={(v) => `${Math.round(v * 100)}%`} />
            <p className="text-xs text-muted-foreground"><Copy k="lab-tool.inference-cost.applies-only-to-rows-with">Applies only to rows with a cached price.</Copy></p>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground/90"><Copy k="lab-tool.inference-cost.peak-hour-vs-average">Peak hour vs average</Copy></span>
              <span className="text-xs text-muted-foreground tabular">×{w.peak}</span>
            </div>
            <RangeSlider label="Peak hour multiple" value={w.peak} onChange={(v) => setW("peak", v)} min={1} max={10} step={0.5} valueText={(v) => `${v} times`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground tabular">{fmtCompact((w.inTokens + w.outTokens) * w.perDay * w.days)} tokens a month.</p>
        </Panel>

        <Panel
          title="Monthly cost"
          description={cheapest ? `Cheapest: ${cheapest.r.name}` : "Add a model to compare."}
          actions={
            <>
              <CopyAction text={csv} label="Copy CSV" />
              <ActionButton onClick={() => downloadText("inference-cost.csv", csv(), "text/csv")}>Download</ActionButton>
            </>
          }
        >
          <ul className="flex flex-col gap-3">
            {results.map(({ r, x }) => (
              <li key={r.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.name || "Unnamed"}</span>
                  <span className="shrink-0 font-semibold tabular">
                    <AnimatedNumber value={x.perMonth} format={fmtMoney} />
                  </span>
                </div>
                <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,rgb(216_197_158/0.5),var(--gold))] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(x.perMonth / maxMonth) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular">
                  <span>{fmtMoney(x.perReq)} per request</span>
                  <span>{fmtMoney(x.perDay)} per day</span>
                  <span>answer in {fmtSeconds(x.latency)}</span>
                  <span>
                    {x.concurrency.toFixed(1)} at once on average, {x.peakConcurrency.toFixed(1)} at peak
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Prices and speeds"
        description="USD per million tokens. Speed is output tokens per second for one request, and time to first token in seconds: measure them on your own traffic, they vary by load and provider."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Add a model" value={preset} onChange={(v) => v && add(v)} className="w-56">
              <option value="">Add a listed model…</option>
              {PRICE_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <ActionButton onClick={() => add("")}>
              <PlusIcon aria-hidden className="size-3.5" />
              Custom row
            </ActionButton>
          </div>
        }
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="font-medium"><Copy k="lab-tool.inference-cost.model">Model</Copy></th>
                <th className="w-24 text-right font-medium"><Copy k="lab-tool.inference-cost.input-m">Input $/M</Copy></th>
                <th className="w-24 text-right font-medium"><Copy k="lab-tool.inference-cost.output-m">Output $/M</Copy></th>
                <th className="w-24 text-right font-medium"><Copy k="lab-tool.inference-cost.cached-m">Cached $/M</Copy></th>
                <th className="w-24 text-right font-medium"><Copy k="lab-tool.inference-cost.tokens-s">Tokens/s</Copy></th>
                <th className="w-20 text-right font-medium"><Copy k="lab-tool.inference-cost.ttft-s">TTFT s</Copy></th>
                <th className="w-10">
                  <span className="sr-only"><Copy k="lab-tool.inference-cost.remove">Remove</Copy></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="pr-2">
                    <input aria-label="Model name" value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} className={cell} />
                    {r.source && (
                      <a href={r.source.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                        List price, checked {r.source.checked}
                        <ExternalLinkIcon aria-hidden className="size-3" />
                      </a>
                    )}
                  </td>
                  <td className="pr-2 align-top">
                    <Num label={`${r.name} input price`} value={r.inPrice} onChange={(v) => setRow(r.id, { inPrice: v })} />
                  </td>
                  <td className="pr-2 align-top">
                    <Num label={`${r.name} output price`} value={r.outPrice} onChange={(v) => setRow(r.id, { outPrice: v })} />
                  </td>
                  <td className="pr-2 align-top">
                    <Num label={`${r.name} cached input price`} value={r.cachedPrice} onChange={(v) => setRow(r.id, { cachedPrice: v })} />
                  </td>
                  <td className="pr-2 align-top">
                    <Num label={`${r.name} tokens per second`} value={r.tps} step={5} onChange={(v) => setRow(r.id, { tps: v })} />
                  </td>
                  <td className="pr-2 align-top">
                    <Num label={`${r.name} time to first token`} value={r.ttft} step={0.1} onChange={(v) => setRow(r.id, { ttft: v })} />
                  </td>
                  <td className="align-top">
                    <button
                      type="button"
                      aria-label={`Remove ${r.name}`}
                      onClick={() => setState((s) => ({ ...s, rows: s.rows.filter((x) => x.id !== r.id) }))}
                      className="flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Trash2Icon aria-hidden className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <Copy k="lab-tool.inference-cost.listed-prices-are-standard-non" multiline>Listed prices are standard, non-batch API rates read from each vendor&rsquo;s pricing page on the date shown; editing a price removes its source note. Concurrency uses Little&rsquo;s law: requests per second × seconds per request.</Copy>
        </p>
      </Panel>
    </div>
  )
}
