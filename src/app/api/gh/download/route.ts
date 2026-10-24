import { connection } from "next/server"
import { GhDownloadError, ghDownload, parseGhDownload } from "@/lib/code/gh-download"

/**
 * GET /api/gh/download?repo=owner/name&kind=zip|tar|file|asset&… streams public GitHub content to the member
 * as a download from Nexverse's own address (see src/lib/code/gh-download.ts). Errors answer a short plain-text
 * page, so a failed download link shows what went wrong instead of a broken file.
 */
/*
 * A cheap per-instance limit per address, so the route cannot be used as a free bulk mirror of GitHub. It is
 * generous for a person (a download every 10 seconds on average over ten minutes) and resets per instance.
 */
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 60
const recent = new Map<string, number[]>()

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 64)
}

function limited(key: string): boolean {
  const now = Date.now()
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  const over = hits.length >= MAX_PER_WINDOW
  if (!over) hits.push(now)
  recent.set(key, hits)
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < WINDOW_MS)) recent.delete(k)
  return over
}

async function handle(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  // Always at request time, never prerendered (and outside the try, so Next's own signal is not swallowed).
  await connection()
  try {
    if (method === "GET" && limited(clientAddress(request))) throw new GhDownloadError(429, "That is a lot of downloads in a few minutes. Wait a little and try again.")
    const req = parseGhDownload(new URL(request.url).searchParams)
    return await ghDownload(req, { signal: request.signal, method })
  } catch (err) {
    const e = err instanceof GhDownloadError ? err : new GhDownloadError(500, "The download failed on our side. Try again.")
    if (!(err instanceof GhDownloadError)) console.error("[gh-download]", (err as Error)?.message ?? err)
    const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
    if (e.status === 429) headers["retry-after"] = "300"
    return new Response(`${e.message}\n`, { status: e.status, headers })
  }
}

export function GET(request: Request) {
  return handle(request, "GET")
}

export function HEAD(request: Request) {
  return handle(request, "HEAD")
}

/** Big archives and release files stream for as long as the plan allows. */
export const maxDuration = 300
