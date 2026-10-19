import { categories } from "@/lib/data"
import type { LanguageCode } from "@/lib/data"

/**
 * One shape for every thread in the lists: members' threads from Supabase (or, in a copy without a database,
 * threads saved in this browser). Lists, counts and search all work on topics; nothing here is sample data.
 */
export type Poster = { handle?: string; name: string }

export type Topic = {
  id: string
  href: string
  title: string
  lang: LanguageCode
  category: string
  author: Poster
  authorId: string | null
  created: string
  /** When the newest post went up: the last reply, or the thread itself when nobody replied yet. */
  activity: string
  lastPoster: Poster
  replies: number
  solved: boolean
  local: boolean
  tags: string[]
  /** Hidden by moderators. Only the author and staff ever receive hidden threads. */
  hidden: boolean
  /** Pinned by staff: first in its category. */
  pinned: boolean
  /** Locked by staff: no new replies. */
  locked: boolean
}

const byActivity = (a: Topic, b: Topic) => b.activity.localeCompare(a.activity)
const byCreated = (a: Topic, b: Topic) => b.created.localeCompare(a.created)

export type TopicSort = "latest" | "new" | "top" | "unanswered"

export const TOPIC_SORTS: { value: TopicSort; label: string; hint: string }[] = [
  { value: "latest", label: "Latest", hint: "Threads with the newest posts first." },
  { value: "new", label: "New", hint: "The newest threads first." },
  { value: "top", label: "Top", hint: "Threads with the most replies first." },
  { value: "unanswered", label: "Unanswered", hint: "Threads nobody has replied to yet." },
]

export const isTopicSort = (v: string | null): v is TopicSort => TOPIC_SORTS.some((s) => s.value === v)

/** Pinned threads come first in every view but Unanswered; the rest follow the chosen order. */
export function sortTopics(list: Topic[], sort: TopicSort) {
  if (sort === "unanswered") return list.filter((t) => t.replies === 0).sort(byCreated)
  const order = sort === "new" ? byCreated : sort === "top" ? (a: Topic, b: Topic) => b.replies - a.replies || byActivity(a, b) : byActivity
  return [...list.filter((t) => t.pinned).sort(order), ...list.filter((t) => !t.pinned).sort(order)]
}

export const latestFirst = (list: Topic[]) => [...list].sort(byActivity)

export type CategoryStats = { threads: number; replies: number; latest: Topic | null }

/** Thread and reply counts and the newest thread for every category (the forum's live list, or the presets). */
export function statsByCategory(list: Topic[], slugs: string[] = categories.map((c) => c.slug)) {
  const stats = new Map<string, CategoryStats>(slugs.map((slug) => [slug, { threads: 0, replies: 0, latest: null }]))
  for (const t of list) {
    const s = stats.get(t.category)
    if (!s) continue
    s.threads += 1
    s.replies += t.replies
    if (!s.latest || t.activity > s.latest.activity) s.latest = t
  }
  return stats
}

export function searchTopics(list: Topic[], query: string) {
  const q = query.trim().toLocaleLowerCase()
  if (q.length < 2) return []
  return latestFirst(list.filter((t) => t.title.toLocaleLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q))))
}
