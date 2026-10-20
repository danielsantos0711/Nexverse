import { computeVram, DEFAULT_INPUT, type Method, type Optimizer, type PrecisionId, type VramResult } from "@/components/lab/vram"

/*
 * Fine-tuning memory and time.
 *
 * Memory reuses the VRAM calculator's training model (weights + gradients + optimizer states + fp32 master
 * copy + activations), which follows ZeRO's accounting of 16 bytes per parameter for mixed-precision Adam
 * and the 34·s·b·h bytes-per-layer activation estimate from Korthikanti et al.
 *
 * Time follows the compute rule of thumb C ≈ 6·N·D (Kaplan et al.): 2·N FLOPs per token forward and 4·N
 * backward. LoRA and QLoRA skip the weight gradients of the frozen base (≈ 2·N), leaving ≈ 4·N; gradient
 * checkpointing recomputes the forward pass, adding ≈ 2·N. Wall time = FLOPs / (GPUs × peak × utilisation).
 */

export const SOURCES = [
  { label: "Kaplan et al. 2020, Scaling Laws for Neural Language Models (C ≈ 6ND)", url: "https://arxiv.org/abs/2001.08361" },
  { label: "Rajbhandari et al. 2019, ZeRO (16 bytes per parameter for mixed-precision Adam)", url: "https://arxiv.org/abs/1910.02054" },
  { label: "Korthikanti et al. 2022, Reducing Activation Recomputation (34·s·b·h per layer)", url: "https://arxiv.org/abs/2205.05198" },
  { label: "Hu et al. 2021, LoRA", url: "https://arxiv.org/abs/2106.09685" },
  { label: "Dettmers et al. 2023, QLoRA", url: "https://arxiv.org/abs/2305.14314" },
]

/** Dense BF16/FP16 tensor throughput without sparsity, from NVIDIA's spec sheets. Defaults; admins edit the live list in /admin/lists (useGpus()). */
export const GPUS: { id: string; name: string; tflops: number; memory: number; url: string }[] = [
  { id: "h100-sxm", name: "H100 SXM", tflops: 989, memory: 80, url: "https://www.nvidia.com/en-us/data-center/h100/" },
  { id: "a100-80", name: "A100 80GB SXM", tflops: 312, memory: 80, url: "https://www.nvidia.com/en-us/data-center/a100/" },
  { id: "l40s", name: "L40S", tflops: 362, memory: 48, url: "https://www.nvidia.com/en-us/data-center/l40s/" },
  { id: "l4", name: "L4", tflops: 121, memory: 24, url: "https://www.nvidia.com/en-us/data-center/l4/" },
  { id: "rtx-4090", name: "GeForce RTX 4090", tflops: 165, memory: 24, url: "https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf" },
]

export type FineTuneInput = {
  params: number // billions
  method: Method
  precision: PrecisionId
  optimizer: Optimizer
  rank: number
  seq: number
  batch: number
  checkpointing: boolean
  /** Training set size in millions of tokens. */
  datasetM: number
  epochs: number
  gpuId: string // a GPUS id or "custom"
  tflops: number
  gpuMemory: number
  gpus: number
  /** Model FLOPs utilisation, 0..1. */
  mfu: number
}

export const DEFAULT_FT: FineTuneInput = {
  params: 8,
  method: "lora",
  precision: "bf16",
  optimizer: "adamw",
  rank: 16,
  seq: 2048,
  batch: 4,
  checkpointing: true,
  datasetM: 20,
  epochs: 3,
  gpuId: "a100-80",
  tflops: 312,
  gpuMemory: 80,
  gpus: 1,
  mfu: 0.35,
}

export type FineTuneResult = {
  memory: VramResult
  /** Per GPU, assuming plain data parallelism (each GPU holds a full copy). */
  perGpu: number
  fits: boolean
  flopsPerToken: number
  totalFlops: number
  seconds: number
  steps: number
  tokens: number
  factor: number
}

export function computeFineTune(i: FineTuneInput): FineTuneResult {
  const memory = computeVram({
    ...DEFAULT_INPUT,
    mode: "training",
    params: i.params,
    precision: i.precision,
    method: i.method,
    optimizer: i.optimizer,
    rank: i.rank,
    targets: "all",
    context: i.seq,
    batch: i.batch,
    checkpointing: i.checkpointing,
    archId: "auto",
  })
  const N = Math.max(0, i.params) * 1e9
  const factor = (i.method === "full" ? 6 : 4) + (i.checkpointing ? 2 : 0)
  const tokens = Math.max(0, i.datasetM) * 1e6 * Math.max(0, i.epochs)
  const flopsPerToken = factor * N
  const totalFlops = flopsPerToken * tokens
  const throughput = Math.max(1, i.gpus) * Math.max(0, i.tflops) * 1e12 * Math.max(0.01, Math.min(1, i.mfu))
  const seconds = throughput > 0 ? totalFlops / throughput : Infinity
  const steps = Math.ceil(tokens / Math.max(1, i.seq * i.batch * Math.max(1, i.gpus)))
  return { memory, perGpu: memory.total, fits: memory.total <= i.gpuMemory, flopsPerToken, totalFlops, seconds, steps, tokens, factor }
}

export function fmtDuration(s: number) {
  if (!Number.isFinite(s)) return "∞"
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400 * 2) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86400).toFixed(1)} days`
}
