/**
 * One paper for /papers/[id]: metadata from the arXiv API, joined with Hugging Face's paper page data
 * (community upvotes, a one-line summary, and the models, datasets and Spaces that cite it) when it exists.
 */
import { cacheLife, cacheTag } from "next/cache"
import { asArray, fetchSafe, HUB_ID, hostname, isoDate, isRecord, num, parseJson, plain, safeUrl, str, type Result } from "./http"
import { arxivBase } from "./ids"
import { parseArxiv } from "./parse"

export type LinkedHub = { id: string; likes: number; downloads: number; emoji: string; title: string }

export type PaperDetail = {
  /** The id as requested (may carry a version). */
  id: string
  baseId: string
  title: string
  authors: string[]
  summary: string
  tldr: string
  published: string
  categories: string[]
  comment: string
  keywords: string[]
  /** Upvotes on Hugging Face's paper page; null when the paper is not listed there. */
  upvotes: number | null
  github: string
  project: string
  models: LinkedHub[]
  datasets: LinkedHub[]
  spaces: LinkedHub[]
  counts: { models: number; datasets: number; spaces: number }
  pdf: string
}

function linked(v: unknown, max = 6): LinkedHub[] {
  return asArray(v)
    .map((x): LinkedHub | null => {
      if (!isRecord(x)) return null
      const id = str(x.id, 200)
      if (!HUB_ID.test(id) || x.private === true) return null
      const emoji = str(x.emoji, 8)
      return {
        id,
        likes: num(x.likes),
        downloads: num(x.downloads),
        emoji: /^[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]{1,8}$/u.test(emoji) ? emoji : "",
        title: plain(x.title ?? x.shortDescription, 120),
      }
    })
    .filter((x): x is LinkedHub => x !== null)
    .slice(0, max)
}

export async function paperDetail(id: string): Promise<Result<PaperDetail>> {
  "use cache"
  const baseId = arxivBase(id)
  cacheTag("live", "live:papers", `paper:${baseId}`)
  const [ax, hf] = await Promise.all([
    fetchSafe(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, { accept: "application/atom+xml", timeout: 15_000, maxBytes: 500_000 }),
    fetchSafe(`https://huggingface.co/api/papers/${encodeURIComponent(baseId)}`, { maxBytes: 3_000_000 }),
  ])
  const entry = ax.ok ? parseArxiv(ax.text)[0] : undefined
  const xmlEntry = ax.ok ? (ax.text.match(/<entry>([\s\S]*?)<\/entry>/)?.[1] ?? "") : ""
  const comment = plain(xmlEntry.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/)?.[1], 400)
  const h = hf.ok ? parseJson(hf.text) : undefined
  const p = isRecord(h) ? h : null

  if (!entry && !p) {
    const reason = ax.ok || (!ax.ok && ax.reason === "notfound") ? "notfound" : !ax.ok ? ax.reason : "error"
    if (reason === "notfound") cacheLife("hours")
    else cacheLife("minutes")
    return { ok: false, reason }
  }

  const github = p ? safeUrl(p.githubRepo) : ""
  const data: PaperDetail = {
    id,
    baseId,
    title: entry?.title || plain(p?.title, 300),
    authors: entry?.authors.length
      ? entry.authors
      : asArray(p?.authors)
          .map((a) => (isRecord(a) ? plain(a.name, 80) : ""))
          .filter(Boolean)
          .slice(0, 60),
    summary: entry?.summary || plain(p?.summary, 4000),
    tldr: p ? plain(p.ai_summary, 400) : "",
    published: entry?.published || isoDate(p?.publishedAt),
    categories: entry?.categories ?? [],
    comment,
    keywords: asArray(p?.ai_keywords)
      .map((k) => plain(k, 40))
      .filter(Boolean)
      .slice(0, 8),
    upvotes: p ? num(p.upvotes) : null,
    github: hostname(github) === "github.com" ? github : "",
    project: p ? safeUrl(p.projectPage) : "",
    models: linked(p?.linkedModels),
    datasets: linked(p?.linkedDatasets),
    spaces: linked(p?.linkedSpaces),
    counts: { models: num(p?.numTotalModels), datasets: num(p?.numTotalDatasets), spaces: num(p?.numTotalSpaces) },
    pdf: `https://arxiv.org/pdf/${id}`,
  }
  if (!data.title) {
    cacheLife("minutes")
    return { ok: false, reason: "error" }
  }
  // If arXiv was down but Hugging Face answered, try again sooner for the full record.
  if (entry) cacheLife("hours")
  else cacheLife("minutes")
  return { ok: true, data }
}
