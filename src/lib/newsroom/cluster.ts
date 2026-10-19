import type { NewsCategory } from "@/lib/newsroom"

/*
 * Server only, pure. Groups fresh signals that are about the same thing (a launch covered by two vendors'
 * blogs, several releases of one project) and ranks the groups, so the newsroom writes one story per event
 * and starts with what matters most.
 */

export type Signal = {
  id?: number
  hash: string
  url: string
  title: string
  excerpt: string
  publisher: string
  publishedAt: string | null
  internalOnly: boolean
  categoryHint: NewsCategory | null
  kind: "rss" | "github_releases" | "arxiv_query" | "site"
}

export type Cluster = { signals: Signal[]; score: number; key: string }

const STOP = new Set(
  "a an and are as at be by for from has have how in into is it its new of on or our the their this to was we what when why will with you your now more about after over using use introducing announcing today".split(" ")
)

export function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((t) => t.length > 1 && !STOP.has(t))
  )
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

/** owner/repo for a GitHub release address, so releases of one project group together. */
function releaseRepo(s: Signal): string | null {
  if (s.kind !== "github_releases") return null
  const m = s.url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//i)
  return m ? m[1].toLowerCase() : null
}

const PRERELEASE = /\b(rc\d*|alpha|beta|nightly|dev|preview|pre)\b|-rc|\bb\d{3,}\b/i

/** Groups signals; each signal lands in exactly one cluster. */
export function clusterSignals(signals: Signal[], threshold = 0.42): Cluster[] {
  const groups: { signals: Signal[]; toks: Set<string>; repo: string | null }[] = []
  for (const s of signals) {
    const repo = releaseRepo(s)
    const toks = tokens(s.title)
    const home = repo ? groups.find((g) => g.repo === repo) : groups.find((g) => !g.repo && jaccard(g.toks, toks) >= threshold)
    if (home) {
      home.signals.push(s)
      for (const t of toks) home.toks.add(t)
    } else groups.push({ signals: [s], toks, repo })
  }
  const now = Date.now()
  return groups
    .map((g) => {
      const publishers = new Set(g.signals.map((s) => s.publisher || s.url))
      const newest = Math.max(...g.signals.map((s) => (s.publishedAt ? Date.parse(s.publishedAt) : now - 864e5)))
      const ageHours = Math.max(0, (now - newest) / 36e5)
      const internal = g.signals.every((s) => s.internalOnly)
      const releasesOnly = g.signals.every((s) => s.kind === "github_releases")
      const allPre = releasesOnly && g.signals.every((s) => PRERELEASE.test(s.title))
      let score = publishers.size * 3 + Math.min(g.signals.length, 4) + Math.max(0, 6 - ageHours / 12)
      if (internal) score -= 4
      if (releasesOnly) score -= 2
      if (allPre) score -= 6
      return { signals: g.signals.slice(0, 8), score, key: g.repo ?? [...g.toks].sort().slice(0, 6).join(" ") }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * The clusters worth a story this run: best first, at most one built only from internal (arXiv) signals,
 * and no pre-release-only release groups.
 */
export function pickClusters(clusters: Cluster[], n: number): Cluster[] {
  const out: Cluster[] = []
  let internalUsed = false
  for (const c of clusters) {
    if (out.length >= n) break
    const internal = c.signals.every((s) => s.internalOnly)
    if (internal && internalUsed) continue
    if (c.signals.every((s) => s.kind === "github_releases" && PRERELEASE.test(s.title))) continue
    if (internal) internalUsed = true
    out.push(c)
  }
  return out
}
