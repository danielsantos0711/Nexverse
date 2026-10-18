/** Shapes of the normalised live data. Every field is validated by the fetchers before it gets here. */

export type LiveSource = "arxiv" | "github"

/** One feed's result. `ok` is false when the source could not be reached; `items` is then empty. */
export type Feed<T> = {
  items: T[]
  /** When this result was fetched (ms since epoch). Shown as "updated N min ago". */
  fetchedAt: number
  ok: boolean
  source: LiveSource
}

export type Paper = {
  /** arXiv id, e.g. 2610.21185 (no version). */
  id: string
  title: string
  summary: string
  authors: string[]
  published: string
  updated: string
  /** Primary category first. */
  categories: string[]
  /** The authors' note (pages, venue, project links), plain text. */
  comment: string
  links: { arxiv: string; pdf: string; /** A GitHub repository named in the abstract or note, if any. */ code: string }
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
  createdAt: string
}

/** A published release of a well-known open-source AI project. */
export type GhReleaseItem = {
  /** owner/name */
  repo: string
  owner: string
  name: string
  tag: string
  title: string
  publishedAt: string
}
