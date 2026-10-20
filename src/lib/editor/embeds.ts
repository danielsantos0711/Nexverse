/**
 * Safe embeds for member posts. A link alone on its own line becomes a rich block when it points at one of the
 * providers below; anything else stays a plain link. Only video players get an iframe, and only from their
 * privacy-friendly hosts (youtube-nocookie.com, player.vimeo.com with do-not-track), built from an id this file
 * validates, never from the member's URL itself. Everything else (GitHub, gists, arXiv, posts on X) is a card
 * that links out: no third-party scripts ever run on Nexverse.
 */

export type Embed =
  | { type: "youtube"; id: string; start: number; url: string }
  | { type: "vimeo"; id: string; url: string }
  | { type: "github"; owner: string; repo: string; url: string }
  | { type: "gist"; user: string; id: string; url: string }
  | { type: "arxiv"; id: string; url: string }
  | { type: "x"; user: string; id: string; url: string }

const YT_ID = /^[A-Za-z0-9_-]{11}$/

function seconds(t: string | null) {
  if (!t) return 0
  if (/^\d+$/.test(t)) return Math.min(86400, Number(t))
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  return m ? Math.min(86400, Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0
}

/** The embed a URL stands for, or null when it is just a link. */
export function parseEmbed(raw: string): Embed | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "")
  const parts = u.pathname.split("/").filter(Boolean)
  const url = u.toString()

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    const id = parts[0] === "watch" || !parts.length ? u.searchParams.get("v") : ["embed", "shorts", "live", "v"].includes(parts[0]) ? parts[1] : null
    if (id && YT_ID.test(id)) return { type: "youtube", id, start: seconds(u.searchParams.get("t") ?? u.searchParams.get("start")), url }
  }
  if (host === "youtu.be" && parts[0] && YT_ID.test(parts[0])) return { type: "youtube", id: parts[0], start: seconds(u.searchParams.get("t")), url }

  if (host === "vimeo.com" && parts.length === 1 && /^\d{5,12}$/.test(parts[0])) return { type: "vimeo", id: parts[0], url }
  if (host === "player.vimeo.com" && parts[0] === "video" && /^\d{5,12}$/.test(parts[1] ?? "")) return { type: "vimeo", id: parts[1], url }

  if (host === "gist.github.com" && parts.length >= 2 && /^[A-Za-z0-9-]{1,39}$/.test(parts[0]) && /^[0-9a-f]{20,40}$/.test(parts[1])) {
    return { type: "gist", user: parts[0], id: parts[1], url }
  }
  if (host === "github.com" && parts.length === 2 && /^[A-Za-z0-9-]{1,39}$/.test(parts[0]) && /^[A-Za-z0-9._-]{1,100}$/.test(parts[1])) {
    const reserved = ["orgs", "topics", "settings", "marketplace", "features", "sponsors", "explore", "about", "login", "join"]
    if (!reserved.includes(parts[0].toLowerCase())) return { type: "github", owner: parts[0], repo: parts[1].replace(/\.git$/, ""), url }
  }

  if (host === "arxiv.org" && (parts[0] === "abs" || parts[0] === "pdf")) {
    const id = parts.slice(1).join("/").replace(/\.pdf$/, "")
    if (/^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d{1,3})?$/.test(id)) return { type: "arxiv", id, url }
  }

  if ((host === "x.com" || host === "twitter.com") && parts[1] === "status" && /^[A-Za-z0-9_]{1,15}$/.test(parts[0]) && /^\d{5,25}$/.test(parts[2] ?? "")) {
    return { type: "x", user: parts[0], id: parts[2], url: `https://x.com/${parts[0]}/status/${parts[2]}` }
  }
  return null
}

/** The player address for a video embed. Built from the validated id only. */
export function playerSrc(e: Extract<Embed, { type: "youtube" | "vimeo" }>) {
  if (e.type === "youtube") return `https://www.youtube-nocookie.com/embed/${e.id}?rel=0&modestbranding=1${e.start ? `&start=${e.start}` : ""}&autoplay=1`
  return `https://player.vimeo.com/video/${e.id}?dnt=1&autoplay=1`
}

/** A still for the video, shown until someone presses play (nothing loads from the provider before that, except this picture for YouTube). */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

export const EMBED_LABEL: Record<Embed["type"], string> = {
  youtube: "YouTube video",
  vimeo: "Vimeo video",
  github: "GitHub repository",
  gist: "GitHub gist",
  arxiv: "arXiv paper",
  x: "Post on X",
}
