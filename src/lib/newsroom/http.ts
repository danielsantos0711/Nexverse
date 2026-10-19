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

/**
 * GET a public https address as text. `accept` says what we want; `kinds` lists the content types we take
 * (a feed may come as XML, RSS, Atom or even text/plain; a page as HTML).
 */
export async function getPublic(
  raw: string,
  { accept, kinds, timeoutMs = 12_000, maxBytes = 3_000_000 }: { accept: string; kinds: RegExp; timeoutMs?: number; maxBytes?: number }
): Promise<Got> {
  let url: URL
  try {
    url = checkUrlShape(raw)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const deadline = AbortSignal.timeout(timeoutMs)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = await publicHost(url.hostname.replace(/^\[|\]$/g, ""))
    if (bad) return { ok: false, error: bad }
    let res: Response
    try {
      res = await fetch(url, { redirect: "manual", signal: deadline, cache: "no-store", headers: { accept, "user-agent": NEWSROOM_UA } })
    } catch (err) {
      const name = (err as Error)?.name
      return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? `no answer within ${Math.round(timeoutMs / 1000)} s` : "could not connect" }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return { ok: false, error: "redirects nowhere" }
      try {
        url = checkUrlShape(new URL(loc, url).toString())
      } catch (err) {
        return { ok: false, error: `redirects to a refused address (${(err as Error).message})` }
      }
      continue
    }
    if (!res.ok) return { ok: false, error: `answered ${res.status}` }
    const type = (res.headers.get("content-type") ?? "").toLowerCase()
    if (type && !kinds.test(type)) return { ok: false, error: `not a feed or page (${type.split(";")[0]})` }
    const text = await readCapped(res, maxBytes).catch(() => null)
    if (text === null) return { ok: false, error: `larger than ${Math.round(maxBytes / 1_000_000)} MB` }
    return { ok: true, url: url.toString(), text, type }
  }
  return { ok: false, error: "too many redirects" }
}

export const FEED_TYPES = /xml|rss|atom|text\/plain|text\/html/
export const PAGE_TYPES = /text\/html|application\/xhtml\+xml/

export const getFeed = (url: string) => getPublic(url, { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5", kinds: FEED_TYPES })

export const getPage = (url: string, timeoutMs = 10_000) => getPublic(url, { accept: "text/html,application/xhtml+xml", kinds: PAGE_TYPES, timeoutMs, maxBytes: 1_500_000 })
