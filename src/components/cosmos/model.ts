import type { Collection } from "@/lib/community"
import { categories, categoryPath, compact, type ResourceKind } from "@/lib/data"
import type { HubEntry } from "@/lib/hub"
import type { GhRepo } from "@/lib/live"
import { ghHref, liveTarget } from "@/lib/live/ids"
import type { PublicMember } from "@/lib/people"
import type { ProjectStats } from "@/lib/projects"

/**
 * The Cosmos model: every project and link members published or shared, every member, every forum category and the
 * repositories rising on GitHub, as stars grouped into galaxies and joined by faint lines. Only real data: an empty
 * galaxy is drawn empty. Layout is computed from the data alone (no randomness), so a star sits in the same place
 * on every visit and on every device.
 *
 * Star ids are the same keys used by likes and bookmarks ("project:<uuid>", "share:<uuid>", "member:<uuid>",
 * "category:help", "ghrepo:<id>"), plus "you" for the signed-in member at the centre of the map.
 */

export type StarKind = ResourceKind | "github" | "person" | "category" | "you"

export const STAR_KINDS: Record<StarKind, { label: string; plural: string; color: string }> = {
  model: { label: "Model", plural: "Models", color: "#a9c2ff" },
  dataset: { label: "Dataset", plural: "Datasets", color: "#9fe3cf" },
  tool: { label: "Tool", plural: "Tools", color: "#e9c79a" },
  repo: { label: "Repo", plural: "Repos", color: "#d3b4ff" },
  github: { label: "GitHub repo", plural: "GitHub", color: "#ffb8d9" },
  person: { label: "Member", plural: "Members", color: "#f4efe6" },
  category: { label: "Forum category", plural: "Forum", color: "#d8c59e" },
  you: { label: "You", plural: "You", color: "#8fb4ff" },
}

/** The kinds a visitor can switch on and off with the filter chips. "you" is always shown. */
export const FILTER_KINDS = ["model", "dataset", "tool", "repo", "github", "person", "category"] as const satisfies StarKind[]

export type GalaxyId = ResourceKind | "github" | "members" | "forum"

export type Galaxy = { id: GalaxyId; name: string; blurb: string; x: number; y: number; radius: number; tint: string; seed: number; count: number }

export type Star = {
  id: string
  kind: StarKind
  name: string
  summary: string
  /** One short line under the name: who made it, real likes or stars. */
  meta: string
  href: string | null
  galaxy: GalaxyId | null
  /** Popularity within its kind, 0..1, on a log scale. Drives size and brightness. */
  weight: number
  x: number
  y: number
  /** Radius in world units at zoom 1. */
  r: number
  /** Lowercased text the search box matches against. */
  search: string
}

/** stack: neighbours in a member's public collection. maker: a member and what they published or shared. you: you and something you liked or saved. thread: unused, kept for the engine's styles. */
export type LinkKind = "stack" | "thread" | "maker" | "you"
export type Link = { a: string; b: string; kind: LinkKind }

