"use client"

import { parseVideoUrl } from "@/components/fx/video-source"
import { isSafeHref } from "@/lib/site-settings"
import { db, live } from "@/lib/supabase"

/*
 * Custom pages: the admins build them from blocks in /admin/pages and they show at /pages/<slug>. A page is one
 * row in public.site_pages (…_cms.sql); drafts are visible to page editors only (row level security), and every
 * save keeps a revision. Blocks are plain JSON, cleaned on the way in and on the way out, so a bad block can
 * never break a page or smuggle in a script: text is Markdown rendered by the site's safe renderer, links must
 * pass isSafeHref, images must be https, and videos are YouTube (no-cookie) or Vimeo ids only.
 */

// ─── Blocks ─────────────────────────────────────────────────────────────────────────────────────────────────

export type Tone = "info" | "success" | "warning" | "launch"
export type ListSource = "threads" | "news" | "projects"

export type Block =
  | { id: string; type: "heading"; text: string; level: 2 | 3 }
  | { id: string; type: "text"; markdown: string }
  | { id: string; type: "image"; src: string; alt: string; caption: string; wide: boolean }
  | { id: string; type: "callout"; tone: Tone; title: string; body: string }
  | { id: string; type: "buttons"; items: { label: string; href: string; primary: boolean }[] }
  | { id: string; type: "faq"; items: { q: string; a: string }[] }
  | { id: string; type: "list"; source: ListSource; title: string; count: number }
  | { id: string; type: "gallery"; images: { src: string; alt: string }[] }
  | { id: string; type: "video"; provider: "youtube" | "vimeo"; videoId: string; title: string }
  | { id: string; type: "divider" }
  | { id: string; type: "columns"; columns: string[] }

export type BlockType = Block["type"]

export const BLOCK_TYPES: { type: BlockType; label: string; blurb: string; icon: string }[] = [
  { type: "heading", label: "Heading", blurb: "A section title", icon: "file-text" },
  { type: "text", label: "Text", blurb: "Paragraphs, lists and links in Markdown", icon: "book-open" },
  { type: "image", label: "Image", blurb: "One picture with alt text and a caption", icon: "image" },
  { type: "callout", label: "Callout", blurb: "A highlighted note", icon: "megaphone" },
  { type: "buttons", label: "Buttons", blurb: "One to three links as buttons", icon: "link" },
  { type: "faq", label: "FAQ", blurb: "Questions that open to their answers", icon: "circle-help" },
  { type: "list", label: "Content list", blurb: "The latest threads, news or projects", icon: "layers" },
  { type: "gallery", label: "Gallery", blurb: "A grid of pictures", icon: "palette" },
  { type: "video", label: "Video", blurb: "YouTube or Vimeo, loaded on click", icon: "satellite" },
  { type: "columns", label: "Columns", blurb: "Two or three columns of text", icon: "layers" },
  { type: "divider", label: "Divider", blurb: "A quiet line between sections", icon: "orbit" },
]

export const TONES: { id: Tone; label: string }[] = [
  { id: "info", label: "Note" },
  { id: "success", label: "Good news" },
  { id: "warning", label: "Heads-up" },
  { id: "launch", label: "Launch" },
]

export const LIST_SOURCES: { id: ListSource; label: string }[] = [
  { id: "threads", label: "Latest forum threads" },
  { id: "news", label: "Latest news" },
  { id: "projects", label: "Newest projects" },
]

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10))

export function newBlock(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case "heading":
      return { id, type, text: "", level: 2 }
    case "text":
      return { id, type, markdown: "" }
    case "image":
      return { id, type, src: "", alt: "", caption: "", wide: false }
    case "callout":
      return { id, type, tone: "info", title: "", body: "" }
    case "buttons":
      return { id, type, items: [{ label: "", href: "", primary: true }] }
    case "faq":
      return { id, type, items: [{ q: "", a: "" }] }
    case "list":
      return { id, type, source: "threads", title: "", count: 5 }
    case "gallery":
      return { id, type, images: [] }
    case "video":
      return { id, type, provider: "youtube", videoId: "", title: "" }
    case "divider":
      return { id, type }
    case "columns":
      return { id, type, columns: ["", ""] }
  }
}

/** An https address for an image, or "" when it is not one. */
export function safeImage(src: unknown): string {
  if (typeof src !== "string") return ""
  try {
    const u = new URL(src.trim())
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : ""
  } catch {
    return ""
  }
}

