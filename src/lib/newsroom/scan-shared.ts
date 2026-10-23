/*
 * What the newsroom scan shares with the admin page (browser): the windows, the source kinds and the shapes of
 * what a scan answers. No network and no secrets here; the scan itself is in ./scan.ts (server only).
 */

/** The windows editors pick from. */
export const SCAN_WINDOWS = [
  { hours: 24, label: "24 h" },
  { hours: 48, label: "48 h" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 336, label: "14 days" },
  { hours: 720, label: "30 days" },
  { hours: 2160, label: "90 days" },
] as const

export const clampHours = (v: unknown, fallback = 24) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(2160, Math.max(1, n)) : fallback
}

export type ScanKind = "official" | "releases" | "github" | "arxiv" | "policy" | "frontpage" | "coverage" | "models"

export const SCAN_KINDS: { id: ScanKind; label: string; blurb: string }[] = [
  { id: "official", label: "Official blogs", blurb: "The labs' and companies' own feeds and news pages." },
  { id: "releases", label: "Releases", blurb: "New versions of the major AI frameworks and runtimes." },
  { id: "github", label: "New repositories", blurb: "Repositories created in the window, by stars." },
  { id: "arxiv", label: "Papers", blurb: "arXiv cs.AI, cs.CL, cs.LG and cs.CV, by submission date." },
  { id: "policy", label: "Policy", blurb: "The US Federal Register: rules and notices about AI." },
  { id: "frontpage", label: "Front page", blurb: "Stories engineers upvoted, followed to the original article." },
  { id: "coverage", label: "News index", blurb: "Coverage worldwide (GDELT), to find and corroborate stories." },
  { id: "models", label: "New models", blurb: "Trending new models, followed to their paper, repository or post." },
]

export type SourceReport = { kind: ScanKind; label: string; ok: boolean; count: number; error?: string }

export type StoredFinding = {
  id: number
  url: string
  title: string
  excerpt: string
  publisher: string
  publishedAt: string | null
  foundAt: string
  scout: string
  kind: ScanKind
  desk: string | null
  score: number
  used: boolean
  storyId: string | null
  leadId: number | null
  internalOnly: boolean
  via: string | null
}
