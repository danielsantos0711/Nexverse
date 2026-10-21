import { NEWSROOM_UA } from "../http"

/*
 * Server only. How the scouts reach the public discovery APIs. Only the hosts below, only https, addresses
 * always built by the scouts from checked parts (never taken whole from a feed or a model), redirects followed
 * by hand and only onto the same list, a time limit and a size cap on every body. No credentials are ever
 * sent, except GITHUB_TOKEN (read-only, optional) to api.github.com so the 60-requests-an-hour limit does not
 * starve the scouts. Article pages go through the newsroom's own locked page reader (../page), not this.
 *
 * Hugging Face and the technical front pages are read here as discovery sources only: what they list is
 * followed to the original paper, repository or announcement, and they are never linked or cited.
 */

const HOSTS = new Set([
  "api.github.com",
  "raw.githubusercontent.com",
  "github.com",
  "huggingface.co",
  "export.arxiv.org",
  "rss.arxiv.org",
  "hn.algolia.com",
  "www.federalregister.gov",
  "api.gdeltproject.org",
  "openrouter.ai",
])

export class Budget {
  fetches = 0
  constructor(public maxFetches: number) {}
  get left() {
    return this.maxFetches - this.fetches
  }
  take() {
    if (this.fetches >= this.maxFetches) return false
    this.fetches++
    return true
  }
}

export type Fetched = { ok: true; text: string; status: number; url: string } | { ok: false; error: string; status?: number }

function allowed(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:" || u.username || u.password || u.port || !HOSTS.has(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

/** One request to an allowed discovery host. Never throws. */
export async function fetchAllowed(
  raw: string,
  { budget, accept = "application/json", timeoutMs = 12_000, maxBytes = 2_500_000 }: { budget?: Budget; accept?: string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<Fetched> {
  const first = allowed(raw)
  if (!first) return { ok: false, error: "that host is not one the scouts read" }
  let url: URL = first
  if (budget && !budget.take()) return { ok: false, error: "this tick's request budget is used up" }
  const deadline = AbortSignal.timeout(timeoutMs)
  for (let hop = 0; hop < 4; hop++) {
    const headers: Record<string, string> = { accept, "user-agent": NEWSROOM_UA }
    const token = process.env.GITHUB_TOKEN?.trim()
    if (url.hostname === "api.github.com") {
      headers["x-github-api-version"] = "2022-11-28"
      if (token) headers.authorization = `Bearer ${token}`
    }
    let res: Response
    try {
      res = await fetch(url, { headers, redirect: "manual", signal: deadline, cache: "no-store" })
    } catch (err) {
      const name = (err as Error)?.name
      return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? `no answer within ${Math.round(timeoutMs / 1000)} s` : "could not connect" }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      await res.body?.cancel().catch(() => {})
      const next: URL | null = loc ? allowed(new URL(loc, url).toString()) : null
      if (!next) return { ok: false, error: "redirects somewhere the scouts do not read" }
      url = next
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: res.status === 403 || res.status === 429 ? `rate limited (${res.status})` : `answered ${res.status}`, status: res.status }
    }
    const declared = Number(res.headers.get("content-length") ?? "0")
    if (declared > maxBytes) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: "the answer is too large" }
    }
    const text = await readCapped(res, maxBytes)
    if (text === null) return { ok: false, error: "the answer is too large" }
    return { ok: true, text, status: res.status, url: url.toString() }
  }
  return { ok: false, error: "too many redirects" }
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    buf.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf)
}

export async function fetchJson(raw: string, o: { budget?: Budget; timeoutMs?: number } = {}): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const got = await fetchAllowed(raw, o)
  if (!got.ok) return got
  try {
    return { ok: true, json: JSON.parse(got.text) as unknown }
  } catch {
    return { ok: false, error: "the answer was not JSON" }
  }
}

/** A small pause, for APIs that ask for one (GDELT: one request every five seconds). */
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
