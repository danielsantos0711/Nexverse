import { DUEL_TASKS, type DuelTask } from "@/lib/arena"
import { BENCHMARKS, type Benchmark, type BenchmarkArea } from "@/lib/benchmarks"
import { BADGE_RULES, BADGE_STATS, badgeFromRule, EVENT_KINDS, KNOWN_TAGS, LEVELS, POINTS, type Badge, type BadgeRule, type BadgeStat, type EventKind, type Level, type Points } from "@/lib/community"
import { KINDS, LANGUAGES, type LanguageCode, type ResourceKind } from "@/lib/data"
import { PRICE_PRESETS, type PriceRow } from "@/lib/lab/cost"
import { GPUS } from "@/lib/lab/finetune"
import { LIBRARY, type LibraryPattern } from "@/lib/lab/regex"
import { GH_TOPICS, MORE_GH_TOPICS, RELEASE_REPOS } from "@/lib/live/catalog"
import { isGhOwner, isGhTopic } from "@/lib/live/ids"
import { CATEGORIES, LAB_TOOLS, type LabCategory, type LabTool } from "@/components/lab/tools"

/*
 * The curated lists admins edit in /admin/lists. Each list is stored as one site_content row (key below,
 * value = an array of flat rows), read on the client through useBlock() (lib/lists/hooks.ts) and on the server
 * through getList() (lib/lists/server.ts). The constants in the lib files stay the defaults: a list nobody
 * saved, a database that is missing, or a saved value that no longer makes sense all fall back to them.
 *
 * Plain data and pure functions, no "use client": server pages, route handlers and the admin editor share it.
 */

export type Cell = string | number | boolean
export type Row = Record<string, Cell>

export type FieldKind = "text" | "textarea" | "number" | "boolean" | "select" | "id"

export type Field = {
  name: string
  label: string
  kind: FieldKind
  /** Characters for text, the highest value for numbers. */
  max?: number
  min?: number
  step?: number
  /** For ids and other strict text: what a valid value looks like, and how to say it. */
  pattern?: RegExp
  patternHelp?: string
  options?: { value: string; label: string }[]
  /** May be left empty (an empty number is stored as ""). */
  optional?: boolean
  /** Fixed by the code or the database: shown, never edited. */
  locked?: boolean
  hint?: string
  placeholder?: string
  /** Grid width in the editor row. */
  width?: "xs" | "sm" | "md" | "lg" | "full"
}

export type ListGroup = "github" | "hub" | "arena" | "community" | "lab"

export type ListDef = {
  /** URL segment in /admin/lists/<slug>. */
  slug: string
  /** site_content key. */
  key: string
  group: ListGroup
  title: string
  blurb: string
  /** One item, for buttons: "topic", "language". */
  noun: string
  fields: Field[]
  /** The field that names an item; unique within the list. */
  idField: string
  /**
   * "free": items can be added and removed. "fixed": the items come from the code or the database (routes,
   * check constraints); admins edit their text, order and visibility. "grow": new items can be added, but the
   * defaults and anything already saved can only be retired, because members' content points at them.
   */
  mode: "free" | "fixed" | "grow"
  max: number
  min?: number
  fallback: Row[]
  /** Whole-list rules on top of each field's own: returns what is wrong, or null. */
  check?: (rows: Row[]) => string | null
  /** Ask GitHub whether each item exists. */
  verify?: "gh-topic" | "gh-repo"
  preview: "chips" | "cards" | "ladder" | "badges" | "table" | "tools"
  /** Shown above the editor: where the list appears, what else applies. */
  where: string
  note?: string
  link?: { href: string; label: string }
}

// ─── Field helpers ──────────────────────────────────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,39}$/
const SLUG_HELP = "Lowercase letters, digits and single hyphens, up to 40 characters."
const GH_TOPIC = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,49}$/
const GH_REPO_FULL = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[\w.-]{1,100}$/
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const text = (name: string, label: string, max: number, extra: Partial<Field> = {}): Field => ({ name, label, kind: "text", max, ...extra })
const area = (name: string, label: string, max: number, extra: Partial<Field> = {}): Field => ({ name, label, kind: "textarea", max, width: "full", ...extra })
const num = (name: string, label: string, min: number, max: number, extra: Partial<Field> = {}): Field => ({ name, label, kind: "number", min, max, width: "xs", ...extra })
const bool = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, kind: "boolean", width: "xs", ...extra })
const id = (name: string, label: string, pattern: RegExp, patternHelp: string, extra: Partial<Field> = {}): Field => ({ name, label, kind: "id", pattern, patternHelp, width: "sm", ...extra })

