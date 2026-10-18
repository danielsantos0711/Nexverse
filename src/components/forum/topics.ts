import { categories, categoryOf, getPerson, lastActivity, threads, type LanguageCode, type Thread } from "@/lib/data"
import type { Question } from "@/lib/store"

/**
 * One shape for every thread on the forum, whether it ships with the app (sample) or a member started it
 * (stored in Supabase, or in this browser). Lists, counts and search all work on topics.
 */
export type Poster = { handle?: string; name: string }

export type Topic = {
  id: string
  href: string
  title: string
  /** English title, when the thread is written in another language. */
  english?: string
  lang: LanguageCode
  category: string
  author: Poster
  created: string
  activity: string
  lastPoster: Poster
  replies: number
  /** Members' threads do not count views. */
  views: number | null
  votes: number
  pinned: boolean
  solved: boolean
  member: boolean
  local: boolean
}

const person = (handle: string): Poster => ({ handle, name: getPerson(handle)?.name ?? handle })

export function sampleTopic(t: Thread): Topic {
  const last = t.replies.reduce<Thread["replies"][number] | null>((a, r) => (!a || r.date >= a.date ? r : a), null)
  return {
    id: t.id,
    href: `/forum/${t.id}`,
    title: t.title,
    english: t.en?.title,
    lang: t.lang,
    category: t.category,
    author: person(t.author),
    created: t.date,
    activity: lastActivity(t),
    lastPoster: person(last?.author ?? t.author),
    replies: t.replies.length,
    views: t.views,
    votes: t.votes,
    pinned: Boolean(t.pinned),
    solved: t.replies.some((r) => r.accepted),
    member: false,
    local: false,
  }
}

export function memberTopic(q: Question): Topic {
  const author: Poster = { name: q.local ? "You" : (q.author?.name ?? "A member") }
  return {
    id: q.id,
    href: `/forum/${q.id}`,
    title: q.title,
    lang: q.lang,
    category: categoryOf(q.orbit),
    author,
    created: q.createdAt,
    // The list query does not carry the newest answer's date, so a member's thread sorts by when it started.
    activity: q.createdAt,
    lastPoster: author,
    replies: q.answerCount,
    views: null,
    votes: 0,
    pinned: false,
    solved: Boolean(q.acceptedAnswerId),
    member: true,
    local: q.local,
  }
}

export const sampleTopics: Topic[] = threads.map(sampleTopic)

const byActivity = (a: Topic, b: Topic) => b.activity.localeCompare(a.activity)

export type TopicSort = "latest" | "top" | "unanswered" | "solved"

export const TOPIC_SORTS: { value: TopicSort; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "top", label: "Top" },
  { value: "unanswered", label: "Unanswered" },
  { value: "solved", label: "Solved" },
]

export const isTopicSort = (v: string | null): v is TopicSort => TOPIC_SORTS.some((s) => s.value === v)

/** Pinned threads always come first; the rest follow the chosen view. */
export function sortTopics(list: Topic[], sort: TopicSort) {
  const pool = sort === "unanswered" ? list.filter((t) => t.replies === 0) : sort === "solved" ? list.filter((t) => t.solved) : list
  const order = sort === "top" ? (a: Topic, b: Topic) => b.votes - a.votes || b.replies - a.replies || byActivity(a, b) : byActivity
  return [...pool.filter((t) => t.pinned).sort(order), ...pool.filter((t) => !t.pinned).sort(order)]
}

export const latestFirst = (list: Topic[]) => [...list].sort(byActivity)

export type CategoryStats = { topics: number; replies: number; latest: Topic | null }

/** Topic and reply counts and the newest post for every category. */
export function statsByCategory(list: Topic[]) {
  const stats = new Map<string, CategoryStats>(categories.map((c) => [c.slug, { topics: 0, replies: 0, latest: null }]))
  for (const t of list) {
    const s = stats.get(t.category)
    if (!s) continue
    s.topics += 1
    s.replies += t.replies
    if (!s.latest || t.activity > s.latest.activity) s.latest = t
  }
  return stats
}

export function searchTopics(list: Topic[], query: string) {
  const q = query.trim().toLocaleLowerCase()
  if (q.length < 2) return []
  return latestFirst(list.filter((t) => t.title.toLocaleLowerCase().includes(q) || t.english?.toLocaleLowerCase().includes(q)))
}

/** Other threads in the same category, the most useful first (solved, then most replies and votes). */
export function similarTopics(id: string, category: string, pool: Topic[] = sampleTopics, n = 5) {
  return pool
    .filter((t) => t.id !== id && t.category === category)
    .sort((a, b) => Number(b.solved) - Number(a.solved) || b.replies - a.replies || b.votes - a.votes)
    .slice(0, n)
}
