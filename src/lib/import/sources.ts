import { LICENSE_LIST } from "@/lib/publish/licenses"
import type { DatasetSpecs, ModelSpecs, ProjectSource, ProjectSpecs } from "@/lib/projects"
import { getBytes, getJson, getText, ImportError } from "./fetch"
import { cardImages, hfAvatar, hfSocial, type CoverCandidate } from "./images"
import type { ImportSite, ImportType } from "./types"

/*
 * Reading a public model or dataset from Hugging Face or OpenRouter and turning it into the fields of a Nexverse
 * project: name, one-line summary, README (the model or dataset card), tags, licence, languages and the specs
 * the model and dataset pages show. Nothing is invented: a field the source does not give stays empty.
 */

export type ImportFile = { name: string; bytes: number | null; get: () => Promise<Uint8Array | null> }

export type Draft = {
  type: ImportType
  name: string
  summary: string
  readme: string
  tags: string[]
  license: string
  langs: string[]
  specs: ProjectSpecs
  source: ProjectSource
  files: ImportFile[]
  facts: { label: string; value: string }[]
  /** Cover picture candidates, best first (read only when the import runs, never for a preview). */
  covers: () => Promise<CoverCandidate[]>
}

/** Hugging Face candidates for one item: its card thumbnail, the pictures in its card, extra ones, the owner's avatar, the social card. */
async function hfCovers(type: "model" | "dataset", id: string, card: string, thumbnail: unknown, extra: CoverCandidate[] = []): Promise<CoverCandidate[]> {
  const base = `${HF}/${type === "dataset" ? "datasets/" : ""}${hfPath(id)}`
  const out: CoverCandidate[] = []
  const thumb = typeof thumbnail === "string" ? cardImages(`![](${thumbnail})`, base, 1)[0] : undefined
  if (thumb) out.push({ url: thumb, origin: "thumbnail" })
  for (const url of cardImages(card, base, 4)) out.push({ url, origin: "readme" })
  out.push(...extra)
  const avatar = await hfAvatar(id.includes("/") ? id.split("/")[0] : id)
  if (avatar) out.push({ url: avatar, origin: "avatar" })
  out.push({ url: hfSocial(type, id), origin: "social" })
  return out
}

const HF = "https://huggingface.co"
const HF_VIEWER = "https://datasets-server.huggingface.co"
const OR = "https://openrouter.ai/api/v1"

// ─── Shared helpers ─────────────────────────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent
const hfPath = (id: string) => id.split("/").map(enc).join("/")

/** The YAML block at the top of a card, which the page shows as specs instead. */
const stripFrontMatter = (md: string) => md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim()

function tagOf(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[a-z_]+:/, "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "")
}

/** Up to 8 tags in the form Nexverse accepts, skipping the source's internal ones. */
function tagsFrom(list: (string | null | undefined)[]): string[] {
  const skip = /^(region|deploy|endpoints|autotrain|doi|arxiv|license|base_model|dataset|library|format|size_categories|modality|language|task_ids|annotations_creators|language_creators|multilinguality|source_datasets)[:_]/i
  const out = new Set<string>()
  for (const raw of list) {
    if (!raw || skip.test(raw)) continue
    const t = tagOf(raw)
    if (t && /^[a-z0-9][a-z0-9-]{0,29}$/.test(t)) out.add(t)
    if (out.size >= 8) break
  }
  return [...out]
}

const SPDX = new Map(LICENSE_LIST.map((l) => [l.id.toLowerCase(), l.id]))
const LICENSE_ALIASES: Record<string, string> = {
  "gpl-3.0": "GPL-3.0-only",
  "gpl-2.0": "GPL-2.0-only",
  "agpl-3.0": "AGPL-3.0-only",
  "lgpl-3.0": "LGPL-3.0-only",
  "lgpl-2.1": "LGPL-2.1-only",
  "openrail": "OpenRAIL-M",
  "creativeml-openrail-m": "CreativeML-OpenRAIL-M",
  "llama3.1": "LicenseRef-Llama-3.1",
  "llama3.3": "LicenseRef-Llama-3.3",
  "llama2": "LicenseRef-Llama-community",
  "llama3": "LicenseRef-Llama-community",
  "llama3.2": "LicenseRef-Llama-community",
  "gemma": "LicenseRef-Gemma",
  "cc0-1.0": "CC0-1.0",
}

