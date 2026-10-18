"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { CpuIcon, InfoIcon, LaptopIcon, ServerIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ARCH_PRESETS,
  computeVram,
  DEVICES,
  fitOn,
  fmtParams,
  fromQuery,
  KV_PRECISIONS,
  OPTIMIZERS,
  PRECISIONS,
  resolveArch,
  toQuery,
  usable,
  type Arch,
  type Device,
  type KvPrecisionId,
  type LoraTargets,
  type Method,
  type Mode,
  type Optimizer,
  type PrecisionId,
  type VramInput,
} from "./vram"
import { AnimatedNumber, CopyAction, EASE, fmtGB, NativeSelect, NumberInput, Panel, RangeSlider, Segmented, SwitchRow, ToolSkeleton, useHydrated } from "./ui"

const SIZE_CHIPS = [1, 3, 8, 14, 32, 70, 405]

const ctxLabel = (n: number) => (n >= 1048576 ? `${+(n / 1048576).toFixed(2)}M` : n >= 1024 ? `${+(n / 1024).toFixed(1)}K` : String(n))

export function VramCalculator() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Calculator />
}

function Calculator() {
  const [input, setInput] = useState<VramInput>(() => fromQuery(new URLSearchParams(window.location.search)))
  const set = <K extends keyof VramInput>(k: K, v: VramInput[K]) => setInput((s) => ({ ...s, [k]: v }))
  const result = useMemo(() => computeVram(input), [input])
  const arch = resolveArch(input)
  const query = toQuery(input)

  // Keep the address bar in step, so the page can be shared or bookmarked as configured.
  useEffect(() => {
    const t = setTimeout(() => window.history.replaceState(null, "", `?${query}`), 250)
    return () => clearTimeout(t)
  }, [query])

  const setArch = (patch: Partial<Arch>) => setInput((s) => ({ ...s, archId: "custom", arch: { ...resolveArch(s), ...patch } }))

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex flex-col gap-4">
        <Panel title="Workload">
          <div className="flex flex-col gap-5">
            <Segmented<Mode>
              label="Workload"
              value={input.mode}
              onChange={(v) => set("mode", v)}
              options={[
                { value: "inference", label: "Inference" },
                { value: "training", label: "Fine-tuning" },
              ]}
            />

            <div className="flex flex-col gap-2">
              <NumberInput label="Parameters" suffix="B" value={input.params} onChange={(v) => set("params", v)} min={0.05} max={2000} step={1} smallStep={0.1} largeStep={10} hint="billions" />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common sizes">
                {SIZE_CHIPS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={input.params === n}
                    onClick={() => set("params", n)}
                    className={cn(
                      "pressable h-7 rounded-full border px-2.5 text-xs tabular transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      input.params === n ? "border-ion/50 bg-ion/10 text-ion" : "border-border text-muted-foreground hover:border-white/20 hover:text-foreground"
                    )}
                  >
                    {n}B
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vram-precision" className="text-sm font-medium text-foreground/90">
                {input.mode === "training" && input.method === "qlora" ? "Base weights (QLoRA uses 4-bit)" : "Weight precision"}
              </label>
              <NativeSelect id="vram-precision" value={input.precision} onChange={(v) => set("precision", v as PrecisionId)}>
                {(["Full and half precision", "8-bit", "GGUF (llama.cpp)", "4-bit"] as const).map((g) => (
                  <optgroup key={g} label={g}>
                    {PRECISIONS.filter((p) => p.group === g).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {p.bits} bits/param{p.note ? ` (${p.note})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-end justify-between gap-3">
                <span className="text-sm font-medium text-foreground/90">
                  {input.mode === "training" ? "Sequence length" : "Context length"}
                </span>
                <span className="text-sm text-muted-foreground tabular">{ctxLabel(input.context)} tokens</span>
              </div>
              <RangeSlider
                label={input.mode === "training" ? "Sequence length" : "Context length"}
                value={Math.round(Math.log2(Math.max(128, input.context)))}
                min={9}
                max={21}
                onChange={(v) => set("context", 2 ** v)}
                valueText={(v) => `${(2 ** v).toLocaleString("en")} tokens`}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Exact tokens" value={input.context} onChange={(v) => set("context", Math.max(128, Math.round(v)))} min={128} max={2_097_152} step={1024} largeStep={8192} smallStep={128} />
                <NumberInput label={input.mode === "training" ? "Micro-batch" : "Batch / parallel users"} value={input.batch} onChange={(v) => set("batch", Math.max(1, Math.round(v)))} min={1} max={1024} step={1} />
              </div>
            </div>

            <AnimatePresence initial={false} mode="popLayout">
              {input.mode === "inference" ? (
                <Reveal key="inf">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-foreground/90">KV cache precision</span>
                    <Segmented<KvPrecisionId> label="KV cache precision" value={input.kv} onChange={(v) => set("kv", v)} options={KV_PRECISIONS.map((k) => ({ value: k.id, label: k.label }))} />
                  </div>
                </Reveal>
              ) : (
                <Reveal key="train">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-foreground/90">Method</span>
                      <Segmented<Method>
                        label="Fine-tuning method"
                        value={input.method}
                        onChange={(v) => set("method", v)}
                        options={[
                          { value: "full", label: "Full", hint: "Every weight is trained" },
                          { value: "lora", label: "LoRA", hint: "Small adapters on frozen weights" },
                          { value: "qlora", label: "QLoRA", hint: "LoRA on 4-bit frozen weights" },
                        ]}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-foreground/90">Optimizer</span>
                      <Segmented<Optimizer> label="Optimizer" value={input.optimizer} onChange={(v) => set("optimizer", v)} options={OPTIMIZERS.map((o) => ({ value: o.id, label: o.label, hint: o.hint }))} />
                    </div>
                    {input.method !== "full" && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium text-foreground/90">LoRA rank</span>
                          <Segmented
                            label="LoRA rank"
                            value={String(input.rank)}
                            onChange={(v) => set("rank", Number(v))}
                            options={["8", "16", "32", "64", "128"].map((r) => ({ value: r, label: r }))}
                            itemClassName="px-1.5"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium text-foreground/90">Adapters on</span>
                          <Segmented<LoraTargets>
                            label="Adapter targets"
                            value={input.targets}
                            onChange={(v) => set("targets", v)}
                            options={[
                              { value: "attn", label: "Attention" },
                              { value: "all", label: "All linear" },
                            ]}
                          />
                        </div>
                      </div>
                    )}
                    <SwitchRow label="Gradient checkpointing" description="Recompute activations in the backward pass" checked={input.checkpointing} onChange={(v) => set("checkpointing", v)} />
                  </div>
                </Reveal>
              )}
            </AnimatePresence>
          </div>
        </Panel>

        <Panel as="div" className="p-0 sm:p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex flex-col">
                <span className="font-medium">Model shape</span>
                <span className="text-xs text-muted-foreground tabular">
                  {input.archId === "custom" ? "Custom" : input.archId === "auto" ? "Matched to size" : ARCH_PRESETS.find((p) => p.id === input.archId)?.label} · {arch.layers} layers · {arch.heads} heads ({arch.kvHeads} KV) · head dim {arch.headDim}
                </span>
              </span>
              <span aria-hidden className="text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <div className="flex flex-col gap-4 px-4 pb-5 sm:px-5">
              <p className="text-sm text-muted-foreground">The KV cache and activations depend on the model&rsquo;s shape. By default the shape is a typical one for the size you chose; pick another or set your own.</p>
              <NativeSelect aria-label="Model shape preset" value={input.archId} onChange={(v) => setInput((s) => ({ ...s, archId: v, arch: v === "custom" ? resolveArch(s) : s.arch }))}>
                <option value="auto">Match to parameter count</option>
                {ARCH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}: {p.arch.layers} layers, {p.arch.heads} heads, {p.arch.kvHeads} KV heads
                  </option>
                ))}
                <option value="custom">Custom</option>
              </NativeSelect>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Layers" value={arch.layers} onChange={(v) => setArch({ layers: Math.round(v) })} min={1} max={512} />
                <NumberInput label="Attention heads" value={arch.heads} onChange={(v) => setArch({ heads: Math.round(v) })} min={1} max={512} />
                <NumberInput label="KV heads" value={arch.kvHeads} onChange={(v) => setArch({ kvHeads: Math.round(v) })} min={1} max={512} hint="GQA" />
                <NumberInput label="Head dim" value={arch.headDim} onChange={(v) => setArch({ headDim: Math.round(v) })} min={8} max={1024} step={8} />
                <NumberInput label="Vocabulary" value={arch.vocab} onChange={(v) => setArch({ vocab: Math.round(v) })} min={256} max={1_000_000} step={1000} className="col-span-2" />
              </div>
            </div>
          </details>
        </Panel>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Breakdown input={input} result={result} query={query} />
        <Devices total={result.total} />
      </div>
    </div>
  )
}

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, filter: "blur(3px)" }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function Breakdown({ input, result, query }: { input: VramInput; result: ReturnType<typeof computeVram>; query: string }) {
  const total = result.total
  return (
    <Panel
      title="Estimated memory"
      actions={<CopyAction text={() => `${window.location.origin}/lab/vram?${query}`} label="Copy link" doneLabel="Link copied" />}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
          <AnimatedNumber value={total} format={fmtGB} />
        </div>
        <p className="pb-1.5 text-sm text-muted-foreground">
          {input.mode === "inference" ? "to run" : "to fine-tune"} a {input.params}B model in {result.effectivePrecision.label}
          {input.mode === "training" && input.method !== "full" ? ` · ${fmtParams(result.trainable)} trainable` : ""}
        </p>
      </div>

      <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-white/[0.06]" role="img" aria-label={`Memory breakdown: ${result.segments.map((s) => `${s.label} ${fmtGB(s.gb)}`).join(", ")}`}>
        {result.segments.map((s) => (
          <div
            key={s.id}
            className="h-full border-r border-black/40 transition-[width] duration-700 ease-[var(--ease-out)] last:border-r-0 motion-reduce:transition-none"
            style={{ width: `${total > 0 ? (s.gb / total) * 100 : 0}%`, background: s.color }}
          />
        ))}
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {result.segments.map((s) => (
          <li key={s.id} className="flex min-w-0 items-start gap-2.5">
            <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{s.label}</span>
                <AnimatedNumber value={s.gb} format={fmtGB} className="shrink-0 text-foreground/90" />
              </div>
              <p className="truncate text-xs text-muted-foreground" title={s.detail}>
                {s.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {result.notes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {result.notes.map((n) => (
            <li key={n} className="flex gap-2 rounded-lg bg-gold/[0.06] px-3 py-2 text-xs text-gold/90">
              <InfoIcon aria-hidden className="mt-px size-3.5 shrink-0" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

type DeviceFilter = "all" | "personal" | "gpu" | "dc"
const FILTERS: { value: DeviceFilter; label: string; test: (d: Device) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "personal", label: "Laptops & Macs", test: (d) => d.kind === "Laptop" || d.kind === "Unified memory" },
  { value: "gpu", label: "Desktop GPUs", test: (d) => d.kind === "Consumer GPU" || d.kind === "Workstation GPU" },
  { value: "dc", label: "Data centre", test: (d) => d.kind === "Data-centre GPU" },
]

const FIT_STYLE = {
  fits: { label: "Fits", cls: "bg-ok/10 text-ok ring-ok/25", bar: "var(--ok)" },
  tight: { label: "Tight", cls: "bg-gold/10 text-gold ring-gold/25", bar: "var(--gold)" },
  multi: { label: "", cls: "bg-ion/10 text-ion ring-ion/25", bar: "var(--ion)" },
  no: { label: "Won't fit", cls: "bg-white/[0.04] text-muted-foreground ring-white/10", bar: "#ff7a70" },
} as const

function Devices({ total }: { total: number }) {
  const [filter, setFilter] = useState<DeviceFilter>("all")
  const list = DEVICES.filter(FILTERS.find((f) => f.value === filter)!.test)
  const smallest = DEVICES.find((d) => fitOn(d, total).fit === "fits")

  return (
    <Panel title="Where it fits" description="Usable memory on unified-memory machines is taken as about 75% of the total.">
      {smallest && (
        <p className="mb-3 flex items-center gap-2 text-sm">
          <SparklesIcon aria-hidden className="size-4 text-ion" />
          <span>
            Smallest comfortable fit: <span className="font-medium text-foreground">{smallest.name}</span>
          </span>
        </p>
      )}
      <Segmented<DeviceFilter> label="Device type" value={filter} onChange={setFilter} options={FILTERS.map(({ value, label }) => ({ value, label }))} className="mb-3" itemClassName="flex-auto text-xs sm:text-[13px]" />
      <ul className="flex flex-col divide-y divide-border">
        {list.map((d) => {
          const f = fitOn(d, total)
          const st = FIT_STYLE[f.fit]
          const Icon = d.kind === "Data-centre GPU" ? ServerIcon : d.kind === "Laptop" || d.kind === "Unified memory" ? LaptopIcon : CpuIcon
          return (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm">{d.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">
                    {d.unified ? `${d.vram} GB · ~${Math.round(usable(d))} usable` : `${d.vram} GB`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-700 ease-[var(--ease-out)] motion-reduce:transition-none"
                    style={{ width: `${Math.min(100, f.ratio * 100)}%`, background: st.bar }}
                  />
                </div>
              </div>
              <span className={cn("w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ring-1 ring-inset", st.cls)}>
                {f.fit === "multi" ? `${f.count}× needed` : st.label}
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
