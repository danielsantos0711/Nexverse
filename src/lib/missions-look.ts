/**
 * How a mission (and a member's space) looks and what shape it takes: the mission types, the accent colours
 * members pick from (the same eight the database allows for crews, missions and profiles), and the covers the
 * site draws itself. Plain data, safe to import anywhere.
 */

export type MissionKind = "bounty" | "challenge" | "quest"

export const MISSION_KINDS: Record<MissionKind, { label: string; blurb: string }> = {
  bounty: { label: "Bounty", blurb: "Build one specific thing. The best entry takes the reward." },
  challenge: { label: "Challenge", blurb: "An open contest: many ways to solve it, the poster picks the best." },
  quest: { label: "Quest", blurb: "One step of a chain. Finish it to unlock the next mission." },
}

export const MISSION_KIND_ORDER: MissionKind[] = ["bounty", "challenge", "quest"]
export const isMissionKind = (s: string): s is MissionKind => s in MISSION_KINDS

export type Accent = "ion" | "gold" | "ok" | "violet" | "rose" | "teal" | "amber" | "sky"

/** Each accent as an rgb triple (for rgb(var / alpha)) and a name. */
export const ACCENTS: Record<Accent, { label: string; rgb: string }> = {
  ion: { label: "Ion", rgb: "143 180 255" },
  gold: { label: "Champagne", rgb: "216 197 158" },
  ok: { label: "Aurora", rgb: "110 231 183" },
  violet: { label: "Nebula", rgb: "211 180 255" },
  rose: { label: "Rose", rgb: "255 170 200" },
  teal: { label: "Tide", rgb: "125 222 214" },
  amber: { label: "Sunrise", rgb: "246 192 120" },
  sky: { label: "Sky", rgb: "150 210 255" },
}

export const ACCENT_ORDER = Object.keys(ACCENTS) as Accent[]
export const isAccent = (s: unknown): s is Accent => typeof s === "string" && s in ACCENTS
export const accentRgb = (a: string | null | undefined) => ACCENTS[isAccent(a) ? a : "ion"].rgb

/** Covers the site draws (no upload needed). Stored as "pattern:<id>". */
export const COVER_PATTERNS = [
  { id: "nebula", label: "Nebula" },
  { id: "orbit", label: "Orbit" },
  { id: "aurora", label: "Aurora" },
  { id: "grid", label: "Star chart" },
  { id: "rings", label: "Rings" },
  { id: "dunes", label: "Dunes" },
] as const

export type CoverPattern = (typeof COVER_PATTERNS)[number]["id"]
const PATTERN_IDS = COVER_PATTERNS.map((p) => p.id) as string[]

/** A cover is a site pattern or an https image (up to 500 characters). Null means "draw one from the id". */
export function parseCover(cover: string | null | undefined): { pattern: CoverPattern } | { image: string } | null {
  if (!cover) return null
  if (cover.startsWith("pattern:")) {
    const id = cover.slice(8)
    return PATTERN_IDS.includes(id) ? { pattern: id as CoverPattern } : null
  }
  return isCoverImage(cover) ? { image: cover } : null
}

export const isCoverImage = (s: string) => s.length <= 500 && /^https:\/\/[^\s]+$/.test(s)

export function validCover(cover: string | null): string | null {
  if (cover === null || cover === "") return null
  if (cover.startsWith("pattern:")) return PATTERN_IDS.includes(cover.slice(8)) ? null : "Pick one of the covers."
  return isCoverImage(cover) ? null : "Use a full https:// link to an image, up to 500 characters."
}

export const MILESTONE_MAX = 12
export const MILESTONE_LENGTH = 120
export const PRIZE_LENGTH = 200
