import { connection } from "next/server"
import { checkUrlShape } from "@/lib/ai/safe-url"
import { AuthError, editorCaller, fail, limited, NO_STORE, readBody } from "@/lib/newsroom/auth"
import { draftFromPage, RunError } from "@/lib/newsroom/pipeline"
import { update } from "@/lib/newsroom/rest"

/*
 * Draft a story from one official page: a member's tip or a link an editor found. The page is fetched with
 * the same locks as every other server fetch, the free AI writes a draft, and the newsroom's checks decide
 * whether it is saved. Always a draft: an editor reads it before it goes out. Ten drafts an hour per editor.
 */

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    const body = await readBody(request)
    const url = typeof body.url === "string" ? body.url.trim() : ""
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
    const tipId = typeof body.tipId === "string" && UUID.test(body.tipId) ? body.tipId : null
    if (!url) throw new AuthError("Paste the link to the official page.", 400)
    try {
      checkUrlShape(url)
    } catch (err) {
      throw new AuthError((err as Error).message, 400)
    }
    if (limited(`draft:${editor.id}`, 10, 3_600_000)) throw new RunError("You drafted ten stories with AI this hour. Try again later.", 429)
    const story = await draftFromPage(editor.db, url, note)
    if (tipId) {
      await update(editor.db, "news_tips", `id=eq.${tipId}`, { status: "used", handled_by: editor.id, handled_at: new Date().toISOString(), story_id: story.id }).catch(() => {})
    }
    return Response.json({ story }, { headers: NO_STORE })
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: unknown }).code === "not_configured") {
      return Response.json({ error: { message: "AI is not switched on for this site yet. Write the story by hand, or try again once it is." } }, { status: 503, headers: NO_STORE })
    }
    return fail(err)
  }
}
