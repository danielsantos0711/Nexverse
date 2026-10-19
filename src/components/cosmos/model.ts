import { categories, categoryPath, compact, constellations, constellationsWith, getPerson, KINDS, people, resourcePath, resources, threads, type ResourceKind } from "@/lib/data"
import { projectPath, type Project, type ProjectStats } from "@/lib/projects"

/**
 * The Cosmos model: every resource, member project, person and forum category as a star, grouped into galaxies by
 * area and joined by faint lines. Layout is computed from the data alone (no randomness), so a star sits in the same
 * place on every visit and on every device.
 *
 * Star ids are the same readable target keys used by likes and bookmarks ("model:orbit-8b", "person:ines",
 * "category:help", "project:<uuid>"), plus "you" for the signed-in member at the centre of the map.
 */

export type StarKind = ResourceKind | "project" | "person" | "category" | "you"

export const STAR_KINDS: Record<StarKind, { label: string; plural: string; color: string }> = {
  model: { label: "Model", plural: "Models", color: "#a9c2ff" },
  dataset: { label: "Dataset", plural: "Datasets", color: "#9fe3cf" },
  tool: { label: "Tool", plural: "Tools", color: "#e9c79a" },
  repo: { label: "Repo", plural: "Repos", color: "#d3b4ff" },
  project: { label: "Member project", plural: "Projects", color: "#ffb8d9" },
  person: { label: "Person", plural: "People", color: "#f4efe6" },
  category: { label: "Forum category", plural: "Forum", color: "#d8c59e" },
  you: { label: "You", plural: "You", color: "#8fb4ff" },
}

/** The kinds a visitor can switch on and off with the filter chips. "you" is always shown. */
export const FILTER_KINDS = ["model", "dataset", "tool", "repo", "project", "person", "category"] as const satisfies StarKind[]

export type GalaxyId = "language" | "media" | "agents" | "evals" | "data" | "forum" | "projects"

export type Galaxy = { id: GalaxyId; name: string; blurb: string; x: number; y: number; radius: number; tint: string; seed: number; count: number }