/** Finds the video id in a YouTube or Vimeo address. Null for anything else (files and other sites are not embedded). */
export function parseVideo(input: string): { provider: "youtube" | "vimeo"; videoId: string } | null {
  const v = parseVideoUrl(input)
  if (v?.kind === "youtube") return { provider: "youtube", videoId: v.id }
  if (v?.kind === "vimeo" && !v.hash) return { provider: "vimeo", videoId: v.id }
  return null
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})

/** Cleans one block from storage or the editor. Unknown or broken blocks become null and are left out. */
export function cleanBlock(raw: unknown): Block | null {
  const b = rec(raw)
  const id = str(b.id, 40) || newId()
  switch (b.type) {
    case "heading":
      return { id, type: "heading", text: str(b.text, 160), level: b.level === 3 ? 3 : 2 }
    case "text":
      return { id, type: "text", markdown: str(b.markdown, 20000) }
    case "image":
      return { id, type: "image", src: safeImage(b.src), alt: str(b.alt, 200), caption: str(b.caption, 300), wide: b.wide === true }
    case "callout":
      return { id, type: "callout", tone: TONES.some((t) => t.id === b.tone) ? (b.tone as Tone) : "info", title: str(b.title, 120), body: str(b.body, 2000) }
    case "buttons":
      return {
        id,
        type: "buttons",
        items: arr(b.items)
          .slice(0, 3)
          .map((x) => rec(x))
          .map((x) => ({ label: str(x.label, 40), href: str(x.href, 400), primary: x.primary === true })),
      }
    case "faq":
      return { id, type: "faq", items: arr(b.items).slice(0, 30).map((x) => ({ q: str(rec(x).q, 200), a: str(rec(x).a, 4000) })) }
    case "list":
      return {
        id,
        type: "list",
        source: LIST_SOURCES.some((s) => s.id === b.source) ? (b.source as ListSource) : "threads",
        title: str(b.title, 120),
        count: Math.min(12, Math.max(1, Math.round(Number(b.count) || 5))),
      }
    case "gallery":
      return {
        id,
        type: "gallery",
        images: arr(b.images)
          .slice(0, 24)
          .map((x) => ({ src: safeImage(rec(x).src), alt: str(rec(x).alt, 200) })),
      }
    case "video": {
      const provider = b.provider === "vimeo" ? "vimeo" : "youtube"
      const videoId = str(b.videoId, 20)
      const ok = provider === "youtube" ? /^[A-Za-z0-9_-]{11}$/.test(videoId) : /^\d{1,12}$/.test(videoId)
      return { id, type: "video", provider, videoId: ok ? videoId : "", title: str(b.title, 160) }
    }
    case "divider":
      return { id, type: "divider" }
    case "columns": {
      const cols = arr(b.columns).slice(0, 3).map((c) => str(c, 6000))
      return { id, type: "columns", columns: cols.length >= 2 ? cols : [...cols, "", ""].slice(0, 2) }
    }
    default:
      return null
  }
}

export const cleanBlocks = (raw: unknown) => arr(raw).slice(0, 80).map(cleanBlock).filter((b): b is Block => b !== null)

/** What is wrong with a block before publishing, in a sentence, or null. Drafts may be incomplete. */
export function blockProblem(b: Block): string | null {
  switch (b.type) {
    case "heading":
      return b.text.trim() ? null : "The heading is empty."
    case "text":
      return b.markdown.trim() ? null : "The text block is empty."
    case "image":
      if (!b.src) return "Pick or upload an image."
      return b.alt.trim() ? null : "Describe the image (alt text) for people who cannot see it."
    case "callout":
      return b.title.trim() || b.body.trim() ? null : "The callout is empty."
    case "buttons":
      if (!b.items.length) return "Add at least one button."
      for (const i of b.items) {
        if (!i.label.trim()) return "Every button needs a label."
        if (!isSafeHref(i.href)) return `“${i.label || "A button"}” needs a link: a path on this site (/forum) or an https address.`
      }
      return null
    case "faq":
      if (!b.items.length) return "Add at least one question."
      return b.items.every((i) => i.q.trim() && i.a.trim()) ? null : "Every question needs an answer."
    case "gallery":
      if (b.images.length < 2) return "A gallery needs at least two images."
      return b.images.every((i) => i.src && i.alt.trim()) ? null : "Every image in the gallery needs alt text."
    case "video":
      return b.videoId ? null : "Paste a YouTube or Vimeo link."
    case "columns":
      return b.columns.some((c) => c.trim()) ? null : "The columns are empty."
    default:
      return null
  }
}

// ─── Pages ──────────────────────────────────────────────────────────────────────────────────────────────────

export type PageStatus = "draft" | "published"

