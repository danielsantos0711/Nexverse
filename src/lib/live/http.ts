/**
 * Small, defensive helpers shared by the live feeds. Every external response is treated as untrusted:
 * fields are read one by one, typed, trimmed and length-limited, and HTML is never passed through.
 */

export const USER_AGENT = "Nexverse/1.0 (community hub for AI builders; +https://nexverse.dev)"

/** Fetches JSON with a timeout and a descriptive User-Agent. Throws on network errors and non-2xx responses. */
export async function getJson(url: string, { timeout = 10_000, headers = {} }: { timeout?: number; headers?: Record<string, string> } = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  return res.json()
}

/** Fetches text (for arXiv's Atom feed) with the same guards. */
export async function getText(url: string, { timeout = 15_000 }: { timeout?: number } = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  const text = await res.text()
  // A sane upper bound: a feed of a few dozen entries is well under this.
  return text.slice(0, 2_000_000)
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** A trimmed string with collapsed whitespace, or "" for anything else. */
export function str(v: unknown, max = 500): string {
  if (typeof v !== "string") return ""
  const s = v.replace(/\s+/g, " ").trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s
}

/** A finite, non-negative integer, or 0. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** An ISO date string if the value parses as a date, else "". */
export function isoDate(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return ""
  const t = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v)
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : ""
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/**
 * Plain text from a string that may contain markup: tags are removed, then entities decoded, whitespace
 * collapsed. Decoded "<" or ">" (as in "p &lt; 0.05") are kept as text; React escapes them when rendering,
 * and nothing here is ever rendered as HTML.
 */
export function plain(v: unknown, max = 500): string {
  if (typeof v !== "string") return ""
  return str(decodeEntities(v.replace(/<[^>]*>/g, " ")), max)
}

/** Only absolute http(s) URLs survive; everything else (javascript:, data:, relative) becomes "". */
export function safeUrl(v: unknown): string {
  if (typeof v !== "string" || v.length > 2048) return ""
  try {
    const u = new URL(v.trim())
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""
  } catch {
    return ""
  }
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Hub repo ids look like owner/name. */
export const HUB_ID = /^[A-Za-z0-9][\w.-]{0,95}\/[\w.-]{1,96}$/

/** Names that a public community front page should not feature. */
const UNSAFE = /nsfw|uncensored|porn|hentai|nude|naked|erotic|\bsex/i
export const isSafe = (...texts: string[]) => !texts.some((t) => UNSAFE.test(t))
