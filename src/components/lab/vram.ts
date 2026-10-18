/*
 * Memory estimates for running and training transformer language models.
 *
 * Inference = weights + KV cache + activations + runtime overhead.
 * Training  = weights + gradients + optimizer states (+ fp32 master weights) + activations + overhead,
 *             where for LoRA/QLoRA only the adapter parameters carry gradients and optimizer states.
 *
 * The formulas are the standard back-of-envelope ones (2·layers·kv_heads·head_dim·tokens for the KV
 * cache, ~34·s·b·h bytes per layer for training activations with fused attention). Real frameworks
 * differ by a few percent to a few tens of percent, so the result is a planning estimate.
 */

export type PrecisionId =
  | "fp32"
  | "bf16"
  | "fp16"
  | "fp8"
  | "int8"
  | "q8_0"
  | "q6_k"
  | "q5_k_m"
  | "q4_k_m"
  | "q4_0"
  | "q3_k_m"
  | "q2_k"
  | "int4"

export type Precision = { id: PrecisionId; label: string; bits: number; group: "Full and half precision" | "8-bit" | "GGUF (llama.cpp)" | "4-bit"; note?: string }

export const PRECISIONS: Precision[] = [
  { id: "fp32", label: "FP32", bits: 32, group: "Full and half precision" },
  { id: "bf16", label: "BF16", bits: 16, group: "Full and half precision" },
  { id: "fp16", label: "FP16", bits: 16, group: "Full and half precision" },
  { id: "fp8", label: "FP8", bits: 8, group: "8-bit" },
  { id: "int8", label: "INT8", bits: 8, group: "8-bit" },
  { id: "q8_0", label: "Q8_0", bits: 8.5, group: "GGUF (llama.cpp)" },
  { id: "q6_k", label: "Q6_K", bits: 6.56, group: "GGUF (llama.cpp)" },
  { id: "q5_k_m", label: "Q5_K_M", bits: 5.69, group: "GGUF (llama.cpp)" },
  { id: "q4_k_m", label: "Q4_K_M", bits: 4.85, group: "GGUF (llama.cpp)", note: "the usual default" },
  { id: "q4_0", label: "Q4_0", bits: 4.55, group: "GGUF (llama.cpp)" },
  { id: "q3_k_m", label: "Q3_K_M", bits: 3.91, group: "GGUF (llama.cpp)" },
  { id: "q2_k", label: "Q2_K", bits: 3.35, group: "GGUF (llama.cpp)" },
  { id: "int4", label: "4-bit (GPTQ / AWQ / NF4)", bits: 4.25, group: "4-bit" },
]

export const getPrecision = (id: string) => PRECISIONS.find((p) => p.id === id) ?? PRECISIONS[1]

export type KvPrecisionId = "fp16" | "fp8" | "q4"
export const KV_PRECISIONS: { id: KvPrecisionId; label: string; bytes: number }[] = [
  { id: "fp16", label: "16-bit", bytes: 2 },
  { id: "fp8", label: "8-bit", bytes: 1 },
  { id: "q4", label: "4-bit", bytes: 0.5625 },
]

export type Arch = { layers: number; heads: number; kvHeads: number; headDim: number; vocab: number }