// ─── Defaults as rows ───────────────────────────────────────────────────────────────────────────────────────

const BENCHMARK_AREAS: BenchmarkArea[] = ["Knowledge", "Reasoning", "Code", "Instructions", "Languages", "Speech", "Language modelling"]

const benchRow = (b: Benchmark): Row => ({
  slug: b.slug,
  name: b.name,
  area: b.area,
  description: b.description,
  metric: b.metric,
  unit: b.unit,
  higherIsBetter: b.higherIsBetter,
  min: b.min,
  max: b.max,
  tolerance: b.tolerance,
  arxiv: b.arxiv,
  usualShots: b.usualShots ?? "",
  retired: Boolean(b.retired),
})

const POINT_LABELS: Record<keyof Points, string> = {
  thread: "Start a thread",
  answer: "Reply",
  accepted: "Your reply marked as the solution",
  like: "A like on your thread",
  reaction: "A reaction to your post",
}

// Nothing from or about community sites Nexverse does not link to (see lib/live/http.ts).
const topicsAllowed = (rows: Row[]) => rows.map((r) => (isGhTopic(String(r.id)) ? null : `#${r.id} is not a topic Nexverse can follow.`)).find(Boolean) ?? null
const ownersAllowed = (rows: Row[]) => rows.map((r) => (isGhOwner(String(r.repo).split("/")[0]) ? null : `${r.repo} is not a repository Nexverse can follow.`)).find(Boolean) ?? null

// ─── The lists ──────────────────────────────────────────────────────────────────────────────────────────────

