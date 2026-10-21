import { createHash } from "node:crypto"
import { getPage } from "../http"
import { htmlToArticleText } from "../page"
import { fetchAllowed, type Budget } from "./fetch"
import type { EvidenceItem, EvidenceLevel } from "./types"

/*
 * Server only. The leak desk's watchers. A watcher reads one public file (an official SDK's list of model
 * names, a README) or one public page, takes the identifiers it is told to look for, and compares them with
 * the last snapshot. Something new is an observation, never a story: the engine then looks for more evidence
 * (other official files, the vendor's pages, credible coverage), weighs other explanations, and only an
 * observation backed strongly enough reaches an editor. Nothing here logs in, guesses private addresses or
 * reads anything that is not public.
 */

export type Watcher = {
  id: string
  kind: "file" | "page"
  label: string
  target: string
  desk: string | null
  pattern: string
  publisher: string
  lastHash: string | null
  lastTokens: string[]
  lastChecked: string | null
}

export type WatchRow = {
  id: string
  kind: "file" | "page"
  label: string
  target: string
  desk: string | null
  pattern: string
  publisher: string
  enabled: boolean
  last_hash: string | null
  last_tokens: string[] | null
  last_checked: string | null
  last_changed: string | null
  last_error: string | null
}

export const WATCH_COLUMNS = "id, kind, label, target, desk, pattern, publisher, enabled, last_hash, last_tokens, last_checked, last_changed, last_error"

export const toWatcher = (r: WatchRow): Watcher => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  target: r.target,
  desk: r.desk,
  pattern: r.pattern,
  publisher: r.publisher,
  lastHash: r.last_hash,
  lastTokens: r.last_tokens ?? [],
  lastChecked: r.last_checked,
})

/** owner/name:branch:path → the raw file and the page people can read. */
export function fileTarget(target: string): { raw: string; view: string; repo: string; path: string } | null {
  const m = target.match(/^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}):([\w./-]{1,100}):([\w./ -]{1,300})$/)
  if (!m) return null
  const [, owner, repo, branch, path] = m
  const p = path.split("/").map(encodeURIComponent).join("/")
  return { raw: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`, view: `https://github.com/${owner}/${repo}/blob/${branch}/${p}`, repo: `${owner}/${repo}`, path }
}

/** The identifiers in a text: the pattern's first group (or the whole match), lowercased, unique, sorted. */
export function extractTokens(text: string, pattern: string): string[] {
  if (!pattern) {
    // Any change: the text's lines, normalised and capped.
    return [...new Set(text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim().slice(0, 200)).filter((l) => l.length > 3))].slice(0, 3000)
  }
  let re: RegExp
  try {
    re = new RegExp(pattern, "gi")
  } catch {
    return []
  }
  const out = new Set<string>()
  for (const m of text.slice(0, 400_000).matchAll(re)) {
    const t = (m[1] ?? m[0]).toLowerCase().trim().replace(/[.,;:]+$/, "")
    if (t.length >= 3 && t.length <= 80) out.add(t)
    if (out.size >= 3000) break
  }
  return [...out].sort()
}

export const textHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40)

export type WatchCheck =
  | { ok: true; hash: string; tokens: string[]; added: string[]; removed: string[]; baseline: boolean; url: string; changed: boolean }
  | { ok: false; error: string }

export async function checkWatcher(w: Watcher, budget: Budget): Promise<WatchCheck> {
  let text = ""
  let url = ""
  if (w.kind === "file") {
    const t = fileTarget(w.target)
    if (!t) return { ok: false, error: "the target is not owner/name:branch:path" }
    const got = await fetchAllowed(t.raw, { budget, accept: "text/plain", maxBytes: 600_000 })
    if (!got.ok) return { ok: false, error: got.error }
    text = got.text
    url = t.view
  } else {
    if (!budget.take()) return { ok: false, error: "this tick's request budget is used up" }
    const got = await getPage(w.target, 12_000)
    if (!got.ok) return { ok: false, error: got.error }
    text = htmlToArticleText(got.text)
    url = got.url
  }
  const hash = textHash(text)
  const tokens = extractTokens(text, w.pattern)
  const before = new Set(w.lastTokens)
  const now = new Set(tokens)
  const baseline = !w.lastChecked || !w.lastHash
  const added = baseline ? [] : tokens.filter((t) => !before.has(t))
  const removed = baseline ? [] : w.lastTokens.filter((t) => !now.has(t))
  return { ok: true, hash, tokens, added, removed, baseline, url, changed: !baseline && hash !== w.lastHash }
}

/** Identifiers that are only spelling variants of known ones (dated snapshots, "-latest", "-preview") are not news. */
export function meaningful(added: string[], known: string[]): string[] {
  const stem = (t: string) => t.replace(/-(\d{4}-?\d{2}-?\d{2}|\d{8}|\d{4}|latest|preview|exp|experimental|beta|alpha)$/g, "").replace(/-+$/, "")
  const knownStems = new Set(known.map(stem))
  return added.filter((t) => !knownStems.has(stem(t)))
}

// ─── Weighing a leak ────────────────────────────────────────────────────────────────────────────────────────

export type LeakEvidence = {
  /** Official files or pages of the company involved where the identifier appears. */
  officialHits: EvidenceItem[]
  /** Other independent public sources (other repositories, documentation mirrors, credible coverage). */
  independentHits: EvidenceItem[]
  /** The company itself announced it (a post or page that names it). */
  announced: boolean
}

/**
 * The evidence level and a confidence from 0 to 100. One isolated mention stays low ("observed", weak); several
 * official traces raise it to "technical"; an announcement makes it "confirmed" (and then it is no longer a
 * leak). Credible coverage alone never makes something technical: it only adds a little.
 */
export function weighLeak(e: LeakEvidence): { level: EvidenceLevel; confidence: number; isolated: boolean } {
  if (e.announced) return { level: "confirmed", confidence: 95, isolated: false }
  const official = e.officialHits.length
  const independent = e.independentHits.length
  const technical = e.independentHits.filter((h) => h.kind !== "coverage").length
  const coverage = independent - technical
  const isolated = official + technical <= 1
  let level: EvidenceLevel = official ? "observed" : independent ? "plausible" : "rumor"
  if (official >= 2 || (official >= 1 && technical >= 1)) level = "technical"
  let confidence = level === "technical" ? 60 : level === "observed" ? 40 : level === "plausible" ? 22 : 5
  confidence += Math.min(3, Math.max(0, official - 1)) * 8 + Math.min(3, technical) * 6 + Math.min(2, coverage) * 4
  if (isolated) confidence -= 12
  return { level, confidence: Math.max(0, Math.min(90, Math.round(confidence))), isolated }
}