/** A source's licence id → an SPDX id Nexverse knows, or "unspecified" (named in the README instead). */
function licenseFrom(raw: unknown): string {
  const id = (Array.isArray(raw) ? raw[0] : raw) as unknown
  if (typeof id !== "string" || !id.trim()) return "unspecified"
  const k = id.trim().toLowerCase()
  return SPDX.get(k) ?? LICENSE_ALIASES[k] ?? "unspecified"
}

const langsFrom = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).filter((l): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)).slice(0, 12)

/** The first sentence-like line of a card, for the one-line summary (10–160 characters). */
function summaryFrom(readme: string, fallback: string): string {
  const lines = readme
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(#|!\[|<|\||```|>|-{3,}|\*{3,}|\[!)/.test(l))
  for (const l of lines) {
    const plain = l.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim()
    if (plain.length >= 20) return fit(plain)
  }
  return fit(fallback)
}

function fit(s: string): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= 160) return t.length >= 10 ? t : `${t} on Nexverse`.slice(0, 160)
  const cut = t.slice(0, 157)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100))}…`
}

const nameFrom = (id: string) => (id.split("/").pop() ?? id).slice(0, 80).padEnd(2, "-")

const human = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n))

const README_MAX = 50_000

function clipReadme(md: string): string {
  if (md.length <= README_MAX) return md
  return `${md.slice(0, README_MAX - 120).replace(/\n[^\n]*$/, "")}\n\n*The rest of this card was longer than Nexverse keeps in one README.*`
}

// ─── Hugging Face models ────────────────────────────────────────────────────────────────────────────────────

type HfModel = {
  id: string
  author?: string
  sha?: string
  private?: boolean
  disabled?: boolean
  pipeline_tag?: string
  library_name?: string
  tags?: string[]
  cardData?: { license?: unknown; language?: unknown; base_model?: unknown; tags?: unknown; thumbnail?: unknown }
  config?: { architectures?: string[]; model_type?: string }
  safetensors?: { total?: number; parameters?: Record<string, number> }
  siblings?: { rfilename: string; size?: number }[]
}

/** Small text files worth copying next to a model: its configuration, so people can read it on Nexverse. */
const MODEL_FILES = ["config.json", "generation_config.json", "tokenizer_config.json", "special_tokens_map.json", "LICENSE", "LICENSE.md", "USE_POLICY.md"]
const SMALL = 2 * 1024 * 1024

async function hfModel(id: string): Promise<Draft> {
  const m = await getJson<HfModel>(`${HF}/api/models/${hfPath(id)}`, { maxBytes: 4 * 1024 * 1024 })
  if (!m || m.private || m.disabled) throw new ImportError(404, "Hugging Face has no public model with that id.")
  const card = stripFrontMatter((await getText(`${HF}/${hfPath(m.id)}/raw/main/README.md`, { maxBytes: 600_000 }).catch(() => null)) ?? "")
  const thumbnail = m.cardData?.thumbnail
  const total = m.safetensors?.total
  const base = m.cardData?.base_model
  const specs: ModelSpecs = {
    provider: m.author ?? m.id.split("/")[0],
    parameters: typeof total === "number" && total > 0 ? human(total) : undefined,
    architecture: m.config?.architectures?.[0] ?? m.config?.model_type,
    library: m.library_name,
    pipeline: m.pipeline_tag,
    baseModel: typeof base === "string" ? base : Array.isArray(base) && typeof base[0] === "string" ? base[0] : undefined,
    quantizations: m.safetensors?.parameters ? Object.keys(m.safetensors.parameters).slice(0, 8) : undefined,
  }
  const siblings = new Set((m.siblings ?? []).map((s) => s.rfilename))
  const files: ImportFile[] = MODEL_FILES.filter((f) => siblings.has(f)).map((f) => ({
    name: f,
    bytes: null,
    get: () => getBytes(`${HF}/${hfPath(m.id)}/raw/${m.sha ?? "main"}/${enc(f)}`, SMALL),
  }))
  const facts = [
    m.pipeline_tag && { label: "Task", value: m.pipeline_tag.replace(/-/g, " ") },
    specs.parameters && { label: "Parameters", value: specs.parameters },
    specs.architecture && { label: "Architecture", value: specs.architecture },
    m.library_name && { label: "Library", value: m.library_name },
    { label: "Files on the source", value: String(siblings.size) },
  ].filter((x): x is { label: string; value: string } => Boolean(x))
  return {
    type: "model",
    name: nameFrom(m.id),
    summary: summaryFrom(card, `${m.pipeline_tag ? m.pipeline_tag.replace(/-/g, " ") : "Open"} model by ${m.author ?? m.id.split("/")[0]}, imported from Hugging Face.`),
    readme: clipReadme(card || `# ${nameFrom(m.id)}\n\nThis model has no card on Hugging Face yet.`),
    tags: tagsFrom([m.pipeline_tag, m.library_name, ...((Array.isArray(m.cardData?.tags) ? m.cardData.tags : []) as string[]), ...(m.tags ?? [])]),
    license: licenseFrom(m.cardData?.license ?? m.tags?.find((t) => t.startsWith("license:"))?.slice(8)),
    langs: langsFrom(m.cardData?.language),
    specs: { model: specs },
    source: { site: "huggingface", type: "model", ref: m.id, importedAt: new Date().toISOString(), revision: m.sha },
    files,
    facts,
    covers: () => hfCovers("model", m.id, card, thumbnail),
  }
}

