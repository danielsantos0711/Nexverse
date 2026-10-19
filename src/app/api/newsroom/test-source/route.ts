import { connection } from "next/server"
import { toSource, type SourceRow } from "@/lib/newsroom"
import { AuthError, editorCaller, fail, limited, NO_STORE, readBody } from "@/lib/newsroom/auth"
import { collectSource } from "@/lib/newsroom/collect"
import { select } from "@/lib/newsroom/rest"

/** Staff check a source: fetch it now and show what it gives, without storing anything. */
export async function POST(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    const body = await readBody(request)
    const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : ""
    if (!id) throw new AuthError("Which source?", 400)
    if (limited(`test:${editor.id}`, 30, 600_000)) throw new AuthError("That is a lot of tests. Wait a few minutes.", 429)
    const rows = await select<SourceRow>(editor.db, "news_sources", `id=eq.${id}&select=*`)
    if (!rows[0]) throw new AuthError("That source is not there any more.", 404)
    const r = await collectSource(toSource(rows[0]))
    return Response.json(
      { ok: r.ok, count: r.items.length, sample: r.items.slice(0, 4).map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt })), error: r.ok ? null : r.error },
      { headers: NO_STORE }
    )
  } catch (err) {
    return fail(err)
  }
}
