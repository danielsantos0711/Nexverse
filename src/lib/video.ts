import type { Member } from "@/lib/store"
import { isUuid, normalizeTag, TAG, type Who } from "@/lib/community"
import { db, live } from "@/lib/supabase"

/**
 * Video lab: AI videos members share with the prompt, model, tool and shot settings behind them, likes, and
 * the shot builder that composes text-to-video prompts. Posts link a video on YouTube or Vimeo, or a short clip
 * uploaded to the "videos" storage bucket (supabase/migrations/…_video.sql). Players load only on click.
 *
 * Everything lives in the database; without one (a copy of the site with no accounts) the gallery is empty and
 * sharing explains why. Nothing here is sample content.
 */

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
  if (/Suspended members/.test(message)) return "Your account is paused, so you cannot post right now."
  if (/video_posts_video_url_check/.test(message)) return "That video link is not one Nexverse can play. Use a YouTube or Vimeo link, or upload an MP4 or WebM file."
  if (/video_posts_poster_url_check/.test(message)) return "That poster image cannot be used. Upload a JPEG, PNG or WebP image instead."
  if (/video_posts_tags_check/.test(message)) return "Tags are lowercase letters, numbers and hyphens, up to 24 characters, and at most 5."
  if (/video_posts_title_check/.test(message)) return "Give the video a title of 3 to 120 characters."
  if (/duplicate key/.test(message)) return "That is already there."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/schema cache|does not exist/.test(message)) return "The video lab is still being switched on for this site. Try again soon."
  if (/exceeded the maximum allowed size|Payload too large/i.test(message)) return `Files can be up to ${MAX_UPLOAD_MB} MB.`
  if (/mime type/i.test(message)) return "Upload an MP4 or WebM video, or a JPEG, PNG or WebP poster."
  return message
}

const NO_DB = "Sharing videos needs member accounts, which are not switched on for this copy of Nexverse."

async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  if (!live) throw new Error(NO_DB)
  const id = await me()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

const memberWho = (m: Member | null | undefined): Who => (m ? { name: m.name, memberId: m.id } : { name: "A member" })

// ─── Video sources ──────────────────────────────────────────────────────────────────────────────────────────

/** Where a video plays from. Only these three kinds are accepted, both here and by the database. */
export type VideoSource =
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string; hash: string }
  | { kind: "file"; url: string; type: "video/mp4" | "video/webm" }

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const SUPABASE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : ""
  } catch {
    return ""
  }
})()
const STORAGE_FILE = /^\/storage\/v1\/object\/public\/videos\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}\.(mp4|webm)$/

/**
 * Reads a pasted link: youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, m.youtube.com, vimeo.com/<id>,
 * vimeo.com/<id>/<hash> (unlisted), player.vimeo.com/video/<id>?h=<hash>, or a file in this site's "videos"
 * bucket. Anything else is null.
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
  if (u.protocol === "https:" && (u.host === SUPABASE_HOST || !SUPABASE_HOST) && STORAGE_FILE.test(u.pathname)) {
    return { kind: "file", url: `https://${u.host}${u.pathname}`, type: u.pathname.endsWith(".webm") ? "video/webm" : "video/mp4" }
  }
  return null
}

/** The one form a link is stored in (the database checks it). */
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

/** Where the video lives, for "Open on YouTube" and similar. Files have no other home. */
export function sourceLabel(s: VideoSource) {
  return s.kind === "youtube" ? "YouTube" : s.kind === "vimeo" ? "Vimeo" : "Nexverse"
}

const POSTER = /^https:\/\/(i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/[a-z0-9_]{2,20}\.jpg|i\.vimeocdn\.com\/video\/[A-Za-z0-9_-]{1,200}(\?[A-Za-z0-9=&_.-]{0,80})?|[^/\s]+\/storage\/v1\/object\/public\/videos\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}\.(jpg|jpeg|png|webp))$/

export const isPosterUrl = (s: string) => POSTER.test(s)

/** YouTube's own still for a video; it exists for every public video. */
export const youtubePoster = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

export type VideoLookup = { title: string; poster: string | null; author: string }

/**
 * Checks a link with the host's public oEmbed endpoint (YouTube and Vimeo both allow it from the browser, no
 * key) to confirm the video exists and is embeddable, and to get its title and thumbnail. Null when it is
 * private, removed, or the host did not answer.
 */
