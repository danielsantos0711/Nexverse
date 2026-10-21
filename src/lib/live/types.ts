/** Shapes of the normalised live data. Every field is validated by the fetchers before it gets here. */

export type LiveSource = "github"

/** One feed's result. `ok` is false when the source could not be reached; `items` is then empty. */
export type Feed<T> = {
  items: T[]
  /** When this result was fetched (ms since epoch). Shown as "updated N min ago". */
  fetchedAt: number
  ok: boolean
  source: LiveSource
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
  /** Stars per day since it was created (rising feeds only). */
  starsPerDay?: number
  /** The followed topic it was found under (rising feeds only). */
  topic?: string
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
