/** Shapes of the normalised live data. Every field is validated by the fetchers before it gets here. */

export type LiveSource = "huggingface" | "arxiv" | "hackernews" | "github"

/** One feed's result. `ok` is false when the source could not be reached; `items` is then empty. */
export type Feed<T> = {
  items: T[]
  /** When this result was fetched (ms since epoch). Shown as "updated N min ago". */
  fetchedAt: number
  ok: boolean
  source: LiveSource
}

export type HubKind = "model" | "dataset" | "space"

export type HubRepo = {
  kind: HubKind
  /** owner/name */
  id: string
  owner: string
  name: string
  url: string
  likes: number
  downloads: number
  trendingScore: number
  /** e.g. "Text generation" for models; the SDK for spaces. */
  task: string
  library: string
  tags: string[]
  createdAt: string
  updatedAt: string
  /** Spaces and datasets: a one-line description. */
  description: string
  /** Spaces only. */
  title: string
  emoji: string
  colorFrom: string
  colorTo: string
  running: boolean
}

export type Paper = {
  source: "huggingface" | "arxiv"
  /** arXiv id, e.g. 2610.21185 (no version). */
  id: string
  title: string
  summary: string
  /** A one-sentence summary when the source provides one (Hugging Face). */
  tldr: string
  authors: string[]
  published: string
  upvotes: number
  comments: number
  categories: string[]
  keywords: string[]
  links: { arxiv: string; pdf: string; hf: string; code: string; project: string }
}

export type HnStory = {
  id: string
  title: string
  /** The linked article, or the HN item for Ask/Show posts without one. */
  url: string
  domain: string
  hnUrl: string
  points: number
  comments: number
  author: string
  createdAt: string
}

export type GhRepo = {
  fullName: string
  owner: string
  name: string
  url: string
  description: string
  stars: number
  forks: number
  language: string
  topics: string[]
  pushedAt: string
}