// ─── Hugging Face datasets ──────────────────────────────────────────────────────────────────────────────────

type HfDataset = {
  id: string
  author?: string
  sha?: string
  private?: boolean
  disabled?: boolean
  tags?: string[]
  cardData?: { license?: unknown; language?: unknown; task_categories?: unknown; pretty_name?: unknown; size_categories?: unknown; thumbnail?: unknown }
}
type HfSize = { size?: { dataset?: { num_rows?: number; num_bytes_original_files?: number; num_bytes_parquet_files?: number }; splits?: { config: string; split: string; num_rows?: number; num_bytes_parquet_files?: number }[] } }
type HfFirstRows = { features?: { name: string; type: Record<string, unknown> }[]; rows?: { row: Record<string, unknown> }[] }
type HfSplits = { splits?: { config: string; split: string }[] }

/** A dataset viewer feature type in words: "string", "int64", "class label (neg, pos)", "list of string". */
function featureType(t: Record<string, unknown> | undefined): string {
  if (!t || typeof t !== "object") return "unknown"
  if (t._type === "Value") return String(t.dtype ?? "value")
  if (t._type === "ClassLabel") return `class label${Array.isArray(t.names) ? ` (${(t.names as string[]).slice(0, 6).join(", ")})` : ""}`
  if (t._type === "Sequence" || t._type === "List" || t._type === "LargeList") return `list of ${featureType((t.feature ?? t.dtype) as Record<string, unknown>)}`
  if (t._type === "Image") return "image"
  if (t._type === "Audio") return "audio"
  if (typeof t._type === "string") return t._type.toLowerCase()
  if (Array.isArray(t)) return "list"
  return "struct"
}

