import { connection } from "next/server"
import { NEWSROOM_DEFAULTS, readCandidates, readNewsroomSettings, readSources, type CoverCandidate } from "@/lib/newsroom"
import { AuthError, editorCaller, fail, limited, NO_STORE, readBody } from "@/lib/newsroom/auth"
import { coverQuery, findCovers } from "@/lib/newsroom/cover"
import type { Doc } from "@/lib/newsroom/gather"
import { readPage } from "@/lib/newsroom/page"
import { urlKey } from "@/lib/newsroom/parse"
import { select, update } from "@/lib/newsroom/rest"

/*
 * The cover gallery's search: for one story, the images its source pages offer, free-licensed photos from
 * Openverse and Wikimedia Commons for the editor's words (or the headline's), and the generated cover. Every
 * image is fetched to prove it loads and to read its size. What is found is kept with the story, next to
 * what was found before, so the gallery does not have to search again. No AI is used.
 */

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    const body = await readBody(request)
    const storyId = typeof body.storyId === "string" && UUID.test(body.storyId) ? body.storyId : ""
    if (!storyId) throw new AuthError("Which story?", 400)
    const asked = typeof body.query === "string" ? body.query.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : ""
    if (limited(`covers:${editor.id}`, 20, 600_000)) throw new AuthError("That is a lot of searches. Wait a few minutes.", 429)

    type Row = { title: string; sources: unknown; cover_candidates?: unknown }
    let rows: Row[]
    try {
      rows = await select<Row>(editor.db, "news_stories", `id=eq.${storyId}&select=title,sources,cover_candidates`)
    } catch {
      rows = await select<Row>(editor.db, "news_stories", `id=eq.${storyId}&select=title,sources`)
    }
    const story = rows[0]
    if (!story) throw new AuthError("That story is not there any more.", 404)

    const settingsRows = await select<{ value: unknown }>(editor.db, "site_settings", "key=eq.newsroom&select=value").catch(() => [])
    const policy = settingsRows.length ? readNewsroomSettings(settingsRows[0].value).cover : NEWSROOM_DEFAULTS.cover

    // The story's own sources, read through the page cache, offer their images.
    const sources = readSources(story.sources).slice(0, 4)
    const pages = await Promise.all(sources.map((s) => readPage(s.url, { db: editor.db, timeoutMs: 8_000 })))
    const docs: Doc[] = []
    pages.forEach((p, i) => {
      if (!p.ok) return
      docs.push({ n: i + 1, url: p.page.url, title: p.page.title || sources[i].title, publisher: sources[i].publisher, publishedAt: p.page.publishedAt, role: i === 0 ? "primary" : "related", description: p.page.description, text: "", internalOnly: false, images: p.page.images })
    })
    const query = coverQuery(story.title, asked)
    // Searching on purpose: every tier, whatever the automatic order is.
    const found = await findCovers({ docs, title: story.title, query, policy: { ...policy, order: ["source", "free", "generated"] } })

    // Keep the new finds first, then what the story already had, without duplicates.
    const merged: CoverCandidate[] = []
    const seen = new Set<string>()
    for (const c of [...found.candidates, ...readCandidates(story.cover_candidates)]) {
      const key = c.kind === "generated" ? "generated" : urlKey(c.url)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(c)
    }
    await update(editor.db, "news_stories", `id=eq.${storyId}`, { cover_candidates: merged.slice(0, 24) }).catch(() => {})
    return Response.json({ candidates: merged.slice(0, 24), query, errors: found.errors.slice(0, 8) }, { headers: NO_STORE })
  } catch (err) {
    return fail(err)
  }
}
