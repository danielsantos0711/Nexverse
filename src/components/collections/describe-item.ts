import { getConstellation, getNews, getResource, getThread, isQuestionId, KINDS, resourcePath, threadTitle, type ResourceKind } from "@/lib/data"
import { describeLiveTarget } from "@/lib/live/ids"

export type ItemInfo = {
  /** What kind of thing it is, for the small label above the name. */
  type: string
  label: string
  summary?: string
  href: string | null
  /** For catalogue resources, so cards can show the kind's icon and colour. */
  kind?: ResourceKind
  /** The forum category or owner, when known. */
  by?: string
}

const LIVE_TYPE: Record<string, string> = { ghrepo: "GitHub repo", hfmodel: "Hugging Face model", hfdataset: "Hugging Face dataset", hfspace: "Hugging Face Space", paper: "Paper" }

/**
 * A label, a one-line summary and a link for anything that can go in a collection: catalogue resources
 * ("model:orbit-8b"), forum threads, news, constellations, papers ("paper:…") and GitHub or Hugging Face repos.
 */
export function describeItem(target: string): ItemInfo {
  const i = target.indexOf(":")
  const type = target.slice(0, i)
  const id = target.slice(i + 1)
  switch (type) {
    case "model":
    case "dataset":
    case "tool":
    case "repo": {
      const r = getResource(id)
      return { type: KINDS[type].label, kind: type, label: r?.name ?? id, summary: r?.summary, href: r ? resourcePath(r) : null, by: r?.owner }
    }
    case "thread": {
      const t = getThread(id)
      if (t) return { type: "Forum thread", label: threadTitle(t), summary: `${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"}`, href: `/forum/${id}` }
      return { type: "Forum thread", label: isQuestionId(id) ? "A member’s thread" : id, href: `/forum/${id}` }
    }
    case "news": {
      const n = getNews(id)
      return { type: "News", label: n?.title ?? id, summary: n?.summary, href: `/news/${id}` }
    }
    case "constellation": {
      const c = getConstellation(id)
      return { type: "Constellation", label: c?.name ?? id, summary: c?.goal, href: `/constellations/${id}` }
    }
    default: {
      const live = describeLiveTarget(target)
      if (live) return { type: LIVE_TYPE[live.type] ?? "Link", label: live.label, href: live.href }
      return { type: "Item", label: id, href: null }
    }
  }
}