export const LISTS: ListDef[] = [
  {
    slug: "github-topics",
    key: "lists.gh.topics",
    group: "github",
    title: "Featured GitHub topics",
    blurb: "The topics with their own card on /gh/topics and a tab on /trending, in this order.",
    noun: "topic",
    idField: "id",
    mode: "free",
    min: 1,
    max: 12,
    verify: "gh-topic",
    check: topicsAllowed,
    preview: "chips",
    where: "GitHub topics page, the topic tabs on Trending, and the rising repos feed.",
    note: "Each featured topic costs one GitHub search per refresh. Without a GITHUB_TOKEN GitHub allows 10 searches a minute, so keep this list short.",
    fields: [
      id("id", "Topic", GH_TOPIC, "A GitHub topic: lowercase letters, digits and hyphens.", { placeholder: "llm" }),
      text("label", "Name on the site", 40, { width: "sm", placeholder: "LLMs" }),
      area("blurb", "One-line description", 200, { placeholder: "What people build under this topic." }),
    ],
    fallback: GH_TOPICS.map((t) => ({ id: t.id, label: t.label, blurb: t.blurb })),
  },
  {
    slug: "more-topics",
    key: "lists.gh.more",
    group: "github",
    title: "More GitHub topics",
    blurb: "Smaller topics linked as chips under the featured ones and on every topic page.",
    noun: "topic",
    idField: "id",
    mode: "free",
    max: 40,
    verify: "gh-topic",
    check: topicsAllowed,
    preview: "chips",
    where: "The “More topics” and “Related topics” rows.",
    fields: [id("id", "Topic", GH_TOPIC, "A GitHub topic: lowercase letters, digits and hyphens.", { width: "md", placeholder: "vector-database" })],
    fallback: MORE_GH_TOPICS.map((t) => ({ id: t })),
  },
  {
    slug: "release-repos",
    key: "lists.gh.releases",
    group: "github",
    title: "Tracked releases",
    blurb: "Open-source projects whose new releases appear on /trending.",
    noun: "repository",
    idField: "repo",
    mode: "free",
    min: 1,
    max: 20,
    verify: "gh-repo",
    check: ownersAllowed,
    preview: "chips",
    where: "The Releases section of Trending. Each project's public release feed is read, which costs no API quota.",
    fields: [id("repo", "Repository", GH_REPO_FULL, "owner/name, as in github.com/owner/name.", { width: "md", placeholder: "ollama/ollama" })],
    fallback: RELEASE_REPOS.map(([o, n]) => ({ repo: `${o}/${n}` })),
  },
  {
    slug: "languages",
    key: "lists.hub.languages",
    group: "hub",
    title: "Languages",
    blurb: "The languages members can tag threads, projects and duels with, in the order pickers show them.",
    noun: "language",
    idField: "code",
    mode: "free",
    min: 1,
    max: 40,
    preview: "chips",
    where: "Thread, project and duel forms, hub filters, Arena ratings and AI translation.",
    note: "Removing a language only takes it out of the pickers. Posts already tagged with it keep the tag.",
    fields: [
      id("code", "Code", /^[a-z]{2}$/, "The two-letter ISO 639-1 code, such as pt or ja.", { width: "xs", placeholder: "pt" }),
      text("name", "Name in English", 40, { width: "sm", placeholder: "Portuguese" }),
      text("native", "Name in the language", 40, { width: "sm", placeholder: "Português" }),
    ],
    fallback: (Object.keys(LANGUAGES) as LanguageCode[]).map((code) => ({ code, name: LANGUAGES[code].name, native: LANGUAGES[code].native })),
  },
  {
    slug: "resource-kinds",
    key: "lists.hub.kinds",
    group: "hub",
    title: "Hub kinds",
    blurb: "What the hub calls models, datasets, tools and repos, and how it describes them.",
    noun: "kind",
    idField: "id",
    mode: "fixed",
    max: 4,
    preview: "cards",
    where: "Hub pages and filters, the publish forms, the home page and search.",
    note: "The four kinds and their addresses are part of the site's structure, so only their names and descriptions change here.",
    fields: [
      id("id", "Kind", SLUG, SLUG_HELP, { locked: true, width: "xs" }),
      text("path", "Address", 20, { locked: true, width: "xs" }),
      text("label", "Name", 24, { width: "sm" }),
      text("plural", "Plural", 24, { width: "sm" }),
      area("blurb", "Description", 160),
    ],
    fallback: (Object.keys(KINDS) as ResourceKind[]).map((k) => ({ id: k, path: KINDS[k].path, label: KINDS[k].label, plural: KINDS[k].plural, blurb: KINDS[k].blurb })),
  },
  {
    slug: "duel-tasks",
    key: "lists.arena.tasks",
    group: "arena",
    title: "Arena duel tasks",
    blurb: "The tasks duels are filed under, the filters on /arena and the per-task ratings.",
    noun: "task",
    idField: "id",
    mode: "fixed",
    max: 5,
    preview: "cards",
    where: "Arena filters, the new duel form and the ratings page.",
    note: "The database accepts these five tasks. Switching one off hides it from the new duel form; its duels and ratings stay.",
    fields: [
      id("id", "Task", SLUG, SLUG_HELP, { locked: true, width: "xs" }),
      text("label", "Name", 24, { width: "sm" }),
      text("blurb", "Description", 80, { width: "lg" }),
      bool("enabled", "Open for new duels"),
    ],
    fallback: (Object.keys(DUEL_TASKS) as DuelTask[]).map((t) => ({ id: t, label: DUEL_TASKS[t].label, blurb: DUEL_TASKS[t].blurb, enabled: true })),
  },
  {
    slug: "benchmarks",
    key: "lists.bench.benchmarks",
    group: "arena",
    title: "Benchmarks",
    blurb: "The public benchmarks members report results on, with their scale, direction and reproduction tolerance.",
    noun: "benchmark",
    idField: "slug",
    mode: "grow",
    min: 1,
    max: 40,
    preview: "table",
    where: "/benchmarks, each benchmark's page, the submit form and model score tables.",
    note: "The database reads this list too: the tolerance decides whether a reproduction counts, and retired benchmarks take no new results. A benchmark with results can be retired but not removed.",
    fields: [
      id("slug", "Slug", SLUG, SLUG_HELP, { placeholder: "mmlu-pro" }),
      text("name", "Name", 40, { width: "sm", placeholder: "MMLU-Pro" }),
      { name: "area", label: "Area", kind: "select", width: "sm", options: BENCHMARK_AREAS.map((a) => ({ value: a, label: a })) },
      text("metric", "Metric", 40, { width: "sm", placeholder: "accuracy" }),
      { name: "unit", label: "Unit", kind: "select", width: "xs", options: [{ value: "%", label: "Percent" }, { value: "", label: "Plain number" }] },
      bool("higherIsBetter", "Higher is better"),
      num("min", "Lowest score", 0, 100000, { step: 0.1 }),
      num("max", "Highest score", 0, 100000, { step: 0.1 }),
      num("tolerance", "Tolerance ±", 0.01, 1000, { step: 0.01, hint: "How far a reproduction may land from the reported score." }),
      id("arxiv", "arXiv id", /^\d{4}\.\d{4,5}$/, "The paper's arXiv id, such as 2009.03300.", { width: "sm", placeholder: "2406.01574" }),
      num("usualShots", "Usual shots", 0, 64, { optional: true }),
      bool("retired", "Retired"),
      area("description", "Description", 240),
    ],
    check: (rows) => rows.map((r) => (Number(r.min) >= Number(r.max) ? `${r.name}: the lowest score must be below the highest.` : null)).find(Boolean) ?? null,
    fallback: BENCHMARKS.map(benchRow),
  },
  {
    slug: "points",
    key: "lists.rep.points",
    group: "community",
    title: "Reputation points",
    blurb: "How many points each kind of contribution is worth. Points light up a member's orbit on the leaderboard.",
    noun: "rule",
    idField: "id",
    mode: "fixed",
    max: 5,
    preview: "table",
    where: "The leaderboard, profiles and every reputation tier. Totals are worked out by the database from these values.",
    note: "Changing a value recounts everyone's points, past contributions included, so tiers can move. Mission rewards are set per mission and are not affected.",
    link: { href: "/admin/roles", label: "Tier thresholds and the powers they unlock live in Roles and powers" },
    fields: [
      id("id", "Rule", SLUG, SLUG_HELP, { locked: true, width: "xs" }),
      text("label", "Contribution", 60, { locked: true, width: "lg" }),
      num("points", "Points", 0, 100),
    ],
    fallback: (Object.keys(POINTS) as (keyof Points)[]).map((k) => ({ id: k, label: POINT_LABELS[k], points: POINTS[k] })),
  },
  {
    slug: "levels",
    key: "lists.rep.levels",
    group: "community",
    title: "Orbits (levels)",
    blurb: "The levels members climb as their points grow, from stardust to a whole galaxy.",
    noun: "level",
    idField: "name",
    mode: "free",
    min: 2,
    max: 12,
    preview: "ladder",
    where: "Level rings on profiles and the leaderboard, and the level guide under it.",
    note: "Levels are what members see. The tiers that unlock powers (posting links, hosting events) are separate, so they can follow these levels or not.",
    link: { href: "/admin/roles", label: "Edit the reputation tiers in Roles and powers" },
    fields: [
      text("name", "Name", 24, { width: "sm", placeholder: "Supernova" }),
      num("min", "From points", 0, 1000000, { width: "sm" }),
      area("blurb", "What it means", 120),
    ],
    check: (rows) => {
      const mins = rows.map((r) => Number(r.min))
      if (!mins.includes(0)) return "One level must start at 0 points, so everyone has one."
      if (new Set(mins).size !== mins.length) return "Two levels start at the same number of points."
      return null
    },
    fallback: LEVELS.map((l) => ({ name: l.name, min: l.min, blurb: l.blurb })),
  },
  {
    slug: "badges",
    key: "lists.rep.badges",
    group: "community",
    title: "Constellations (badges)",
    blurb: "Badges members collect for what they do. Each one lights up once a count reaches its goal.",
    noun: "badge",
    idField: "id",
    mode: "free",
    max: 24,
    preview: "badges",
    where: "Profiles, reputation cards and the leaderboard.",
    fields: [
      id("id", "Id", SLUG, SLUG_HELP, { placeholder: "first-orbit" }),
      text("name", "Name", 30, { width: "sm", placeholder: "First orbit" }),
      { name: "stat", label: "Counts", kind: "select", width: "md", options: BADGE_STATS.map((s) => ({ value: s.id, label: s.label })) },
      num("min", "Goal", 1, 100000, { width: "xs" }),
      area("description", "What earns it", 120, { placeholder: "Replied 10 times." }),
    ],
    fallback: BADGE_RULES.map((b) => ({ ...b })),
  },
  {
    slug: "event-kinds",
    key: "lists.events.kinds",
    group: "community",
    title: "Event kinds",
    blurb: "What members can host: paper clubs, meetups, office hours and AMAs.",
    noun: "kind",
    idField: "id",
    mode: "fixed",
    max: 4,
    preview: "cards",
    where: "The events page filters, the host form and every event card.",
    note: "The database accepts these four kinds. Switching one off hides it from the host form; events already planned stay.",
    fields: [
      id("id", "Kind", SLUG, SLUG_HELP, { locked: true, width: "xs" }),
      text("label", "Name", 24, { width: "sm" }),
      text("plural", "Plural", 24, { width: "sm" }),
      bool("enabled", "Open for hosting"),
      area("blurb", "Description", 120),
    ],
    fallback: (Object.keys(EVENT_KINDS) as EventKind[]).map((k) => ({ id: k, label: EVENT_KINDS[k].label, plural: EVENT_KINDS[k].plural, blurb: EVENT_KINDS[k].blurb, enabled: true })),
  },
  {
    slug: "tags",
    key: "lists.forum.tags",
    group: "community",
    title: "Suggested tags",
    blurb: "Tags offered while members type one. Members can still use any tag.",
    noun: "tag",
    idField: "tag",
    mode: "free",
    max: 120,
    preview: "chips",
    where: "The tag field in the forum's new thread form.",
    fields: [id("tag", "Tag", /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,23}$/, "Lowercase letters, digits and hyphens, up to 24 characters.", { width: "md", placeholder: "agents" })],
    fallback: KNOWN_TAGS.map((tag) => ({ tag })),
  },
  {
    slug: "lab-tools",
    key: "lists.lab.tools",
    group: "lab",
    title: "Lab tools",
    blurb: "Which tools the Lab shows, in what order, which ones are featured, and what they are called.",
    noun: "tool",
    idField: "slug",
    mode: "fixed",
    max: LAB_TOOLS.length,
    preview: "tools",
    where: "/lab, each tool's page and the related tools under it.",
    note: "A switched-off tool disappears from the Lab and its page answers “not found”.",
    fields: [
      id("slug", "Tool", SLUG, SLUG_HELP, { locked: true, width: "sm" }),
      text("name", "Name", 40, { width: "md" }),
      { name: "group", label: "Shelf", kind: "select", width: "sm", options: CATEGORIES.map((c) => ({ value: c.id, label: c.label })) },
      bool("enabled", "Shown"),
      bool("featured", "Featured"),
      bool("isNew", "“New” badge"),
      area("tagline", "One-line description", 160),
      area("intro", "Introduction on its page", 600),
    ],
    fallback: LAB_TOOLS.map((t) => ({ slug: t.slug, name: t.name, group: t.group, enabled: true, featured: false, isNew: Boolean(t.isNew), tagline: t.tagline, intro: t.intro })),
  },
  {
    slug: "lab-shelves",
    key: "lists.lab.categories",
    group: "lab",
    title: "Lab shelves",
    blurb: "The groups the Lab sorts its tools into.",
    noun: "shelf",
    idField: "id",
    mode: "fixed",
    max: CATEGORIES.length,
    preview: "cards",
    where: "The Lab's filters and section headings.",
    fields: [id("id", "Shelf", SLUG, SLUG_HELP, { locked: true, width: "xs" }), text("label", "Name", 40, { width: "md" }), area("blurb", "Description", 120)],
    fallback: CATEGORIES.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb })),
  },
  {
    slug: "lab-prices",
    key: "lists.lab.prices",
    group: "lab",
    title: "Model price presets",
    blurb: "List prices the inference cost calculator offers. Vendors change them often: check the source and update the date.",
    noun: "preset",
    idField: "name",
    mode: "free",
    min: 1,
    max: 30,
    preview: "table",
    where: "The Inference cost and speed tool in the Lab.",
    fields: [
      text("name", "Model", 60, { width: "md", placeholder: "Model name (context limit)" }),
      num("inPrice", "Input $ / M", 0, 1000, { step: 0.01 }),
      num("outPrice", "Output $ / M", 0, 1000, { step: 0.01 }),
      num("cachedPrice", "Cached $ / M", 0, 1000, { step: 0.01 }),
      num("tps", "Tokens / s", 1, 10000),
      num("ttft", "First token s", 0, 120, { step: 0.1 }),
      { ...text("sourceUrl", "Pricing page", 300, { width: "lg", placeholder: "https://…", optional: true }), pattern: HTTPS, patternHelp: "A full https:// address of the vendor's pricing page." },
      { ...text("checked", "Checked on", 10, { width: "sm", placeholder: "2026-10-19", optional: true }), pattern: DATE, patternHelp: "The date you read the price, as YYYY-MM-DD." },
    ],
    fallback: PRICE_PRESETS.map((p) => ({ name: p.name, inPrice: p.inPrice, outPrice: p.outPrice, cachedPrice: p.cachedPrice, tps: p.tps, ttft: p.ttft, sourceUrl: p.source?.url ?? "", checked: p.source?.checked ?? "" })),
  },
  {
    slug: "lab-gpus",
    key: "lists.lab.gpus",
    group: "lab",
    title: "GPUs",
    blurb: "The GPUs the fine-tuning calculator estimates training time for.",
    noun: "GPU",
    idField: "id",
    mode: "free",
    min: 1,
    max: 20,
    preview: "table",
    where: "The Fine-tuning calculator in the Lab.",
    fields: [
      id("id", "Id", SLUG, SLUG_HELP, { placeholder: "h200" }),
      text("name", "Name", 40, { width: "md", placeholder: "H200 SXM" }),
      num("tflops", "BF16 TFLOPS", 1, 100000, { width: "sm", hint: "Dense, without sparsity, from the spec sheet." }),
      num("memory", "Memory GB", 1, 4096, { width: "sm" }),
      { ...text("url", "Spec sheet", 300, { width: "lg", placeholder: "https://…" }), pattern: HTTPS, patternHelp: "A full https:// address." },
    ],
    fallback: GPUS.map((g) => ({ ...g })),
  },
  {
    slug: "lab-regex",
    key: "lists.lab.regex",
    group: "lab",
    title: "Regex library",
    blurb: "Ready patterns in the Regex tester for cleaning model replies and data.",
    noun: "pattern",
    idField: "id",
    mode: "free",
    min: 1,
    max: 40,
    preview: "table",
    where: "The Regex tester's pattern library in the Lab.",
    fields: [
      id("id", "Id", SLUG, SLUG_HELP, { placeholder: "emails" }),
      text("label", "Name", 60, { width: "md" }),
      text("pattern", "Pattern", 400, { width: "lg" }),
      { ...text("flags", "Flags", 6, { width: "xs", optional: true }), pattern: /^[dgimsuy]{0,6}$/, patternHelp: "JavaScript flags: d, g, i, m, s, u, y." },
      area("note", "What it does", 200),
      area("sample", "Sample text", 1200),
    ],
    check: (rows) => {
      for (const r of rows) {
        try {
          new RegExp(String(r.pattern), String(r.flags))
        } catch {
          return `${r.label || r.id}: the pattern is not a valid regular expression.`
        }
      }
      return null
    },
    fallback: LIBRARY.map((l) => ({ ...l })),
  },
]