/** Typical shapes of dense decoder-only models at common sizes (grouped-query attention throughout). */
export const ARCH_PRESETS: { id: string; label: string; params: number; arch: Arch }[] = [
  { id: "0.5b", label: "~0.5B", params: 0.5, arch: { layers: 24, heads: 14, kvHeads: 2, headDim: 64, vocab: 152000 } },
  { id: "1b", label: "~1B", params: 1.2, arch: { layers: 16, heads: 32, kvHeads: 8, headDim: 64, vocab: 128000 } },
  { id: "3b", label: "~3B", params: 3.2, arch: { layers: 28, heads: 24, kvHeads: 8, headDim: 128, vocab: 128000 } },
  { id: "8b", label: "~7–8B", params: 8, arch: { layers: 32, heads: 32, kvHeads: 8, headDim: 128, vocab: 128000 } },
  { id: "14b", label: "~13–14B", params: 14, arch: { layers: 48, heads: 40, kvHeads: 8, headDim: 128, vocab: 152000 } },
  { id: "32b", label: "~32B", params: 32, arch: { layers: 64, heads: 40, kvHeads: 8, headDim: 128, vocab: 152000 } },
  { id: "70b", label: "~70B", params: 70, arch: { layers: 80, heads: 64, kvHeads: 8, headDim: 128, vocab: 128000 } },
  { id: "120b", label: "~120B", params: 123, arch: { layers: 88, heads: 96, kvHeads: 8, headDim: 128, vocab: 32768 } },
  { id: "405b", label: "~405B", params: 405, arch: { layers: 126, heads: 128, kvHeads: 8, headDim: 128, vocab: 128000 } },
]

export function nearestArch(params: number) {
  let best = ARCH_PRESETS[0]
  for (const p of ARCH_PRESETS) if (Math.abs(Math.log(p.params / params)) < Math.abs(Math.log(best.params / params))) best = p
  return best
}

export type Mode = "inference" | "training"
export type Method = "full" | "lora" | "qlora"
export type Optimizer = "adamw" | "adamw8" | "sgd"
export type LoraTargets = "attn" | "all"

export type VramInput = {
  params: number // billions
  precision: PrecisionId
  context: number
  batch: number
  kv: KvPrecisionId
  archId: string // preset id, "auto" or "custom"
  arch: Arch
  mode: Mode
  method: Method
  optimizer: Optimizer
  rank: number
  targets: LoraTargets
  checkpointing: boolean
}

export const DEFAULT_INPUT: VramInput = {
  params: 8,
  precision: "q4_k_m",
  context: 8192,
  batch: 1,
  kv: "fp16",
  archId: "auto",
  arch: ARCH_PRESETS[3].arch,
  mode: "inference",
  method: "lora",
  optimizer: "adamw",
  rank: 16,
  targets: "all",
  checkpointing: true,
}

export const OPTIMIZERS: { id: Optimizer; label: string; bytes: number; hint: string }[] = [
  { id: "adamw", label: "AdamW", bytes: 8, hint: "Two fp32 moments per parameter" },
  { id: "adamw8", label: "AdamW 8-bit", bytes: 2, hint: "Quantised moments" },
  { id: "sgd", label: "SGD + momentum", bytes: 4, hint: "One fp32 buffer per parameter" },
]

export type SegmentId = "weights" | "kv" | "activations" | "gradients" | "optimizer" | "master" | "adapters" | "overhead"
export type Segment = { id: SegmentId; label: string; gb: number; color: string; detail: string }

export type VramResult = {
  total: number
  segments: Segment[]
  notes: string[]
  trainable: number // parameters, absolute
  effectivePrecision: Precision
}

const GB = 1e9

export function resolveArch(i: VramInput): Arch {
  if (i.archId === "custom") return i.arch
  if (i.archId === "auto") return nearestArch(i.params).arch
  return ARCH_PRESETS.find((p) => p.id === i.archId)?.arch ?? nearestArch(i.params).arch
}

