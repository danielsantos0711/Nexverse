import type { LanguageCode, ResourceKind } from "@/lib/data"
import { KINDS, LANGUAGES } from "@/lib/data"
import type { Member } from "@/lib/store"
import { db } from "@/lib/supabase"
import { LICENSE_ID, LICENSE_LIST, legacyLicense, licenseName, normalizeLicense } from "@/lib/publish/licenses"

/**
 * Projects members publish on Nexverse: a model, dataset, tool or repo with a README, links and a changelog.
 * With a database connected they live in public.projects (drafts are visible to their owner only); without one
 * they stay in this browser, so the studio still works as a local preview.
 *
 * Likes, saves and discussion use the keys every other page uses:
 *   project:<uuid>    like and bookmark target
 *   project-<uuid>    discussion thread id (stored as a "sample thread" in public.answers)
 */

export type ProjectKind = ResourceKind
export type ProjectStatus = "draft" | "published"

/**
 * What a project is (round 10). The kind is the hub list it sits in (/models, /datasets, /tools, /repos); the
 * type is finer: apps sit next to tools, papers and everything else next to repos. Older rows have no type and
 * read it from their kind.
 */
export type ProjectType = "model" | "dataset" | "tool" | "app" | "paper" | "other"

export const PROJECT_TYPES: { id: ProjectType; label: string; blurb: string }[] = [
  { id: "model", label: "Model", blurb: "Weights or an API model: a model card, specs, pricing, providers and quick-start code." },
  { id: "dataset", label: "Dataset", blurb: "Data with a card, a viewer for CSV and JSON files, splits and a snippet to load it." },
  { id: "tool", label: "Tool", blurb: "A library, CLI or utility people install and use." },
  { id: "app", label: "App", blurb: "Something people open and use: a web app, a bot, a demo." },
  { id: "paper", label: "Paper", blurb: "Research with its write-up, code and results in one place." },
  { id: "other", label: "Other", blurb: "Anything else worth a page: a project, a guide, a collection of code." },
]

export const kindForType = (t: ProjectType): ProjectKind => (t === "model" || t === "dataset" || t === "tool" ? t : t === "app" ? "tool" : "repo")
export const typeLabel = (t: ProjectType) => PROJECT_TYPES.find((x) => x.id === t)?.label ?? "Project"
const isType = (t: unknown): t is ProjectType => typeof t === "string" && PROJECT_TYPES.some((x) => x.id === t)
/** The type a row stands for: its own, or the one its kind implies. */
export const typeOf = (p: { type?: ProjectType | null; kind: ProjectKind }): ProjectType => p.type ?? (p.kind === "repo" ? "other" : p.kind)

/** Prices are US dollars per million tokens, as API providers quote them. */
export type Pricing = { free?: boolean; prompt?: number; completion?: number; request?: number; image?: number }

export type Endpoint = { provider: string; contextLength?: number; maxOutput?: number; pricing?: Pricing; quantization?: string; status?: string }

/** What a model page shows next to its card. Everything is optional; members fill what applies. */
export type ModelSpecs = {
  provider?: string
  contextLength?: number
  maxOutput?: number
  pricing?: Pricing
  inputModalities?: string[]
  outputModalities?: string[]
  /** "7B", "70.6B", "MoE 8x22B". */
  parameters?: string
  architecture?: string
  tokenizer?: string
  library?: string
  pipeline?: string
  baseModel?: string
  quantizations?: string[]
  supportedParameters?: string[]
  knowledgeCutoff?: string
  endpoints?: Endpoint[]
}

export type DatasetSplit = { name: string; config?: string; rows?: number; bytes?: number }
export type DatasetFeature = { name: string; type: string }

export type DatasetSpecs = {
  rows?: number
  bytes?: number
  splits?: DatasetSplit[]
  features?: DatasetFeature[]
  tasks?: string[]
  modalities?: string[]
  formats?: string[]
  sizeCategory?: string
}

/**
 * What the source said about an imported item when it was read (round 12): its numbers at that moment, its
 * dates, files, code languages, latest release, authors, and a few rows of a dataset. Shown on the page as
 * "from the source"; the numbers are never mixed into Nexverse's own counts.
 */
export type ImportedFacts = {
  /** When these were read. */
  at: string
  author?: string
  createdAt?: string
  updatedAt?: string
  downloads?: number
  likes?: number
  stars?: number
  forks?: number
  openIssues?: number
  gated?: boolean
  fileCount?: number
  totalBytes?: number
  files?: { name: string; bytes?: number }[]
  /** Code languages with their share of the code, in percent. */
  languages?: { name: string; share: number }[]
  topics?: string[]
  release?: { tag: string; name?: string; date?: string; notes?: string }
  /** Papers: the authors and arXiv categories. */
  authors?: string[]
  categories?: string[]
  arxivId?: string
  /** Models: the datasets they were trained on, as the card names them. */
  datasets?: string[]
  /** Datasets: a few rows, as text. */
  sample?: { split?: string; columns: string[]; rows: string[][] }
}

export type ProjectSpecs = { model?: ModelSpecs; dataset?: DatasetSpecs; imported?: ImportedFacts }

export type SourceSite = "huggingface" | "openrouter" | "github" | "arxiv"

/** The "imported from" credit, written when an import creates the project (and refreshed by "Refresh details"). */
export type ProjectSource = { site: SourceSite; ref: string; type: "model" | "dataset" | "repo" | "tool" | "paper"; importedAt: string; refreshedAt?: string; revision?: string; curated?: boolean }

export const SOURCE_SITES: Record<SourceSite, string> = { huggingface: "Hugging Face", openrouter: "OpenRouter", github: "GitHub", arxiv: "arXiv" }

export type Accent = "ion" | "gold" | "rose" | "mint" | "violet"
export const ACCENTS: { id: Accent; label: string; hex: string }[] = [
  { id: "ion", label: "Ion blue", hex: "#8fb4ff" },
  { id: "violet", label: "Nebula violet", hex: "#b9a7ff" },
  { id: "rose", label: "Red giant", hex: "#ff8fa8" },
  { id: "gold", label: "Sun gold", hex: "#f3d58a" },
  { id: "mint", label: "Aurora green", hex: "#7fe0b0" },
]

