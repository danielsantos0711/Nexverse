import { rest, supabase, type Member } from "@/lib/code/server"
import { getImage, getJson, isImageHost, type Picture } from "./fetch"

/*
 * Cover pictures for imported projects. Each source offers candidates in order of how well they show the item:
 * the card's own thumbnail, the first real picture in its README (badges and logos in SVG are skipped), a sample
 * from the dataset, the organisation's avatar, and the social card as the last resort. The first one that is
 * a real raster picture is copied into Nexverse storage (the public post-media bucket, in the importing member's
 * folder) so nothing on the site hotlinks the source, and where it came from is recorded as a credit.
 */

export type CoverOrigin = "thumbnail" | "readme" | "sample" | "avatar" | "social"
export type CoverCandidate = { url: string; origin: CoverOrigin }
export type StoredCover = { url: string; origin: CoverOrigin; sourceUrl: string }

const HF = "https://huggingface.co"

/** Badges, shields and tracking pixels are not covers. */
const NOT_A_COVER = /shields\.io|badge|badgen|\/badges?\/|star-history|visitor|hits\.|komarev|contrib\.rocks|discord|twitter|wechat|qr[-_]?code|\.svg(\?|$)/i

/** A link from a card resolved against the item's files, or a GitHub page turned into its raw file, or null. */
export function resolveCardImage(raw: string, base: string): string | null {
  const src = raw.trim().replace(/^<|>$/g, "").split(/\s+/)[0]
  if (!src || src.startsWith("data:") || NOT_A_COVER.test(src)) return null
  let u: URL
  try {
    u = /^https?:\/\//i.test(src) ? new URL(src) : new URL(src.replace(/^\.?\//, ""), `${base}/resolve/main/`)
  } catch {
    return null
  }
  if (u.protocol === "http:") u.protocol = "https:"
  // github.com/<o>/<r>/blob/<ref>/<path>(?raw=true) → raw.githubusercontent.com/<o>/<r>/<ref>/<path>
  if (u.hostname === "github.com") {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/)
    if (!m) return null
    u = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`)
  }
  // A picture on the item's own page (".../blob/main/x.png") is served from ".../resolve/main/x.png".
  if (u.hostname === "huggingface.co") u.pathname = u.pathname.replace(/\/blob\//, "/resolve/")
  if (!isImageHost(u.hostname) || NOT_A_COVER.test(u.pathname)) return null
  return u.toString()
}

/** The pictures of a Markdown card in reading order: ![alt](src), <img src="…"> and reference-style images. */
export function cardImages(md: string, base: string, max = 4): string[] {
  const out: string[] = []
  const re = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  for (const m of md.matchAll(re)) {
    const tag = m[0]
    if (/\balt\s*=\s*["'](?:[^"']*\b(?:badge|license|homepage|chat|twitter|discord|wechat)\b)/i.test(tag)) continue
    if (/\b(?:width|height)\s*=\s*["']?(\d+)/i.test(tag) && Number(tag.match(/\b(?:width|height)\s*=\s*["']?(\d+)/i)?.[1]) < 80) continue
    const url = resolveCardImage(m[2] ?? m[3] ?? "", base)
    if (url && !out.includes(url)) out.push(url)
    if (out.length >= max) break
  }
  return out
}

/** A Hugging Face organisation's or user's avatar, when they have one. */
export async function hfAvatar(owner: string): Promise<string | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(owner)) return null
  for (const kind of ["organizations", "users"]) {
    const got = await getJson<{ avatarUrl?: string }>(`${HF}/api/${kind}/${encodeURIComponent(owner)}/avatar`).catch(() => null)
    const url = got?.avatarUrl
    if (typeof url === "string" && /^https:\/\/cdn-avatars\.huggingface\.co\//.test(url)) return url
  }
  return null
}

/** The social card Hugging Face draws for an item. Last resort: it carries that site's own frame. */
export const hfSocial = (type: "model" | "dataset", id: string) =>
  `https://cdn-thumbnails.huggingface.co/social-thumbnails/${type === "dataset" ? "datasets/" : "models/"}${id.split("/").map(encodeURIComponent).join("/")}.png`

function randomName() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Uploads a picture into the member's post-media folder and returns its public address. */
async function storePicture(m: Member, pic: Picture): Promise<string | null> {
  const env = supabase()
  const path = `${m.id}/${randomName()}.${pic.ext}`
  const res = await fetch(`${env.url}/storage/v1/object/post-media/${path}`, {
    method: "POST",
    headers: { apikey: env.key, authorization: `Bearer ${m.token}`, "content-type": pic.type, "cache-control": "max-age=31536000", "x-upsert": "false" },
    body: new Blob([pic.data.slice().buffer], { type: pic.type }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) return null
  return `${env.url}/storage/v1/object/public/post-media/${path}`
}

/** Tries the candidates in order and stores the first real picture. Null when none worked. */
export async function storeCover(m: Member, candidates: CoverCandidate[]): Promise<StoredCover | null> {
  const seen = new Set<string>()
  for (const c of candidates.slice(0, 8)) {
    if (seen.has(c.url)) continue
    seen.add(c.url)
    const pic = await getImage(c.url)
    // A 28-pixel digit from a dataset is a sample, not a cover.
    if (!pic || (c.origin === "sample" && pic.data.length < 3000)) continue
    const url = await storePicture(m, pic)
    if (url) return { url, origin: c.origin, sourceUrl: c.url }
    // Storage refused (pace limit): later candidates would be refused too.
    return null
  }
  return null
}

/** Records where a project's cover came from (the table may not exist yet: then nothing is recorded). */
export async function creditCover(m: Member, projectId: string, site: string, cover: StoredCover): Promise<void> {
  await rest(m, "project_media_credits?on_conflict=project_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { project_id: projectId, origin: cover.origin, source_site: site, source_url: cover.sourceUrl.slice(0, 1000), stored_url: cover.url, set_by: m.id, updated_at: new Date().toISOString() },
  }).catch(() => null)
}
