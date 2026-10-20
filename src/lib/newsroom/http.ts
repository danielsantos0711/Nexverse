import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { checkUrlShape, isPrivateAddress } from "@/lib/ai/safe-url"

/*
 * Server only. Fetching the newsroom's sources: feeds, official news pages and article pages. The addresses
 * come from the sources list (editable by staff) and from the feeds themselves, so every request goes through
 * the same locks as the member link reader in src/lib/ai/safe-url.ts: https on port 443, no credentials, no
 * private or local addresses (checked on every DNS answer and every redirect), community sites refused, a
 * time limit and a size cap. A failure never throws: it comes back as a short reason for the run log.
 */

export const NEWSROOM_UA = "NexverseNewsroom/1.0 (+https://nexverse.dev/news; reads official feeds once a day)"

const MAX_REDIRECTS = 3

export type Got = { ok: true; url: string; text: string; type: string } | { ok: false; error: string }

async function publicHost(host: string): Promise<string | null> {
  if (isIP(host)) return isPrivateAddress(host) ? "that address is not on the public internet" : null
  try {
    const answers = await lookup(host, { all: true, verbatim: true })
    if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) return "that address is not on the public internet"
    return null
  } catch {
    return "the site's address could not be found"
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0")
  if (declared > maxBytes) return null
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

type Opened = { ok: true; url: URL; res: Response } | { ok: false; error: string }

/** Follows up to three redirects by hand, re-checking the shape and the address of every hop. */
async function open(raw: string, init: { headers: Record<string, string>; timeoutMs: number }): Promise<Opened> {
  let url: URL
  try {
    url = checkUrlShape(raw)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const deadline = AbortSignal.timeout(init.timeoutMs)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = await publicHost(url.hostname.replace(/^\[|\]$/g, ""))
    if (bad) return { ok: false, error: bad }
    let res: Response
    try {
      res = await fetch(url, { redirect: "manual", signal: deadline, cache: "no-store", headers: { "user-agent": NEWSROOM_UA, ...init.headers } })
    } catch (err) {
      const name = (err as Error)?.name
      return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? `no answer within ${Math.round(init.timeoutMs / 1000)} s` : "could not connect" }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      await res.body?.cancel().catch(() => {})
      if (!loc) return { ok: false, error: "redirects nowhere" }
      try {
        url = checkUrlShape(new URL(loc, url).toString())
      } catch (err) {
        return { ok: false, error: `redirects to a refused address (${(err as Error).message})` }
      }
      continue
    }
    return { ok: true, url, res }
  }
  return { ok: false, error: "too many redirects" }
}

/**
 * GET a public https address as text. `accept` says what we want; `kinds` lists the content types we take
 * (a feed may come as XML, RSS, Atom or even text/plain; a page as HTML).
 */
export async function getPublic(
  raw: string,
  { accept, kinds, timeoutMs = 12_000, maxBytes = 3_000_000, headers = {} }: { accept: string; kinds: RegExp; timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> }
): Promise<Got> {
  const got = await open(raw, { headers: { accept, ...headers }, timeoutMs })
  if (!got.ok) return got
  const { res, url } = got
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    return { ok: false, error: `answered ${res.status}` }
  }
  const type = (res.headers.get("content-type") ?? "").toLowerCase()
  if (type && !kinds.test(type)) {
    await res.body?.cancel().catch(() => {})
    return { ok: false, error: `not a feed or page (${type.split(";")[0]})` }
  }
  const text = await readCapped(res, maxBytes).catch(() => null)
  if (text === null) return { ok: false, error: `larger than ${Math.round(maxBytes / 1_000_000)} MB` }
  return { ok: true, url: url.toString(), text, type }
}

export type GotBytes = { ok: true; url: string; type: string; bytes: Uint8Array; total: number | null } | { ok: false; error: string }

/**
 * The first `headBytes` of an image, enough to read its size from the header without downloading it all.
 * Asks for a byte range; servers that ignore it are read up to the same cap and then cut off.
 */
export async function getImageHead(raw: string, { headBytes = 96_000, timeoutMs = 8_000 } = {}): Promise<GotBytes> {
  const got = await open(raw, { headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.1", range: `bytes=0-${headBytes - 1}` }, timeoutMs })
  if (!got.ok) return got
  const { res, url } = got
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    return { ok: false, error: `answered ${res.status}` }
  }
  const type = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim()
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(type)) {
    await res.body?.cancel().catch(() => {})
    return { ok: false, error: type ? `not a photo (${type})` : "no content type" }
  }
  const range = res.headers.get("content-range")?.match(/\/(\d+)$/)
  const length = Number(res.headers.get("content-length") ?? "")
  const total = range ? Number(range[1]) : res.status === 200 && Number.isFinite(length) && length > 0 ? length : null
  const bytes = await readHead(res, headBytes).catch(() => null)
  if (!bytes) return { ok: false, error: "the image could not be read" }
  return { ok: true, url: url.toString(), type, bytes, total }
}

async function readHead(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < max) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  await reader.cancel().catch(() => {})
  const buf = new Uint8Array(Math.min(total, max))
  let at = 0
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - at)
    if (take <= 0) break
    buf.set(c.subarray(0, take), at)
    at += take
  }
  return buf
}

/** JSON from a public API (Openverse, Wikimedia Commons), with the same locks. */
export async function getJson(url: string, timeoutMs = 10_000): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const got = await getPublic(url, { accept: "application/json", kinds: /json/, timeoutMs, maxBytes: 2_000_000 })
  if (!got.ok) return got
  try {
    return { ok: true, json: JSON.parse(got.text) as unknown }
  } catch {
    return { ok: false, error: "the answer was not JSON" }
  }
}

export const FEED_TYPES = /xml|rss|atom|text\/plain|text\/html/
export const PAGE_TYPES = /text\/html|application\/xhtml\+xml/

export const getFeed = (url: string) => getPublic(url, { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5", kinds: FEED_TYPES })

export const getPage = (url: string, timeoutMs = 10_000) => getPublic(url, { accept: "text/html,application/xhtml+xml", kinds: PAGE_TYPES, timeoutMs, maxBytes: 1_500_000 })
