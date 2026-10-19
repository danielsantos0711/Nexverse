/**
 * Reading YouTube and Vimeo links, for pages that embed a video (custom pages, posts). Pure functions with no
 * database or browser access, so server and client code can both use them. The player itself is
 * `VideoEmbed` in ./video-embed, which loads nothing until someone presses play.
 */

/** Where a video plays from: YouTube, Vimeo, or a plain MP4/WebM file served over https. */
export type VideoSource =
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string; hash: string }
  | { kind: "file"; url: string; type: "video/mp4" | "video/webm" }

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * Reads a pasted link: youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, m.youtube.com, vimeo.com/<id>,
 * vimeo.com/<id>/<hash> (unlisted), player.vimeo.com/video/<id>?h=<hash>, or an https link ending in .mp4 or
 * .webm. Anything else is null.
 */
export function parseVideoUrl(input: string): VideoSource | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase()
  const parts = u.pathname.split("/").filter(Boolean)
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    const id = u.pathname === "/watch" ? u.searchParams.get("v") : ["shorts", "embed", "live", "v"].includes(parts[0]) ? parts[1] : null
    return id && YT_ID.test(id) ? { kind: "youtube", id } : null
  }
  if (host === "youtu.be") return parts[0] && YT_ID.test(parts[0]) ? { kind: "youtube", id: parts[0] } : null
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const at = host === "player.vimeo.com" ? (parts[0] === "video" ? 1 : -1) : parts.findIndex((p) => /^\d{1,12}$/.test(p))
    const id = at >= 0 ? parts[at] : ""
    if (!/^\d{1,12}$/.test(id)) return null
    const hash = (u.searchParams.get("h") ?? parts[at + 1] ?? "").toLowerCase()
    return { kind: "vimeo", id, hash: /^[0-9a-f]{6,20}$/.test(hash) ? hash : "" }
  }
  if (u.protocol === "https:" && /\.(mp4|webm)$/i.test(u.pathname)) {
    return { kind: "file", url: u.toString(), type: /\.webm$/i.test(u.pathname) ? "video/webm" : "video/mp4" }
  }
  return null
}

/** The one form a link is stored in. */
export function canonicalUrl(s: VideoSource): string {
  if (s.kind === "youtube") return `https://www.youtube.com/watch?v=${s.id}`
  if (s.kind === "vimeo") return `https://vimeo.com/${s.id}${s.hash ? `/${s.hash}` : ""}`
  return s.url
}

/**
 * The player address, loaded only after someone presses play (so autoplay here starts what they asked for).
 * YouTube's privacy-enhanced domain sets no cookies until playback; Vimeo is asked not to track (dnt=1).
 */
export function embedUrl(s: VideoSource): string | null {
  if (s.kind === "youtube") return `https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  if (s.kind === "vimeo") return `https://player.vimeo.com/video/${s.id}?autoplay=1&dnt=1${s.hash ? `&h=${s.hash}` : ""}`
  return null
}

/** Where the video lives, for "Open on YouTube" and the play button's label. */
export function sourceLabel(s: VideoSource) {
  return s.kind === "youtube" ? "YouTube" : s.kind === "vimeo" ? "Vimeo" : "this site"
}

/** YouTube's own still for a video; it exists for every public video. Vimeo has none without an API call. */
export function posterFor(s: VideoSource): string | null {
  return s.kind === "youtube" ? `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg` : null
}
