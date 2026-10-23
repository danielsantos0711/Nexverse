import type { NewsSource } from "@/lib/newsroom"
import { getFeed, getPage } from "./http"
import { parseFeed, parseReleases, parseSiteLinks, type RawItem } from "./parse"

/*
 * Server only. One source in, its newest items out. GitHub releases come from the repository's public Atom
 * feed (no API quota), arXiv from its official per-category RSS. A source that fails gives no items and a
 * reason, and the run carries on with the others.
 */

export type Collected = { ok: true; items: RawItem[] } | { ok: false; items: []; error: string }

/** Items older than this are not news any more and are not collected. */
const MAX_AGE_MS = 10 * 864e5

/**
 * `maxAgeMs` is the scan window (ten days unless a scan asks for another one); `max` how many items a feed may
 * give at most. Items without a date are kept: the caller decides what to do with them.
 */
export async function collectSource(s: Pick<NewsSource, "kind" | "url" | "repo" | "query">, { maxAgeMs = MAX_AGE_MS, max = 20 }: { maxAgeMs?: number; max?: number } = {}): Promise<Collected> {
  let items: RawItem[]
  if (s.kind === "github_releases") {
    if (!s.repo) return { ok: false, items: [], error: "no repository set" }
    const got = await getFeed(`https://github.com/${s.repo}/releases.atom`)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseReleases(got.text, s.repo, Math.max(4, Math.min(10, Math.round(max / 4))))
  } else if (s.kind === "arxiv_query") {
    if (!s.query) return { ok: false, items: [], error: "no category set" }
    const got = await getFeed(`https://rss.arxiv.org/rss/${encodeURIComponent(s.query)}`)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseFeed(got.text, "https://arxiv.org/", max)
  } else if (s.kind === "site") {
    if (!s.url || !s.query) return { ok: false, items: [], error: "no page or path set" }
    const got = await getPage(s.url, 12_000)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseSiteLinks(got.text, got.url, s.query, max)
  } else {
    if (!s.url) return { ok: false, items: [], error: "no feed address set" }
    const got = await getFeed(s.url)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseFeed(got.text, got.url, max)
    if (!items.length && !/<(rss|feed|rdf)[\s>]/i.test(got.text.slice(0, 2000))) return { ok: false, items: [], error: "the address did not return a feed" }
  }
  const cutoff = Date.now() - maxAgeMs
  return { ok: true, items: items.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff) }
}
