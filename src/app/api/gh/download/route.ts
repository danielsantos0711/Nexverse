import { connection } from "next/server"
import { GhDownloadError, ghDownload, parseGhDownload } from "@/lib/code/gh-download"

/**
 * GET /api/gh/download?repo=owner/name&kind=zip|tar|file|asset&… streams public GitHub content to the member
 * as a download from Nexverse's own address (see src/lib/code/gh-download.ts). Errors answer a short plain-text
 * page, so a failed download link shows what went wrong instead of a broken file.
 */
async function handle(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  // Always at request time, never prerendered (and outside the try, so Next's own signal is not swallowed).
  await connection()
  try {
    const req = parseGhDownload(new URL(request.url).searchParams)
    return await ghDownload(req, { signal: request.signal, method })
  } catch (err) {
    const e = err instanceof GhDownloadError ? err : new GhDownloadError(500, "The download failed on our side. Try again.")
    if (!(err instanceof GhDownloadError)) console.error("[gh-download]", (err as Error)?.message ?? err)
    return new Response(`${e.message}\n`, { status: e.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } })
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
