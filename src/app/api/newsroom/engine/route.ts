import { revalidateTag } from "next/cache"
import { after, connection } from "next/server"
import { AuthError, editorCaller, fail, limited, NO_STORE, readBody } from "@/lib/newsroom/auth"
import { tick } from "@/lib/newsroom/engine/engine"
import { DecisionLog, enqueue } from "@/lib/newsroom/engine/queue"
import { engineState } from "@/lib/newsroom/engine/state"
import { DESK_ID, readEngineSettings, readMethods, readTimeline, type TimelineEntry } from "@/lib/newsroom/engine/types"
import { fileTarget } from "@/lib/newsroom/engine/watch"
import { insert, select, update, upsert } from "@/lib/newsroom/rest"

/*
 * Newsroom control (/admin/newsroom/control). Every call is the signed-in editor's own, so row level security
 * decides what they may change. POST { action, ... }:
 *
 *   state                       everything the page shows
 *   run                         start a research cycle now (the tick runs after the response)
 *   backfill {desks,days,perDesk}  the mass import: a wider window, a fixed number of stories per desk
 *   job {id, op: retry|cancel}
 *   lead {id, op: research|reject|apply|dismiss, reason?}
 *   settings {settings}         frequency, limits, rules, models, scouts (news.publish)
 *   desk {desk}                 add or change a desk (news.publish)
 *   watch {op: add|toggle, ...} leak watchers (news.publish to add)
 */

export const maxDuration = 300

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

