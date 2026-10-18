/**
 * Pure normalisers: raw API payloads in, typed items out. Anything malformed is dropped rather than
 * repaired, so a change on the other side shows fewer items instead of broken ones.
 */
import { asArray, decodeEntities, HUB_ID, hostname, isoDate, isRecord, isSafe, num, plain, safeUrl, str } from "./http"
import type { GhRepo, HnStory, HubKind, HubRepo, Paper } from "./types"

const HUB_PATH: Record<HubKind, string> = { model: "", dataset: "datasets/", space: "spaces/" }

export const NOISE_TAGS = /^(transformers|safetensors|pytorch|gguf|endpoints_compatible|autotrain_compatible|text-generation-inference|custom_code|has_space|gradio|streamlit|docker|static|region|deploy|template|mlx|onnx|diffusers|\d+-bit|fp\d+|bf16)$/i

export const pretty = (tag: string) => {
  const s = tag.replace(/[-_]+/g, " ").trim()
  return s ? s[0].toUpperCase() + s.slice(1) : ""
}

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})$/

function arxivLinks(id: string) {
  return { arxiv: `https://arxiv.org/abs/${id}`, pdf: `https://arxiv.org/pdf/${id}`, hf: `https://huggingface.co/papers/${id}` }
}

export function normalizeHub(raw: unknown, kind: HubKind): HubRepo | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id ?? raw.modelId, 200)
  if (!HUB_ID.test(id) || raw.private === true || raw.disabled === true) return null
  const [owner, name] = id.split("/")
  const card = isRecord(raw.cardData) ? raw.cardData : {}
  const runtime = isRecord(raw.runtime) ? raw.runtime : {}
  const title = plain(card.title, 80)
  const description = kind === "space" ? plain(card.short_description, 160) : kind === "dataset" ? plain(raw.description, 220) : ""
  if (!isSafe(id, title, description)) return null
  const tags = asArray(raw.tags)
    .map((t) => str(t, 40))
    .filter((t) => t && !t.includes(":") && !NOISE_TAGS.test(t) && t !== str(raw.pipeline_tag))
    .slice(0, 4)
  const emoji = str(card.emoji, 8)
  return {
    kind,
    id,
    owner,
    name,
    url: `https://huggingface.co/${HUB_PATH[kind]}${id}`,
    likes: num(raw.likes),
    downloads: num(raw.downloads),
    trendingScore: num(raw.trendingScore),
    task: kind === "space" ? pretty(str(raw.sdk ?? card.sdk, 30)) : pretty(str(raw.pipeline_tag, 60)),
    library: str(raw.library_name, 40),
    tags,
    createdAt: isoDate(raw.createdAt),
    updatedAt: isoDate(raw.lastModified),
    description,
    title,
    // Only a short run of pictographs is shown; anything else falls back to the drawn cover.
    emoji: /^[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]{1,8}$/u.test(emoji) ? emoji : "",
    colorFrom: str(card.colorFrom, 12).toLowerCase(),
    colorTo: str(card.colorTo, 12).toLowerCase(),
    running: str(runtime.stage, 20) === "RUNNING",
  }
}

export function normalizeHfPaper(raw: unknown): Paper | null {
  if (!isRecord(raw) || !isRecord(raw.paper)) return null
  const p = raw.paper
  const id = str(p.id, 40)
  if (!ARXIV_ID.test(id)) return null
  const title = plain(p.title ?? raw.title, 300)
  if (!title) return null
  const authors = asArray(p.authors)
    .map((a) => (isRecord(a) ? plain(a.name, 80) : ""))
    .filter(Boolean)
    .slice(0, 40)
  const github = safeUrl(p.githubRepo)
  return {
    source: "huggingface",
    id,
    title,
    summary: plain(p.summary ?? raw.summary, 2400),
    tldr: plain(p.ai_summary, 300),
    authors,
    published: isoDate(p.publishedAt ?? raw.publishedAt),
    upvotes: num(p.upvotes),
    comments: num(raw.numComments),
    categories: [],
    keywords: asArray(p.ai_keywords)
      .map((k) => plain(k, 40))
      .filter(Boolean)
      .slice(0, 5),
    links: { ...arxivLinks(id), code: hostname(github) === "github.com" ? github : "", project: safeUrl(p.projectPage) },
  }
}

