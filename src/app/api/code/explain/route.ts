import { AiError } from "@/lib/ai/errors"
import { field } from "@/lib/ai/json"
import { askJson } from "@/lib/ai/llm"
import { codeFileRequest, codeRepoRequest, readCodeFile, readCodeRepo } from "@/lib/ai/prompts"
import { aiRoute } from "@/lib/ai/route"
import type { ExplainFile, RepoSummary } from "@/lib/code/ai"

/*
 * AI for Nexverse Code, on the free router (job "code"):
 *   mode "file": explain one file: what it does, its main parts, and things to watch.
 *   mode "repo": summarise a repository from its README and file list.
 * The browser sends the text it already shows (the file or README it read with the member's own access), so this
 * route never reads a repository itself. The prompts live in lib/ai/prompts.ts with the shared Nexverse voice;
 * everything from the repository is untrusted and fenced there.
 */

export const POST = aiRoute<ExplainFile | RepoSummary>({
  prepare(body) {
    const mode = body.mode
    const repo = field(body, "repo", { max: 200, min: 1, label: "Repository" })
    if (mode === "file") {
      const path = field(body, "path", { max: 400, min: 1, label: "Path" })
      const text = field(body, "text", { max: 40_000, min: 1, label: "File" })
      return async () => {
        const { json, model } = await askJson(codeFileRequest({ repo, path, text }))
        return { data: readCodeFile(json), model }
      }
    }
    if (mode === "repo") {
      const readme = field(body, "readme", { max: 20_000, optional: true, label: "README" })
      const files = Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === "string").slice(0, 300).map((f) => f.slice(0, 200)) : []
      const description = field(body, "description", { max: 350, optional: true, label: "Description" })
      if (!readme && !files.length) throw new AiError(400, "bad_request", "There is nothing in this repository to summarise yet.")
      return async () => {
        const { json, model } = await askJson(codeRepoRequest({ repo, description, readme, files }))
        return { data: readCodeRepo(json), model }
      }
    }
    throw new AiError(400, "bad_request", 'mode must be "file" or "repo".')
  },
})

/** Room for the router to fall back through several free models. */
export const maxDuration = 90
