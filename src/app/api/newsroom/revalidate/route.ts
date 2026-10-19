import { revalidateTag } from "next/cache"
import { connection } from "next/server"
import { editorCaller, fail, limited, NO_STORE } from "@/lib/newsroom/auth"

/** After an editor publishes or edits: the public news pages pick the change up on their next visit. */
export async function POST(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    if (!limited(`reval:${editor.id}`, 60, 600_000)) revalidateTag("newsroom", "max")
    return Response.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return fail(err)
  }
}
