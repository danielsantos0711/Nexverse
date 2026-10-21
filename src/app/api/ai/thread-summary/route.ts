import { askJson } from "@/lib/ai/llm"
import { AiError } from "@/lib/ai/errors"
import { field, isObject, str } from "@/lib/ai/json"
import { readThreadSummary, threadSummaryRequest } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"

const MAX_POSTS = 200
const MAX_TOTAL = 120_000

/**
 * A TL;DR, key points, open questions and the consensus for a forum thread, or a catch-up for a chat room
 * (`kind: "chat"`, or a title that starts with "Chat room"). Long threads keep the opening post and the most
 * recent replies that fit, and say how many were left out. `regenerate: true` skips the cache.
 */
export const POST = aiRoute({
  prepare(body) {
    const title = field(body, "title", { max: 300, label: "Title" })
    const accepted = field(body, "accepted", { max: 6000, optional: true, label: "Accepted answer" })
    const kind = body.kind === "chat" || /^chat room\b/i.test(title) ? "chat" : "thread"
    if (!Array.isArray(body.posts) || body.posts.length === 0) throw new AiError(400, "bad_request", "Send the thread's posts.")
    const all = body.posts
      .slice(0, MAX_POSTS)
      .filter(isObject)
      .map((p) => ({ author: str(p.author, 60) || "someone", body: str(p.body, 8000) }))
      .filter((p) => p.body)
    if (!all.length) throw new AiError(400, "bad_request", "Those posts are empty.")
    // The opening post frames everything, so it always stays; then the newest replies, as many as fit.
    const [first, ...rest] = kind === "chat" ? [null, ...all] : all
    let total = first?.body.length ?? 0
    const kept: typeof all = []
    for (let i = rest.length - 1; i >= 0; i--) {
      const p = rest[i]!
      if (total + p.body.length > MAX_TOTAL) break
      total += p.body.length
      kept.unshift(p)
    }
    const skipped = rest.length - kept.length
    const posts = [...(first ? [first] : []), ...(skipped ? [{ author: "(note)", body: `${skipped} earlier ${kind === "chat" ? "messages" : "replies"} left out for length.` }] : []), ...kept]
    const fresh = body.regenerate === true ? { cache: false } : {}
    return async () => {
      const { json, model } = await askJson({ ...threadSummaryRequest({ title, posts, kind, accepted }), ...fresh })
      return { data: { ...readThreadSummary(json), postsRead: posts.length - (skipped ? 1 : 0) }, model }
    }
  },
})

/** Room for the router to fall back through several free models. */
export const maxDuration = 90
