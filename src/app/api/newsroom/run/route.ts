import { revalidateTag } from "next/cache"
import { connection } from "next/server"
import { cronCaller, editorCaller, fail, isCron, limited, NO_STORE } from "@/lib/newsroom/auth"
import { RunError, runNewsroom } from "@/lib/newsroom/pipeline"

/*
 * One newsroom run: collect the sources, store new signals, have the free AI write drafts.
 *
 * - Vercel cron (vercel.json "crons") calls GET with `Authorization: Bearer ${CRON_SECRET}` once a day and
 *   the run acts as the service role (SUPABASE_SERVICE_ROLE_KEY, server only).
 * - "Collect now" in /admin/newsroom calls POST with the editor's own access token, so row level security
 *   applies; it works without the service key.
 *
 * The database allows one run every five minutes whoever starts it; each editor may also start at most
 * three runs an hour from this server.
 */

export const maxDuration = 300

async function handle(request: Request): Promise<Response> {
  await connection()
  try {
    const caller = isCron(request) ? cronCaller() : await editorCaller(request, "news.write")
    const key = caller.kind === "cron" ? "cron" : `run:${caller.id}`
    if (limited(key, caller.kind === "cron" ? 2 : 3, 3_600_000)) throw new RunError("The newsroom ran several times this hour already. Try again later.", 429)
    const summary = await runNewsroom({ db: caller.db, trigger: caller.kind === "cron" ? "cron" : "manual", canPublish: caller.canPublish, deadline: Date.now() + 240_000 })
    if (summary.published > 0) revalidateTag("newsroom", "max")
    return Response.json(summary, { headers: NO_STORE })
  } catch (err) {
    return fail(err)
  }
}

export const GET = handle
export const POST = handle
