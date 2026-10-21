import { supabaseEnv } from "./config"
import { fence } from "./prompts"

/*
 * Retrieval over Nexverse's own content, so AI answers cite Nexverse items first. One call to the ai_search()
 * database function (Postgres full-text search over public threads, news, projects, repositories, events,
 * pages and rooms), run with the caller's own token, so row level security decides what each caller may see.
 * Before the migration is applied, or without a database, it returns nothing and callers carry on without it.
 */

export type NexverseHit = { kind: string; id: string; title: string; snippet: string; url: string; at: string | null }

/** What a kind is called in answers and on source chips. */
export const KIND_LABEL: Record<string, string> = {
  thread: "Thread",
  news: "News",
  model: "Model",
  dataset: "Dataset",
  repo: "Repository",
  event: "Event",
  page: "Page",
  room: "Room",
  space: "Space",
  tool: "Tool",
  paper: "Paper",
  prompt: "Prompt",
  agent: "Agent",
}

/** Search Nexverse. `token` is the member's access token (or none for public reads). Never throws. */
export async function searchNexverse(q: string, opts: { token?: string; limit?: number; exclude?: string[] } = {}): Promise<NexverseHit[]> {
  const env = supabaseEnv()
  const query = q.replace(/\s+/g, " ").trim().slice(0, 200)
  if (!env || query.length < 2) return []
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/ai_search`, {
      method: "POST",
      headers: { apikey: env.key, authorization: `Bearer ${opts.token ?? env.key}`, "content-type": "application/json" },
      body: JSON.stringify({ q: query, lim: Math.min(20, (opts.limit ?? 8) + (opts.exclude?.length ?? 0)) }),
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    })
    if (!res.ok) return []
    const rows = (await res.json()) as { kind: string; id: string; title: string; snippet: string; url: string; at: string | null }[]
    const skip = new Set(opts.exclude ?? [])
    return rows
      .filter((r) => r && typeof r.url === "string" && r.url.startsWith("/") && !skip.has(r.url))
      .slice(0, opts.limit ?? 8)
      .map((r) => ({ kind: String(r.kind), id: String(r.id), title: String(r.title ?? "").slice(0, 200), snippet: String(r.snippet ?? "").replace(/\s+/g, " ").slice(0, 500), url: r.url, at: r.at }))
  } catch {
    return []
  }
}

/** Hits as numbered, fenced context for a prompt: [1], [2], … so the model can cite them. */
export function hitsAsContext(hits: NexverseHit[]): string {
  if (!hits.length) return ""
  return fence(
    "nexverse_items",
    hits.map((h, i) => `[${i + 1}] ${KIND_LABEL[h.kind] ?? h.kind}: ${h.title}${h.at ? ` (${h.at.slice(0, 10)})` : ""}\n${h.snippet}`).join("\n\n")
  )
}

/** The citation numbers [n] a text uses, mapped back to hits, in the order they first appear. */
export function citedHits(text: string, hits: NexverseHit[]): NexverseHit[] {
  const seen = new Set<number>()
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= hits.length) seen.add(n)
  }
  return [...seen].map((n) => hits[n - 1])
}