/** The owner's choices for their page. */
export type Appearance = { accent?: Accent; emoji?: string; openOn?: string }

/** Round 10 fields, with defaults filled in when a row or a form lacks them. */
export type ProjectHub = { type: ProjectType; specs: ProjectSpecs; related: string[]; appearance: Appearance }

/** Licence choices, by SPDX id (see lib/publish/licenses.ts). */
export const LICENSES = LICENSE_LIST.map((l) => ({ id: l.id, label: l.name }))

export type LicenseId = string

export const licenseLabel = (id: string) => licenseName(id)

export type ProjectVersion = { id?: string; version: string; notes: string; releasedOn: string }

export type ProjectLinks = { repo: string; paper: string; demo: string }

export type ProjectOwner = Member & { handle: string | null; avatarUrl: string | null }

/** Who can open the page: everyone, signed-in members only, or anyone with the link (not listed anywhere). */
export type ProjectVisibility = "public" | "members" | "unlisted"

export type GalleryItem = { url: string; caption: string }
export type ExtraLink = { label: string; url: string }

/** Publishing options (round 9). Optional on Project so lists built elsewhere need not fill them; see pub(). */
export type ProjectPublishing = {
  visibility: ProjectVisibility
  commentsEnabled: boolean
  /** A future time when a published project goes public; null for "now". */
  publishAt: string | null
  coverUrl: string
  gallery: GalleryItem[]
  extraLinks: ExtraLink[]
  coauthors: ProjectOwner[]
  /** Set by staff. */
  featuredAt: string | null
}

export const PUBLISHING_DEFAULTS: ProjectPublishing = { visibility: "public", commentsEnabled: true, publishAt: null, coverUrl: "", gallery: [], extraLinks: [], coauthors: [], featuredAt: null }

/** A project's publishing options with defaults filled in. */
export const pub = (p: Partial<ProjectPublishing>): ProjectPublishing => ({ ...PUBLISHING_DEFAULTS, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) })

export type Project = Partial<ProjectPublishing> &
  Partial<ProjectHub> & {
  id: string
  kind: ProjectKind
  name: string
  slug: string
  summary: string
  readme: string
  tags: string[]
  license: LicenseId
  langs: LanguageCode[]
  links: ProjectLinks
  status: ProjectStatus
  versions: ProjectVersion[]
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  owner: ProjectOwner | null
  ownerId: string | null
  /** Saved in this browser only (no database). */
  local: boolean
  source?: ProjectSource | null
  /** Its Nexverse Code repository, when it has one. */
  codeRepoId?: string | null
}

export type ProjectInput = Pick<Project, "kind" | "name" | "slug" | "summary" | "readme" | "tags" | "license" | "langs" | "links" | "status" | "versions"> &
  Omit<ProjectPublishing, "featuredAt"> &
  ProjectHub

export type ProjectStats = { likes: number; saves: number; replies: number }

export const LIMITS = { name: [2, 80], summary: [10, 160], readme: 50000, tags: 8, tag: 30, versions: 50, notes: 5000, gallery: 12, links: 10, coauthors: 10 } as const

