/**
 * Hugging Face model, dataset and Space details for /hf/[kind]/[...id]. Cached for hours; failures for
 * minutes. Card READMEs and small text files come from the repo's raw endpoint.
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, fetchSafe, HUB_ID, isoDate, isRecord, isSafe, num, parseJson, plain, str, type Result } from "./http"
import { HF_PLURAL, HF_PREFIX } from "./ids"
import { NOISE_TAGS, pretty } from "./parse"
import type { HubKind } from "./types"

export type HfFileEntry = { path: string; size: number; lfs: boolean }

export type HfDetail = {
  kind: HubKind
  id: string
  owner: string
  name: string
  likes: number
  downloads: number
  updatedAt: string
  createdAt: string
  /** Models: the pipeline tag, prettified. Spaces: the SDK. */
  task: string
  library: string
  tags: string[]
  license: string
  languages: string[]
  baseModels: string[]
  datasets: string[]
  gated: boolean
  files: HfFileEntry[]
  totalSize: number
  description: string
  // Spaces
  title: string
  emoji: string
  colorFrom: string
  colorTo: string
  stage: string
  running: boolean
  hardware: string
  /** https://<subdomain>.hf.space, validated. */
  host: string
  /** Models a Space uses. */
  models: string[]
}

export type HfReadme = { text: string }

export type HfTextFile = { kind: "text"; path: string; text: string; bytes: number } | { kind: "toolarge" | "binary"; path: string; size: number }

const tags = (kind: HubKind, id: string) => cacheTag("live", "live:hf", `hf:${kind}:${id.toLowerCase()}`)

function settle<T>(r: Result<T>): Result<T> {
  if (r.ok || r.reason === "notfound") cacheLife("hours")
  else cacheLife("minutes")
  return r
}

const NOISE = /^(region:|endpoints_compatible|autotrain_compatible|text-generation-inference|has_space|deploy:|template:)/

const ids = (v: unknown, max = 12) =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .map((x) => str(x, 200))
    .filter((x) => HUB_ID.test(x))
    .slice(0, max)

const words = (v: unknown, max = 12, len = 40) =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .map((x) => str(x, len))
    .filter((x) => x && /^[\w .+#/-]+$/.test(x))
    .slice(0, max)

/** Hub subdomains are lowercase letters, digits and hyphens. */
function spaceHost(raw: Record<string, unknown>, id: string): string {
  const host = str(raw.host, 200)
  const m = host.match(/^https:\/\/([a-z0-9-]{1,120})\.hf\.space$/)
  if (m) return host
  const sub = str(raw.subdomain, 120)
  if (/^[a-z0-9-]{1,120}$/.test(sub)) return `https://${sub}.hf.space`
  const derived = id.toLowerCase().replace(/[/._]/g, "-").replace(/-+/g, "-")
  return /^[a-z0-9-]{1,120}$/.test(derived) ? `https://${derived}.hf.space` : ""
}

export function normalizeHfDetail(raw: unknown, kind: HubKind): HfDetail | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id ?? raw.modelId, 200)
  if (!HUB_ID.test(id) || raw.private === true || raw.disabled === true) return null
  const [owner, name] = id.split("/")
  const card = isRecord(raw.cardData) ? raw.cardData : {}
  const runtime = isRecord(raw.runtime) ? raw.runtime : {}
  const hardware = isRecord(runtime.hardware) ? str(runtime.hardware.current ?? runtime.hardware.requested, 40) : ""
  const title = plain(card.title ?? card.pretty_name, 120)
  const description = plain(kind === "space" ? card.short_description : kind === "dataset" ? raw.description : card.description, 300)
  if (!isSafe(id, title, description)) return null
  const files = asArray(raw.siblings)
    .map((s): HfFileEntry | null => {
      if (!isRecord(s)) return null
      const path = str(s.rfilename, 1024)
      if (!path || path.includes("..") || path.startsWith("/")) return null
      const lfs = isRecord(s.lfs)
      return { path, size: num(lfs && isRecord(s.lfs) ? (s.lfs.size ?? s.size) : s.size), lfs }
    })
    .filter((f): f is HfFileEntry => f !== null)
  const pipeline = str(raw.pipeline_tag ?? card.pipeline_tag, 60)
  const license = str(card.license_name ?? card.license, 60) || (asArray(raw.tags).map((t) => str(t, 80)).find((t) => t.startsWith("license:"))?.slice(8) ?? "")
  const emoji = str(card.emoji, 8)
  const languages = words(card.language, 16, 20)
  const library = str(raw.library_name ?? card.library_name, 40)
  const stage = str(runtime.stage, 30)
  return {
    kind,
    id,
    owner,
    name,
    likes: num(raw.likes),
    downloads: num(raw.downloads),
    updatedAt: isoDate(raw.lastModified),
    createdAt: isoDate(raw.createdAt),
    task: kind === "space" ? pretty(str(raw.sdk ?? card.sdk, 30)) : pretty(pipeline),
    library,
    tags: asArray(raw.tags)
      .map((t) => str(t, 60))
      .filter((t) => t && !t.includes(":") && !NOISE.test(t) && !NOISE_TAGS.test(t) && t !== pipeline && t !== library && t !== str(raw.sdk, 30) && !languages.includes(t))
      .slice(0, 24),
    license: license === "other" && card.license_name ? str(card.license_name, 60) : license,
    languages,
    baseModels: ids(card.base_model, 6),
    datasets: ids(card.datasets, 8),
    gated: raw.gated === "auto" || raw.gated === "manual" || raw.gated === true,
    files: files.slice(0, 2000),
    totalSize: files.reduce((s, f) => s + f.size, 0),
    description,
    title,
    emoji: /^[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]{1,8}$/u.test(emoji) ? emoji : "",
    colorFrom: str(card.colorFrom, 12).toLowerCase(),
    colorTo: str(card.colorTo, 12).toLowerCase(),
    stage,
    running: stage === "RUNNING",
    hardware,
    host: kind === "space" ? spaceHost(raw, id) : "",
    models: kind === "space" ? ids(raw.models, 8) : [],
  }
}

