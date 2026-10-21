import { askJson } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { field, isObject, str, strList } from "@/lib/ai/json"
import { fence, obj, systemJson, titleTagsRequest, tldrRequest } from "@/lib/ai/prompts"
import { hitsAsContext, KIND_LABEL, searchNexverse } from "@/lib/ai/retrieval"
import { aiRoute } from "@/lib/ai/route"

/*
 * The small structured AI helpers (components/ai/inline-ai.tsx), one route for all of them:
 *   "tags"     forum composer: a clearer title and tags, aligned with tags similar Nexverse threads use, plus
 *              those threads (possible duplicates) so the member can check before posting          (job "rewrite")
 *   "explain"  Lab tools, JSON form kept for older callers (the streamed form is /api/ai/stream)    (job "explain")
 *   "tldr"     news stories: TL;DR, three key points, why it matters, related Nexverse coverage     (job "summary")
 * Members only; aiRoute checks the session, the "ai.use" power and the daily allowance, and every answer is
 * labelled as AI output in the interface. `regenerate: true` skips the cache.
 */

export type HelperResult =
  | { task: "tags"; title: string; tags: string[]; similar: { url: string; title: string; kind: string }[] }
  | { task: "explain"; text: string; points: string[] }
  | { task: "tldr"; tldr: string; points: string[]; why: string; related: { url: string; title: string; kind: string }[] }

const bad = (): never => {
  throw new AiError(502, "bad_output", "The AI answer was incomplete. Try again.")
}

export const POST = aiRoute<HelperResult>({
  prepare(body, caller) {
    const task = str(body.task, 20)
    const fresh = body.regenerate === true ? { cache: false } : {}

    if (task === "tags") {
      const title = field(body, "title", { max: 300, optional: true, label: "Title" })
      const text = field(body, "body", { max: 8000, optional: true, label: "Post" })
      const category = field(body, "category", { max: 80, optional: true, label: "Category" })
      if ((title + text).trim().length < 12) throw new AiError(400, "bad_request", "Write a few words first, then ask for a title and tags.")
      return async () => {
        const hits = (await searchNexverse(`${title} ${text.slice(0, 300)}`, { token: caller.token, limit: 6 })).filter((h) => h.kind === "thread")
        const similar = hits.map((h, i) => `${i + 1}. ${h.title}`).join("\n")
        const { json, model } = await askJson({ ...titleTagsRequest({ title, body: text, category, similar: similar ? fence("similar_threads", similar) : "" }), ...fresh })
        if (!isObject(json)) bad()
        const j = json as Record<string, unknown>
        const t = str(j.title, 120)
        if (!t) bad()
        const tags = strList(j.tags, 5, 32)
          .map((x) => x.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9\- ]/g, "").trim().replace(/\s+/g, "-"))
          .filter(Boolean)
        return { data: { task: "tags", title: t, tags: [...new Set(tags)], similar: hits.slice(0, 3).map((h) => ({ url: h.url, title: h.title, kind: KIND_LABEL[h.kind] ?? h.kind })) }, model }
      }
    }

    if (task === "explain") {
      const tool = field(body, "tool", { max: 80, label: "Tool" })
      const result = field(body, "result", { max: 6000, min: 3, label: "Result" })
      return async () => {
        const { json, model } = await askJson({
          job: "explain",
          maxTokens: 700,
          system: systemJson(
            `A member used the "${tool}" calculator in the Nexverse Lab and wants its result explained. Return "text": two or three sentences on what their actual numbers mean in practice (quote the key number), and "points": two to four short caveats, levers or next steps that follow from those numbers. Only use the inputs and outputs given; when something depends on hardware or a provider, say so.`
          ),
          prompt: `Lab tool: ${tool}\n\n${fence("result", result)}`,
          schema: obj({ text: { type: "string" }, points: { type: "array", items: { type: "string" } } }),
          ...fresh,
        })
        if (!isObject(json)) bad()
        const j = json as Record<string, unknown>
        const text = str(j.text, 900)
        if (!text) bad()
        return { data: { task: "explain", text, points: strList(j.points, 4, 240) }, model }
      }
    }

    if (task === "tldr") {
      const title = field(body, "title", { max: 300, label: "Title" })
      const text = field(body, "body", { max: 40_000, min: 40, label: "Story" })
      const url = field(body, "url", { max: 200, optional: true, label: "Page" })
      return async () => {
        const hits = await searchNexverse(title, { token: caller.token, limit: 5, exclude: url ? [url] : [] })
        const { json, model } = await askJson({ ...tldrRequest({ title, body: text, related: hitsAsContext(hits) }), ...fresh })
        if (!isObject(json)) bad()
        const j = json as Record<string, unknown>
        const tldr = str(j.tldr, 600)
        if (!tldr) bad()
        const picked = Array.isArray(j.related) ? j.related.filter((n): n is number => typeof n === "number" && n >= 1 && n <= hits.length) : []
        const related = [...new Set(picked)].slice(0, 3).map((n) => hits[n - 1])
        return {
          data: { task: "tldr", tldr, points: strList(j.points, 3, 260), why: str(j.why, 300), related: related.map((h) => ({ url: h.url, title: h.title, kind: KIND_LABEL[h.kind] ?? h.kind })) },
          model,
        }
      }
    }
    throw new AiError(400, "bad_request", "Unknown helper.")
  },
})

export const maxDuration = 60