export const GROUPS: { id: ListGroup; label: string; blurb: string }[] = [
  { id: "github", label: "GitHub signals", blurb: "What Nexverse follows on GitHub." },
  { id: "hub", label: "The hub", blurb: "Languages and the kinds of things members publish." },
  { id: "arena", label: "Arena and benchmarks", blurb: "How models are compared." },
  { id: "community", label: "Orbits, constellations and events", blurb: "Reputation, badges, events and tags." },
  { id: "lab", label: "The Lab", blurb: "Tools and the presets inside them." },
]

export const getListDef = (slug: string) => LISTS.find((l) => l.slug === slug)
const byKey = (key: string) => LISTS.find((l) => l.key === key)!

// ─── Checking and resolving ─────────────────────────────────────────────────────────────────────────────────

/** The value one field should hold, or an error. Used by the editor (to explain) and by resolve (to drop). */
export function checkCell(f: Field, raw: unknown): { value: Cell; error: string | null } {
  if (f.kind === "boolean") return { value: raw === true, error: null }
  if (f.kind === "number") {
    if (f.optional && (raw === "" || raw === null || raw === undefined)) return { value: "", error: null }
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN
    if (!Number.isFinite(n)) return { value: f.min ?? 0, error: `${f.label} needs a number.` }
    if (f.min !== undefined && n < f.min) return { value: f.min, error: `${f.label} is at least ${f.min}.` }
    if (f.max !== undefined && n > f.max) return { value: f.max, error: `${f.label} is at most ${f.max.toLocaleString("en")}.` }
    return { value: n, error: null }
  }
  const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : ""
  if (f.kind === "select") {
    const ok = f.options?.some((o) => o.value === s)
    return ok ? { value: s, error: null } : { value: f.options?.[0]?.value ?? "", error: `Pick a ${f.label.toLowerCase()}.` }
  }
  if (f.max !== undefined && s.length > f.max) return { value: s.slice(0, f.max), error: `${f.label} can be at most ${f.max} characters.` }
  if (!s && !f.optional) return { value: s, error: `${f.label} cannot be empty.` }
  if (s && f.pattern && !f.pattern.test(s)) return { value: s, error: f.patternHelp ?? `${f.label} is not valid.` }
  return { value: s, error: null }
}