export async function hfItem(kind: HubKind, id: string): Promise<Result<HfDetail>> {
  "use cache"
  tags(kind, id)
  const res = await fetchSafe(`https://huggingface.co/api/${HF_PLURAL[kind]}/${id}?blobs=true`, { maxBytes: 8_000_000 })
  // Private and gated-by-login repos answer 401; for a public page they do not exist.
  if (!res.ok) return settle(res.status === 401 ? { ok: false, reason: "notfound" } : res)
  const data = normalizeHfDetail(parseJson(res.text), kind)
  return settle(data ? { ok: true, data } : { ok: false, reason: "notfound" })
}

/** Removes a leading YAML front-matter block (the card metadata, which the API already gives us parsed). */
export function stripFrontMatter(md: string): string {
  const m = md.match(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/)
  return m ? md.slice(m[0].length) : md
}

export async function hfReadme(kind: HubKind, id: string): Promise<Result<HfReadme>> {
  "use cache"
  tags(kind, id)
  const res = await fetchSafe(`https://huggingface.co/${HF_PREFIX[kind]}${id}/raw/main/README.md`, { accept: "text/plain", maxBytes: 500_000 })
  if (!res.ok) return settle(res.status === 401 || res.status === 403 ? { ok: false, reason: "notfound" } : res)
  return settle({ ok: true, data: { text: stripFrontMatter(res.text) } })
}

const BINARY_EXT = /\.(safetensors|bin|pt|pth|ckpt|onnx|h5|pb|tflite|gguf|ggml|npy|npz|pkl|parquet|arrow|zip|gz|tar|7z|png|jpe?g|gif|webp|mp[34]|wav|flac|pdf|msgpack|model|db|sqlite)$/i
export const HF_FILE_MAX = 200_000

/** A small text file from the repo, for the in-site viewer. `size` and `lfs` come from the siblings list. */
export async function hfFile(kind: HubKind, id: string, path: string, size: number, lfs: boolean): Promise<Result<HfTextFile>> {
  "use cache"
  tags(kind, id)
  if (lfs || BINARY_EXT.test(path)) return settle({ ok: true, data: { kind: "binary", path, size } })
  if (size > HF_FILE_MAX) return settle({ ok: true, data: { kind: "toolarge", path, size } })
  const res = await fetchSafe(`https://huggingface.co/${HF_PREFIX[kind]}${id}/raw/main/${path.split("/").map(encodeURIComponent).join("/")}`, {
    accept: "text/plain, */*",
    maxBytes: HF_FILE_MAX,
  })
  if (!res.ok) return settle(res.reason === "toolarge" ? { ok: true, data: { kind: "toolarge", path, size } } : res.status === 401 ? { ok: false, reason: "notfound" } : res)
  if (res.text.slice(0, 8000).includes("\u0000")) return settle({ ok: true, data: { kind: "binary", path, size } })
  return settle({ ok: true, data: { kind: "text", path, text: res.text, bytes: Buffer.byteLength(res.text) } })
}
