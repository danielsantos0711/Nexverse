import { listEvents, type CommunityEvent } from "@/lib/community"
import { getCategory, KINDS, type ResourceKind } from "@/lib/data"
import { listShares, type Share } from "@/lib/hub"
import { listMissions, missionState, type Mission } from "@/lib/missions"
import { listMembers, type PublicMember } from "@/lib/people"
import type { FeedTuning } from "@/lib/profile"
import { listProjects, type Project } from "@/lib/projects"
import { getMemberNames } from "@/lib/social"
import { listQuestions, type Question } from "@/lib/store"

/**
 * The "For you" feed, from real activity only. What the members you follow made, shared and asked; new threads
 * in the categories you follow; projects of the kinds you are into; events coming up; missions taking pilots;
 * the latest news; and people you might follow. Each card says why it is there. When you follow nothing yet, it
 * falls back to what is new across Nexverse, saying so.
 */

export type FeedKind = "project" | "thread" | "news" | "event" | "mission" | "people"

export const FEED_KINDS: { id: FeedKind; label: string }[] = [
  { id: "project", label: "Projects" },
  { id: "thread", label: "Threads" },
  { id: "news", label: "News" },
  { id: "event", label: "Events" },
  { id: "mission", label: "Missions" },
  { id: "people", label: "People" },
]

/** `source` is what a "see less of this" mutes: a member or a category. */
export type FeedItem =
  | { key: string; kind: "project"; date: string; why: string; weight: number; source?: string; p: Project }
  | { key: string; kind: "thread"; date: string; why: string; weight: number; source?: string; q: Question }
  | { key: string; kind: "news"; date: string; why: string; weight: number; source?: string; s: Share }
  | { key: string; kind: "event"; date: string; why: string; weight: number; source?: string; e: CommunityEvent }
  | { key: string; kind: "mission"; date: string; why: string; weight: number; source?: string; m: Mission }
  | { key: string; kind: "people"; date: string; why: string; weight: number; source?: string; people: PublicMember[] }

const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback)