export type RowErrors = Record<string, string>

/** Every problem in a list as the editor shows it: per row and field, then the list as a whole. */
export function checkList(def: ListDef, rows: Row[]): { rows: RowErrors[]; list: string | null } {
  const seen = new Map<string, number>()
  const out = rows.map((row, i) => {
    const e: RowErrors = {}
    for (const f of def.fields) {
      if (f.locked) continue
      const { error } = checkCell(f, row[f.name])
      if (error) e[f.name] = error
    }
    const key = String(row[def.idField] ?? "").trim().toLowerCase()
    if (key && seen.has(key)) e[def.idField] = `Already in the list (item ${seen.get(key)! + 1}).`
    else seen.set(key, i)
    return e
  })
  let list: string | null = null
  if (def.min && rows.length < def.min) list = `Keep at least ${def.min} ${def.min === 1 ? def.noun : `${def.noun}s`}.`
  else if (rows.length > def.max) list = `Up to ${def.max} ${def.noun}s.`
  else if (out.every((e) => !Object.keys(e).length)) list = def.check?.(rows) ?? null
  return { rows: out, list }
}

/**
 * Turns whatever is saved into a list the site can use: rows with a bad field are dropped (bad optional
 * fields fall back to the default item's value), locked fields come from the defaults, fixed and growing lists
 * always keep their default items, and anything unusable means the defaults.
 */
