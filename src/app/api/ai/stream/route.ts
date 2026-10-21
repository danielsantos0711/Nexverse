import { AiError } from "@/lib/ai/errors"
import { field, str } from "@/lib/ai/json"
import { askText } from "@/lib/ai/llm"
import { answerRequest, DRAFT_MODES, draftRequest, explainItemRequest, explainResultRequest, type DraftMode } from "@/lib/ai/prompts"
import { citedHits, hitsAsContext, KIND_LABEL, searchNexverse, type NexverseHit } from "@/lib/ai/retrieval"
import { aiStreamRoute, type StreamDone } from "@/lib/ai/route"
import { isBlockedHost } from "@/lib/ai/safe-url"
import type { Source } from "@/lib/ai/llm"

/*
 * The streamed AI moments (components/ai/ai-answer.tsx reads this), one route for all of them:
 *   "answer"        command menu: answers a question from Nexverse content, citing it        (job "answer")
 *   "explain"       Lab tools: what the member's actual result means                         (job "explain")
 *   "explain-item"  model, dataset and project pages: what it is, uses, how to start, limits (job "explain")
 *   "draft"         editors: outline, continue, expand, intro or polish a draft              (job "draft")
 * Every answer that leans on Nexverse items cites them as [n]; the route turns the citations into source chips
 * (Nexverse first, then any web pages the model grounded in). `regenerate: true` skips the cache.
 * Members only: aiStreamRoute checks the session, the "ai.use" power and the daily allowance.
 */

const chip = (h: NexverseHit) => ({ url: h.url, title: h.title, kind: KIND_LABEL[h.kind] ?? h.kind })

/** Every numbered item, so the reader can turn [n] in the text into a link. */
const citeMap = (hits: NexverseHit[]) => ({ cite: Object.fromEntries(hits.map((h, i) => [String(i + 1), chip(h)])) })

/** Web pages the model grounded in, minus community sites Nexverse never links to. */
function webSources(list: Source[]) {
  return list.filter((s) => {
    try {
      return !isBlockedHost(new URL(s.url).hostname.toLowerCase())
    } catch {
      return false
    }
  })
}

/** Cited Nexverse items first; when the answer cited none, the best few matches as related reading. */
function nexverseSources(text: string, hits: NexverseHit[], fallback = 3) {
  const cited = citedHits(text, hits)
  return (cited.length ? cited : hits.slice(0, fallback)).map(chip)
}

export const POST = aiStreamRoute({
  prepare(body, caller) {
    const task = str(body.task, 20)
    const fresh = body.regenerate === true ? { cache: false } : {}

    if (task === "answer") {
      const question = field(body, "q", { max: 500, min: 3, label: "Question" })
      const page = field(body, "page", { max: 300, optional: true, label: "Page" })
      return async (io): Promise<StreamDone> => {
        const hits = await searchNexverse(question, { token: caller.token, limit: 8 })
        const r = await askText({ ...answerRequest({ question, items: hitsAsContext(hits), page }), ...fresh, onText: io.onText, onReset: io.onReset, signal: io.signal })
        return { model: r.modelId, label: r.label, sources: [...nexverseSources(r.text, hits), ...webSources(r.sources)], extra: { searched: hits.length, ...citeMap(hits) } }
      }
    }

    if (task === "explain") {
      const tool = field(body, "tool", { max: 80, label: "Tool" })
      const result = field(body, "result", { max: 6000, min: 3, label: "Result" })
      return async (io): Promise<StreamDone> => {
        const hits = await searchNexverse(tool, { token: caller.token, limit: 3 })
        const r = await askText({ ...explainResultRequest({ tool, result, related: hitsAsContext(hits) }), ...fresh, onText: io.onText, onReset: io.onReset, signal: io.signal })
        return { model: r.modelId, label: r.label, sources: citedHits(r.text, hits).map(chip), extra: citeMap(hits) }
      }
    }

    if (task === "explain-item") {
      const kind = str(body.kind, 20) || "project"
      const name = field(body, "name", { max: 200, min: 1, label: "Name" })
      const summary = field(body, "summary", { max: 1000, optional: true, label: "Summary" })
      const readme = field(body, "readme", { max: 24_000, optional: true, label: "README" })
      const details = field(body, "details", { max: 4000, optional: true, label: "Details" })
      const url = field(body, "url", { max: 200, optional: true, label: "Page" })
      if ((summary + readme + details).length < 20) throw new AiError(400, "bad_request", "This page has too little written on it to explain yet.")
      const item = `Name: ${name}\nKind: ${kind}\n${summary ? `Summary: ${summary}\n` : ""}${details ? `Details:\n${details}\n` : ""}${readme ? `\nREADME:\n${readme}` : ""}`
      return async (io): Promise<StreamDone> => {
        const hits = await searchNexverse(`${name} ${summary}`.slice(0, 200), { token: caller.token, limit: 4, exclude: url ? [url] : [] })
        const r = await askText({ ...explainItemRequest({ kind, item, related: hitsAsContext(hits) }), ...fresh, onText: io.onText, onReset: io.onReset, signal: io.signal })
        return { model: r.modelId, label: r.label, sources: citedHits(r.text, hits).map(chip), extra: citeMap(hits) }
      }
    }

    if (task === "draft") {
      const mode = str(body.mode, 20) as DraftMode
      if (!DRAFT_MODES.includes(mode)) throw new AiError(400, "bad_request", `mode must be one of ${DRAFT_MODES.join(", ")}.`)
      const kind = str(body.kind, 30) || "post"
      const title = field(body, "title", { max: 300, optional: true, label: "Title" })
      const text = field(body, "text", { max: 20_000, optional: true, label: "Draft" })
      const selection = field(body, "selection", { max: 4000, optional: true, label: "Selection" })
      if (mode !== "outline" && mode !== "intro" && text.trim().length < 20) throw new AiError(400, "bad_request", "Write a few sentences first.")
      if ((title + text).trim().length < 6) throw new AiError(400, "bad_request", "Give it a title or a few words to start from.")
      return async (io): Promise<StreamDone> => {
        const r = await askText({ ...draftRequest({ mode, kind, title, text, selection }), onText: io.onText, onReset: io.onReset, signal: io.signal })
        return { model: r.modelId, label: r.label }
      }
    }

    throw new AiError(400, "bad_request", "Unknown task.")
  },
})

/** Research-grade models think for a while; leave room for the router to fall back. */
export const maxDuration = 120
