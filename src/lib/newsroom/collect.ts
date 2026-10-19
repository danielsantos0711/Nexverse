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

export async function collectSource(s: Pick<NewsSource, "kind" | "url" | "repo" | "query">): Promise<Collected> {
  let items: RawItem[]
  if (s.kind === "github_releases") {
    if (!s.repo) return { ok: false, items: [], error: "no repository set" }
    const got = await getFeed(`https://github.com/${s.repo}/releases.atom`)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseReleases(got.text, s.repo, 4)
  } else if (s.kind === "arxiv_query") {
    if (!s.query) return { ok: false, items: [], error: "no category set" }
    const got = await getFeed(`https://rss.arxiv.org/rss/${encodeURIComponent(s.query)}`)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseFeed(got.text, "https://arxiv.org/", 15)
  } else if (s.kind === "site") {
    if (!s.url || !s.query) return { ok: false, items: [], error: "no page or path set" }
    const got = await getPage(s.url, 12_000)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseSiteLinks(got.text, got.url, s.query, 15)
  } else {
    if (!s.url) return { ok: false, items: [], error: "no feed address set" }
    const got = await getFeed(s.url)
    if (!got.ok) return { ok: false, items: [], error: got.error }
    items = parseFeed(got.text, got.url, 20)
    if (!items.length && !/<(rss|feed|rdf)[\s>]/i.test(got.text.slice(0, 2000))) return { ok: false, items: [], error: "the address did not return a feed" }
  }
  const cutoff = Date.now() - MAX_AGE_MS
  return { ok: true, items: items.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff) }
}
