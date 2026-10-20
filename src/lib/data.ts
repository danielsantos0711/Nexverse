/**
 * Presets every page can lean on: languages, the four kinds of thing on the hub, tasks, the forum's categories,
 * news kinds, and small pure helpers (dates, compact numbers, plurals).
 * Everything members share lives in the database; nothing here pretends to be content.
 */

export type LanguageCode = "en" | "pt" | "es" | "ja" | "de" | "fr" | "yo" | "sw" | "hi" | "sv" | "ko" | "ar"

/** The default languages. Admins add, rename and reorder them in /admin/lists; pickers read useLanguages() (lib/lists/hooks.ts). */
export const LANGUAGES: Record<LanguageCode, { name: string; native: string }> = {
  en: { name: "English", native: "English" },
  pt: { name: "Portuguese", native: "Português" },
  es: { name: "Spanish", native: "Español" },
  ja: { name: "Japanese", native: "日本語" },
  de: { name: "German", native: "Deutsch" },
  fr: { name: "French", native: "Français" },
  yo: { name: "Yoruba", native: "Yorùbá" },
  sw: { name: "Swahili", native: "Kiswahili" },
  hi: { name: "Hindi", native: "हिन्दी" },
  sv: { name: "Swedish", native: "Svenska" },
  ko: { name: "Korean", native: "한국어" },
  ar: { name: "Arabic", native: "العربية" },
}

// Resources: models, datasets, tools and repositories

export type ResourceKind = "model" | "dataset" | "tool" | "repo"

/** The four kinds of thing on the hub. Admins rename and describe them in /admin/lists (useKinds() returns the live version). */
export const KINDS: Record<ResourceKind, { label: string; plural: string; path: string; blurb: string }> = {
  model: { label: "Model", plural: "Models", path: "/models", blurb: "Open weights you can download, fine-tune and run." },
  dataset: { label: "Dataset", plural: "Datasets", path: "/datasets", blurb: "Data with datasheets: where it came from and what it is for." },
  tool: { label: "Tool", plural: "Tools", path: "/tools", blurb: "Apps and utilities you can use right now, most of them free." },
  repo: { label: "Repo", plural: "Repos", path: "/repos", blurb: "Code: libraries, recipes, agents and everything in between." },
}


export const TASKS = [
  "Text generation",
  "Translation",
  "Speech recognition",
  "Text to speech",
  "Image generation",
  "Audio generation",
  "Embeddings",
  "Agents",
  "Evaluation",
  "Retrieval",
  "On-device",
  "Data tooling",
  "Observability",
] as const

// Forum

export type CategoryGroup = "community" | "build" | "research" | "languages"

/** Categories sit in groups, the way a classic forum's index is laid out. */
export const categoryGroups: { slug: CategoryGroup; name: string; blurb: string }[] = [
  { slug: "community", name: "Community", blurb: "News, questions and things people made." },
  { slug: "build", name: "Build", blurb: "Models, agents, data and running them yourself." },
  { slug: "research", name: "Research", blurb: "Papers, evals, and doing it responsibly." },
  { slug: "languages", name: "Languages", blurb: "AI beyond English, region by region." },
]

export type Category = { slug: string; name: string; blurb: string; icon: string; group: CategoryGroup }

export const categories: Category[] = [
  { slug: "announcements", name: "Announcements", blurb: "Releases, forum news and how things work here.", icon: "megaphone", group: "community" },
  { slug: "help", name: "Help", blurb: "Stuck? Ask. Someone has done it before.", icon: "life-buoy", group: "community" },
  { slug: "show", name: "Show & tell", blurb: "Share what you built and get honest feedback.", icon: "sparkles", group: "community" },
  { slug: "models", name: "Models", blurb: "Training, fine-tuning, quantising, comparing.", icon: "box", group: "build" },
  { slug: "agents", name: "Agents", blurb: "Tools, loops, memory and agents that behave.", icon: "bot", group: "build" },
  { slug: "local", name: "Local & on-device", blurb: "Phones, laptops, offline, private.", icon: "cpu", group: "build" },
  { slug: "data", name: "Data & datasets", blurb: "Collecting, cleaning, documenting and sharing data.", icon: "database", group: "build" },
  { slug: "research", name: "Research", blurb: "Papers explained by people who read them.", icon: "flask-conical", group: "research" },
  { slug: "benchmarks", name: "Evals & benchmarks", blurb: "Measuring what matters, and catching leaks.", icon: "gauge", group: "research" },
  { slug: "policy", name: "Policy & safety", blurb: "Regulation, licences and doing it responsibly.", icon: "scale", group: "research" },
  { slug: "languages", name: "Every language", blurb: "Multilingual work that crosses regions: tokenisers, translation, fairness.", icon: "languages", group: "languages" },
  { slug: "europe", name: "European languages", blurb: "Portuguese, Spanish, Swedish, Catalan and the rest of Europe.", icon: "globe", group: "languages" },
  { slug: "africa", name: "African languages", blurb: "Yoruba, Swahili, Hausa, Amharic and more.", icon: "earth", group: "languages" },
  { slug: "asia", name: "Asian languages", blurb: "Japanese, Korean, Hindi, Chinese and beyond.", icon: "globe", group: "languages" },
  { slug: "arabic", name: "Arabic & Middle East", blurb: "Dialects, Arabizi, right-to-left and the region's languages.", icon: "earth", group: "languages" },
]

// News

export type NewsKind = "release" | "paper" | "policy" | "tutorial" | "community"

export const NEWS_KINDS: Record<NewsKind, string> = {
  release: "Release",
  paper: "Paper",
  policy: "Policy",
  tutorial: "Tutorial",
  community: "Community",
}

// Lookups

/** Threads started in the first version were filed under its communities ("orbits"); each maps to a category. */
const LEGACY_CATEGORIES: Record<string, string> = {
  "small-models": "models",
  "every-language": "languages",
  "local-first": "local",
  evals: "benchmarks",
  "image-audio": "show",
  "in-practice": "help",
  "safety-policy": "policy",
}
export const categoryOf = (slug: string) => LEGACY_CATEGORIES[slug] ?? slug
export const getCategory = (slug: string) => categories.find((c) => c.slug === categoryOf(slug))

export const categoriesIn = (group: CategoryGroup) => categories.filter((c) => c.group === group)
export const getCategoryGroup = (group: CategoryGroup) => categoryGroups.find((g) => g.slug === group)
/** Where a forum category lives. Old links used /forum?c=<slug>; the forum index redirects those here. */
export const categoryPath = (slug: string) => `/forum/c/${categoryOf(slug)}`
export const resourcePath = (r: { kind: ResourceKind; slug: string }) => `${KINDS[r.kind].path}/${r.slug}`

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
  return String(n)
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${compact(n)} ${n === 1 ? one : many}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Forum threads have database ids. */
export const isQuestionId = (id: string) => UUID.test(id)
