import { CodeError } from "@/lib/code/server"

/*
 * The only way the import routes reach the internet. Requests go to three hosts and nowhere else: the public
 * Hugging Face API and file host, its dataset viewer API, and OpenRouter's public model list. The address is
 * always built here from a checked id (never taken from the member), redirects are followed by hand and only
 * to those same hosts, and every body is read with a size cap. No tokens are sent: public items only.
 */

export const ALLOWED_HOSTS = new Set(["huggingface.co", "datasets-server.huggingface.co", "openrouter.ai"])

const UA = "Nexverse-Import"

export class ImportError extends CodeError {}

function checkUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ImportError(400, "That address is not valid.")
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !ALLOWED_HOSTS.has(u.hostname)) {
    throw new ImportError(400, "Imports only read from Hugging Face and OpenRouter.")
  }
  return u
}

type Got = { status: number; body: Uint8Array; type: string }

/** GETs an allow-listed address, following up to 3 redirects that stay on allow-listed hosts. */
export async function getAllowed(raw: string, { maxBytes = 2 * 1024 * 1024, timeoutMs = 15_000, accept = "application/json" } = {}): Promise<Got> {
  let url = checkUrl(raw)
  for (let hop = 0; hop < 4; hop++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { accept, "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" })
    } catch {
      throw new ImportError(502, `Could not reach ${url.hostname}. Try again in a minute.`)
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      await res.body?.cancel().catch(() => null)
      if (!loc || hop === 3) throw new ImportError(502, "The source sent too many redirects.")
      url = checkUrl(new URL(loc, url).toString())
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
