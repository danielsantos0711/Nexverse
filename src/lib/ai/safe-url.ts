import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { AiError } from "./errors"

/*
 * Fetching a page a member pasted, for the news draft helper. This is a server-side request to an address
 * chosen by a user, so it is locked down: https on port 443 only, no credentials in the URL, no private,
 * loopback or link-local addresses (checked on every DNS answer and on every redirect hop), at most 1 MB of
 * text/html within 8 seconds. Community sites that compete with Nexverse are refused outright.
 *
 * Remaining gap, stated honestly: DNS is resolved once for the check and again by fetch, so a hostile DNS
 * server could still rebind between the two. Vercel functions have no access to a private network, which
 * limits what that could reach.
 */

const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3

/** Community sites we never fetch or summarize (product rule: no competitors). Subdomains are included. */
export const BLOCKED_HOSTS = [
  "huggingface.co",
  "hf.co",
  "hf.space",
  "news.ycombinator.com",
  "reddit.com",
  "redd.it",
  "producthunt.com",
  "stackoverflow.com",
  "stackexchange.com",
  "superuser.com",
  "serverfault.com",
  "askubuntu.com",
  "mathoverflow.net",
  "quora.com",
  "lobste.rs",
  "dev.to",
  "hashnode.com",
  "kaggle.com",
  "discord.com",
  "discord.gg",
  "slashdot.org",
]

export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "")
  return BLOCKED_HOSTS.some((b) => h === b || h.endsWith("." + b))
}

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = p
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

/** Expand an IPv6 address into eight 16-bit groups, or null if it is not one. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]
  // Embedded IPv4 tail (::ffff:1.2.3.4 and friends).
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const p = v4[1].split(".").map(Number)
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16)
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return null
  const all = [...head, ...Array(fill).fill("0"), ...tail]
  if (all.length !== 8) return null
  const out = all.map((g) => Number.parseInt(g, 16))
  return out.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff) ? null : out
}

/** True for any address a server-side fetch must not reach (private, loopback, link-local, reserved). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return v4Private(ip)
  if (kind !== 6) return true
  const g = v6Groups(ip)
  if (!g) return true
  const zeroHead = g.slice(0, 5).every((n) => n === 0)
  if (zeroHead && g[5] === 0xffff) return v4Private(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`) // IPv4-mapped
  if (g.slice(0, 6).every((n) => n === 0)) return true // ::, ::1 and the old IPv4-compatible range
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Private(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`) // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // link-local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x2002) return true // 6to4 can wrap private IPv4
  return false
}

/** Parse and check a member-supplied URL without touching the network. Throws a 400 AiError. */
export function checkUrlShape(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new AiError(400, "blocked_url", "That does not look like a full link. Use one that starts with https://")
  }
  if (u.protocol !== "https:") throw new AiError(400, "blocked_url", "Only https:// links can be read.")
  if (u.username || u.password) throw new AiError(400, "blocked_url", "Links with a user name or password cannot be read.")
  if (u.port && u.port !== "443") throw new AiError(400, "blocked_url", "Only links on the standard https port can be read.")
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (isBlockedHost(host)) throw new AiError(400, "blocked_url", "Nexverse does not read or summarize posts from other community sites. Link to the original source instead.")
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new AiError(400, "blocked_url", "That address is not on the public internet.")
  } else if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) {
    throw new AiError(400, "blocked_url", "That address is not on the public internet.")
  }
  return u
}

async function checkDns(host: string) {
  if (isIP(host)) return
  let answers: { address: string }[]
  try {
    answers = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new AiError(400, "fetch_failed", "That site's address could not be found.")
  }
  if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) {
    throw new AiError(400, "blocked_url", "That address is not on the public internet.")
  }
}

/** Read up to MAX_BYTES of a response body; fail if it is larger. */
async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0")
  if (declared > MAX_BYTES) throw new AiError(413, "fetch_failed", "That page is larger than 1 MB, too big to read.")
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new AiError(413, "fetch_failed", "That page is larger than 1 MB, too big to read.")
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

export type FetchedPage = { url: string; html: string }

/** Fetch a public HTML page with every limit above. Throws AiErrors with readable messages. */
export async function fetchPublicPage(raw: string): Promise<FetchedPage> {
  let url = checkUrlShape(raw)
  const deadline = AbortSignal.timeout(TIMEOUT_MS)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkDns(url.hostname.replace(/^\[|\]$/g, ""))
    let res: Response
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        cache: "no-store",
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "NexverseBot/1.0 (news draft helper; one page per request)" },
      })
    } catch (err) {
      const name = (err as Error)?.name
      if (name === "TimeoutError" || name === "AbortError") throw new AiError(504, "fetch_failed", "That page took longer than 8 seconds to load.")
      throw new AiError(502, "fetch_failed", "That page could not be loaded.")
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) throw new AiError(502, "fetch_failed", "That page redirects nowhere.")
      url = checkUrlShape(new URL(loc, url).toString())
      continue
    }
    if (!res.ok) throw new AiError(502, "fetch_failed", `That page answered with an error (${res.status}).`)
    const type = (res.headers.get("content-type") ?? "").toLowerCase()
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      throw new AiError(415, "fetch_failed", "That link is not a web page (only HTML pages can be read).")
    }
    return { url: url.toString(), html: await readCapped(res) }
  }
  throw new AiError(502, "fetch_failed", "That page redirects too many times.")
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" }

function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i")
  const tag = html.match(re)?.[0]
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1]
  return content ? decode(content).trim() : ""
}

/** Reduce HTML to readable text plus title and description, capped to `maxChars`. */
export function htmlToText(html: string, maxChars = 20_000): { title: string; description: string; text: string } {
  const title = meta(html, "og:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim()
  const description = meta(html, "og:description") || meta(html, "description")
  // Prefer the main article when the page marks one.
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html
  const text = decode(
    main
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form|header|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { title: title.slice(0, 300), description: description.slice(0, 600), text: text.slice(0, maxChars) }
}