export type SitePage = {
  id: string
  slug: string
  title: string
  description: string
  blocks: Block[]
  status: PageStatus
  showInMenu: boolean
  position: number
  publishedAt: string | null
  updatedAt: string
  updatedBy: { id: string; name: string } | null
}

export const PAGE_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/
export const pagePath = (slug: string) => `/pages/${slug}`

const COLUMNS = "id, slug, title, description, blocks, status, show_in_menu, position, published_at, updated_at, editor:profiles!site_pages_updated_by_fkey(id, name)"

type Row = {
  id: string
  slug: string
  title: string
  description: string
  blocks: unknown
  status: PageStatus
  show_in_menu: boolean
  position: number
  published_at: string | null
  updated_at: string
  editor: { id: string; name: string } | null
}

const fromRow = (r: Row): SitePage => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  blocks: cleanBlocks(r.blocks),
  status: r.status,
  showInMenu: r.show_in_menu,
  position: r.position,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
  updatedBy: r.editor,
})

/** True when the error means the pages table is not in this database yet. */
export const isMissing = (e: { message: string; code?: string } | null) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/.test(e.message)))

function explain(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (isMissing(error)) throw new Error("Custom pages are not switched on in the database yet (migration …_cms.sql).")
  if (error.code === "23505") throw new Error("Another page already uses that address. Pick another slug.")
  if (error.code === "23514") throw new Error("Something does not fit: the slug is lowercase letters, numbers and dashes, and the title is up to 120 characters.")
  if (error.code === "42501" || /row-level security/i.test(error.message)) throw new Error("Your account cannot edit pages.")
  throw new Error(error.message)
}

function need() {
  const c = db()
  if (!c) throw new Error("Custom pages need the database. Connect Supabase first.")
  return c
}

/** Every page you may see, in menu order: published ones for everyone, drafts too for page editors. */
export async function listPages(): Promise<SitePage[]> {
  const c = db()
  if (!c) return []
  const { data, error } = await c.from("site_pages").select(COLUMNS).order("position").order("title")
  if (isMissing(error)) return []
  explain(error)
  return (data as unknown as Row[]).map(fromRow)
}

/** A page by its address, or null. Drafts come back only for page editors (row level security). */
export async function getPageBySlug(slug: string): Promise<SitePage | null> {
  if (!PAGE_SLUG.test(slug)) return null
  const c = db()
  if (!c) return null
  const { data, error } = await c.from("site_pages").select(COLUMNS).eq("slug", slug).maybeSingle()
  if (isMissing(error)) return null
  explain(error)
  return data ? fromRow(data as unknown as Row) : null
}

export async function getPage(id: string): Promise<SitePage | null> {
  const c = need()
  const { data, error } = await c.from("site_pages").select(COLUMNS).eq("id", id).maybeSingle()
  explain(error)
  return data ? fromRow(data as unknown as Row) : null
}

export type PageDraft = Pick<SitePage, "slug" | "title" | "description" | "blocks" | "status" | "showInMenu">

export function pageProblems(p: PageDraft): string[] {
  const out: string[] = []
  if (!PAGE_SLUG.test(p.slug)) out.push("The address (slug) is 1 to 60 lowercase letters, numbers and dashes.")
  if (!p.title.trim()) out.push("Give the page a title.")
  if (p.title.length > 120) out.push("The title is up to 120 characters.")
  if (p.description.length > 300) out.push("The search description is up to 300 characters.")
  if (p.status === "published") {
    if (!p.blocks.length) out.push("Add at least one block before publishing.")
    p.blocks.forEach((b, i) => {
      const problem = blockProblem(b)
      if (problem) out.push(`Block ${i + 1}: ${problem}`)
    })
  }
  return out
}

const toRow = (p: PageDraft) => ({
  slug: p.slug,
  title: p.title.trim(),
  description: p.description.trim(),
  blocks: cleanBlocks(p.blocks),
  status: p.status,
  show_in_menu: p.showInMenu,
})

export async function createPage(p: PageDraft): Promise<SitePage> {
  const c = need()
  const { data: last } = await c.from("site_pages").select("position").order("position", { ascending: false }).limit(1)
  const position = ((last as { position: number }[] | null)?.[0]?.position ?? -1) + 1
  const { data, error } = await c
    .from("site_pages")
    .insert({ ...toRow(p), position })
    .select(COLUMNS)
    .single()
  explain(error)
  return fromRow(data as unknown as Row)
}

export async function savePage(id: string, p: PageDraft): Promise<SitePage> {
  const c = need()
  const { data, error } = await c.from("site_pages").update(toRow(p)).eq("id", id).select(COLUMNS).maybeSingle()
  explain(error)
  if (!data) throw new Error("That page is not here any more, or your account cannot edit it.")
  return fromRow(data as unknown as Row)
}

