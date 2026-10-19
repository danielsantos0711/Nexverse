import { askJson } from "@/lib/ai/anthropic"
import { AiError } from "@/lib/ai/errors"
import { field, isObject, str } from "@/lib/ai/json"
import { readThreadSummary, threadSummaryRequest } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"

const MAX_POSTS = 60
const MAX_TOTAL = 40_000

/** A short TL;DR and key points for a forum thread. */
export const POST = aiRoute({
  prepare(body) {
    const title = field(body, "title", { max: 300, label: "Title" })
    if (!Array.isArray(body.posts) || body.posts.length === 0) throw new AiError(400, "bad_request", "Send the thread's posts.")
    let total = 0
    const posts: { author: string; body: string }[] = []
    // Keep the opening post and as many replies as fit, oldest first.
    for (const p of body.posts.slice(0, MAX_POSTS)) {
      if (!isObject(p)) continue
      const text = str(p.body, 6000)
      if (!text) continue
      if (total + text.length > MAX_TOTAL) break
      total += text.length
      posts.push({ author: str(p.author, 60) || "someone", body: text })
    }
    if (!posts.length) throw new AiError(400, "bad_request", "Those posts are empty.")
    return async () => {
      const { json, model } = await askJson(threadSummaryRequest({ title, posts }))
      return { data: { ...readThreadSummary(json), postsRead: posts.length }, model }
    }
  },
})