export function resolveRows(def: ListDef, saved: unknown): Row[] {
  if (!Array.isArray(saved)) return def.fallback
  const defaults = new Map(def.fallback.map((r) => [String(r[def.idField]), r]))
  const seen = new Set<string>()
  const rows: Row[] = []
  for (const raw of saved.slice(0, def.max * 2)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const src = raw as Record<string, unknown>
    const key = typeof src[def.idField] === "string" || typeof src[def.idField] === "number" ? String(src[def.idField]).trim() : ""
    const base = defaults.get(key)
    if (def.mode === "fixed" && !base) continue
    if (!key || seen.has(key.toLowerCase())) continue
    const row: Row = {}
    let ok = true
    for (const f of def.fields) {
      if (f.locked && base) {
        row[f.name] = base[f.name]
        continue
      }
      const { value, error } = checkCell(f, src[f.name])
      if (error) {
        if (base && f.name !== def.idField) row[f.name] = base[f.name]
        else if (f.kind === "boolean" || f.kind === "select" || f.optional) row[f.name] = value
        else ok = false
      } else row[f.name] = value
    }
    if (!ok) continue
    seen.add(key.toLowerCase())
    rows.push(row)
  }
  if (def.mode !== "free") for (const [key, r] of defaults) if (!seen.has(key.toLowerCase())) rows.push(r)
  const capped = rows.slice(0, Math.max(def.max, def.mode === "free" ? 0 : def.fallback.length))
  if ((def.min && capped.length < def.min) || def.check?.(capped)) return def.fallback
  return capped
}

