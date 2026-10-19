import { accessToken } from "./api"

/*
 * Browser side of the code host's AI (POST /api/code/explain, job "code" on the free router). Components check
 * `useAiStatus()` from @/lib/ai-client first and render nothing when AI is off.
 */

export type ExplainFile = { summary: string; parts: { name: string; what: string }[]; notes: string[] }
export type RepoSummary = { summary: string; highlights: string[]; audience: string; stack: string[] }
export type AiAnswer<T> = { data: T; model: string; remaining: number }

async function post<T>(body: unknown, signal?: AbortSignal): Promise<AiAnswer<T>> {
  const token = await accessToken()
  if (!token) throw new Error("Sign in to use AI.")
  let res: Response
  try {
    res = await fetch("/api/code/explain", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal })
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err
    throw new Error("Could not reach Nexverse. Check your connection and try again.")
  }
  const json = (await res.json().catch(() => null)) as (AiAnswer<T> & { error?: { message: string } }) | null
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? "AI failed. Try again.")
  return json
}

export const explainFile = (input: { repo: string; path: string; text: string }, signal?: AbortSignal) => post<ExplainFile>({ mode: "file", ...input, text: input.text.slice(0, 40_000) }, signal)

export const summariseRepo = (input: { repo: string; description: string; readme: string; files: string[] }, signal?: AbortSignal) =>
  post<RepoSummary>({ mode: "repo", ...input, readme: input.readme.slice(0, 20_000), files: input.files.slice(0, 300) }, signal)
