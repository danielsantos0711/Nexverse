import { connection } from "next/server"
import { checkUrlShape } from "@/lib/ai/safe-url"
import { isDepth, readSources, type Depth } from "@/lib/newsroom"
import { AuthError, editorCaller, fail, limited, NO_STORE, readBody } from "@/lib/newsroom/auth"
import { draftFromPage, RunError } from "@/lib/newsroom/pipeline"
import { select, update } from "@/lib/newsroom/rest"

/*
 * Research and draft a story from one official page: a member's tip or a link an editor found. Or, with a
 * storyId, research an existing draft again from its own sources and rewrite it in place. The pages are
 * fetched with the same locks as every other server fetch, the free AI writes at the chosen depth (gather,
 * brief, write, fact check, cover), and the newsroom's checks decide whether it is saved. Always a draft:
 * an editor reads it before it goes out. Ten AI drafts an hour per editor.
 */

export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    const body = await readBody(request)
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
    const tipId = typeof body.tipId === "string" && UUID.test(body.tipId) ? body.tipId : null
    const storyId = typeof body.storyId === "string" && UUID.test(body.storyId) ? body.storyId : null
    const depth: Depth | undefined = isDepth(body.depth) ? body.depth : undefined
    let url = typeof body.url === "string" ? body.url.trim() : ""
    let extraUrls: string[] = []

    if (storyId) {
      // A rewrite: the story's first source is the main page, the others are read as related pages.
      const rows = await select<{ status: string; sources: unknown }>(editor.db, "news_stories", `id=eq.${storyId}&select=status,sources`)
      if (!rows[0]) throw new AuthError("That story is not there any more.", 404)
      if (rows[0].status === "published" || rows[0].status === "scheduled") throw new AuthError("Unpublish the story before rewriting it; the rewrite is a draft.", 409)
      const sources = readSources(rows[0].sources)
      if (!sources.length) throw new AuthError("The story has no sources to research from. Add one first.", 400)
      url = sources[0].url
      extraUrls = sources.slice(1).map((s) => s.url)
    }
    if (!url) throw new AuthError("Paste the link to the official page.", 400)
    try {
      checkUrlShape(url)
    } catch (err) {
      throw new AuthError((err as Error).message, 400)
    }
    if (limited(`draft:${editor.id}`, 10, 3_600_000)) throw new RunError("You drafted ten stories with AI this hour. Try again later.", 429)
    const result = await draftFromPage(editor.db, url, note, { depth, replace: storyId ?? undefined, extraUrls })
    if (tipId) {
      await update(editor.db, "news_tips", `id=eq.${tipId}`, { status: "used", handled_by: editor.id, handled_at: new Date().toISOString(), story_id: result.story.id }).catch(() => {})
    }
    return Response.json(result, { headers: NO_STORE })
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: unknown }).code === "not_configured") {
      return Response.json({ error: { message: "AI is not switched on for this site yet. Write the story by hand, or try again once it is." } }, { status: 503, headers: NO_STORE })
    }
    if (err instanceof Error && "code" in err && (err as { code: unknown }).code === "rate_limited") {
      return Response.json({ error: { message: err.message } }, { status: 429, headers: NO_STORE })
    }
    return fail(err)
  }
}