export async function lookupVideo(s: VideoSource): Promise<VideoLookup | null> {
  if (s.kind === "file") return null
  const endpoint =
    s.kind === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl(s))}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonicalUrl(s))}`
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    const title = typeof data.title === "string" ? data.title.slice(0, 120) : ""
    const author = typeof data.author_name === "string" ? data.author_name.slice(0, 80) : ""
    const thumb = typeof data.thumbnail_url === "string" ? data.thumbnail_url : ""
    const poster = s.kind === "youtube" ? youtubePoster(s.id) : POSTER.test(thumb) ? thumb : null
    return { title, poster, author }
  } catch {
    return null
  }
}

// ─── Vocabulary ─────────────────────────────────────────────────────────────────────────────────────────────

/** Model families, offered as suggestions only: the field is free text because versions change monthly. */
export const MODEL_SUGGESTIONS = [
  "Veo",
  "Sora",
  "Runway Gen-4",
  "Luma Ray",
  "Kling",
  "Pika",
  "Hailuo",
  "Seedance",
  "Wan",
  "LTX-Video",
  "HunyuanVideo",
  "Mochi",
] as const

export const TOOL_SUGGESTIONS = ["Google Flow", "Sora app", "Runway", "Luma Dream Machine", "Kling", "Pika", "ComfyUI", "DaVinci Resolve", "Premiere Pro", "CapCut"] as const

export const LIMITS = { title: [3, 120], prompt: 4000, model: 80, tool: 80, tags: 5 } as const
export const MAX_UPLOAD_MB = 25
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" } as const
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const

// ─── Shot builder ───────────────────────────────────────────────────────────────────────────────────────────

export type Option = { id: string; label: string; phrase: string; hint?: string }

/** Camera moves, in the words most text-to-video models respond to. */
export const CAMERA_MOVES: Option[] = [
  { id: "static", label: "Static", phrase: "locked-off static shot", hint: "Tripod, no movement" },
  { id: "dolly-in", label: "Dolly in", phrase: "slow dolly in toward the subject", hint: "Camera travels closer" },
  { id: "dolly-out", label: "Dolly out", phrase: "slow dolly out revealing the surroundings", hint: "Camera pulls away" },
  { id: "orbit", label: "Orbit", phrase: "smooth orbit around the subject", hint: "Circles the subject" },
  { id: "crane-up", label: "Crane up", phrase: "crane shot rising up and over the scene", hint: "Lifts into the air" },
  { id: "tracking", label: "Tracking", phrase: "tracking shot following the subject from the side", hint: "Moves alongside" },
  { id: "handheld", label: "Handheld", phrase: "handheld camera with subtle natural shake", hint: "Documentary feel" },
  { id: "pan", label: "Pan", phrase: "slow pan from left to right", hint: "Turns on the spot" },
  { id: "tilt-up", label: "Tilt up", phrase: "slow tilt up from the ground to the sky", hint: "Looks upward" },
  { id: "push-in", label: "Push in", phrase: "subtle push in on the face", hint: "Builds tension" },
  { id: "fpv", label: "FPV drone", phrase: "fast FPV drone flight through the scene", hint: "Swooping, energetic" },
  { id: "aerial", label: "Aerial", phrase: "high aerial establishing shot", hint: "Bird's-eye view" },
]

export const LENSES: Option[] = [
  { id: "ultra-wide", label: "14mm ultra-wide", phrase: "14mm ultra-wide lens" },
  { id: "wide", label: "24mm wide", phrase: "24mm wide-angle lens" },
  { id: "normal", label: "35mm", phrase: "35mm lens" },
  { id: "standard", label: "50mm", phrase: "50mm lens, natural perspective" },
  { id: "portrait", label: "85mm portrait", phrase: "85mm portrait lens, shallow depth of field" },
  { id: "tele", label: "200mm telephoto", phrase: "200mm telephoto lens, compressed background" },
  { id: "macro", label: "Macro", phrase: "macro lens, extreme close detail" },
  { id: "anamorphic", label: "Anamorphic", phrase: "anamorphic lens with oval bokeh and horizontal flares" },
  { id: "fisheye", label: "Fisheye", phrase: "fisheye lens" },
]

export const LIGHTING: Option[] = [
  { id: "golden", label: "Golden hour", phrase: "warm golden hour sunlight" },
  { id: "blue", label: "Blue hour", phrase: "cool blue hour twilight" },
  { id: "overcast", label: "Overcast", phrase: "soft overcast daylight" },
  { id: "noon", label: "Hard noon sun", phrase: "hard midday sun with crisp shadows" },
  { id: "neon", label: "Neon", phrase: "neon signs casting magenta and cyan light" },
  { id: "low-key", label: "Low key", phrase: "low-key lighting, deep shadows" },
  { id: "high-key", label: "High key", phrase: "bright high-key studio lighting" },
  { id: "rim", label: "Rim light", phrase: "strong rim light outlining the subject" },
  { id: "volumetric", label: "Volumetric", phrase: "volumetric light rays through haze" },
  { id: "candle", label: "Candlelight", phrase: "flickering candlelight" },
  { id: "moon", label: "Moonlight", phrase: "pale moonlight" },
  { id: "starlight", label: "Starlight", phrase: "faint starlight and the glow of a nebula" },
]

export const MOODS: Option[] = [
  { id: "epic", label: "Epic", phrase: "epic, awe-inspiring" },
  { id: "serene", label: "Serene", phrase: "calm and serene" },
  { id: "tense", label: "Tense", phrase: "tense, suspenseful" },
  { id: "dreamy", label: "Dreamy", phrase: "dreamy and ethereal" },
  { id: "melancholic", label: "Melancholic", phrase: "quietly melancholic" },
  { id: "playful", label: "Playful", phrase: "playful and light" },
  { id: "eerie", label: "Eerie", phrase: "eerie and unsettling" },
  { id: "documentary", label: "Documentary", phrase: "grounded, documentary realism" },
]

export const STYLES: Option[] = [
  { id: "cinematic", label: "Cinematic", phrase: "cinematic, film grain, 35mm film look" },
  { id: "photoreal", label: "Photoreal", phrase: "photorealistic" },
  { id: "anime", label: "Anime", phrase: "hand-drawn anime style" },
  { id: "3d", label: "3D render", phrase: "stylised 3D render" },
  { id: "claymation", label: "Claymation", phrase: "stop-motion claymation" },
  { id: "vintage", label: "Vintage 16mm", phrase: "vintage 16mm footage, light leaks" },
  { id: "noir", label: "Noir", phrase: "black-and-white film noir" },
]

export const DURATIONS = [4, 5, 6, 8, 10] as const
export const ASPECTS = [
  { id: "16:9", label: "16:9", hint: "Landscape" },
  { id: "9:16", label: "9:16", hint: "Vertical" },
  { id: "1:1", label: "1:1", hint: "Square" },
  { id: "21:9", label: "21:9", hint: "Widescreen" },
  { id: "4:5", label: "4:5", hint: "Portrait" },
] as const

export type Shot = {
  subject: string
  action: string
  setting: string
  camera: string
  lens: string
  lighting: string
  mood: string
  style: string
  duration: number
  aspect: string
  /** Things to keep out, for models that take a negative prompt. */
  avoid: string
}

export const EMPTY_SHOT: Shot = {
  subject: "",
  action: "",
  setting: "",
  camera: "dolly-in",
  lens: "standard",
  lighting: "",
  mood: "",
  style: "cinematic",
  duration: 5,
  aspect: "16:9",
  avoid: "",
}

/** Starting points for the builder. Each one is a complete, usable shot. */
export const SHOT_TEMPLATES: { id: string; label: string; shot: Partial<Shot> }[] = [
  {
    id: "launch",
    label: "Rocket launch",
    shot: { subject: "a slender silver rocket", action: "lifts off on a column of white fire", setting: "on a coastal launch pad at dawn", camera: "tilt-up", lens: "tele", lighting: "golden", mood: "epic", style: "cinematic" },
  },
  {
    id: "astronaut",
    label: "Astronaut portrait",
    shot: { subject: "an astronaut with a scuffed helmet", action: "slowly turns to look at the camera", setting: "inside a dim space station module", camera: "push-in", lens: "portrait", lighting: "rim", mood: "melancholic", style: "photoreal" },
  },
  {
    id: "city",
    label: "Neon street",
    shot: { subject: "a courier on an electric bike", action: "weaves through traffic in the rain", setting: "a crowded night market street", camera: "tracking", lens: "anamorphic", lighting: "neon", mood: "tense", style: "cinematic" },
  },
  {
    id: "product",
    label: "Product reveal",
    shot: { subject: "a matte black wristwatch", action: "rotates slowly as light sweeps across it", setting: "a seamless dark studio backdrop", camera: "orbit", lens: "macro", lighting: "low-key", mood: "serene", style: "photoreal", aspect: "1:1" },
  },
  {
    id: "nature",
    label: "Nature aerial",
    shot: { subject: "a herd of wild horses", action: "gallop across the plain kicking up dust", setting: "across a wide steppe under storm clouds", camera: "aerial", lens: "wide", lighting: "volumetric", mood: "epic", style: "cinematic", duration: 8 },
  },
]

const pick = (list: Option[], id: string) => list.find((o) => o.id === id)

/** Fills a shot from saved settings, ignoring anything unknown. */
export function shotFrom(settings: Record<string, unknown>): Shot {
  const s: Shot = { ...EMPTY_SHOT }
  const text = (k: keyof Shot, max: number) => (typeof settings[k] === "string" ? String(settings[k]).slice(0, max) : undefined)
  s.subject = text("subject", 200) ?? ""
  s.action = text("action", 200) ?? ""
  s.setting = text("setting", 200) ?? ""
  s.avoid = text("avoid", 200) ?? ""
  for (const [k, list] of [
    ["camera", CAMERA_MOVES],
    ["lens", LENSES],
    ["lighting", LIGHTING],
    ["mood", MOODS],
    ["style", STYLES],
  ] as const) {
    const v = text(k, 40)
    if (v !== undefined && (v === "" || pick(list, v))) s[k] = v
  }
  const d = Number(settings.duration)
  if ((DURATIONS as readonly number[]).includes(d)) s.duration = d
  const a = text("aspect", 8)
  if (a && ASPECTS.some((x) => x.id === a)) s.aspect = a
  return s
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ")
  return t ? t[0].toUpperCase() + t.slice(1).replace(/[.\s]+$/, "") + "." : ""
}

/**
 * A clean text-to-video prompt from a shot: what happens first (subject, action, setting), then how it is
 * filmed (camera, lens, light, mood, style), then the format. Most models read the opening words most closely.
 */
export function composePrompt(shot: Shot): string {
  const scene = [shot.subject, shot.action, shot.setting.trim() ? (/^(in|at|on|inside|under|above|across|through|over)\s/i.test(shot.setting.trim()) ? shot.setting.trim() : `in ${shot.setting.trim()}`) : ""].filter((x) => x.trim()).join(" ")
  const camera = pick(CAMERA_MOVES, shot.camera)?.phrase
  const lens = pick(LENSES, shot.lens)?.phrase
  const look = [pick(LIGHTING, shot.lighting)?.phrase, pick(MOODS, shot.mood)?.phrase, pick(STYLES, shot.style)?.phrase].filter(Boolean).join(", ")
  const format = `${shot.duration} seconds, ${shot.aspect}${shot.aspect === "9:16" ? " vertical" : ""}`
  const parts = [sentence(scene), sentence([camera, lens].filter(Boolean).join(", ")), sentence(look), sentence(format)]
  if (shot.avoid.trim()) parts.push(sentence(`Avoid ${shot.avoid.trim().replace(/^avoid\s+/i, "")}`))
  return parts.filter(Boolean).join(" ")
}

/** The settings saved with a post: the shot itself, so "remix" can rebuild it. */
export const shotSettings = (shot: Shot): Record<string, string | number> => ({ ...shot })

/** Human labels for saved settings, for the detail page. Unknown keys are shown as written. */
export function settingRows(settings: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const label = (list: Option[], v: unknown) => (typeof v === "string" ? (pick(list, v)?.label ?? "") : "")
  const known: [string, string][] = [
    ["Camera", label(CAMERA_MOVES, settings.camera)],
    ["Lens", label(LENSES, settings.lens)],
    ["Lighting", label(LIGHTING, settings.lighting)],
    ["Mood", label(MOODS, settings.mood)],
    ["Style", label(STYLES, settings.style)],
    ["Duration", typeof settings.duration === "number" ? `${settings.duration} s` : ""],
    ["Aspect", typeof settings.aspect === "string" ? settings.aspect.slice(0, 8) : ""],
  ]
  for (const [l, v] of known) if (v) rows.push({ label: l, value: v })
  const extra = ["seed", "steps", "cfg", "fps", "resolution"]
  for (const k of extra) {
    const v = settings[k]
    if (typeof v === "string" || typeof v === "number") rows.push({ label: k.toUpperCase() === "CFG" ? "CFG" : k[0].toUpperCase() + k.slice(1), value: String(v).slice(0, 40) })
  }
  return rows
}

// ─── Where to generate ──────────────────────────────────────────────────────────────────────────────────────

/** Official homes of well-known video models. Open models link to their GitHub repository (shown on Nexverse). */
export const GENERATORS: { name: string; maker: string; href: string; open: boolean; github?: [string, string] }[] = [
  { name: "Veo", maker: "Google DeepMind", href: "https://deepmind.google/models/veo/", open: false },
  { name: "Sora", maker: "OpenAI", href: "https://openai.com/sora/", open: false },
  { name: "Runway", maker: "Runway", href: "https://runway.com/", open: false },
  { name: "Dream Machine", maker: "Luma AI", href: "https://lumalabs.ai/dream-machine", open: false },
  { name: "Kling", maker: "Kuaishou", href: "https://kling.ai/", open: false },
  { name: "Pika", maker: "Pika", href: "https://pika.art/", open: false },
  { name: "Hailuo", maker: "MiniMax", href: "https://hailuoai.video/", open: false },
  { name: "Wan", maker: "Alibaba", href: "https://github.com/Wan-Video/Wan2.2", open: true, github: ["Wan-Video", "Wan2.2"] },
  { name: "LTX-Video", maker: "Lightricks", href: "https://github.com/Lightricks/LTX-Video", open: true, github: ["Lightricks", "LTX-Video"] },
  { name: "HunyuanVideo", maker: "Tencent", href: "https://github.com/Tencent-Hunyuan/HunyuanVideo", open: true, github: ["Tencent-Hunyuan", "HunyuanVideo"] },
  { name: "Mochi 1", maker: "Genmo", href: "https://github.com/genmoai/mochi", open: true, github: ["genmoai", "mochi"] },
]

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

export type VideoStatus = "draft" | "published"

export type VideoPost = {
  id: string
  status: VideoStatus
  title: string
  videoUrl: string | null
  source: VideoSource | null
  posterUrl: string | null
  prompt: string
  model: string
  tool: string
  settings: Record<string, unknown>
  tags: string[]
  createdAt: string
  updatedAt: string
  hidden: boolean
  author: Who
  likes: number
  liked: boolean
  mine: boolean
}

export type NewVideo = {
  status: VideoStatus
  title: string
  videoUrl: string
  posterUrl: string
  prompt: string
  model: string
  tool: string
  settings: Record<string, unknown>
  tags: string[]
}

const COLUMNS = "id, status, title, video_url, poster_url, prompt, model, tool, settings, tags, created_at, updated_at, hidden_at, author_id, author:profiles!video_posts_author_id_fkey(id, name), likes:video_likes(count)"

type Row = {
  id: string
  status: VideoStatus
  title: string
  video_url: string | null
  poster_url: string | null
  prompt: string
  model: string
  tool: string
  settings: Record<string, unknown> | null
  tags: string[] | null
  created_at: string
  updated_at: string
  hidden_at: string | null
  author_id: string
  author: Member | null
  likes: { count: number }[] | null
}

const fromRow = (r: Row, userId: string | null, liked: Set<string>): VideoPost => ({
  id: r.id,
  status: r.status,
  title: r.title,
  videoUrl: r.video_url,
  source: r.video_url ? parseVideoUrl(r.video_url) : null,
  posterUrl: r.poster_url && POSTER.test(r.poster_url) ? r.poster_url : null,
  prompt: r.prompt ?? "",
  model: r.model ?? "",
  tool: r.tool ?? "",
  settings: r.settings && typeof r.settings === "object" && !Array.isArray(r.settings) ? r.settings : {},
  tags: r.tags ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  hidden: Boolean(r.hidden_at),
  author: memberWho(r.author),
  likes: r.likes?.[0]?.count ?? 0,
  liked: liked.has(r.id),
  mine: Boolean(userId && r.author_id === userId),
})

async function likedBy(userId: string | null, ids: string[]): Promise<Set<string>> {
  const client = db()
  if (!client || !userId || !ids.length) return new Set()
  const { data } = await client.from("video_likes").select("video_id").eq("user_id", userId).in("video_id", ids.slice(0, 200))
  return new Set((data as { video_id: string }[] | null)?.map((r) => r.video_id) ?? [])
}

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

/** Shared videos, newest first (up to 200). Hidden ones only reach their author and staff. */
export async function listVideos(): Promise<VideoPost[]> {
  const client = db()
  if (!client) return []
  const userId = await me()
  const { data, error } = await client.from("video_posts").select(COLUMNS).eq("status", "published").order("created_at", { ascending: false }).limit(200)
  fail(error)
  const rows = data as unknown as Row[]
  const liked = await likedBy(
    userId,
    rows.map((r) => r.id)
  )
  return rows.map((r) => fromRow(r, userId, liked))
}

/** The signed-in member's drafts from the shot builder, newest first. */
export async function listMyDrafts(): Promise<VideoPost[]> {
  const client = db()
  const userId = await me()
  if (!client || !userId) return []
  const { data, error } = await client.from("video_posts").select(COLUMNS).eq("author_id", userId).eq("status", "draft").order("updated_at", { ascending: false }).limit(50)
  fail(error)
  return (data as unknown as Row[]).map((r) => fromRow(r, userId, new Set()))
}

export async function getVideo(id: string): Promise<VideoPost | null> {
  const client = db()
  if (!client || !isUuid(id)) return null
  const userId = await me()
  const { data, error } = await client.from("video_posts").select(COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  if (!data) return null
  const row = data as unknown as Row
  return fromRow(row, userId, await likedBy(userId, [row.id]))
}

/** Tags in use, most used first. */
export function videoTags(list: VideoPost[]): string[] {
  const n = new Map<string, number>()
  for (const v of list) for (const t of v.tags) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}

/** Models in use, most used first (case-insensitive, shown as first written). */
export function videoModels(list: VideoPost[]): string[] {
  const n = new Map<string, { label: string; count: number }>()
  for (const v of list) {
    const key = v.model.trim().toLowerCase()
    if (!key) continue
    const e = n.get(key)
    n.set(key, { label: e?.label ?? v.model.trim(), count: (e?.count ?? 0) + 1 })
  }
  return [...n.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((e) => e.label)
}

// ─── Writing ────────────────────────────────────────────────────────────────────────────────────────────────

export function cleanTags(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeTag).filter((t) => TAG.test(t)))].slice(0, LIMITS.tags)
}

/** Checks a post before it goes to the database; returns a message for people, or null. */
export function validateVideo(v: NewVideo): string | null {
  const title = v.title.trim()
  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) return "Give the video a title of 3 to 120 characters."
  if (v.status === "published") {
    if (!v.videoUrl.trim()) return "Add the video: a YouTube or Vimeo link, or an uploaded file."
    if (!parseVideoUrl(v.videoUrl)) return "That link is not one Nexverse can play. Use a YouTube or Vimeo link, or upload an MP4 or WebM file."
  }
  if (v.posterUrl && !POSTER.test(v.posterUrl)) return "That poster image cannot be used."
  if (v.prompt.length > LIMITS.prompt) return `Prompts can be up to ${LIMITS.prompt} characters.`
  if (v.model.length > LIMITS.model || v.tool.length > LIMITS.tool) return "Keep the model and tool names under 80 characters."
  return null
}

function toRow(v: NewVideo) {
  const source = v.videoUrl.trim() ? parseVideoUrl(v.videoUrl) : null
  return {
    status: v.status,
    title: v.title.trim(),
    video_url: source ? canonicalUrl(source) : null,
    poster_url: v.posterUrl || (source?.kind === "youtube" ? youtubePoster(source.id) : null),
    prompt: v.prompt.trim(),
    model: v.model.trim(),
    tool: v.tool.trim(),
    settings: v.settings,
    tags: cleanTags(v.tags),
  }
}

export async function createVideo(v: NewVideo): Promise<VideoPost> {
  const problem = validateVideo(v)
  if (problem) throw new Error(problem)
  const userId = await requireMe()
  const { data, error } = await db()!.from("video_posts").insert(toRow(v)).select(COLUMNS).single()
  fail(error)
  return fromRow(data as unknown as Row, userId, new Set())
}

/** Edits your own post (or publishes a draft by giving it a video). */
export async function updateVideo(id: string, v: NewVideo): Promise<VideoPost> {
  const problem = validateVideo(v)
  if (problem) throw new Error(problem)
  const userId = await requireMe()
  const { data, error } = await db()!.from("video_posts").update(toRow(v)).eq("id", id).eq("author_id", userId).select(COLUMNS).maybeSingle()
  fail(error)
  if (!data) throw new Error("That post is gone or is not yours.")
  return fromRow(data as unknown as Row, userId, new Set())
}

/** Deletes a post: your own, or any post if you are staff (the database decides). Its uploaded files go too. */
export async function deleteVideo(post: Pick<VideoPost, "id" | "videoUrl" | "posterUrl" | "mine">) {
  await requireMe()
  const client = db()!
  const { data, error } = await client.from("video_posts").delete().eq("id", post.id).select("id")
  fail(error)
  if (!data?.length) throw new Error("That post is gone or you cannot delete it.")
  if (post.mine) {
    const paths = [post.videoUrl, post.posterUrl].map((u) => (u ? storagePath(u) : null)).filter((p): p is string => Boolean(p))
    if (paths.length) await client.storage.from("videos").remove(paths).catch(() => {})
  }
}

/** Staff only: hide or unhide a post (it stays visible to its author). Logged in the moderation log. */
export async function moderateVideo(id: string, act: "hide" | "unhide" | "remove", note = "") {
  await requireMe()
  const { error } = await db()!.rpc("moderate_video", { target: id, act, note })
  fail(error)
}

export async function setVideoLike(id: string, on: boolean) {
  const userId = await requireMe()
  const client = db()!
  const { error } = on ? await client.from("video_likes").insert({ video_id: id }) : await client.from("video_likes").delete().eq("video_id", id).eq("user_id", userId)
  if (error && !(on && /duplicate key/.test(error.message))) fail(error)
}

// ─── Uploads ────────────────────────────────────────────────────────────────────────────────────────────────

const storagePath = (url: string) => url.match(/\/storage\/v1\/object\/public\/videos\/([0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100})$/)?.[1] ?? null

/** True when files can be uploaded (a database is connected). Signing in is checked on upload. */
export const canUpload = () => live

/**
 * Uploads a clip (MP4 or WebM) or a poster (JPEG, PNG or WebP) to "videos/<your id>/" and returns its public
 * address. Up to 25 MB per file; the database also caps files per member.
 */
export async function uploadVideoFile(file: File, kind: "video" | "poster"): Promise<string> {
  const types: Record<string, string> = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES
  const ext = types[file.type]
  if (!ext) throw new Error(kind === "video" ? "Upload an MP4 or WebM video." : "Use a JPEG, PNG or WebP image for the poster.")
  if (file.size > (kind === "video" ? MAX_UPLOAD_BYTES : 3 * 1024 * 1024)) throw new Error(kind === "video" ? `Videos can be up to ${MAX_UPLOAD_MB} MB. Trim it or share a YouTube or Vimeo link instead.` : "Use a poster image under 3 MB.")
  const userId = await requireMe()
  const path = `${userId}/${kind}-${Date.now()}.${ext}`
  const bucket = db()!.storage.from("videos")
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
  if (error) throw new Error(friendly(/row-level security/.test(error.message) ? "You have uploaded a lot today. Try again tomorrow, or share a YouTube or Vimeo link." : error.message))
  return bucket.getPublicUrl(path).data.publicUrl
}

/** Removes an upload that was never used in a post (the share form was abandoned or the file replaced). */
export async function discardUpload(url: string) {
  const path = storagePath(url)
  const client = db()
  if (path && client) await client.storage.from("videos").remove([path]).catch(() => {})
}

// ─── Builder hand-off ───────────────────────────────────────────────────────────────────────────────────────

/** The builder's address with a shot filled in, for "remix this prompt". */
export function remixHref(settings: Record<string, unknown>, prompt: string): string {
  const shot = shotFrom(settings)
  const hasShot = shot.subject || shot.action || shot.setting
  const q = new URLSearchParams()
  if (hasShot) q.set("shot", JSON.stringify(shot))
  else if (prompt) q.set("prompt", prompt.slice(0, 1500))
  return `/video/builder${q.size ? `?${q.toString()}` : ""}`
}