export type Star = {
  id: string
  kind: StarKind
  name: string
  summary: string
  /** One short line under the name: owner, likes, part of which stack. */
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

/** stack: two parts of a curated constellation. thread: a forum category and a resource its threads talk about. maker: a person and what they made. you: you and something you liked or saved. */
export type LinkKind = "stack" | "thread" | "maker" | "you"
export type Link = { a: string; b: string; kind: LinkKind }

export type Cosmos = { stars: Star[]; byId: Map<string, Star>; links: Link[]; galaxies: Galaxy[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

/** Where each galaxy sits on a wide ellipse around the centre, and what it holds. Hand-placed so labels never collide. */
const GALAXIES: { id: GalaxyId; name: string; blurb: string; angle: number; tint: string; tasks?: string[] }[] = [
  { id: "language", name: "Language", blurb: "Text generation, translation, embeddings and retrieval.", angle: 182, tint: "#8fb4ff", tasks: ["Text generation", "Translation", "Embeddings", "Retrieval"] },
  { id: "media", name: "Voice, sound & image", blurb: "Speech recognition, text to speech, audio and image generation.", angle: 236, tint: "#7fd8e8", tasks: ["Speech recognition", "Text to speech", "Audio generation", "Image generation"] },
  { id: "agents", name: "Agents & running", blurb: "Agents, observability and models that run on your own device.", angle: 292, tint: "#b9a7ff", tasks: ["Agents", "Observability", "On-device"] },
  { id: "evals", name: "Evaluation", blurb: "Evals, benchmarks and the tools that keep results honest.", angle: 342, tint: "#e8cf9a", tasks: ["Evaluation"] },
  { id: "forum", name: "Forum", blurb: "Every forum category. Lines show what its threads talk about.", angle: 30, tint: "#f0d9a8" },
  { id: "projects", name: "Member projects", blurb: "Models, datasets, tools and repos published by members.", angle: 92, tint: "#ffb8d9" },
  { id: "data", name: "Data", blurb: "Data tooling: cleaning, documenting and checking datasets.", angle: 136, tint: "#9fe3cf", tasks: ["Data tooling"] },
]

const ELLIPSE = { a: 1000, b: 600 }

/** FNV-1a: a stable number from a string, for per-star jitter and twinkle phase. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

const galaxyForTask = (task: string): GalaxyId => GALAXIES.find((g) => g.tasks?.includes(task))?.id ?? "language"

/** Spreads raw popularity numbers onto 0.15..1 with a log scale, so one giant does not shrink everyone else to dust. */
function normalise(values: number[]) {
  const logs = values.map((v) => Math.log10(Math.max(0, v) + 1))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  return logs.map((l) => (max - min < 1e-6 ? 0.6 : 0.15 + (0.85 * (l - min)) / (max - min)))
}

type Draft = Omit<Star, "x" | "y" | "r" | "weight" | "search"> & { pop: number }

export type YouInput = { name: string; signedIn: boolean; canSignIn: boolean; highlights: string[] }

/** Builds the whole map. Projects and "you" are optional so the map can draw before they load. */
export function buildCosmos({ projects = [], stats = {}, you }: { projects?: Project[]; stats?: Record<string, ProjectStats>; you?: YouInput }): Cosmos {
  const drafts: Draft[] = []

  for (const r of resources) {
    const stacks = constellationsWith(r.slug)
    const owner = getPerson(r.owner)?.name ?? r.owner
    drafts.push({
      id: `${r.kind}:${r.slug}`,
      kind: r.kind,
      name: r.name,
      summary: r.summary,
      meta: [`by ${owner}`, `${compact(r.likes)} likes`, stacks[0] ? `in ${stacks[0].name}` : null].filter(Boolean).join(" · "),
      href: resourcePath(r),
      galaxy: galaxyForTask(r.task),
      pop: r.likes,
    })
  }

  // People live in the galaxy where most of their work is, so a maker sits next to what they made.
  for (const p of people) {
    const made = resources.filter((r) => r.owner === p.handle)
    const tally = new Map<GalaxyId, number>()
    for (const r of made) tally.set(galaxyForTask(r.task), (tally.get(galaxyForTask(r.task)) ?? 0) + 1)
    const home = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "forum"
    drafts.push({
      id: `person:${p.handle}`,
      kind: "person",
      name: p.name,
      summary: p.bio,
      meta: [p.org ? "Organisation" : p.role, p.place, `${compact(p.followers)} followers`].join(" · "),
      href: `/people/${p.handle}`,
      galaxy: home,
      pop: p.followers,
    })
  }

  for (const c of categories) {
    const inside = threads.filter((t) => t.category === c.slug)
    drafts.push({
      id: `category:${c.slug}`,
      kind: "category",
      name: c.name,
      summary: c.blurb,
      meta: `${inside.length} ${inside.length === 1 ? "thread" : "threads"} · ${compact(inside.reduce((n, t) => n + t.views, 0))} views`,
      href: categoryPath(c.slug),
      galaxy: "forum",
      pop: inside.reduce((n, t) => n + t.views, 0) + 500,
    })
  }

  // Oldest first, so a new project joins the edge of its galaxy instead of reshuffling everyone already there.
  const published = [...projects].sort((a, b) => (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt))
  for (const p of published) {
    const s = stats[p.id]
    drafts.push({
      id: `project:${p.id}`,
      kind: "project",
      name: p.name,
      summary: p.summary,
      meta: [`${KINDS[p.kind].label} by ${p.owner?.name ?? "a member"}`, s ? `${compact(s.likes)} likes` : null].filter(Boolean).join(" · "),
      href: projectPath(p.id),
      galaxy: "projects",
      pop: (s?.likes ?? 0) + 2 * (s?.saves ?? 0) + 1,
    })
  }

  // Popularity is compared within each kind: followers and likes are different scales.
  const weights = new Map<string, number>()
  for (const kind of Object.keys(STAR_KINDS) as StarKind[]) {
    const group = drafts.filter((d) => d.kind === kind)
    if (!group.length) continue
    const norm = normalise(group.map((d) => d.pop))
    group.forEach((d, i) => weights.set(d.id, kind === "project" && group.length < 3 ? 0.55 : norm[i]))
  }

  const galaxies: Galaxy[] = []
  const stars: Star[] = []
  for (const g of GALAXIES) {
    const members = drafts.filter((d) => d.galaxy === g.id)
    const rad = (g.angle * Math.PI) / 180
    const radius = Math.max(140, 72 + 46 * Math.sqrt(members.length))
    const galaxy: Galaxy = { id: g.id, name: g.name, blurb: g.blurb, x: Math.cos(rad) * ELLIPSE.a, y: Math.sin(rad) * ELLIPSE.b, radius, tint: g.tint, seed: hash(g.id), count: members.length }
    galaxies.push(galaxy)

    // Brightest at the core, the rest on a sunflower spiral: even spacing with no overlaps, and fully deterministic.
    // Projects keep their publish order so the spiral only ever grows outwards.
    const ordered = g.id === "projects" ? members : [...members].sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    const spin = galaxy.seed * Math.PI * 2
    ordered.forEach((d, i) => {
      const w = weights.get(d.id) ?? 0.5
      const t = Math.sqrt((i + 0.6) / Math.max(ordered.length, 6))
      const angle = i * 2.399963 + spin
      const j = hash(d.id)
      const dist = radius * 0.86 * t * (0.92 + 0.16 * j)
      stars.push({
        ...d,
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
  const kindOf = (slug: string) => resources.find((r) => r.slug === slug)?.kind
  const resId = (slug: string) => `${kindOf(slug)}:${slug}`

  for (const c of constellations) for (const [i, j] of c.links) link(resId(c.stars[i]), resId(c.stars[j]), "stack")
  for (const t of threads) for (const slug of t.links) if (kindOf(slug)) link(`category:${t.category}`, resId(slug), "thread")
  for (const r of resources) link(`person:${r.owner}`, `${r.kind}:${r.slug}`, "maker")
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

/** "model:orbit-8b" → true when it is a key a star could have. */
export const FOCUS = /^(?:you|[a-z]{2,16}:[a-z0-9-]{1,80})$/

/** Lowercase without accents, so "ines" finds Inês and "tunde" finds Túndé. */
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