// ─── From rows to what the site uses ────────────────────────────────────────────────────────────────────────

export const LIST_KEYS = {
  ghTopics: "lists.gh.topics",
  moreTopics: "lists.gh.more",
  releaseRepos: "lists.gh.releases",
  languages: "lists.hub.languages",
  kinds: "lists.hub.kinds",
  duelTasks: "lists.arena.tasks",
  benchmarks: "lists.bench.benchmarks",
  points: "lists.rep.points",
  levels: "lists.rep.levels",
  badges: "lists.rep.badges",
  eventKinds: "lists.events.kinds",
  tags: "lists.forum.tags",
  labTools: "lists.lab.tools",
  labShelves: "lists.lab.categories",
  labPrices: "lists.lab.prices",
  labGpus: "lists.lab.gpus",
  labRegex: "lists.lab.regex",
} as const

export type ListName = keyof typeof LIST_KEYS
export const defOf = (name: ListName) => byKey(LIST_KEYS[name])

const s = (v: Cell | undefined) => (typeof v === "string" ? v : String(v ?? ""))
const n = (v: Cell | undefined) => (typeof v === "number" ? v : Number(v) || 0)

export type GhTopic = { id: string; label: string; blurb: string }
export const toGhTopics = (rows: Row[]): GhTopic[] => rows.map((r) => ({ id: s(r.id), label: s(r.label) || s(r.id), blurb: s(r.blurb) }))
export const toMoreTopics = (rows: Row[]): string[] => rows.map((r) => s(r.id))
export const toReleaseRepos = (rows: Row[]): [string, string][] => rows.map((r) => s(r.repo).split("/") as [string, string])

