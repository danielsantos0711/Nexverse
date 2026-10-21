import { revalidateTag } from "next/cache"
import { after, connection } from "next/server"
import { AuthError, cronCaller, editorCaller, fail, isCron, limited, NO_STORE } from "@/lib/newsroom/auth"
import { tick } from "@/lib/newsroom/engine/engine"

/*
 * One tick of the research engine (src/lib/newsroom/engine/engine.ts).
 *
 * - Supabase pg_cron calls this every ten minutes through pg_net (job "nexverse-newsroom-tick", which reads the
 *   address and the secret from Supabase Vault), with `Authorization: Bearer ${CRON_SECRET}`. The tick acts as
 *   the service role (SUPABASE_SERVICE_ROLE_KEY). Vercel's daily cron (vercel.json) calls it too, as a fallback.
 * - Editors can call it with their own session (the "Run now" button); row level security applies.
 *
 * It answers at once and does the work after the response (next/server `after`), so pg_net's 20-second timeout
 * never cuts a tick short; the engine's own lock keeps two ticks from working at the same time.
 */

export const maxDuration = 300

async function handle(request: Request): Promise<Response> {
  await connection()
  try {
    const cron = isCron(request)
    const caller = cron ? cronCaller() : await editorCaller(request, "news.write")
    if (limited(cron ? "tick:cron" : `tick:${caller.kind === "member" ? caller.id : ""}`, cron ? 20 : 6, 3_600_000)) throw new AuthError("The engine was started many times this hour. Try again later.", 429)
    const startedAt = Date.now()
    after(async () => {
      try {
        const s = await tick({ db: caller.db, trigger: cron ? "cron" : "manual", canPublish: caller.canPublish, deadline: startedAt + 270_000 })
        if (s.published > 0) revalidateTag("newsroom", "max")
        if (s.status === "failed") console.warn("[newsroom] tick failed:", s.note)
      } catch (err) {
        console.error("[newsroom] tick:", err instanceof Error ? err.message : err)
      }
    })
    return Response.json({ accepted: true, at: new Date(startedAt).toISOString() }, { status: 202, headers: NO_STORE })
  } catch (err) {
    return fail(err)
  }
}

export const GET = handle
export const POST = handle