export type Cosmos = { stars: Star[]; byId: Map<string, Star>; links: Link[]; galaxies: Galaxy[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

/** Where each galaxy sits on a wide ellipse around the centre, and what it holds. Hand-placed so labels never collide. */
const GALAXIES: { id: GalaxyId; name: string; blurb: string; angle: number; tint: string }[] = [
  { id: "model", name: "Models", blurb: "Models members published or shared.", angle: 182, tint: "#8fb4ff" },
  { id: "dataset", name: "Datasets", blurb: "Datasets members published or shared.", angle: 236, tint: "#9fe3cf" },
  { id: "tool", name: "Tools", blurb: "Tools members published or shared.", angle: 292, tint: "#e8cf9a" },
  { id: "repo", name: "Repos", blurb: "Code members published or shared.", angle: 342, tint: "#b9a7ff" },
  { id: "forum", name: "Forum", blurb: "Every forum category.", angle: 30, tint: "#f0d9a8" },
  { id: "members", name: "Members", blurb: "The people of Nexverse. Lines lead to what they made.", angle: 92, tint: "#f4efe6" },
  { id: "github", name: "Rising on GitHub", blurb: "New open-source AI repositories gathering stars this month.", angle: 136, tint: "#ffb8d9" },
]

const ELLIPSE = { a: 1000, b: 600 }

/** FNV-1a: a stable number from a string, for per-star jitter and twinkle phase. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Spreads raw popularity numbers onto 0.15..1 with a log scale, so one giant does not shrink everyone else to dust. */
function normalise(values: number[]) {
  const logs = values.map((v) => Math.log10(Math.max(0, v) + 1))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  return logs.map((l) => (max - min < 1e-6 ? 0.6 : 0.15 + (0.85 * (l - min)) / (max - min)))
}

type Draft = Omit<Star, "x" | "y" | "r" | "weight" | "search"> & { pop: number; order: number }

export type YouInput = { name: string; signedIn: boolean; canSignIn: boolean; highlights: string[] }

export type CosmosInput = {
  /** Members' projects and shared links (lib/hub). */
  entries?: HubEntry[]
  stats?: Record<string, ProjectStats>
  members?: PublicMember[]
  /** Public collections, for the lines between things that belong together. */
  collections?: Collection[]
  /** Rising GitHub repositories, fetched on the server. */
  github?: GhRepo[]
  you?: YouInput
}

/** Builds the whole map from real data. Everything is optional so the map can draw before it loads. */
export function buildCosmos({ entries = [], stats = {}, members = [], collections = [], github = [], you }: CosmosInput): Cosmos {
  const drafts: Draft[] = []

  // Oldest first, so a new project joins the edge of its galaxy instead of reshuffling everyone already there.
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  ordered.forEach((e, i) => {
    const s = stats[e.id]
    drafts.push({
      id: e.key,
      kind: e.kind,
      name: e.name,
      summary: e.summary,
      meta: [`${e.source === "project" ? "Published" : "Shared"} by ${e.owner?.name ?? "a member"}`, s?.likes ? `${compact(s.likes)} likes` : null].filter(Boolean).join(" · "),
      href: e.href,
      galaxy: e.kind,
      pop: (s?.likes ?? 0) + 2 * (s?.saves ?? 0) + 1,
      order: i,
    })
  })

  const made = new Map<string, number>()
  for (const e of entries) if (e.owner?.id) made.set(e.owner.id, (made.get(e.owner.id) ?? 0) + 1)
  members.forEach((m, i) => {
    drafts.push({
      id: `member:${m.id}`,
      kind: "person",
      name: m.name,
      summary: m.bio || (m.handle ? `@${m.handle}` : "A member of Nexverse."),
      meta: [m.handle ? `@${m.handle}` : null, m.location || null, made.get(m.id) ? `${made.get(m.id)} published or shared` : null].filter(Boolean).join(" · ") || "Member",
      href: `/people/${m.handle ?? m.id}`,
      galaxy: "members",
      pop: (made.get(m.id) ?? 0) + 1,
      order: i,
    })
  })

  categories.forEach((c, i) => {
    drafts.push({ id: `category:${c.slug}`, kind: "category", name: c.name, summary: c.blurb, meta: "Forum category", href: categoryPath(c.slug), galaxy: "forum", pop: 1, order: i })
  })

  github.forEach((r, i) => {
    const key = liveTarget("ghrepo", r.fullName)
    if (!key) return
    drafts.push({
      id: key,
      kind: "github",
      name: r.fullName,
      summary: r.description || "No description yet.",
      meta: [`${compact(r.stars)} stars on GitHub`, r.language || null].filter(Boolean).join(" · "),
      href: ghHref(r.owner, r.name),
      galaxy: "github",
      pop: r.stars,
      order: i,
    })
  })

  // Popularity is compared within each kind: stars and likes are different scales.
  const weights = new Map<string, number>()
  for (const kind of Object.keys(STAR_KINDS) as StarKind[]) {
    const group = drafts.filter((d) => d.kind === kind)
    if (!group.length) continue
    const norm = normalise(group.map((d) => d.pop))
    group.forEach((d, i) => weights.set(d.id, group.length < 3 ? 0.55 : norm[i]))
  }

  const galaxies: Galaxy[] = []
  const stars: Star[] = []
  for (const g of GALAXIES) {
    const inside = drafts.filter((d) => d.galaxy === g.id)
    const rad = (g.angle * Math.PI) / 180
    const radius = Math.max(140, 72 + 46 * Math.sqrt(inside.length))
    const galaxy: Galaxy = { id: g.id, name: g.name, blurb: g.blurb, x: Math.cos(rad) * ELLIPSE.a, y: Math.sin(rad) * ELLIPSE.b, radius, tint: g.tint, seed: hash(g.id), count: inside.length }
    galaxies.push(galaxy)

    // Members' work keeps its publish order so the spiral only grows outwards; the rest is brightest at the core.
    const sorted = g.id === "github" || g.id === "forum" ? [...inside].sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0) || a.id.localeCompare(b.id)) : [...inside].sort((a, b) => a.order - b.order)
    const spin = galaxy.seed * Math.PI * 2
    sorted.forEach((d, i) => {
      const w = weights.get(d.id) ?? 0.5
      const t = Math.sqrt((i + 0.6) / Math.max(sorted.length, 6))
      const angle = i * 2.399963 + spin
      const j = hash(d.id)
      const dist = radius * 0.86 * t * (0.92 + 0.16 * j)
      const { pop: _pop, order: _order, ...star } = d
      void _pop
      void _order
      stars.push({
        ...star,
        weight: w,
        x: galaxy.x + Math.cos(angle) * dist,
        y: galaxy.y + Math.sin(angle) * dist * 0.82,
        r: d.kind === "category" ? 4 + 6 * w : 4.5 + 11 * w,
        search: fold(`${d.name} ${d.summary} ${d.id} ${STAR_KINDS[d.kind].label}`),
      })
    })
  }

  if (you) {
    stars.push({
      id: "you",
      kind: "you",
      name: you.signedIn ? you.name : you.canSignIn ? "Your star" : "You",
      summary: you.signedIn
        ? "You are here. Lines lead to everything you liked and saved."
        : you.canSignIn
          ? "Sign in and your star appears here, joined to everything you like and save."
          : "You are here. Lines lead to what you liked and saved in this browser.",
      meta: you.highlights.length ? `${you.highlights.length} liked or saved` : "Nothing liked or saved yet",
      href: you.signedIn ? "/you" : you.canSignIn ? "/sign-in?next=%2Fcosmos%3Ffocus%3Dyou" : "/saved",
      galaxy: null,
      weight: 0.9,
      x: 0,
      y: 0,
      r: 11,
      search: fold(`you me my star ${you.name}`),
    })
  }

  const byId = new Map(stars.map((s) => [s.id, s]))
  const links: Link[] = []
  const seen = new Set<string>()
  const link = (a: string, b: string, kind: LinkKind) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (a === b || seen.has(key) || !byId.has(a) || !byId.has(b)) return
    seen.add(key)
    links.push({ a, b, kind })
  }

  for (const c of collections) {
    const keys = c.items.map((i) => i.target).filter((t) => byId.has(t))
    for (let i = 1; i < keys.length; i++) link(keys[i - 1], keys[i], "stack")
  }
  for (const e of entries) if (e.owner?.id) link(`member:${e.owner.id}`, e.key, "maker")
  if (you) for (const target of you.highlights) link("you", target, "you")

  const pad = 150
  const bounds = {
    minX: Math.min(...galaxies.map((g) => g.x - g.radius)) - pad,
    maxX: Math.max(...galaxies.map((g) => g.x + g.radius)) + pad,
    minY: Math.min(...galaxies.map((g) => g.y - g.radius)) - pad,
    maxY: Math.max(...galaxies.map((g) => g.y + g.radius)) + pad,
  }

  return { stars, byId, links, galaxies, bounds }
}

/** "project:<uuid>" → true when it is a key a star could have. */
export const FOCUS = /^(?:you|[a-z]{2,16}:[a-z0-9-]{1,80})$/

/** Lowercase without accents, so "ines" finds Inês. */
export const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** Stars that match a search, best first: name or key starts with it, then name contains it, then anything else. */
export function searchStars(stars: Star[], query: string, limit = 6) {
  const q = fold(query.trim())
  if (!q) return []
  const scored: { s: Star; score: number }[] = []
  for (const s of stars) {
    const name = fold(s.name)
    const key = s.id.slice(s.id.indexOf(":") + 1)
    const score = name.startsWith(q) || key.startsWith(q) ? 3 : name.includes(q) ? 2 : s.search.includes(q) ? 1 : 0
    if (score) scored.push({ s, score: score + s.weight * 0.5 })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.s)
}
