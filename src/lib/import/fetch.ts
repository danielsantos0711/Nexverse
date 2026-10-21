import { CodeError } from "@/lib/code/server"

/*
 * The only way the import routes reach the internet. Requests go to a short list of hosts and nowhere else: the
 * public Hugging Face API and file host (models, datasets and the daily papers list), its dataset viewer API,
 * OpenRouter's public model list, GitHub's public API (mass import), and, for cover pictures only, the CDNs those
 * sites serve images from.
 * Addresses are built here from checked ids or read from the source's own card, redirects are followed by hand
 * and only to listed hosts, and every body is read with a size cap. Only GitHub gets a token (GITHUB_TOKEN, a
 * server-only variable, when set): public items only.
 */

export const ALLOWED_HOSTS = new Set(["huggingface.co", "datasets-server.huggingface.co", "openrouter.ai", "api.github.com"])

/** Where cover pictures may come from: the sites above and the CDNs they hand pictures out from. */
const IMAGE_HOSTS = new Set([
  "huggingface.co",
  "cdn-uploads.huggingface.co",
  "cdn-avatars.huggingface.co",
  "cdn-thumbnails.huggingface.co",
  "datasets-server.huggingface.co",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "avatars.githubusercontent.com",
  "repository-images.githubusercontent.com",
  "opengraph.githubassets.com",
])
/** Hugging Face's file CDNs (us.aws.cdn.hf.co, cas-bridge.xethub.hf.co, cdn-lfs.hf.co, …). */
const IMAGE_SUFFIXES = [".hf.co", ".huggingface.co"]

export const isImageHost = (host: string) => IMAGE_HOSTS.has(host) || IMAGE_SUFFIXES.some((s) => host.endsWith(s))

const UA = "Nexverse-Import"

export class ImportError extends CodeError {}

function checkUrl(raw: string, image = false): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ImportError(400, "That address is not valid.")
  }
  const ok = image ? isImageHost(u.hostname) : ALLOWED_HOSTS.has(u.hostname)
  if (u.protocol !== "https:" || u.username || u.password || u.port || !ok) {
    throw new ImportError(400, "Imports only read from Hugging Face, OpenRouter and GitHub.")
  }
  return u
}

function authHeaders(url: URL): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim()
  if (url.hostname === "api.github.com") {
    const h: Record<string, string> = { "x-github-api-version": "2022-11-28" }
    if (token) h.authorization = `Bearer ${token}`
    return h
  }
  return {}
}

type Got = { status: number; body: Uint8Array; type: string }

/** GETs an allow-listed address, following up to 3 redirects that stay on allow-listed hosts. */
export async function getAllowed(raw: string, { maxBytes = 2 * 1024 * 1024, timeoutMs = 15_000, accept = "application/json", image = false } = {}): Promise<Got> {
  let url = checkUrl(raw, image)
  for (let hop = 0; hop < 4; hop++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { accept, "user-agent": UA, ...authHeaders(url) }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" })
    } catch {
      throw new ImportError(502, `Could not reach ${url.hostname}. Try again in a minute.`)
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      await res.body?.cancel().catch(() => null)
      if (!loc || hop === 3) throw new ImportError(502, "The source sent too many redirects.")
      url = checkUrl(new URL(loc, url).toString(), image)
      continue
    }
    const declared = Number(res.headers.get("content-length") ?? "0")
    if (declared > maxBytes) {
      await res.body?.cancel().catch(() => null)
      throw new ImportError(413, "The source answered with more data than an import reads.")
    }
    const body = await readCapped(res, maxBytes)
    return { status: res.status, body, type: res.headers.get("content-type") ?? "" }
  }
  throw new ImportError(502, "The source sent too many redirects.")
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel().catch(() => null)
      throw new ImportError(413, "The source answered with more data than an import reads.")
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const text = (b: Uint8Array) => new TextDecoder().decode(b)

/** JSON from an allow-listed address. 404 (and 401/403, which the sources use for private or gated items) → null. */
export async function getJson<T>(url: string, opts?: Parameters<typeof getAllowed>[1]): Promise<T | null> {
  const got = await getAllowed(url, opts)
  if (got.status === 404 || got.status === 401 || got.status === 403) return null
  if (got.status === 429) throw new ImportError(429, "The source is limiting requests from this site right now. Try again later.")
  if (got.status >= 400) throw new ImportError(502, `The source answered with an error (${got.status}).`)
  try {
    return JSON.parse(text(got.body)) as T
  } catch {
    throw new ImportError(502, "The source sent something that is not JSON.")
  }
}

/** Text from an allow-listed address, or null when it is not there. */
export async function getText(url: string, opts?: Parameters<typeof getAllowed>[1]): Promise<string | null> {
  const got = await getAllowed(url, { accept: "text/plain, text/markdown, */*", ...opts })
  if (got.status >= 400) return null
  return text(got.body)
}

/** Bytes from an allow-listed address, or null when it is not there or larger than `maxBytes`. */
export async function getBytes(url: string, maxBytes: number): Promise<Uint8Array | null> {
  try {
    const got = await getAllowed(url, { maxBytes, accept: "*/*", timeoutMs: 30_000 })
    return got.status === 200 ? got.body : null
  } catch (e) {
    if (e instanceof ImportError && e.status === 413) return null
    throw e
  }
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }

/** The picture type from its first bytes (the Content-Type header is not trusted alone). */
function sniff(b: Uint8Array): string | null {
  if (b.length < 12) return null
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(4, 8) === "ftyp" && /avi[fs]/.test(ascii(8, 12))) return "image/avif"
  return null
}

export type Picture = { data: Uint8Array; type: string; ext: string }

/**
 * A raster picture (PNG, JPEG, WebP, GIF or AVIF, never SVG) from an image host, up to `maxBytes`, or null when
 * it is missing, too big or not a picture. Never throws for a bad picture: covers are best effort.
 */
export async function getImage(url: string, maxBytes = 5 * 1024 * 1024): Promise<Picture | null> {
  try {
    const got = await getAllowed(url, { maxBytes, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9", timeoutMs: 20_000, image: true })
    if (got.status !== 200 || got.body.length < 200) return null
    const type = sniff(got.body)
    if (!type) return null
    return { data: got.body, type, ext: IMAGE_TYPES[type] }
  } catch {
    return null
  }
}