export function computeVram(i: VramInput): VramResult {
  const arch = resolveArch(i)
  const P = Math.max(0, i.params) * 1e9
  const hidden = arch.heads * arch.headDim
  const kvDim = arch.kvHeads * arch.headDim
  const inter = Math.round(hidden * 3.5)
  const notes: string[] = []
  const seg: Segment[] = []
  const tokens = i.context * i.batch
  let precision = getPrecision(i.precision)

  if (i.mode === "inference") {
    const weights = (P * precision.bits) / 8
    const kvBytes = KV_PRECISIONS.find((k) => k.id === i.kv)?.bytes ?? 2
    const kv = 2 * arch.layers * kvDim * tokens * kvBytes
    // Prefill runs in chunks; buffers scale with the chunk, the hidden size and the MLP width.
    const chunk = Math.min(i.context, 2048) * i.batch
    const activations = chunk * (hidden * 4 + inter * 2) * 2 + i.batch * arch.vocab * 4 * 2
    const overhead = 0.6 * GB + weights * 0.03
    seg.push(
      { id: "weights", label: "Weights", gb: weights / GB, color: "var(--color-ion)", detail: `${fmtParams(P)} × ${precision.bits} bits` },
      { id: "kv", label: "KV cache", gb: kv / GB, color: "#9fe3cf", detail: `${i.context.toLocaleString("en")} tokens × ${i.batch} · ${arch.layers} layers × ${arch.kvHeads} KV heads × ${arch.headDim}` },
      { id: "activations", label: "Activations", gb: activations / GB, color: "#e9c79a", detail: "Working buffers during prefill and decoding" },
      { id: "overhead", label: "Runtime overhead", gb: overhead / GB, color: "#5d6577", detail: "CUDA context, allocator slack, kernels" }
    )
    if (i.context > 32768 && arch.kvHeads === arch.heads) notes.push("Full multi-head attention at long context makes the KV cache huge; most current models use grouped-query attention.")
    return { total: sum(seg), segments: seg, notes, trainable: 0, effectivePrecision: precision }
  }

  // Training
  let trainable = P
  if (i.method === "qlora") {
    precision = getPrecision("int4")
  } else if (precision.group === "GGUF (llama.cpp)") {
    notes.push("GGUF files are for inference. Training estimates use BF16 instead.")
    precision = getPrecision("bf16")
  } else if (i.method === "full" && precision.bits < 16) {
    notes.push("Full fine-tuning needs 16- or 32-bit weights. Using BF16.")
    precision = getPrecision("bf16")
  }

  const weightBytes = precision.bits / 8
  const weights = P * weightBytes
  if (i.method !== "full") {
    const attn = 2 * (hidden + hidden) + 2 * (hidden + kvDim)
    const mlp = 3 * (hidden + inter)
    trainable = arch.layers * i.rank * (attn + (i.targets === "all" ? mlp : 0))
  }
  const opt = OPTIMIZERS.find((o) => o.id === i.optimizer) ?? OPTIMIZERS[0]
  const gradBytes = i.method === "full" ? Math.max(2, weightBytes) : 2
  const gradients = trainable * gradBytes
  const optimizer = trainable * opt.bytes
  // Mixed precision keeps an fp32 copy of whatever is trained when the working copy is 16-bit.
  const master = i.method === "full" ? (weightBytes < 4 ? P * 4 : 0) : trainable * 4
  const adapters = i.method === "full" ? 0 : trainable * 2

  const sbh = i.context * i.batch * hidden
  const perLayer = 34 * sbh
  const activations = (i.checkpointing ? arch.layers * 2 * sbh + perLayer : arch.layers * perLayer) + i.context * i.batch * arch.vocab * 4
  const overhead = 0.8 * GB

  seg.push({ id: "weights", label: i.method === "full" ? "Weights" : "Frozen base weights", gb: weights / GB, color: "var(--color-ion)", detail: `${fmtParams(P)} × ${precision.bits} bits` })
  if (adapters) seg.push({ id: "adapters", label: "LoRA adapters", gb: adapters / GB, color: "#d3b4ff", detail: `${fmtParams(trainable)} trainable (rank ${i.rank})` })
  seg.push(
    { id: "gradients", label: "Gradients", gb: gradients / GB, color: "#ff9f8a", detail: `${fmtParams(trainable)} × ${gradBytes * 8} bits` },
    { id: "optimizer", label: "Optimizer states", gb: optimizer / GB, color: "#ffc58a", detail: `${opt.label}: ${opt.bytes} bytes per trained parameter` }
  )
  if (master) seg.push({ id: "master", label: "FP32 master weights", gb: master / GB, color: "#c4e38f", detail: "Mixed-precision copy of trained parameters" })
  seg.push(
    { id: "activations", label: "Activations", gb: activations / GB, color: "#e9c79a", detail: i.checkpointing ? "With gradient checkpointing, plus logits" : "All layers kept for backward, plus logits" },
    { id: "overhead", label: "Runtime overhead", gb: overhead / GB, color: "#5d6577", detail: "CUDA context, allocator slack, kernels" }
  )
  if (!i.checkpointing && i.context >= 4096) notes.push("Turning on gradient checkpointing trades about 30% more compute for far less activation memory.")
  if (arch.vocab >= 100000 && i.context * i.batch >= 16384) notes.push("Logits over a large vocabulary are a big share here; fused or chunked cross-entropy removes most of it.")
  return { total: sum(seg), segments: seg, notes, trainable, effectivePrecision: precision }
}

