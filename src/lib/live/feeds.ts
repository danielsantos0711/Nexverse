/**
 * Live feeds from public, keyless APIs. Each fetcher is a cached function ("use cache"): results become
 * part of the prerendered page and are refreshed in the background (ISR-style) on the lifetime set by
 * cacheLife. A feed that fails returns `ok: false` with no items and is cached only briefly, so the page
 * still renders and the next visitor after a few minutes triggers a retry.
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, getJson, getText, isRecord } from "./http"
import { AI_TITLE, normalizeGh, normalizeHfPaper, normalizeHn, normalizeHub, parseArxiv } from "./parse"
import type { Feed, GhRepo, HnStory, HubKind, HubRepo, Paper } from "./types"

const HUB_ENDPOINT: Record<HubKind, string> = { model: "models", dataset: "datasets", space: "spaces" }

const clampLimit = (n: number, max: number) => Math.min(max, Math.max(1, Math.floor(Number.isFinite(n) ? n : 10)))

function failed<T>(source: Feed<T>["source"], err: unknown): Feed<T> {
  console.warn(`[live] ${source} feed unavailable:`, err instanceof Error ? err.message : err)
  return { items: [], fetchedAt: Date.now(), ok: false, source }
}

/** Trending models, datasets or Spaces on the Hugging Face Hub. */
export async function hfTrending(kind: HubKind, limit = 12): Promise<Feed<HubRepo>> {
  "use cache"
  cacheTag("live", "live:hf", `live:hf:${kind}`)
  const n = clampLimit(limit, 50)
  try {
    // Ask for a few extra: private, disabled or unsuitable entries are dropped by the normaliser.
    const params = new URLSearchParams({ sort: "trendingScore", limit: String(n + 8) })
    if (kind === "space") for (const f of ["cardData", "likes", "trendingScore", "sdk", "author", "lastModified", "createdAt", "runtime"]) params.append("expand[]", f)
    const data = await getJson(`https://huggingface.co/api/${HUB_ENDPOINT[kind]}?${params}`)
    const items = asArray(data)
      .map((r) => normalizeHub(r, kind))
      .filter((r): r is HubRepo => r !== null)
      .slice(0, n)
    if (!items.length) throw new Error("empty response")
    cacheLife("hours")
    return { items, fetchedAt: Date.now(), ok: true, source: "huggingface" }
  } catch (err) {
    cacheLife("minutes")
    return failed("huggingface", err)
  }
}

/** Today's papers on Hugging Face, most upvoted first. */
export async function hfDailyPapers(limit = 30): Promise<Feed<Paper>> {
  "use cache"
  cacheTag("live", "live:hf", "live:papers")
  const n = clampLimit(limit, 100)
  try {
    const data = await getJson(`https://huggingface.co/api/daily_papers?limit=${Math.max(n, 50)}`)
    const items = asArray(data)
      .map(normalizeHfPaper)
      .filter((p): p is Paper => p !== null)
      .sort((a, b) => b.upvotes - a.upvotes || b.published.localeCompare(a.published))
      .slice(0, n)
    if (!items.length) throw new Error("empty response")
    cacheLife("hours")
    return { items, fetchedAt: Date.now(), ok: true, source: "huggingface" }
  } catch (err) {
    cacheLife("minutes")
    return failed("huggingface", err)
  }
}

/** The newest submissions in cs.AI, cs.CL and cs.LG. */
export async function arxivLatest(limit = 30): Promise<Feed<Paper>> {
  "use cache"
  cacheTag("live", "live:arxiv", "live:papers")
  const n = clampLimit(limit, 100)
  try {
    const q = "search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending"
    const xml = await getText(`https://export.arxiv.org/api/query?${q}&max_results=${n}`)
    const items = parseArxiv(xml).slice(0, n)
    if (!items.length) throw new Error("empty response")
    cacheLife("hours")
    return { items, fetchedAt: Date.now(), ok: true, source: "arxiv" }
  } catch (err) {
    cacheLife("minutes")
    return failed("arxiv", err)
  }
}

const HN_TERMS = "AI LLM LLMs GPT ChatGPT Claude OpenAI Anthropic Gemini Llama DeepSeek Qwen Mistral agents model models inference"

/** The most discussed AI stories on Hacker News over the last few days. */
export async function hnAiStories(limit = 15, minPoints = 40): Promise<Feed<HnStory>> {
  "use cache"
  cacheTag("live", "live:hn")
  const n = clampLimit(limit, 50)
  try {
    const since = Math.floor(Date.now() / 1000) - 3 * 86400
    const params = new URLSearchParams({
      tags: "story",
      query: HN_TERMS,
      optionalWords: HN_TERMS,
      restrictSearchableAttributes: "title",
      typoTolerance: "false",
      numericFilters: `created_at_i>${since},points>${Math.max(0, Math.floor(minPoints))}`,
      hitsPerPage: "60",
      attributesToRetrieve: "title,url,points,num_comments,author,created_at_i,objectID",
      attributesToHighlight: "",
    })
    const data = await getJson(`https://hn.algolia.com/api/v1/search?${params}`)
    const items = asArray(isRecord(data) ? data.hits : null)
      .map(normalizeHn)
      .filter((s): s is HnStory => s !== null && AI_TITLE.test(s.title))
      .sort((a, b) => b.points - a.points)
      .slice(0, n)
    if (!items.length) throw new Error("empty response")
    // Discussions move faster than the Hub: refresh every 15 minutes.
    cacheLife({ stale: 300, revalidate: 900, expire: 86400 })
    return { items, fetchedAt: Date.now(), ok: true, source: "hackernews" }
  } catch (err) {
    cacheLife("minutes")
    return failed("hackernews", err)
  }
}

/**
 * New and rising open-source AI repositories: created in the last 30 days, most starred first.
 * Unauthenticated search allows 10 requests a minute; an optional GITHUB_TOKEN raises that. Cached for hours.
 */
export async function githubTrendingAi(limit = 9): Promise<Feed<GhRepo>> {
  "use cache"
  cacheTag("live", "live:github")
  const n = clampLimit(limit, 30)
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
    const token = process.env.GITHUB_TOKEN
    if (token) headers.Authorization = `Bearer ${token}`
    const topics = ["llm", "ai-agents", "generative-ai"]
    const results = await Promise.allSettled(
      topics.map((t) =>
        getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${t} created:>${since}`)}&sort=stars&order=desc&per_page=${n}`, { headers })
      )
    )
    const seen = new Set<string>()
    const items = results
      .flatMap((r) => (r.status === "fulfilled" && isRecord(r.value) ? asArray(r.value.items) : []))
      .map(normalizeGh)
      .filter((r): r is GhRepo => r !== null && !seen.has(r.fullName) && (seen.add(r.fullName), true))
      .sort((a, b) => b.stars - a.stars)
      .slice(0, n)
    if (!items.length) throw results.find((r) => r.status === "rejected")?.reason ?? new Error("empty response")
    cacheLife("hours")
    return { items, fetchedAt: Date.now(), ok: true, source: "github" }
  } catch (err) {
    cacheLife("minutes")
    return failed("github", err)
  }
}