export async function deletePage(id: string) {
  const { error } = await need().from("site_pages").delete().eq("id", id)
  explain(error)
}

export async function reorderPages(ids: string[]) {
  const { error } = await need().rpc("cms_reorder", { what: "site_pages", slugs: ids })
  explain(error)
}

export type Revision = { id: number; title: string; description: string; blocks: Block[]; status: PageStatus; savedAt: string; savedBy: string | null }

export async function listRevisions(pageId: string): Promise<Revision[]> {
  const c = db()
  if (!c) return []
  const { data, error } = await c
    .from("site_page_revisions")
    .select("id, title, description, blocks, status, saved_at, saver:profiles!site_page_revisions_saved_by_fkey(name)")
    .eq("page_id", pageId)
    .order("saved_at", { ascending: false })
    .limit(30)
  if (error) return []
  return (data as unknown as { id: number; title: string; description: string; blocks: unknown; status: PageStatus; saved_at: string; saver: { name: string } | null }[]).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    blocks: cleanBlocks(r.blocks),
    status: r.status,
    savedAt: r.saved_at,
    savedBy: r.saver?.name ?? null,
  }))
}

// ─── Media ──────────────────────────────────────────────────────────────────────────────────────────────────

export const MEDIA_BUCKET = "site-media"
export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]
export const MEDIA_MAX = 5 * 1024 * 1024

export type MediaFile = { name: string; url: string; size: number; createdAt: string }

/** Uploads an image to the site's media bucket and returns its public address. Page editors only. */
export async function uploadMedia(file: File): Promise<string> {
  const c = need()
  if (!MEDIA_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP, GIF or AVIF image.")
  if (file.size > MEDIA_MAX) throw new Error("Images are up to 5 MB.")
  const ext = file.type.split("/")[1].replace("jpeg", "jpg")
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image"
  const path = `pages/${Date.now().toString(36)}-${base}.${ext}`
  const { error } = await c.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("The media library is not switched on in the database yet (migration …_cms.sql).")
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error("Your account cannot upload images.")
    throw new Error(error.message)
  }
  return c.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function listMedia(): Promise<MediaFile[]> {
  const c = db()
  if (!c) return []
  const { data, error } = await c.storage.from(MEDIA_BUCKET).list("pages", { limit: 100, sortBy: { column: "created_at", order: "desc" } })
  if (error || !data) return []
  return data
    .filter((f) => f.id && f.name)
    .map((f) => ({
      name: f.name,
      url: c.storage.from(MEDIA_BUCKET).getPublicUrl(`pages/${f.name}`).data.publicUrl,
      size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
      createdAt: f.created_at ?? "",
    }))
}

// ─── Content lists ──────────────────────────────────────────────────────────────────────────────────────────

export type ListItem = { id: string; title: string; href: string; meta: string; date: string }

/** The latest threads, news or projects from the database, for a content list block. Empty when unavailable. */
export async function loadList(source: ListSource, count: number): Promise<ListItem[]> {
  const c = db()
  if (!c) return []
  if (source === "threads") {
    const { data } = await c.from("questions").select("id, title, created_at, author:profiles(name)").order("created_at", { ascending: false }).limit(count)
    return ((data as unknown as { id: string; title: string; created_at: string; author: { name: string } | null }[] | null) ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      href: `/forum/${r.id}`,
      meta: r.author?.name ?? "A member",
      date: r.created_at,
    }))
  }
  if (source === "news") {
    // The AI newsroom's stories when that table exists; otherwise news members shared.
    const stories = await c.from("news_stories").select("id, slug, title, dek, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(count)
    if (!stories.error && stories.data?.length) {
      return (stories.data as { id: string; slug: string; title: string; dek: string; published_at: string }[]).map((r) => ({ id: r.id, title: r.title, href: `/news/${r.slug}`, meta: r.dek, date: r.published_at }))
    }
    const { data } = await c.from("submissions").select("id, title, summary, created_at").eq("kind", "news").order("created_at", { ascending: false }).limit(count)
    return ((data as { id: string; title: string; summary: string | null; created_at: string }[] | null) ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      href: `/news/${r.id}`,
      meta: r.summary ?? "",
      date: r.created_at,
    }))
  }
  const { data } = await c.from("projects").select("id, name, kind, summary, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(count)
  return ((data as { id: string; name: string; kind: string; summary: string | null; published_at: string }[] | null) ?? []).map((r) => ({
    id: r.id,
    title: r.name,
    href: `/p/${r.id}`,
    meta: r.summary || r.kind,
    date: r.published_at,
  }))
}

export { live }