export async function buildFeed({ follows, interests, me, tuning }: { follows: string[]; interests: string[]; me: string | null; tuning: FeedTuning }): Promise<FeedItem[]> {
  const items = new Map<string, FeedItem>()
  const add = (item: FeedItem) => {
    const prev = items.get(item.key)
    if (!prev || prev.weight < item.weight) items.set(item.key, item)
  }
  const members = follows.filter((f) => f.startsWith("member:")).map((f) => f.slice(7)).slice(0, 12)
  const cats = follows.filter((f) => f.startsWith("category:")).map((f) => f.slice(9)).slice(0, 12)
  const kinds = interests.filter((i) => i.startsWith("kind:")).map((i) => i.slice(5)).filter((k): k is ResourceKind => k in KINDS)
  const interestCats = interests.filter((i) => i.startsWith("category:")).map((i) => i.slice(9))
  const names = await safe(getMemberNames(members), {} as Record<string, string>)

  const [fresh, threads, news, events, missions, people] = await Promise.all([
    safe(listProjects({ limit: 24 }), [] as Project[]),
    safe(listQuestions({ limit: 24 }), [] as Question[]),
    safe(listShares({ kind: "news", limit: 8, featuredFirst: true }), [] as Share[]),
    safe(listEvents(), [] as CommunityEvent[]),
    safe(listMissions(), [] as Mission[]),
    safe(listMembers({ sort: "new", limit: 24 }), [] as PublicMember[]),
    ...members.map(async (id) => {
      const name = names[id] ?? "A member you follow"
      const [projects, shares, qs] = await Promise.all([
        safe(listProjects({ owner: id, limit: 10 }), [] as Project[]),
        safe(listShares({ author: id, limit: 10 }), [] as Share[]),
        safe(listQuestions({ author: id, limit: 10 }), [] as Question[]),
      ])
      for (const p of projects.filter((p) => p.status === "published")) add({ key: `project:${p.id}`, kind: "project", date: p.publishedAt ?? p.updatedAt, why: `Because you follow ${name}`, weight: 3, source: `member:${id}`, p })
      for (const s of shares.filter((s) => s.kind === "news")) add({ key: `share:${s.id}`, kind: "news", date: s.createdAt, why: `${name} shared this`, weight: 3, source: `member:${id}`, s })
      for (const q of qs) add({ key: `thread:${q.id}`, kind: "thread", date: q.createdAt, why: `${name} asked this`, weight: 3, source: `member:${id}`, q })
      return []
    }),
    ...cats.map(async (slug) => {
      const name = getCategory(slug)?.name ?? slug
      for (const q of await safe(listQuestions({ orbit: slug, limit: 10 }), [] as Question[])) add({ key: `thread:${q.id}`, kind: "thread", date: q.createdAt, why: `New in ${name}, which you follow`, weight: 2, source: `category:${slug}`, q })
      return []
    }),
    ...kinds.map(async (k) => {
      for (const p of await safe(listProjects({ kind: k, limit: 8 }), [] as Project[]))
        if (p.status === "published") add({ key: `project:${p.id}`, kind: "project", date: p.publishedAt ?? p.updatedAt, why: `New ${KINDS[k].label.toLowerCase()}, one of your interests`, weight: 2, p })
      return []
    }),
  ])

  const personal = items.size > 0
  for (const p of (fresh as Project[]).filter((p) => p.status === "published")) add({ key: `project:${p.id}`, kind: "project", date: p.publishedAt ?? p.updatedAt, why: "New on Nexverse", weight: 1, source: p.ownerId ? `member:${p.ownerId}` : undefined, p })
  for (const q of threads as Question[]) {
    const interested = interestCats.includes(q.orbit)
    add({ key: `thread:${q.id}`, kind: "thread", date: q.createdAt, why: interested ? `In ${getCategory(q.orbit)?.name ?? q.orbit}, one of your interests` : "New in the forum", weight: interested ? 2 : 1, source: `category:${q.orbit}`, q })
  }
  for (const s of news as Share[]) add({ key: `share:${s.id}`, kind: "news", date: s.createdAt, why: s.featuredAt ? "Featured in the newsroom" : "Latest news", weight: s.featuredAt ? 1.5 : 1, s })
  const now = Date.now()
  for (const e of (events as CommunityEvent[]).filter((e) => Date.parse(e.endsAt || e.startsAt) > now).slice(0, 6))
    add({ key: `event:${e.id}`, kind: "event", date: new Date(Math.min(now, Date.parse(e.startsAt))).toISOString(), why: "Coming up soon", weight: 1.5, e })
  for (const m of (missions as Mission[]).filter((m) => ["open", "in-progress"].includes(missionState(m, now))).slice(0, 6))
    add({ key: `mission:${m.id}`, kind: "mission", date: m.createdAt, why: m.reward > 0 ? `Taking pilots, ${m.reward} points riding on it` : "Taking pilots", weight: 1.5, m })

  const followed = new Set(members)
  const suggest = (people as PublicMember[]).filter((p) => p.id !== me && !followed.has(p.id) && !tuning.muted.includes(`member:${p.id}`)).slice(0, 8)

  // Rank: newer first, nudged by why it is here (follows outrank interests outrank what is new everywhere).
  const score = (i: FeedItem) => Date.parse(i.date) / 864e5 + i.weight * 2
  let list = [...items.values()]
    .filter((i) => !tuning.hidden.includes(i.key) && !tuning.hiddenKinds.includes(i.kind) && !(i.source && tuning.muted.includes(i.source)))
    .sort((a, b) => score(b) - score(a))

  // No more than two cards of a kind in a row, so the feed reads as a mix.
  const mixed: FeedItem[] = []
  const rest = [...list]
  while (rest.length) {
    const last2 = mixed.slice(-2).map((i) => i.kind)
    const at = last2.length === 2 && last2[0] === last2[1] ? rest.findIndex((i) => i.kind !== last2[0]) : 0
    mixed.push(...rest.splice(at < 0 ? 0 : at, 1))
  }
  list = mixed
  if (suggest.length && !tuning.hiddenKinds.includes("people")) {
    const card: FeedItem = { key: "people:suggested", kind: "people", date: new Date().toISOString(), why: personal ? "People you might follow" : "Follow a few people to make this feed yours", weight: 0, people: suggest }
    list.splice(Math.min(list.length, personal ? 5 : 2), 0, card)
  }
  return list
}