/** Rows from the viewer as JSON Lines, with media columns (images, audio) left out: they are links to the source. */
function sampleJsonl(rows: { row: Record<string, unknown> }[], features: { name: string; type: Record<string, unknown> }[]): string {
  const media = new Set(features.filter((f) => ["Image", "Audio", "Video"].includes(String(f.type?._type))).map((f) => f.name))
  return rows.map(({ row }) => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !media.has(k))))).join("\n") + "\n"
}

/** The first picture in the dataset's own rows (an Image column), as the viewer serves it. */
function sampleImages(rows: HfFirstRows | null): CoverCandidate[] {
  const col = rows?.features?.find((f) => f.type?._type === "Image")?.name
  if (!col) return []
  for (const { row } of rows?.rows ?? []) {
    const v = row[col] as { src?: unknown } | null
    if (v && typeof v.src === "string" && v.src.startsWith("https://datasets-server.huggingface.co/")) return [{ url: v.src, origin: "sample" }]
  }
  return []
}

async function hfDataset(id: string): Promise<Draft> {
  const d = await getJson<HfDataset>(`${HF}/api/datasets/${hfPath(id)}`, { maxBytes: 4 * 1024 * 1024 })
  if (!d || d.private || d.disabled) throw new ImportError(404, "Hugging Face has no public dataset with that id.")
  const q = `dataset=${enc(d.id)}`
  const [card, size, splitList] = await Promise.all([
    getText(`${HF}/datasets/${hfPath(d.id)}/raw/main/README.md`, { maxBytes: 600_000 }).catch(() => null),
    getJson<HfSize>(`${HF_VIEWER}/size?${q}`).catch(() => null),
    getJson<HfSplits>(`${HF_VIEWER}/splits?${q}`).catch(() => null),
  ])
  const first = splitList?.splits?.find((s) => s.split === "train") ?? splitList?.splits?.[0]
  const rows = first ? await getJson<HfFirstRows>(`${HF_VIEWER}/first-rows?${q}&config=${enc(first.config)}&split=${enc(first.split)}`, { maxBytes: 8 * 1024 * 1024 }).catch(() => null) : null
  const tags = d.tags ?? []
  const pick = (prefix: string) => tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length))
  const features = (rows?.features ?? []).map((f) => ({ name: f.name, type: featureType(f.type) }))
  const spec: DatasetSpecs = {
    rows: size?.size?.dataset?.num_rows,
    bytes: size?.size?.dataset?.num_bytes_original_files ?? size?.size?.dataset?.num_bytes_parquet_files,
    splits: (size?.size?.splits ?? []).slice(0, 40).map((s) => ({ name: s.split, config: s.config, rows: s.num_rows, bytes: s.num_bytes_parquet_files })),
    features,
    tasks: pick("task_categories:"),
    modalities: pick("modality:"),
    formats: pick("format:"),
    sizeCategory: pick("size_categories:")[0],
  }
  const files: ImportFile[] = []
  if (rows?.rows?.length && first) {
    const body = new TextEncoder().encode(sampleJsonl(rows.rows, rows.features ?? []))
    if (body.length <= 5 * 1024 * 1024) files.push({ name: `sample-${first.split}.jsonl`.replace(/[^A-Za-z0-9._-]/g, "-"), bytes: body.length, get: async () => body })
  }
  const pretty = typeof d.cardData?.pretty_name === "string" ? d.cardData.pretty_name.slice(0, 80) : null
  const name = pretty && pretty.trim().length >= 2 ? pretty.trim() : nameFrom(d.id)
  const readme = stripFrontMatter(card ?? "")
  const facts = [
    spec.rows !== undefined && { label: "Rows", value: spec.rows.toLocaleString("en") },
    spec.splits?.length && { label: "Splits", value: [...new Set(spec.splits.map((s) => s.name))].join(", ") },
    features.length > 0 && { label: "Columns", value: features.map((f) => f.name).slice(0, 8).join(", ") },
    spec.tasks?.length && { label: "Tasks", value: spec.tasks.join(", ") },
  ].filter((x): x is { label: string; value: string } => Boolean(x))
  return {
    type: "dataset",
    name,
    summary: summaryFrom(readme, `${spec.tasks?.[0] ? `${spec.tasks[0].replace(/-/g, " ")} dataset` : "Dataset"} by ${d.author ?? d.id.split("/")[0]}, imported from Hugging Face.`),
    readme: clipReadme(readme || `# ${name}\n\nThis dataset has no card on Hugging Face yet.`),
    tags: tagsFrom([...(spec.tasks ?? []), ...pick("task_ids:"), ...tags.filter((t) => !t.includes(":"))]),
    license: licenseFrom(d.cardData?.license ?? pick("license:")[0]),
    langs: langsFrom(d.cardData?.language ?? pick("language:")),
    specs: { dataset: spec },
    source: { site: "huggingface", type: "dataset", ref: d.id, importedAt: new Date().toISOString(), revision: d.sha },
    files,
    facts,
    covers: () => hfCovers("dataset", d.id, readme, d.cardData?.thumbnail, sampleImages(rows)),
  }
}