export type Lang = { name: string; native: string }
export const toLanguages = (rows: Row[]) => Object.fromEntries(rows.map((r) => [s(r.code), { name: s(r.name), native: s(r.native) || s(r.name) }])) as Record<LanguageCode, Lang>

export const toKinds = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [s(r.id), { label: s(r.label), plural: s(r.plural), path: s(r.path), blurb: s(r.blurb) }])) as typeof KINDS

export type Choice = { label: string; blurb: string; enabled: boolean }
export const toDuelTasks = (rows: Row[]) => Object.fromEntries(rows.map((r) => [s(r.id), { label: s(r.label), blurb: s(r.blurb), enabled: r.enabled !== false }])) as Record<DuelTask, Choice>
export const toEventKinds = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [s(r.id), { label: s(r.label), plural: s(r.plural), blurb: s(r.blurb), enabled: r.enabled !== false }])) as Record<EventKind, Choice & { plural: string }>

export const toBenchmarks = (rows: Row[]): Benchmark[] =>
  rows.map((r) => ({
    slug: s(r.slug),
    name: s(r.name),
    area: s(r.area) as BenchmarkArea,
    description: s(r.description),
    metric: s(r.metric),
    unit: r.unit === "%" ? "%" : "",
    higherIsBetter: r.higherIsBetter !== false,
    min: n(r.min),
    max: n(r.max),
    tolerance: n(r.tolerance),
    arxiv: s(r.arxiv),
    usualShots: r.usualShots === "" || r.usualShots === undefined ? undefined : n(r.usualShots),
    retired: r.retired === true,
  }))

export const toPoints = (rows: Row[]): Points => ({ ...POINTS, ...Object.fromEntries(rows.map((r) => [s(r.id), n(r.points)])) })
export const toLevels = (rows: Row[]): Level[] => rows.map((r) => ({ name: s(r.name), min: n(r.min), blurb: s(r.blurb) })).sort((a, b) => a.min - b.min)
export const toBadgeRules = (rows: Row[]): BadgeRule[] => rows.map((r) => ({ id: s(r.id), name: s(r.name), description: s(r.description), stat: s(r.stat) as BadgeStat, min: n(r.min) }))
export const toBadges = (rows: Row[]): Badge[] => toBadgeRules(rows).map(badgeFromRule)
export const toTags = (rows: Row[]): string[] => rows.map((r) => s(r.tag))

/** The Lab's tools in the admins' order, with their names and flags; switched-off tools included (enabled: false). */
export const toLabTools = (rows: Row[]): LabTool[] =>
  rows.flatMap((r) => {
    const base = LAB_TOOLS.find((t) => t.slug === r.slug)
    if (!base) return []
    return [{ ...base, name: s(r.name) || base.name, tagline: s(r.tagline) || base.tagline, intro: s(r.intro) || base.intro, group: (s(r.group) || base.group) as LabCategory, isNew: r.isNew === true, featured: r.featured === true, enabled: r.enabled !== false }]
  })
export const toLabShelves = (rows: Row[]): typeof CATEGORIES => rows.map((r) => ({ id: s(r.id) as LabCategory, label: s(r.label), blurb: s(r.blurb) }))
export const toPrices = (rows: Row[]): Omit<PriceRow, "id">[] =>
  rows.map((r) => ({
    name: s(r.name),
    inPrice: n(r.inPrice),
    outPrice: n(r.outPrice),
    cachedPrice: n(r.cachedPrice),
    tps: n(r.tps) || 50,
    ttft: n(r.ttft),
    source: s(r.sourceUrl) ? { url: s(r.sourceUrl), checked: s(r.checked) } : undefined,
  }))
export const toGpus = (rows: Row[]): typeof GPUS => rows.map((r) => ({ id: s(r.id), name: s(r.name), tflops: n(r.tflops), memory: n(r.memory), url: s(r.url) }))
export const toRegex = (rows: Row[]): LibraryPattern[] => rows.map((r) => ({ id: s(r.id), label: s(r.label), pattern: s(r.pattern), flags: s(r.flags), note: s(r.note), sample: s(r.sample) }))
