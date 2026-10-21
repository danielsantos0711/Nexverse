import { tokens, type Cluster, type Signal } from "../cluster"
import { urlKey } from "../parse"
import type { Desk } from "./types"

/*
 * Server only, pure. The first, deterministic half of the editorial filter: how fresh, how authoritative, how
 * independently reported, how fast it is rising, how new compared with what Nexverse already published, and
 * how much the desk matters right now. The triage agent adds its own judgement (impact, originality) on top;
 * without AI the deterministic score decides alone and says so.
 */

export type EngineSignal = Signal & { desk: string | null; scout: string; metrics: Record<string, number | string> | null; via: string | null }

export type Published = { id: string; title: string; storyKey: string | null; sources: string[]; publishedAt: string | null; desk: string | null; status: string }

export type Scored = {
  cluster: Cluster
  signals: EngineSignal[]
  desk: string | null
  score: number
  parts: Record<string, number>
  storyKey: string
  /** The published story this repeats or develops. */
  match: { id: string; title: string; similarity: number; newSources: string[]; kind: "duplicate" | "update" } | null
  flags: string[]
}

const DAY = 864e5

const AUTHORITY: Record<string, number> = {
  rss: 20,
  site: 20,
  federal: 20,
  github_releases: 15,
  github_rising: 12,
  hf_models: 11,
  hf_datasets: 10,
  arxiv_query: 10,
  arxiv_search: 10,
  watch: 14,
  front_page: 8,
  gdelt: 6,
}

const PRERELEASE = /\b(rc\d*|alpha|beta|nightly|dev|preview|pre)\b|-rc/i

/** The words a story is about, as a stable key: the eight most specific tokens of its headline, sorted. */
export function storyKeyOf(title: string): string {
  return [...tokens(title)]
    .filter((t) => t.length > 2 && !/^\d+$/.test(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .sort()
    .join(" ")
    .slice(0, 200)
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** The most common desk among the signals, else the first desk whose format fits. */
function deskOf(signals: EngineSignal[], fallback: string | null): string | null {
  const count = new Map<string, number>()
  for (const s of signals) if (s.desk) count.set(s.desk, (count.get(s.desk) ?? 0) + 1)
  let best: string | null = null
  let n = 0
  for (const [d, c] of count) if (c > n) [best, n] = [d, c]
  return best ?? fallback
}

export function scoreCluster(c: Cluster, signals: EngineSignal[], desks: Map<string, Desk>, published: Published[], now = Date.now()): Scored {
  const flags: string[] = []
  const newest = Math.max(...signals.map((s) => (s.publishedAt ? Date.parse(s.publishedAt) : now - DAY)))
  const ageH = Math.max(0, (now - newest) / 36e5)
  const freshness = 20 * Math.exp(-ageH / 48)

  const authority = Math.max(...signals.map((s) => AUTHORITY[s.scout] ?? AUTHORITY[s.kind] ?? 8))
  const publishers = new Set(signals.map((s) => s.publisher.toLowerCase() || s.url))
  const independence = publishers.size >= 3 ? 15 : publishers.size === 2 ? 9 : 3

  // Momentum: stars a day, front-page points, model likes; logarithmic so one viral item does not drown the rest.
  let momentum = 0
  for (const s of signals) {
    const m = s.metrics ?? {}
    momentum = Math.max(
      momentum,
      Math.min(15, Math.log10(1 + num(m.starsPerDay)) * 6),
      Math.min(15, Math.log10(1 + num(m.points)) * 4.5),
      Math.min(15, Math.log10(1 + num(m.likes)) * 4.2),
      Math.min(15, Math.log10(1 + num(m.trending)) * 4.5)
    )
  }

  const desk = deskOf(signals, null)
  const d = desk ? desks.get(desk) : undefined
  const priority = (d?.priority ?? 2) * 2

  // Novelty: against what is already published (or in the queue), by words and by address.
  const key = storyKeyOf(c.signals[0]?.title ?? "")
  const mine = new Set(signals.flatMap((s) => [...tokens(s.title)]))
  const urls = new Set(signals.map((s) => urlKey(s.url)))
  let match: Scored["match"] = null
  let best = 0
  for (const p of published) {
    const sameUrl = p.sources.some((u) => urls.has(urlKey(u)))
    const sim = Math.max(jaccard(mine, tokens(p.title)), p.storyKey ? jaccard(new Set(key.split(" ")), new Set(p.storyKey.split(" "))) : 0)
    const similarity = sameUrl ? Math.max(sim, 0.9) : sim
    if (similarity > best && similarity >= 0.42) {
      best = similarity
      const covered = new Set(p.sources.map(urlKey))
      const newSources = signals.map((s) => s.url).filter((u) => !covered.has(urlKey(u)))
      const recent = p.publishedAt ? now - Date.parse(p.publishedAt) < 21 * DAY : true
      match = { id: p.id, title: p.title, similarity: Math.round(similarity * 100) / 100, newSources, kind: newSources.length && recent && p.status === "published" ? "update" : "duplicate" }
    }
  }
  const novelty = 15 * (1 - Math.min(1, best))

  let penalty = 0
  if (signals.every((s) => s.internalOnly)) {
    penalty += 5
    flags.push("internal sources only (arXiv)")
  }
  if (signals.every((s) => s.kind === "github_releases" || s.scout === "github_releases") && signals.every((s) => PRERELEASE.test(s.title))) {
    penalty += 12
    flags.push("pre-releases only")
  }
  if (signals.every((s) => s.via)) flags.push(`found through ${signals[0].via}`)
  if (ageH > 24 * 9) {
    penalty += 10
    flags.push("older than nine days")
  }

  const parts = {
    freshness: Math.round(freshness),
    authority: Math.round(authority),
    independence,
    momentum: Math.round(momentum),
    novelty: Math.round(novelty),
    priority,
    penalty: -penalty,
  }
  const score = Math.max(0, Math.min(100, Math.round(freshness + authority + independence + momentum + novelty + priority - penalty)))
  return { cluster: c, signals, desk, score, parts, storyKey: key, match, flags }
}

/** Combines the deterministic score with the triage agent's judgement (impact and originality, 0 to 100). */
export function blend(base: number, ai: { impact: number; originality: number } | null): number {
  if (!ai) return base
  return Math.max(0, Math.min(100, Math.round(base * 0.4 + ai.impact * 0.4 + ai.originality * 0.2)))
}

/**
 * How many stories each desk may research this cycle: the shared allowance, given out by the desks' priority
 * and how active they are (strong candidates waiting). A quiet desk gets nothing, so no filler is written.
 */
export function allocate(total: number, candidates: { desk: string | null; score: number }[], desks: Map<string, Desk>): Map<string, number> {
  const weight = new Map<string, number>()
  for (const c of candidates) {
    if (!c.desk) continue
    const d = desks.get(c.desk)
    if (!d || !d.enabled || c.score < d.minScore) continue
    weight.set(c.desk, (weight.get(c.desk) ?? 0) + (c.score / 100) * (1 + d.priority))
  }
  const sum = [...weight.values()].reduce((a, b) => a + b, 0)
  const out = new Map<string, number>()
  if (!sum || total <= 0) return out
  let given = 0
  const sorted = [...weight.entries()].sort((a, b) => b[1] - a[1])
  for (const [desk, w] of sorted) {
    const share = Math.floor((w / sum) * total)
    out.set(desk, share)
    given += share
  }
  // What is left over goes to the most active desks, one each.
  for (const [desk] of sorted) {
    if (given >= total) break
    out.set(desk, (out.get(desk) ?? 0) + 1)
    given++
  }
  return out
}