const sum = (s: Segment[]) => s.reduce((n, x) => n + x.gb, 0)

export function fmtParams(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)}B params`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M params`
  return `${Math.round(n / 1e3)}k params`
}

/* ------------------------------------------------------------------ devices */

export type Device = { id: string; name: string; vram: number; kind: "Consumer GPU" | "Laptop" | "Workstation GPU" | "Data-centre GPU" | "Unified memory"; unified?: boolean }

/** Unified-memory machines can give the GPU roughly three quarters of system memory by default. */
export const usable = (d: Device) => (d.unified ? d.vram * 0.75 : d.vram)

const DEVICE_LIST: Device[] = [
  { id: "laptop-8", name: "Gaming laptop, 8 GB GPU", vram: 8, kind: "Laptop" },
  { id: "rtx4060", name: "RTX 4060", vram: 8, kind: "Consumer GPU" },
  { id: "rtx3060", name: "RTX 3060 12 GB", vram: 12, kind: "Consumer GPU" },
  { id: "laptop-16", name: "Laptop RTX 4090 / 5090", vram: 16, kind: "Laptop" },
  { id: "mac-16", name: "MacBook Air, 16 GB", vram: 16, kind: "Unified memory", unified: true },
  { id: "rtx4060ti", name: "RTX 4060 Ti 16 GB", vram: 16, kind: "Consumer GPU" },
  { id: "rtx5080", name: "RTX 5080", vram: 16, kind: "Consumer GPU" },
  { id: "mac-24", name: "MacBook Air, 24 GB", vram: 24, kind: "Unified memory", unified: true },
  { id: "rtx3090", name: "RTX 3090 / 4090", vram: 24, kind: "Consumer GPU" },
  { id: "rx7900", name: "Radeon RX 7900 XTX", vram: 24, kind: "Consumer GPU" },
  { id: "rtx5090", name: "RTX 5090", vram: 32, kind: "Consumer GPU" },
  { id: "mac-36", name: "MacBook Pro, 36 GB", vram: 36, kind: "Unified memory", unified: true },
  { id: "mac-48", name: "MacBook Pro, 48 GB", vram: 48, kind: "Unified memory", unified: true },
  { id: "a6000", name: "RTX A6000 / L40S", vram: 48, kind: "Workstation GPU" },
  { id: "mac-64", name: "MacBook Pro, 64 GB", vram: 64, kind: "Unified memory", unified: true },
  { id: "a100-40", name: "A100 40 GB", vram: 40, kind: "Data-centre GPU" },
  { id: "a100-80", name: "A100 / H100 80 GB", vram: 80, kind: "Data-centre GPU" },
  { id: "rtx6000-pro", name: "RTX PRO 6000", vram: 96, kind: "Workstation GPU" },
  { id: "mac-128", name: "MacBook Pro, 128 GB", vram: 128, kind: "Unified memory", unified: true },
  { id: "strix-128", name: "Mini PC, 128 GB unified", vram: 128, kind: "Unified memory", unified: true },
  { id: "h200", name: "H200 141 GB", vram: 141, kind: "Data-centre GPU" },
  { id: "b200", name: "B200 / MI300X", vram: 192, kind: "Data-centre GPU" },
  { id: "mac-512", name: "Mac Studio, 512 GB", vram: 512, kind: "Unified memory", unified: true },
]

export const DEVICES: Device[] = DEVICE_LIST.sort((a, b) => usable(a) - usable(b))