async function handle(request: Request): Promise<Response> {
  await connection()
  try {
    const editor = await editorCaller(request, "news.write")
    const body = await readBody(request, 64_000)
    const action = str(body.action, 20) || "state"
    const db = editor.db
    const publisher = () => {
      if (!editor.canPublish) throw new AuthError("Only editors who can publish can change this.", 403)
    }
    const log = new DecisionLog(db, null)

    switch (action) {
      case "state":
        return Response.json(await engineState(db), { headers: NO_STORE })

      case "run":
      case "backfill": {
        if (limited(`engine:${editor.id}`, 8, 3_600_000)) throw new AuthError("You started the engine many times this hour. Try again later.", 429)
        const startedAt = Date.now()
        const backfill =
          action === "backfill"
            ? {
                desks: Array.isArray(body.desks) ? body.desks.filter((d): d is string => typeof d === "string" && DESK_ID.test(d)).slice(0, 20) : undefined,
                days: Math.min(30, Math.max(1, Number(body.days) || 7)),
                perDesk: Math.min(6, Math.max(1, Number(body.perDesk) || 2)),
              }
            : undefined
        if (backfill && backfill.desks && !backfill.desks.length) backfill.desks = undefined
        after(async () => {
          try {
            const s = await tick({ db, trigger: "manual", canPublish: editor.canPublish, deadline: startedAt + 270_000, forceCycle: action === "run", backfill })
            if (s.published > 0) revalidateTag("newsroom", "max")
          } catch (err) {
            console.error("[newsroom] manual tick:", err instanceof Error ? err.message : err)
          }
        })
        return Response.json({ accepted: true }, { status: 202, headers: NO_STORE })
      }

      case "job": {
        const id = Number(body.id)
        const op = str(body.op, 10)
        if (!Number.isInteger(id)) throw new AuthError("Which job?", 400)
        if (op === "retry") await update(db, "news_jobs", `id=eq.${id}&status=in.(failed,dead,cancelled)`, { status: "queued", attempts: 0, run_after: new Date().toISOString(), last_error: null, finished_at: null })
        else if (op === "cancel") await update(db, "news_jobs", `id=eq.${id}&status=eq.queued`, { status: "cancelled", finished_at: new Date().toISOString() })
        else throw new AuthError("Unknown job action.", 400)
        log.add({ agent: "human", action: `job ${op}`, outcome: "done", reason: `Job #${id}` })
        await log.flush()
        return Response.json({ ok: true }, { headers: NO_STORE })
      }

      case "lead": {
        const id = Number(body.id)
        const op = str(body.op, 10)
        const reason = str(body.reason, 400)
        const rows = await select<{ id: number; title: string; decision: string; proposal: Record<string, unknown> | null; story_id: string | null; match_story: string | null }>(db, "news_leads", `id=eq.${id}&select=id,title,decision,proposal,story_id,match_story`)
        const lead = rows[0]
        if (!lead) throw new AuthError("That lead is gone.", 404)
        if (op === "research") {
          await update(db, "news_leads", `id=eq.${id}`, { decision: "queued", reason: `An editor asked for research${reason ? `: ${reason}` : "."}`.slice(0, 800), decided_at: new Date().toISOString() })
          await enqueue(db, { kind: "research", payload: { lead: id }, priority: 30, dedupe: `research:${id}` })
        } else if (op === "reject" || op === "dismiss") {
          await update(db, "news_leads", `id=eq.${id}`, { decision: "rejected", reason: `Rejected by an editor${reason ? `: ${reason}` : "."}`.slice(0, 800), decided_at: new Date().toISOString() })
        } else if (op === "apply") {
          publisher()
          const p = lead.proposal ?? {}
          const target = lead.story_id ?? lead.match_story
          const entry = readTimeline([p.entry])[0] as TimelineEntry | undefined
          if (!target || !entry) throw new AuthError("This lead has no update to apply.", 400)
          const stories = await select<{ id: string; body: string; sources: unknown[]; timeline: unknown }>(db, "news_stories", `id=eq.${target}&select=id,body,sources,timeline`)
          const s = stories[0]
          if (!s) throw new AuthError("The story is gone.", 404)
          const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(entry.at))
          const newSources = Array.isArray(p.sources) ? p.sources.slice(0, 6) : []
          await update(db, "news_stories", `id=eq.${s.id}`, {
            body: `## Update, ${date}\n\n**${entry.title}.** ${entry.note}\n\n${s.body}`.slice(0, 20000),
            sources: [...(Array.isArray(s.sources) ? s.sources : []), ...newSources].slice(0, 12),
            timeline: [...readTimeline(s.timeline), entry].slice(-40),
            edit_reason: `update approved: ${entry.title}`.slice(0, 300),
          })
          await update(db, "news_leads", `id=eq.${id}`, { decision: "published", reason: "Update approved by an editor.", decided_at: new Date().toISOString() })
          revalidateTag("newsroom", "max")
        } else throw new AuthError("Unknown lead action.", 400)
        log.add({ agent: "human", action: `lead ${op}`, outcome: op === "apply" ? "published" : op === "research" ? "queued" : "rejected", reason: `${lead.title.slice(0, 160)}${reason ? `: ${reason}` : ""}`, leadId: id })
        await log.flush()
        return Response.json({ ok: true }, { headers: NO_STORE })
      }

      case "settings": {
        publisher()
        const settings = readEngineSettings(body.settings)
        await upsert(db, "site_settings", { key: "newsroom_engine", value: settings }, "key")
        log.add({ agent: "human", action: "settings", outcome: "saved", reason: `Cycle every ${settings.cycleMinutes} min; ${settings.limits.researchPerCycle} stories a cycle; auto-publish ${settings.rules.autoPublish ? "on" : "off"}; premium stages: ${Object.entries(settings.stages).filter(([, v]) => v.premium.enabled).map(([k]) => k).join(", ") || "none"}.` })
        await log.flush()
        return Response.json({ ok: true, settings }, { headers: NO_STORE })
      }

      case "desk": {
        publisher()
        const d = (body.desk ?? {}) as Record<string, unknown>
        const id = str(d.id, 32).toLowerCase()
        if (!DESK_ID.test(id)) throw new AuthError("A desk id is 2 to 31 lowercase letters, digits or dashes.", 400)
        const kinds = ["launch", "research", "policy", "industry", "tools", "rumor"]
        const row = {
          id,
          label: str(d.label, 40) || id,
          one: str(d.one, 30) || str(d.label, 30) || id,
          blurb: str(d.blurb, 200),
          scope: str(d.scope, 600),
          audience: str(d.audience, 200),
          kind: kinds.includes(String(d.kind)) ? String(d.kind) : "industry",
          priority: Math.min(5, Math.max(0, Math.round(Number(d.priority) || 0))),
          enabled: d.enabled !== false,
          hidden: d.hidden === true,
          leak_track: d.leakTrack === true,
          auto_publish: d.autoPublish === true,
          min_score: Math.min(100, Math.max(0, Math.round(Number(d.minScore) || 65))),
          methods: readMethods(d.methods),
          tint: typeof d.tint === "string" && /^#[0-9a-f]{6}$/i.test(d.tint) ? d.tint : null,
          sort: Math.round(Number(d.sort) || 100),
        }
        await upsert(db, "news_desks", row, "id")
        log.add({ agent: "human", action: "desk", outcome: "saved", reason: `${row.label}: priority ${row.priority}, ${row.enabled ? "on" : "off"}, auto-publish ${row.auto_publish ? "on" : "off"}.` })
        await log.flush()
        revalidateTag("newsroom", "max")
        return Response.json({ ok: true }, { headers: NO_STORE })
      }

      case "watch": {
        const op = str(body.op, 10)
        if (op === "toggle") {
          const id = str(body.id, 40)
          await update(db, "news_watch", `id=eq.${encodeURIComponent(id)}`, { enabled: body.enabled === true })
        } else if (op === "add") {
          publisher()
          const kind = body.kind === "page" ? "page" : "file"
          const target = str(body.target, 500)
          if (kind === "file" ? !fileTarget(target) : !/^https:\/\/\S{4,}$/.test(target)) throw new AuthError(kind === "file" ? "A file watcher is owner/repo:branch:path." : "A page watcher needs an https address.", 400)
          await insert(db, "news_watch", { kind, target, label: str(body.label, 80) || target.slice(0, 80), publisher: str(body.publisher, 80), pattern: str(body.pattern, 300), desk: DESK_ID.test(str(body.desk, 32)) ? str(body.desk, 32) : "rumor" })
        } else throw new AuthError("Unknown watcher action.", 400)
        return Response.json({ ok: true }, { headers: NO_STORE })
      }

      default:
        throw new AuthError("Unknown action.", 400)
    }
  } catch (err) {
    return fail(err)
  }
}

export const POST = handle