// ─── OpenRouter models ──────────────────────────────────────────────────────────────────────────────────────

type OrPricing = { prompt?: string; completion?: string; request?: string; image?: string }
type OrModel = {
  id: string
  canonical_slug?: string
  hugging_face_id?: string | null
  name?: string
  description?: string
  context_length?: number
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; tokenizer?: string }
  pricing?: OrPricing
  top_provider?: { context_length?: number | null; max_completion_tokens?: number | null }
  supported_parameters?: string[]
  knowledge_cutoff?: string | null
}
type OrEndpoints = {
  data?: { endpoints?: { name?: string; provider_name?: string; context_length?: number; max_completion_tokens?: number | null; pricing?: OrPricing; quantization?: string | null; status?: number | string }[] }
}

/** OpenRouter quotes dollars per token as strings; Nexverse shows dollars per million tokens. */
const perMillion = (v?: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10000) / 10000 : undefined
}

function pricingOf(p?: OrPricing) {
  if (!p) return undefined
  const prompt = perMillion(p.prompt)
  const completion = perMillion(p.completion)
  return { free: prompt === 0 && completion === 0 ? true : undefined, prompt, completion, request: perMillion(p.request) || undefined, image: perMillion(p.image) || undefined }
}

/** OpenRouter authors whose organisation on Hugging Face is known to be the same lab (for its avatar). */
const OR_ORGS: Record<string, string> = {
  openai: "openai",
  google: "google",
  "meta-llama": "meta-llama",
  mistralai: "mistralai",
  qwen: "Qwen",
  deepseek: "deepseek-ai",
  anthropic: "Anthropic",
  "x-ai": "xai-org",
  microsoft: "microsoft",
  nvidia: "nvidia",
  cohere: "CohereLabs",
  amazon: "amazon",
  moonshotai: "moonshotai",
  "z-ai": "zai-org",
  minimax: "MiniMaxAI",
  baidu: "baidu",
  tencent: "tencent",
  "ibm-granite": "ibm-granite",
  allenai: "allenai",
  nousresearch: "NousResearch",
}

/**
 * OpenRouter has no pictures of its own. When the model names its weights on Hugging Face, that card's pictures
 * are used; otherwise the lab's avatar, for the labs we can match with certainty.
 */
async function openRouterCovers(author: string, hfId: string | null): Promise<CoverCandidate[]> {
  const out: CoverCandidate[] = []
  if (hfId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(hfId)) {
    const card = stripFrontMatter((await getText(`${HF}/${hfPath(hfId)}/raw/main/README.md`, { maxBytes: 600_000 }).catch(() => null)) ?? "")
    for (const url of cardImages(card, `${HF}/${hfPath(hfId)}`, 3)) out.push({ url, origin: "readme" })
    const avatar = await hfAvatar(hfId.split("/")[0])
    if (avatar) out.push({ url: avatar, origin: "avatar" })
  }
  const org = OR_ORGS[author.toLowerCase()]
  if (org) {
    const avatar = await hfAvatar(org)
    if (avatar) out.push({ url: avatar, origin: "avatar" })
  }
  return out
}