/** The inner text of the first matching XML element, or "". */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : ""
}

function allTags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1])
}

function attrs(xml: string, name: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}\\s[^>]*?${attr}="([^"]*)"`, "g"))].map((m) => decodeEntities(m[1]))
}

/** A DOM-free parser for arXiv's Atom feed. CDATA is unwrapped; markup inside text is stripped. */
export function parseArxiv(xml: string): Paper[] {
  const out: Paper[] = []
  const seen = new Set<string>()
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const rawId = plain(tag(entry, "id"), 200)
    const m = rawId.match(/arxiv\.org\/abs\/(.+?)(v\d+)?$/)
    const id = m?.[1] ?? ""
    if (!ARXIV_ID.test(id) || seen.has(id)) continue
    const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    const title = plain(unwrap(tag(entry, "title")), 300)
    if (!title) continue
    seen.add(id)
    const categories = attrs(entry, "category", "term")
      .map((c) => str(c, 20))
      .filter((c) => /^[a-z-]+(\.[A-Za-z-]+)?$/.test(c))
    const primary = attrs(entry, "arxiv:primary_category", "term")[0]
    out.push({
      source: "arxiv",
      id,
      title,
      summary: plain(unwrap(tag(entry, "summary")), 2400),
      tldr: "",
      authors: allTags(entry, "author")
        .map((a) => plain(unwrap(tag(a, "name")), 80))
        .filter(Boolean)
        .slice(0, 40),
      published: isoDate(plain(tag(entry, "published"), 40)),
      upvotes: 0,
      comments: 0,
      categories: primary && categories.includes(primary) ? [primary, ...categories.filter((c) => c !== primary)].slice(0, 4) : categories.slice(0, 4),
      keywords: [],
      links: { ...arxivLinks(id), code: "", project: "" },
    })
  }
  return out
}

export function normalizeHn(raw: unknown): HnStory | null {
  if (!isRecord(raw)) return null
  const id = str(raw.objectID ?? raw.story_id, 20)
  if (!/^\d{1,12}$/.test(id)) return null
  const title = plain(raw.title, 240)
  if (!title) return null
  const hnUrl = `https://news.ycombinator.com/item?id=${id}`
  const url = safeUrl(raw.url) || hnUrl
  return {
    id,
    title,
    url,
    domain: url === hnUrl ? "news.ycombinator.com" : hostname(url),
    hnUrl,
    points: num(raw.points),
    comments: num(raw.num_comments),
    author: str(raw.author, 40).replace(/[^\w-]/g, ""),
    createdAt: isoDate(raw.created_at_i ?? raw.created_at),
  }
}

/** Titles that are about AI, to guard against loose search matches. */
export const AI_TITLE =
  /\b(ai|a\.i\.|llms?|gpts?|chatgpt|openai|anthropic|claude|gemini|llama|mistral|deepseek|qwen|hugging ?face|transformers?|diffusion|neural|machine learning|ml|deep learning|agents?|agentic|rag|embeddings?|inference|fine-?tun\w*|models?|copilot|cursor|mcp|prompts?|tokens?|gguf|vllm|pytorch)\b/i

export function normalizeGh(raw: unknown): GhRepo | null {
  if (!isRecord(raw)) return null
  const fullName = str(raw.full_name, 200)
  if (!/^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/.test(fullName) || raw.private === true) return null
  const description = plain(raw.description, 220)
  if (!isSafe(fullName, description)) return null
  const [owner, name] = fullName.split("/")
  return {
    fullName,
    owner,
    name,
    url: `https://github.com/${fullName}`,
    description,
    stars: num(raw.stargazers_count),
    forks: num(raw.forks_count),
    language: str(raw.language, 30),
    topics: asArray(raw.topics)
      .map((t) => str(t, 40))
      .filter((t) => /^[a-z0-9-]+$/.test(t))
      .slice(0, 4),
    pushedAt: isoDate(raw.pushed_at),
  }
}
