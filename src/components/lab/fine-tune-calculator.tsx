"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckIcon, ExternalLinkIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react"
import { computeFineTune, DEFAULT_FT, fmtDuration, GPUS, SOURCES, type FineTuneInput } from "@/lib/lab/finetune"
import { cn } from "@/lib/utils"
import { ActionButton, AnimatedNumber, CopyAction, fmtCompact, fmtGB, NativeSelect, NumberInput, Panel, RangeSlider, readStored, Segmented, SwitchRow, ToolSkeleton, useHydrated, writeStored } from "./ui"
import { fmtParams, OPTIMIZERS, type Method, type Optimizer } from "./vram"

const KEY = "nexverse:lab:fine-tuning"

export function FineTuneCalculator() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Inner />
}

function Inner() {
  const [i, setI] = useState<FineTuneInput>(() => ({ ...DEFAULT_FT, ...readStored<Partial<FineTuneInput>>(KEY, {}) }))
  const set = <K extends keyof FineTuneInput>(k: K, v: FineTuneInput[K]) => setI((p) => ({ ...p, [k]: v }))
  useEffect(() => {
    const t = setTimeout(() => writeStored(KEY, i), 300)
    return () => clearTimeout(t)
  }, [i])

  const r = useMemo(() => computeFineTune(i), [i])
  const gpu = GPUS.find((g) => g.id === i.gpuId)
  const total = r.memory.total
  const gpuHours = (r.seconds / 3600) * i.gpus

  const summary = () =>
    [
      `Fine-tuning estimate (${i.method.toUpperCase()}, ${i.params}B params)`,
      `Memory per GPU: ${fmtGB(total)} (${r.fits ? "fits" : "does not fit"} in ${i.gpuMemory} GB)`,
      ...r.memory.segments.map((s) => `  ${s.label}: ${fmtGB(s.gb)}`),
      `Trainable parameters: ${fmtParams(r.memory.trainable || i.params * 1e9)}`,
      `Training tokens: ${fmtCompact(r.tokens)} (${i.datasetM}M × ${i.epochs} epochs), ${r.steps.toLocaleString("en")} steps`,
      `Compute: ${r.factor}·N FLOPs per token = ${r.totalFlops.toExponential(2)} FLOPs`,
      `Time: ${fmtDuration(r.seconds)} on ${i.gpus} × ${gpu?.name ?? "custom GPU"} at ${Math.round(i.mfu * 100)}% utilisation (${gpuHours.toFixed(1)} GPU-hours)`,
    ].join("\n")

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex flex-col gap-4">
        <Panel title="Model and method" actions={<ActionButton onClick={() => setI(DEFAULT_FT)}><RotateCcwIcon aria-hidden className="size-3.5" />Reset</ActionButton>}>
          <div className="flex flex-col gap-4">
            <NumberInput label="Parameters" value={i.params} onChange={(v) => set("params", v)} min={0.1} max={1000} step={1} smallStep={0.1} suffix="B" />
            <Segmented<Method>
              label="Method"
              value={i.method}
              onChange={(v) => set("method", v)}
              options={[
                { value: "full", label: "Full", hint: "Train every weight" },
                { value: "lora", label: "LoRA", hint: "Frozen 16-bit base, small adapters" },
                { value: "qlora", label: "QLoRA", hint: "Frozen 4-bit base, small adapters" },
              ]}
            />
            {i.method !== "qlora" && (
              <Segmented<"bf16" | "fp32">
                label="Weight precision"
                value={i.precision === "fp32" ? "fp32" : "bf16"}
                onChange={(v) => set("precision", v)}
                options={[
                  { value: "bf16", label: "BF16 mixed precision" },
                  { value: "fp32", label: "FP32" },
                ]}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ft-opt" className="text-sm font-medium text-foreground/90">
                Optimizer
              </label>
              <NativeSelect id="ft-opt" value={i.optimizer} onChange={(v) => set("optimizer", v as Optimizer)}>
                {OPTIMIZERS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.hint.toLowerCase()})
                  </option>
                ))}
              </NativeSelect>
            </div>
            {i.method !== "full" && <NumberInput label="LoRA rank" value={i.rank} onChange={(v) => set("rank", Math.round(v))} min={1} max={512} step={8} smallStep={1} hint="all linear layers" />}
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Sequence length" value={i.seq} onChange={(v) => set("seq", Math.round(v))} min={128} max={131072} step={512} smallStep={128} />
              <NumberInput label="Micro-batch per GPU" value={i.batch} onChange={(v) => set("batch", Math.round(v))} min={1} max={256} step={1} />
            </div>
            <SwitchRow label="Gradient checkpointing" description="Far less activation memory, about a third more compute." checked={i.checkpointing} onChange={(v) => set("checkpointing", v)} />
          </div>
        </Panel>

        <Panel title="Data and hardware">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Dataset size" value={i.datasetM} onChange={(v) => set("datasetM", v)} min={0} step={10} smallStep={1} suffix="M tokens" />
              <NumberInput label="Epochs" value={i.epochs} onChange={(v) => set("epochs", v)} min={0} max={100} step={1} smallStep={0.5} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ft-gpu" className="text-sm font-medium text-foreground/90">
                GPU
              </label>
              <NativeSelect
                id="ft-gpu"
                value={i.gpuId}
                onChange={(v) => {
                  const g = GPUS.find((x) => x.id === v)
                  setI((p) => ({ ...p, gpuId: v, ...(g ? { tflops: g.tflops, gpuMemory: g.memory } : {}) }))
                }}
              >
                {GPUS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}: {g.tflops} TFLOPS, {g.memory} GB
                  </option>
                ))}
                <option value="custom">Custom</option>
              </NativeSelect>
              {gpu && (
                <a href={gpu.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Dense BF16 tensor throughput from NVIDIA&rsquo;s spec sheet
                  <ExternalLinkIcon aria-hidden className="size-3" />
                </a>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberInput label="Peak TFLOPS" value={i.tflops} onChange={(v) => setI((p) => ({ ...p, tflops: v, gpuId: "custom" }))} min={1} step={10} />
              <NumberInput label="Memory" value={i.gpuMemory} onChange={(v) => setI((p) => ({ ...p, gpuMemory: v, gpuId: "custom" }))} min={1} step={8} suffix="GB" />
              <NumberInput label="GPUs" value={i.gpus} onChange={(v) => set("gpus", Math.max(1, Math.round(v)))} min={1} max={4096} step={1} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground/90">Utilisation (MFU)</span>
                <span className="text-xs text-muted-foreground tabular">{Math.round(i.mfu * 100)}%</span>
              </div>
              <RangeSlider label="Model FLOPs utilisation" value={i.mfu} onChange={(v) => set("mfu", v)} min={0.05} max={0.7} step={0.01} valueText={(v) => `${Math.round(v * 100)} percent`} />
              <p className="text-xs text-muted-foreground">Share of peak throughput actually used. Well-tuned training often reaches 30–50%; small batches and QLoRA run lower.</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel title="Memory per GPU" actions={<CopyAction text={summary} label="Copy summary" />}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="text-3xl font-semibold tracking-tight">
              <AnimatedNumber value={total} format={fmtGB} />
            </div>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", r.fits ? "bg-ok/10 text-ok ring-ok/25" : "bg-destructive/10 text-destructive ring-destructive/25")}>
              {r.fits ? <CheckIcon aria-hidden className="size-3" /> : <TriangleAlertIcon aria-hidden className="size-3" />}
              {r.fits ? `Fits in ${i.gpuMemory} GB` : `Needs more than ${i.gpuMemory} GB`}
            </span>
          </div>
          <div aria-hidden className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
            {r.memory.segments.map((s) => (
              <span key={s.id} className="h-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(s.gb / Math.max(total, i.gpuMemory)) * 100}%`, background: s.color }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {r.memory.segments.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.label}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">{s.detail}</span>
                </span>
                <span className="shrink-0 tabular">{fmtGB(s.gb)}</span>
              </li>
            ))}
          </ul>
          {r.memory.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-xs text-gold/90">
              {r.memory.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {i.gpus > 1 && <p className="mt-2 text-xs text-muted-foreground">Assumes plain data parallelism: each GPU holds a full copy. Sharding (ZeRO-3 / FSDP) divides weights, gradients and optimizer states across GPUs.</p>}
        </Panel>

        <Panel title="Training time">
          <div className="text-3xl font-semibold tracking-tight">{fmtDuration(r.seconds)}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Training tokens</dt>
            <dd className="text-right tabular">{fmtCompact(r.tokens)}</dd>
            <dt className="text-muted-foreground">Optimizer steps</dt>
            <dd className="text-right tabular">{r.steps.toLocaleString("en")}</dd>
            <dt className="text-muted-foreground">FLOPs per token</dt>
            <dd className="text-right tabular">
              {r.factor}·N = {r.flopsPerToken.toExponential(2)}
            </dd>
            <dt className="text-muted-foreground">Total compute</dt>
            <dd className="text-right tabular">{r.totalFlops.toExponential(2)} FLOPs</dd>
            <dt className="text-muted-foreground">GPU-hours</dt>
            <dd className="text-right tabular">{gpuHours.toFixed(1)}</dd>
          </dl>
        </Panel>

        <Panel title="How it is calculated">
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground/90">Memory:</span> weights + gradients + optimizer states + an FP32 master copy of what is trained, plus activations (34·s·b·h bytes per layer, or about 2·s·b·h with checkpointing) and logits.
            </li>
            <li>
              <span className="text-foreground/90">Compute:</span> 6·N FLOPs per token for full training (2·N forward, 4·N backward). LoRA and QLoRA skip the frozen weights&rsquo; gradients: about 4·N. Checkpointing recomputes the forward pass: +2·N.
            </li>
            <li>
              <span className="text-foreground/90">Time:</span> total FLOPs ÷ (GPUs × peak TFLOPS × utilisation).
            </li>
          </ul>
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  {s.label}
                  <ExternalLinkIcon aria-hidden className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