async function openRouterModel(id: string): Promise<Draft> {
  const list = await getJson<{ data?: OrModel[] }>(`${OR}/models`, { maxBytes: 12 * 1024 * 1024 })
  const m = list?.data?.find((x) => x.id === id || x.canonical_slug === id)
  if (!m) throw new ImportError(404, "OpenRouter has no model with that id.")
  const [author, slug] = m.id.split(":")[0].split("/")
  const ends = await getJson<OrEndpoints>(`${OR}/models/${enc(author)}/${enc(slug)}/endpoints`).catch(() => null)
  const provider = (m.name?.includes(":") ? m.name.split(":")[0] : author).trim()
  const name = (m.name?.includes(":") ? m.name.split(":").slice(1).join(":") : (m.name ?? slug)).trim().slice(0, 80) || slug
  const description = (m.description ?? "").trim()
  const specs: ModelSpecs = {
    provider,
    contextLength: m.context_length ?? m.top_provider?.context_length ?? undefined,
    maxOutput: m.top_provider?.max_completion_tokens ?? undefined,
    pricing: pricingOf(m.pricing),
    inputModalities: m.architecture?.input_modalities,
    outputModalities: m.architecture?.output_modalities,
    tokenizer: m.architecture?.tokenizer,
    supportedParameters: m.supported_parameters,
    knowledgeCutoff: m.knowledge_cutoff ?? undefined,
    baseModel: m.hugging_face_id ?? undefined,
    endpoints: (ends?.data?.endpoints ?? []).slice(0, 30).map((e) => ({
      provider: (e.provider_name ?? e.name ?? "").slice(0, 80),
      contextLength: e.context_length,
      maxOutput: e.max_completion_tokens ?? undefined,
      pricing: pricingOf(e.pricing),
      quantization: e.quantization ?? undefined,
      status: e.status === 0 || e.status === "0" ? "up" : e.status !== undefined ? String(e.status) : undefined,
    })),
  }
  const readme = `# ${name}\n\n${description || "OpenRouter gives no description for this model."}\n`
  const facts = [
    { label: "Provider", value: provider },
    specs.contextLength && { label: "Context", value: `${human(specs.contextLength)} tokens` },
    specs.pricing && { label: "Pricing", value: specs.pricing.free ? "Free" : `$${specs.pricing.prompt ?? "?"} in / $${specs.pricing.completion ?? "?"} out per 1M tokens` },
    specs.inputModalities?.length && { label: "Input", value: specs.inputModalities.join(", ") },
    specs.endpoints?.length && { label: "Endpoints", value: String(specs.endpoints.length) },
  ].filter((x): x is { label: string; value: string } => Boolean(x))
  return {
    type: "model",
    name: name.length >= 2 ? name : slug,
    summary: summaryFrom(description, `${name} by ${provider}, available through API providers.`),
    readme,
    tags: tagsFrom([provider, ...(specs.inputModalities ?? []).map((x) => `${x}-input`), m.supported_parameters?.includes("tools") ? "tool-use" : null, specs.pricing?.free ? "free" : null]),
    license: "unspecified",
    langs: [],
    specs: { model: specs },
    source: { site: "openrouter", type: "model", ref: m.id, importedAt: new Date().toISOString() },
    files: [],
    facts,
    covers: () => openRouterCovers(author, m.hugging_face_id ?? null),
  }
}

/** Reads one item from its source. Throws an ImportError a member can read when it cannot. */
export async function readSource(site: ImportSite, type: ImportType, id: string): Promise<Draft> {
  if (site === "openrouter") {
    if (type !== "model") throw new ImportError(400, "OpenRouter lists models only.")
    return openRouterModel(id)
  }
  return type === "model" ? hfModel(id) : hfDataset(id)
}