export type Fit = "fits" | "tight" | "multi" | "no"

/** How a device copes: fits with headroom, fits tightly, needs several of it, or cannot. */
export function fitOn(d: Device, total: number): { fit: Fit; count: number; ratio: number } {
  const cap = usable(d)
  const ratio = total / cap
  if (ratio <= 0.85) return { fit: "fits", count: 1, ratio }
  if (ratio <= 1) return { fit: "tight", count: 1, ratio }
  if (d.unified || d.kind === "Laptop") return { fit: "no", count: 0, ratio }
  // Splitting a model across GPUs costs some duplication; assume 90% of each card is usable.
  const count = Math.ceil(total / (cap * 0.9))
  const maxCards = d.kind === "Consumer GPU" ? 4 : 8
  return count <= maxCards ? { fit: "multi", count, ratio } : { fit: "no", count, ratio }
}

/* ------------------------------------------------------------- URL state */

const MODES: Mode[] = ["inference", "training"]
const METHODS: Method[] = ["full", "lora", "qlora"]
const OPTS: Optimizer[] = ["adamw", "adamw8", "sgd"]

const num = (v: string | null, lo: number, hi: number, d: number) => {
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

export function fromQuery(q: URLSearchParams): VramInput {
  const d = DEFAULT_INPUT
  const archId = q.get("arch") ?? d.archId
  const validArch = archId === "auto" || archId === "custom" || ARCH_PRESETS.some((p) => p.id === archId)
  const params = num(q.get("p"), 0.05, 2000, d.params)
  const base = nearestArch(params).arch
  return {
    params,
    precision: (PRECISIONS.find((p) => p.id === q.get("q"))?.id ?? d.precision) as PrecisionId,
    context: Math.round(num(q.get("ctx"), 128, 2_097_152, d.context)),
    batch: Math.round(num(q.get("b"), 1, 1024, d.batch)),
    kv: (KV_PRECISIONS.find((k) => k.id === q.get("kv"))?.id ?? d.kv) as KvPrecisionId,
    archId: validArch ? archId : "auto",
    arch: {
      layers: Math.round(num(q.get("l"), 1, 512, base.layers)),
      heads: Math.round(num(q.get("h"), 1, 512, base.heads)),
      kvHeads: Math.round(num(q.get("kvh"), 1, 512, base.kvHeads)),
      headDim: Math.round(num(q.get("hd"), 8, 1024, base.headDim)),
      vocab: Math.round(num(q.get("v"), 256, 1_000_000, base.vocab)),
    },
    mode: MODES.find((m) => m === q.get("mode")) ?? d.mode,
    method: METHODS.find((m) => m === q.get("m")) ?? d.method,
    optimizer: OPTS.find((m) => m === q.get("opt")) ?? d.optimizer,
    rank: Math.round(num(q.get("r"), 1, 1024, d.rank)),
    targets: q.get("t") === "attn" ? "attn" : "all",
    checkpointing: q.get("gc") !== "0",
  }
}

export function toQuery(i: VramInput): string {
  const q = new URLSearchParams()
  q.set("p", String(i.params))
  q.set("q", i.precision)
  q.set("ctx", String(i.context))
  q.set("b", String(i.batch))
  if (i.archId !== "auto") q.set("arch", i.archId)
  if (i.archId === "custom") {
    q.set("l", String(i.arch.layers))
    q.set("h", String(i.arch.heads))
    q.set("kvh", String(i.arch.kvHeads))
    q.set("hd", String(i.arch.headDim))
    q.set("v", String(i.arch.vocab))
  }
  if (i.mode === "inference") {
    if (i.kv !== "fp16") q.set("kv", i.kv)
  } else {
    q.set("mode", "training")
    q.set("m", i.method)
    q.set("opt", i.optimizer)
    if (i.method !== "full") {
      q.set("r", String(i.rank))
      q.set("t", i.targets)
    }
    if (!i.checkpointing) q.set("gc", "0")
  }
  return q.toString()
}