/** The old short address; it forwards to projectHref(). Kept because links all over the site use it. */
export const projectPath = (id: string) => `/p/${id}`
/** A project's page: /models/<id>, /datasets/<id>, /tools/<id> or /repos/<id>, with its tabs below it. */
export const projectHref = (p: { id: string; kind: ProjectKind }, tab = "") => `${KINDS[p.kind].path}/${p.id}${tab ? `/${tab}` : ""}`
export const projectTarget = (id: string) => `project:${id}`
export const projectThreadId = (id: string) => `project-${id}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isProjectId = (id: string) => UUID.test(id)

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const TAG = /^[a-z0-9][a-z0-9-]{0,29}$/
export const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/
const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$/

/** "Tagus 3B (PT)" → "tagus-3b-pt". */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

/** A tag as members type it ("#On Device") → "on-device", or "" when nothing usable is left. */
export function normalizeTag(raw: string) {
  return slugify(raw.replace(/^#/, "")).slice(0, LIMITS.tag).replace(/-+$/g, "")
}

function httpsUrl(raw: string) {
  try {
    const u = new URL(raw.trim())
    return u.protocol === "https:" && !/\s/.test(raw.trim()) ? u : null
  } catch {
    return null
  }
}

export type ProjectErrors = Partial<Record<"kind" | "name" | "slug" | "summary" | "readme" | "tags" | "repo" | "paper" | "demo" | "versions" | "license" | "cover" | "gallery" | "extraLinks" | "publishAt", string>>

/** The same rules the database enforces, checked first so the form can say exactly what to fix. */
export function validateProject(p: ProjectInput): ProjectErrors {
  const e: ProjectErrors = {}
  const name = p.name.trim()
  if (name.length < LIMITS.name[0]) e.name = "Give it a name of at least 2 characters."
  else if (name.length > LIMITS.name[1]) e.name = "Keep the name under 80 characters."
  if (!p.slug) e.slug = "Choose an address for the project."
  else if (!SLUG.test(p.slug)) e.slug = "Use lowercase letters, numbers and single dashes, up to 60 characters, not starting or ending with a dash."
  const summary = p.summary.trim()
  if (summary.length < LIMITS.summary[0]) e.summary = "Write a line of at least 10 characters about what it does."
  else if (summary.length > LIMITS.summary[1]) e.summary = "Keep the summary to one line of 160 characters."
  if (p.readme.length > LIMITS.readme) e.readme = "The README can be up to 50,000 characters."
  if (p.tags.length > LIMITS.tags) e.tags = "Use up to 8 tags."
  else if (p.tags.some((t) => !TAG.test(t))) e.tags = "Tags use lowercase letters, numbers and dashes."
  if (p.links.repo && !GITHUB_REPO.test(p.links.repo.trim())) e.repo = "Use a GitHub repository address, like https://github.com/owner/repo"
  if (p.links.paper && !httpsUrl(p.links.paper)) e.paper = "Use a full link that starts with https://"
  if (p.links.demo && !httpsUrl(p.links.demo)) e.demo = "Use a full link that starts with https://"
  if (!LICENSE_ID.test(p.license)) e.license = "Pick a licence from the list, or type its SPDX id (like Apache-2.0)."
  if (p.coverUrl && !httpsUrl(p.coverUrl)) e.cover = "The cover must be a full https:// address."
  if (p.gallery.length > LIMITS.gallery) e.gallery = "Use up to 12 pictures."
  else if (p.gallery.some((g) => !httpsUrl(g.url) || g.caption.length > 120)) e.gallery = "Each picture needs an https:// address and a caption under 120 characters."
  if (p.extraLinks.length > LIMITS.links) e.extraLinks = "Use up to 10 links."
  else if (p.extraLinks.some((l) => !l.label.trim() || l.label.length > 120 || !httpsUrl(l.url))) e.extraLinks = "Each link needs a name and a full https:// address."
  if (p.publishAt && Number.isNaN(Date.parse(p.publishAt))) e.publishAt = "Pick a date and time to publish."
  if (p.versions.length > LIMITS.versions) e.versions = "List up to 50 versions."
  else {
    const seen = new Set<string>()
    for (const v of p.versions) {
      if (!VERSION.test(v.version)) {
        e.versions = `"${v.version || "(empty)"}" is not a version name. Use something like 1.0.0 or v2-beta.`
        break
      }
      if (seen.has(v.version)) {
        e.versions = `Version ${v.version} is listed twice.`
        break
      }
      if (v.notes.length > LIMITS.notes) {
        e.versions = `The notes for ${v.version} are longer than 5,000 characters.`
        break
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.releasedOn) || Number.isNaN(Date.parse(v.releasedOn))) {
        e.versions = `Pick a release date for ${v.version}.`
        break
      }
      seen.add(v.version)
    }
  }
  return e
}

function clean(p: ProjectInput): ProjectInput {
  const link = (s: string) => s.trim()
  return {
    ...p,
    name: p.name.trim(),
    summary: p.summary.trim().replace(/\s+/g, " "),
    tags: [...new Set(p.tags)].slice(0, LIMITS.tags),
    // Any two-letter code: admins can add languages beyond the built-in ones (/admin/lists).
    langs: [...new Set(p.langs)].filter((l) => l in LANGUAGES || /^[a-z]{2}$/.test(l)).slice(0, 12),
    links: { repo: link(p.links.repo).replace(/\/$/, ""), paper: link(p.links.paper), demo: link(p.links.demo) },
    license: normalizeLicense(p.license.trim()),
    coverUrl: p.coverUrl.trim(),
    gallery: p.gallery.map((g) => ({ url: g.url.trim(), caption: g.caption.trim() })).filter((g) => g.url),
    extraLinks: p.extraLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url || l.label),
    publishAt: p.publishAt && Date.parse(p.publishAt) > Date.now() ? new Date(p.publishAt).toISOString() : null,
    versions: p.versions.map((v) => ({ ...v, version: v.version.trim(), notes: v.notes.trim() })),
    kind: kindForType(p.type),
    specs: cleanSpecs(p.specs, p.type),
    related: [...new Set(p.related.filter(isProjectId))].slice(0, 12),
    appearance: cleanAppearance(p.appearance),
  }
}

// ─── Specs ──────────────────────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown, max = 1e15) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined)
const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined)
const strs = (v: unknown, n = 24, max = 60) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, max)).filter((x): x is string => Boolean(x)))].slice(0, n) : undefined)
const drop = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as T

function cleanPricing(v: unknown): Pricing | undefined {
  if (!v || typeof v !== "object") return undefined
  const x = v as Pricing
  const out = drop({ free: x.free === true ? true : undefined, prompt: num(x.prompt, 1e6), completion: num(x.completion, 1e6), request: num(x.request, 1e6), image: num(x.image, 1e6) })
  return Object.keys(out).length ? out : undefined
}

/** Keeps only the known fields, with sane sizes, so a page never renders something odd. */
export function cleanSpecs(v: unknown, type: ProjectType): ProjectSpecs {
  const s = (v && typeof v === "object" ? v : {}) as ProjectSpecs
  const out: ProjectSpecs = {}
  if (type === "model" && s.model) {
    const m = s.model
    out.model = drop({
      provider: str(m.provider, 80),
      contextLength: num(m.contextLength, 1e9),
      maxOutput: num(m.maxOutput, 1e9),
      pricing: cleanPricing(m.pricing),
      inputModalities: strs(m.inputModalities, 8, 20),
      outputModalities: strs(m.outputModalities, 8, 20),
      parameters: str(m.parameters, 40),
      architecture: str(m.architecture, 80),
      tokenizer: str(m.tokenizer, 60),
      library: str(m.library, 60),
      pipeline: str(m.pipeline, 60),
      baseModel: str(m.baseModel, 120),
      quantizations: strs(m.quantizations, 12, 30),
      supportedParameters: strs(m.supportedParameters, 40, 40),
      knowledgeCutoff: str(m.knowledgeCutoff, 30),
      endpoints: Array.isArray(m.endpoints)
        ? m.endpoints
            .slice(0, 30)
            .map((e) => drop({ provider: str(e?.provider, 80) ?? "", contextLength: num(e?.contextLength, 1e9), maxOutput: num(e?.maxOutput, 1e9), pricing: cleanPricing(e?.pricing), quantization: str(e?.quantization, 30), status: str(e?.status, 30) }))
            .filter((e) => e.provider)
        : undefined,
    })
  }
  if (type === "dataset" && s.dataset) {
    const d = s.dataset
    out.dataset = drop({
      rows: num(d.rows),
      bytes: num(d.bytes),
      splits: Array.isArray(d.splits) ? d.splits.slice(0, 40).map((x) => drop({ name: str(x?.name, 60) ?? "", config: str(x?.config, 60), rows: num(x?.rows), bytes: num(x?.bytes) })).filter((x) => x.name) : undefined,
      features: Array.isArray(d.features) ? d.features.slice(0, 80).map((x) => ({ name: str(x?.name, 80) ?? "", type: str(x?.type, 80) ?? "unknown" })).filter((x) => x.name) : undefined,
      tasks: strs(d.tasks, 12, 60),
      modalities: strs(d.modalities, 8, 30),
      formats: strs(d.formats, 8, 30),
      sizeCategory: str(d.sizeCategory, 30),
    })
  }
  const imported = cleanImported(s.imported)
  if (imported) out.imported = imported
  return out
}

const isoDate = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined)

/** The imported facts with sane sizes (the specs column holds 32 KB at most). */
export function cleanImported(v: unknown): ImportedFacts | undefined {
  if (!v || typeof v !== "object") return undefined
  const x = v as ImportedFacts
  const at = isoDate(x.at)
  if (!at) return undefined
  const rel = x.release && typeof x.release === "object" && str(x.release.tag, 80) ? drop({ tag: str(x.release.tag, 80) ?? "", name: str(x.release.name, 120), date: isoDate(x.release.date), notes: str(x.release.notes, 1500) }) : undefined
  const sample =
    x.sample && Array.isArray(x.sample.columns) && Array.isArray(x.sample.rows)
      ? {
          split: str(x.sample.split, 40),
          columns: x.sample.columns.slice(0, 8).map((c) => str(c, 60) ?? ""),
          rows: x.sample.rows.slice(0, 5).map((r) => (Array.isArray(r) ? r.slice(0, 8).map((c) => (typeof c === "string" ? c.slice(0, 200) : "")) : [])),
        }
      : undefined
  return drop({
    at,
    author: str(x.author, 80),
    createdAt: isoDate(x.createdAt),
    updatedAt: isoDate(x.updatedAt),
    downloads: num(x.downloads),
    likes: num(x.likes),
    stars: num(x.stars),
    forks: num(x.forks),
    openIssues: num(x.openIssues),
    gated: x.gated === true ? true : undefined,
    fileCount: num(x.fileCount),
    totalBytes: num(x.totalBytes),
    files: Array.isArray(x.files) ? x.files.slice(0, 40).map((f) => drop({ name: str(f?.name, 160) ?? "", bytes: num(f?.bytes) })).filter((f) => f.name) : undefined,
    languages: Array.isArray(x.languages) ? x.languages.slice(0, 8).map((l) => ({ name: str(l?.name, 40) ?? "", share: Math.round((num(l?.share, 100) ?? 0) * 10) / 10 })).filter((l) => l.name) : undefined,
    topics: strs(x.topics, 20, 50),
    release: rel,
    authors: strs(x.authors, 40, 80),
    categories: strs(x.categories, 12, 30),
    arxivId: str(x.arxivId, 20),
    datasets: strs(x.datasets, 12, 120),
    sample: sample && sample.columns.length && sample.rows.length ? drop(sample) : undefined,
  })
}

function cleanAppearance(v: unknown): Appearance {
  const a = (v && typeof v === "object" ? v : {}) as Appearance
  const emoji = typeof a.emoji === "string" ? [...a.emoji.trim()].slice(0, 2).join("") : ""
  return drop({
    accent: ACCENTS.some((x) => x.id === a.accent) ? a.accent : undefined,
    emoji: emoji && !/[\p{L}\p{N}<>]/u.test(emoji) ? emoji : undefined,
    openOn: typeof a.openOn === "string" && /^[a-z]{2,20}$/.test(a.openOn) ? a.openOn : undefined,
  })
}

const asSource = (v: unknown): ProjectSource | null => {
  const x = v as ProjectSource | null
  return x && typeof x === "object" && typeof x.site === "string" && x.site in SOURCE_SITES && typeof x.ref === "string" ? x : null
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (error.code === "23505") throw new Error("You already have a project at that address. Pick another one.")
  throw new Error(error.message)
}

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const LOCAL_KEY = "nexverse-projects"
type LocalProject = Omit<Project, "owner" | "ownerId" | "local">

function readLocal(): LocalProject[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]")
    return Array.isArray(v) ? (v as LocalProject[]).filter((p) => p && typeof p.id === "string" && typeof p.name === "string") : []
  } catch {
    return []
  }
}

function writeLocal(list: LocalProject[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    throw new Error("This browser would not save the project. Free some storage or allow site data, then try again.")
  }
}

const fromLocal = (p: LocalProject): Project => ({
  ...p,
  tags: p.tags ?? [],
  langs: p.langs ?? [],
  versions: p.versions ?? [],
  links: { repo: p.links?.repo ?? "", paper: p.links?.paper ?? "", demo: p.links?.demo ?? "" },
  license: normalizeLicense(p.license),
  visibility: p.visibility ?? "public",
  commentsEnabled: p.commentsEnabled ?? true,
  publishAt: p.publishAt ?? null,
  coverUrl: p.coverUrl ?? "",
  gallery: p.gallery ?? [],
  extraLinks: p.extraLinks ?? [],
  coauthors: [],
  featuredAt: null,
  type: isType(p.type) ? p.type : p.kind === "repo" ? "other" : p.kind,
  specs: p.specs ?? {},
  related: p.related ?? [],
  appearance: p.appearance ?? {},
  source: null,
  codeRepoId: null,
  owner: null,
  ownerId: null,
  local: true,
})

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const OWNER = "owner:profiles!projects_owner_id_fkey(id, name, handle, avatar_url)"
const BASE = "id, owner_id, kind, name, slug, summary, tags, license, langs, repo_url, paper_url, demo_url, status, created_at, updated_at, published_at"
// Publishing options from the round 9 update (cover, gallery, visibility, …). Older databases lack them.
const EXT = "visibility, comments_enabled, publish_at, cover_url, gallery, extra_links, license_id, featured_at"
// Round 10: type, specs, import credit, "built with", code repository and the owner's page choices.
const HUB = "project_type, specs, source, related, code_repo_id, appearance"
const COAUTHORS = "coauthors:project_coauthors(member:profiles!project_coauthors_member_id_fkey(id, name, handle, avatar_url))"
const VERSIONS = "versions:project_versions(id, version, notes, released_on)"

/** Whether the database has the publishing columns; null until the first query tells. */
let extended: boolean | null = null
/** Whether it has the round 10 hub columns. */
let hub: boolean | null = null

const columns = (full: boolean, ext = extended !== false, h = hub !== false && ext) =>
  [BASE, full ? "readme" : null, ext ? EXT : null, h ? HUB : null, OWNER, full ? VERSIONS : null, full && ext ? COAUTHORS : null].filter(Boolean).join(", ")

const isMissingColumn = (e: { code?: string; message: string } | null) =>
  Boolean(e && (e.code === "42703" || e.code === "PGRST200" || e.code === "PGRST204" || /column .* does not exist|could not find a relationship|project_coauthors/i.test(e.message)))

/** Runs a select with the newest columns, then without the round 10 ones, then without the round 9 ones. */
async function selectWithFallback<T>(run: (cols: (full: boolean) => string) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>) {
  if (extended !== false && hub !== false) {
    const res = await run((full) => columns(full, true, true))
    if (!isMissingColumn(res.error)) {
      if (!res.error) extended = hub = true
      return res
    }
    hub = false
  }
  if (extended !== false) {
    const res = await run((full) => columns(full, true, false))
    if (!isMissingColumn(res.error)) {
      if (!res.error) extended = true
      return res
    }
    extended = false
  }
  return run((full) => columns(full, false, false))
}

/** True once the round 10 columns (type, specs, code repository…) are known to be in the database. */
export async function hubColumnsAvailable() {
  const client = db()
  if (!client) return true
  if (hub !== null) return hub
  const { error } = await client.from("projects").select("project_type").limit(1)
  hub = !isMissingColumn(error)
  return hub
}

type Person = { id: string; name: string; handle: string | null; avatar_url: string | null }

type Row = {
  id: string
  owner_id: string
  kind: ProjectKind
  name: string
  slug: string
  summary: string
  readme?: string
  tags: string[] | null
  license: string
  langs: string[] | null
  repo_url: string | null
  paper_url: string | null
  demo_url: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
  published_at: string | null
  visibility?: ProjectVisibility
  comments_enabled?: boolean
  publish_at?: string | null
  cover_url?: string | null
  gallery?: GalleryItem[] | null
  extra_links?: ExtraLink[] | null
  license_id?: string | null
  featured_at?: string | null
  project_type?: ProjectType | null
  specs?: ProjectSpecs | null
  source?: ProjectSource | null
  related?: string[] | null
  code_repo_id?: string | null
  appearance?: Appearance | null
  owner: Person | null
  versions?: { id: string; version: string; notes: string; released_on: string }[]
  coauthors?: { member: Person | null }[]
}

const byRelease = (a: ProjectVersion, b: ProjectVersion) => b.releasedOn.localeCompare(a.releasedOn) || b.version.localeCompare(a.version, "en", { numeric: true })

const person = (o: Person): ProjectOwner => ({ id: o.id, name: o.name, handle: o.handle, avatarUrl: o.avatar_url })

const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function fromRow(r: Row): Project {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    summary: r.summary,
    readme: r.readme ?? "",
    tags: r.tags ?? [],
    license: normalizeLicense(r.license_id ?? r.license),
    langs: (r.langs ?? []).filter((l): l is LanguageCode => l in LANGUAGES || /^[a-z]{2}$/.test(l)),
    links: { repo: r.repo_url ?? "", paper: r.paper_url ?? "", demo: r.demo_url ?? "" },
    status: r.status,
    versions: (r.versions ?? []).map((v) => ({ id: v.id, version: v.version, notes: v.notes, releasedOn: v.released_on })).sort(byRelease),
    visibility: r.visibility ?? "public",
    commentsEnabled: r.comments_enabled ?? true,
    publishAt: r.publish_at ?? null,
    coverUrl: r.cover_url ?? "",
    gallery: asList<GalleryItem>(r.gallery).map((g) => ({ url: String(g?.url ?? ""), caption: String(g?.caption ?? "") })).filter((g) => g.url),
    extraLinks: asList<ExtraLink>(r.extra_links).map((l) => ({ label: String(l?.label ?? ""), url: String(l?.url ?? "") })).filter((l) => l.url),
    coauthors: (r.coauthors ?? []).flatMap((c) => (c.member ? [person(c.member)] : [])),
    featuredAt: r.featured_at ?? null,
    type: isType(r.project_type) ? r.project_type : r.kind === "repo" ? "other" : r.kind,
    specs: r.specs && typeof r.specs === "object" ? r.specs : {},
    source: asSource(r.source),
    related: r.related ?? [],
    codeRepoId: r.code_repo_id ?? null,
    appearance: r.appearance && typeof r.appearance === "object" ? r.appearance : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
    owner: r.owner ? person(r.owner) : null,
    ownerId: r.owner_id,
    local: false,
  }
}

function toRow(p: ProjectInput) {
  const base = {
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    summary: p.summary,
    readme: p.readme,
    tags: p.tags,
    license: legacyLicense(p.license),
    langs: p.langs,
    repo_url: p.links.repo || null,
    paper_url: p.links.paper || null,
    demo_url: p.links.demo || null,
    status: p.status,
  }
  if (extended === false) return base
  const ext = {
    ...base,
    license_id: p.license === "unspecified" ? null : p.license,
    visibility: p.visibility,
    comments_enabled: p.commentsEnabled,
    publish_at: p.publishAt,
    cover_url: p.coverUrl || null,
    gallery: p.gallery,
    extra_links: p.extraLinks,
  }
  if (hub === false) return ext
  return { ...ext, project_type: p.type, specs: p.specs, related: p.related, appearance: p.appearance }
}

/** True when this database can store the round 9 publishing options (visibility, cover, gallery, …). */
export async function publishingOptionsAvailable() {
  const client = db()
  if (!client) return true
  if (extended !== null) return extended
  const { error } = await client.from("projects").select("visibility").limit(1)
  extended = !isMissingColumn(error)
  return extended
}

async function currentUserId() {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

/** Published projects, newest first; or every project of one owner (drafts included when it is you). */
export async function listProjects({ kind, owner, limit = 30 }: { kind?: ProjectKind; owner?: string; limit?: number } = {}): Promise<Project[]> {
  const client = db()
  if (!client) {
    return readLocal()
      .filter((p) => (owner ? true : p.status === "published") && (!kind || p.kind === kind))
      .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
      .slice(0, limit)
      .map(fromLocal)
  }
  const { data, error } = await selectWithFallback<Row[]>((cols) => {
    let query = client.from("projects").select(cols(false)).limit(limit)
    if (owner) query = query.eq("owner_id", owner).order("updated_at", { ascending: false })
    else {
      query = query.eq("status", "published").order("published_at", { ascending: false })
      // Unlisted projects open from their link only. (Scheduled and members-only ones are filtered by the database.)
      if (extended !== false) query = query.eq("visibility", "public").lte("published_at", new Date().toISOString())
    }
    if (kind) query = query.eq("kind", kind)
    return query.overrideTypes<Row[], { merge: false }>()
  })
  fail(error)
  return (data ?? []).map(fromRow)
}

/** Your own projects, drafts included, most recently edited first. Empty when signed out. */
export async function listMyProjects(limit = 100): Promise<Project[]> {
  const client = db()
  if (!client) return listProjects({ owner: "local", limit })
  const me = await currentUserId()
  if (!me) return []
  return listProjects({ owner: me, limit })
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null
  const client = db()
  if (!client) {
    const p = readLocal().find((x) => x.id === id)
    return p ? fromLocal(p) : null
  }
  const { data, error } = await selectWithFallback<Row>((cols) => client.from("projects").select(cols(true)).eq("id", id).maybeSingle().overrideTypes<Row, { merge: false }>())
  fail(error)
  return data ? fromRow(data) : null
}

/** Whether one of your projects already uses this address (other than `except`). */
export async function slugTaken(slug: string, except?: string): Promise<boolean> {
  const client = db()
  if (!client) return readLocal().some((p) => p.slug === slug && p.id !== except)
  const me = await currentUserId()
  if (!me) return false
  let query = client.from("projects").select("id").eq("owner_id", me).eq("slug", slug).limit(1)
  if (except) query = query.neq("id", except)
  const { data, error } = await query
  fail(error)
  return (data ?? []).length > 0
}

/** Likes, saves and replies per project id. Missing ids count as zero. */
export async function getProjectStats(ids: string[]): Promise<Record<string, ProjectStats>> {
  const out: Record<string, ProjectStats> = Object.fromEntries(ids.map((id) => [id, { likes: 0, saves: 0, replies: 0 }]))
  if (!ids.length) return out
  const client = db()
  if (!client) {
    const read = (key: string) => {
      try {
        const v = JSON.parse(localStorage.getItem(key) ?? "[]")
        return Array.isArray(v) ? v : []
      } catch {
        return []
      }
    }
    const likes = new Set(read("nexverse-likes") as string[])
    const saves = new Set((read("nexverse-bookmarks") as { target?: string }[]).map((b) => b?.target))
    for (const id of ids) {
      out[id] = {
        likes: likes.has(projectTarget(id)) ? 1 : 0,
        saves: saves.has(projectTarget(id)) ? 1 : 0,
        replies: read(`nexverse-replies:${projectThreadId(id)}`).length,
      }
    }
    return out
  }
  const { data, error } = await client.rpc("project_stats", { project_ids: ids.slice(0, 200) })
  fail(error)
  for (const r of (data ?? []) as { project_id: string; likes: number; saves: number; replies: number }[]) {
    out[r.project_id] = { likes: Number(r.likes), saves: Number(r.saves), replies: Number(r.replies) }
  }
  return out
}

// ─── Writing ────────────────────────────────────────────────────────────────────────────────────────────────

/** Brings the database's changelog in line with the form: removed versions go, edited ones update, new ones arrive. */
async function syncVersions(projectId: string, versions: ProjectVersion[], before: ProjectVersion[]) {
  const client = db()!
  const keep = new Set(versions.map((v) => v.id).filter(Boolean))
  const gone = before.filter((v) => v.id && !keep.has(v.id)).map((v) => v.id!)
  if (gone.length) {
    const { error } = await client.from("project_versions").delete().in("id", gone)
    fail(error)
  }
  const existing = versions.filter((v) => v.id)
  for (const v of existing) {
    const old = before.find((b) => b.id === v.id)
    if (old && old.version === v.version && old.notes === v.notes && old.releasedOn === v.releasedOn) continue
    const { error } = await client.from("project_versions").update({ version: v.version, notes: v.notes, released_on: v.releasedOn }).eq("id", v.id!)
    fail(error)
  }
  const fresh = versions.filter((v) => !v.id)
  if (fresh.length) {
    const { error } = await client
      .from("project_versions")
      .insert(fresh.map((v) => ({ project_id: projectId, version: v.version, notes: v.notes, released_on: v.releasedOn })))
    fail(error)
  }
}

/** Brings the co-author list in line with the form. Only the owner may change it (the database checks). */
async function syncCoauthors(projectId: string, next: ProjectOwner[], before: ProjectOwner[]) {
  if (extended === false) return
  const client = db()!
  const keep = new Set(next.map((c) => c.id))
  const had = new Set(before.map((c) => c.id))
  const gone = before.filter((c) => !keep.has(c.id)).map((c) => c.id)
  if (gone.length) {
    const { error } = await client.from("project_coauthors").delete().eq("project_id", projectId).in("member_id", gone)
    fail(error)
  }
  const fresh = next.filter((c) => !had.has(c.id))
  if (fresh.length) {
    const { error } = await client.from("project_coauthors").insert(fresh.map((c) => ({ project_id: projectId, member_id: c.id })))
    fail(error)
  }
}

function assertValid(p: ProjectInput) {
  const errors = validateProject(p)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const p = clean(input)
  assertValid(p)
  const client = db()
  if (!client) {
    const list = readLocal()
    if (list.some((x) => x.slug === p.slug)) throw new Error("You already have a project at that address. Pick another one.")
    const now = new Date().toISOString()
    const local: LocalProject = {
      ...p,
      id: crypto.randomUUID(),
      versions: p.versions.map((v) => ({ ...v, id: crypto.randomUUID() })).sort(byRelease),
      createdAt: now,
      updatedAt: now,
      publishedAt: p.status === "published" ? (p.publishAt ?? now) : null,
      featuredAt: null,
    }
    writeLocal([local, ...list])
    return fromLocal(local)
  }
  if (!(await currentUserId())) throw new Error("Sign in to create a project.")
  const { data, error } = await client.from("projects").insert(toRow(p)).select("id").single()
  fail(error)
  const id = (data as { id: string }).id
  if (p.versions.length) {
    try {
      await syncVersions(id, p.versions, [])
    } catch (e) {
      // The row exists: the caller opens it instead of letting a second click publish it twice.
      throw Object.assign(new Error(`The project was saved, but its changelog was not: ${(e as Error).message}`), { saved: { id, kind: p.kind } })
    }
  }
  if (p.coauthors.length) {
    try {
      await syncCoauthors(id, p.coauthors, [])
    } catch (e) {
      throw Object.assign(new Error(`The project was saved, but its co-authors were not: ${(e as Error).message}`), { saved: { id, kind: p.kind } })
    }
  }
  return (await getProject(id))!
}

export async function updateProject(id: string, input: ProjectInput, before?: Project): Promise<Project> {
  const p = clean(input)
  assertValid(p)
  const client = db()
  if (!client) {
    const list = readLocal()
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) throw new Error("This project is no longer here.")
    if (list.some((x) => x.slug === p.slug && x.id !== id)) throw new Error("You already have a project at that address. Pick another one.")
    const now = new Date().toISOString()
    list[i] = {
      ...list[i],
      ...p,
      versions: p.versions.map((v) => ({ ...v, id: v.id ?? crypto.randomUUID() })).sort(byRelease),
      updatedAt: now,
      publishedAt: list[i].publishedAt ?? (p.status === "published" ? now : null),
    }
    writeLocal(list)
    return fromLocal(list[i])
  }
  const prev = before ?? (await getProject(id))
  if (!prev) throw new Error("This project is no longer here.")
  const { error } = await client.from("projects").update(toRow(p)).eq("id", id)
  fail(error)
  await syncVersions(id, p.versions, prev.versions)
  // Co-authors may edit the project but not its list of co-authors.
  if (prev.ownerId === (await currentUserId())) await syncCoauthors(id, p.coauthors, prev.coauthors ?? [])
  return (await getProject(id))!
}

export async function setProjectStatus(id: string, status: ProjectStatus) {
  const client = db()
  if (!client) {
    const list = readLocal()
    const p = list.find((x) => x.id === id)
    if (!p) throw new Error("This project is no longer here.")
    p.status = status
    p.updatedAt = new Date().toISOString()
    p.publishedAt ??= status === "published" ? p.updatedAt : null
    writeLocal(list)
    return
  }
  const { error } = await client.from("projects").update({ status }).eq("id", id)
  fail(error)
}

export async function deleteProject(id: string) {
  const client = db()
  if (!client) {
    writeLocal(readLocal().filter((p) => p.id !== id))
    try {
      localStorage.removeItem(`nexverse-replies:${projectThreadId(id)}`)
    } catch {}
    return
  }
  const { error } = await client.from("projects").delete().eq("id", id)
  fail(error)
}

/** A blank project for the editor. */
export function emptyProject(what: ProjectKind | ProjectType = "model"): ProjectInput {
  const type: ProjectType = isType(what) ? what : what === "repo" ? "other" : what
  const kind = kindForType(type)
  return {
    kind,
    name: "",
    slug: "",
    summary: "",
    readme: "",
    tags: [],
    license: "unspecified",
    langs: [],
    links: { repo: "", paper: "", demo: "" },
    status: "draft",
    versions: [],
    visibility: "public",
    commentsEnabled: true,
    publishAt: null,
    coverUrl: "",
    gallery: [],
    extraLinks: [],
    coauthors: [],
    type,
    specs: {},
    related: [],
    appearance: {},
  }
}

export function toInput(p: Project): ProjectInput {
  const { visibility, commentsEnabled, publishAt, coverUrl, gallery, extraLinks, coauthors } = pub(p)
  return {
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    summary: p.summary,
    readme: p.readme,
    tags: p.tags,
    license: p.license,
    langs: p.langs,
    links: p.links,
    status: p.status,
    versions: p.versions,
    visibility,
    commentsEnabled,
    publishAt,
    coverUrl,
    gallery,
    extraLinks,
    coauthors,
    type: typeOf(p),
    specs: p.specs ?? {},
    related: p.related ?? [],
    appearance: p.appearance ?? {},
  }
}

/** Whether the signed-in member may edit a project: its owner or a co-author. */
export function canEditProject(p: Project, userId: string | null | undefined) {
  return p.local || Boolean(userId && (p.ownerId === userId || (p.coauthors ?? []).some((c) => c.id === userId)))
}

/** A published project is live once its scheduled time (if any) has come. */
export const isScheduled = (p: Pick<Project, "status" | "publishAt">) => p.status === "published" && Boolean(p.publishAt && Date.parse(p.publishAt) > Date.now())

// ─── Staff and history ──────────────────────────────────────────────────────────────────────────────────────

/** Staff only: puts a project in the featured lists (logged in the moderation log by the database). */
export async function featureProject(id: string, featured: boolean): Promise<string | null> {
  const client = db()
  if (!client) throw new Error("Featuring needs the site's database.")
  const { data, error } = await client.rpc("feature_project", { target: id, featured })
  fail(error)
  return (data as string | null) ?? null
}

export type ProjectRevision = { id: string; name: string; summary: string; readme: string; createdAt: string; editor: ProjectOwner | null }

/** Earlier texts of a project, newest first (editors and staff only). Empty when the history is not available. */
export async function listRevisions(projectId: string, limit = 50): Promise<ProjectRevision[]> {
  const client = db()
  if (!client) return []
  const { data, error } = await client
    .from("project_revisions")
    .select("id, name, summary, readme, created_at, editor:profiles!project_revisions_editor_id_fkey(id, name, handle, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as unknown as { id: string; name: string; summary: string; readme: string; created_at: string; editor: Person | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    summary: r.summary,
    readme: r.readme,
    createdAt: r.created_at,
    editor: r.editor ? person(r.editor) : null,
  }))
}

// ─── Round 10: code repository, activity, "built with" ─────────────────────────────────────────────────────

/** Connects one of your repositories to a project you own, or disconnects it (null). The database checks both. */
export async function linkProjectRepo(projectId: string, repoId: string | null) {
  const client = db()
  if (!client) throw new Error("Code repositories need the site's database.")
  const { error } = await client.from("projects").update({ code_repo_id: repoId }).eq("id", projectId)
  if (error && isMissingColumn(error)) throw new Error("Projects and code are still being joined on this site. Ask an admin to run the latest database update.")
  if (error?.code === "23505") throw new Error("That repository already belongs to another project.")
  fail(error)
}

export type CodeLink = { projectId: string; kind: ProjectKind; type: ProjectType; repoId: string; repoSlug: string; ownerHandle: string | null; ownerId: string }

type CodeRow = { project_id: string; kind: ProjectKind; project_type: ProjectType | null; repo_id: string; repo_slug: string; repo_owner_id: string; repo_owner_handle: string | null }
const fromCode = (r: CodeRow): CodeLink => ({ projectId: r.project_id, kind: r.kind, type: isType(r.project_type) ? r.project_type : r.kind === "repo" ? "other" : r.kind, repoId: r.repo_id, repoSlug: r.repo_slug, ownerHandle: r.repo_owner_handle, ownerId: r.repo_owner_id })

/** The project a repository belongs to, if you can see both. Null when there is none (or no view yet). */
export async function projectForRepo(repoId: string): Promise<CodeLink | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.from("project_code").select("project_id, kind, project_type, repo_id, repo_slug, repo_owner_id, repo_owner_handle").eq("repo_id", repoId).maybeSingle()
  if (error || !data) return null
  return fromCode(data as CodeRow)
}

/** A project's repository with its owner and slug, if you can see both. */
export async function repoForProject(projectId: string): Promise<CodeLink | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.from("project_code").select("project_id, kind, project_type, repo_id, repo_slug, repo_owner_id, repo_owner_handle").eq("project_id", projectId).maybeSingle()
  if (error || !data) return null
  return fromCode(data as CodeRow)
}

export type ActivityDay = { day: string; views: number; downloads: number; likes: number }

/** Views, downloads and new likes per day. Null when the activity function is not in the database yet. */
export async function getProjectActivity(id: string, days = 90): Promise<ActivityDay[] | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.rpc("project_activity", { pid: id, days })
  if (error) return null
  return ((data ?? []) as { day: string; views: number; downloads: number; likes: number }[]).map((r) => ({ day: r.day, views: Number(r.views), downloads: Number(r.downloads), likes: Number(r.likes) }))
}

/** Counts one view of a project's page, once a day per browser. Quiet when it cannot. */
export async function recordProjectView(id: string) {
  const client = db()
  if (!client) return
  const key = `nexverse-viewed:${id}`
  const today = new Date().toISOString().slice(0, 10)
  try {
    if (localStorage.getItem(key) === today) return
    localStorage.setItem(key, today)
  } catch {}
  await client.rpc("record_project_view", { pid: id }).then(
    () => undefined,
    () => undefined
  )
}

/** Published projects that list this one under "built with": the apps using a model, the models on a dataset. */
export async function listUsing(id: string, limit = 24): Promise<Project[]> {
  const client = db()
  if (!client || hub === false) return []
  const { data, error } = await selectWithFallback<Row[]>((cols) =>
    client.from("projects").select(cols(false)).eq("status", "published").contains("related", [id]).order("published_at", { ascending: false }).limit(limit).overrideTypes<Row[], { merge: false }>()
  )
  if (error) return []
  return (data ?? []).map(fromRow)
}

/** Published projects whose name matches, for pickers ("built with"). */
export async function searchProjects(q: string, limit = 8): Promise<Project[]> {
  const words = q.trim().replace(/[%_,()]/g, " ").trim()
  if (words.length < 2) return []
  const client = db()
  if (!client) return readLocal().filter((p) => p.name.toLowerCase().includes(words.toLowerCase())).slice(0, limit).map(fromLocal)
  const { data, error } = await selectWithFallback<Row[]>((cols) =>
    client.from("projects").select(cols(false)).eq("status", "published").ilike("name", `%${words}%`).order("published_at", { ascending: false }).limit(limit).overrideTypes<Row[], { merge: false }>()
  )
  if (error) return []
  return (data ?? []).map(fromRow)
}

/** Several projects by id, in the order asked, leaving out ones you cannot see. */
export async function getProjectsById(ids: string[]): Promise<Project[]> {
  const list = [...new Set(ids.filter(isProjectId))].slice(0, 50)
  if (!list.length) return []
  const client = db()
  if (!client) return readLocal().filter((p) => list.includes(p.id)).map(fromLocal)
  const { data, error } = await selectWithFallback<Row[]>((cols) => client.from("projects").select(cols(false)).in("id", list).overrideTypes<Row[], { merge: false }>())
  if (error) return []
  const byId = new Map((data ?? []).map((r) => [r.id, fromRow(r)]))
  return list.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
}
