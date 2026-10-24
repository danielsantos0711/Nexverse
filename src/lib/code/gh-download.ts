import { isGhOwner, isGhRepo } from "@/lib/live/ids"

/*
 * Downloads of public GitHub content, served from Nexverse's own address so members never leave the site:
 *
 *   /api/gh/download?repo=owner/name&kind=zip&ref=main            the whole repository at a branch, tag or commit
 *   /api/gh/download?repo=owner/name&kind=tar&ref=v1.2.0          the same as .tar.gz
 *   /api/gh/download?repo=owner/name&kind=file&ref=main&path=a/b  one file (Git LFS files resolved to their content)
 *   /api/gh/download?repo=owner/name&kind=asset&tag=v1&name=x.bin a release asset
 *
 * The bytes are streamed from GitHub as they arrive, never held in memory, so large archives and release assets
 * work. Redirects are followed here on the server, only to GitHub's own download hosts. No token is ever sent:
 * only public content can be fetched, so GITHUB_TOKEN can never leak a private repository through this route.
 * Everything is served as an attachment with nosniff, so nothing from a repository can run on Nexverse's origin.
 */

export type GhDownloadKind = "zip" | "tar" | "file" | "asset"

export type GhDownloadRequest =
  | { kind: "zip" | "tar"; owner: string; repo: string; ref: string }
  | { kind: "file"; owner: string; repo: string; ref: string; path: string }
  | { kind: "asset"; owner: string; repo: string; tag: string; name: string }

export class GhDownloadError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

/** Branch, tag or commit names: what git allows minus anything that could step outside the URL path. */
const REF = /^(?!.*\.\.)(?!\/)(?!.*\/\/)[\w.\-/+@]{1,200}(?<!\/)$/
/** A path inside a repository: no empty, "." or ".." segments. */
const PATH_SEGMENT = /^(?!\.{1,2}$)[^/\\\u0000-\u001f]{1,255}$/
/** A release asset's file name, as GitHub stores it. */
const ASSET_NAME = /^(?!\.{1,2}$)[^/\\\u0000-\u001f]{1,255}$/

/** The hosts GitHub hands downloads out from. Anything else in a redirect is refused. */
const HOSTS = new Set([
  "github.com",
  "codeload.github.com",
  "raw.githubusercontent.com",
  "media.githubusercontent.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
  "github-production-release-asset-2e65be.s3.amazonaws.com",
])

const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/")

/** Reads and validates the query string. Throws GhDownloadError(400) with a plain message. */
export function parseGhDownload(params: URLSearchParams): GhDownloadRequest {
  const [owner = "", repo = "", extra] = (params.get("repo") ?? "").split("/")
  if (extra !== undefined || !isGhOwner(owner) || !isGhRepo(repo)) throw new GhDownloadError(400, "That is not a GitHub repository Nexverse can download.")
  const kind = params.get("kind") ?? "zip"
  if (kind === "zip" || kind === "tar") {
    const ref = params.get("ref") || "HEAD"
    if (!REF.test(ref)) throw new GhDownloadError(400, "That branch or tag name is not valid.")
    return { kind, owner, repo, ref }
  }
  if (kind === "file") {
    const ref = params.get("ref") || "HEAD"
    const path = (params.get("path") ?? "").replace(/^\/+/, "")
    if (!REF.test(ref)) throw new GhDownloadError(400, "That branch or tag name is not valid.")
    if (!path || path.length > 1000 || !path.split("/").every((s) => PATH_SEGMENT.test(s))) throw new GhDownloadError(400, "That file path is not valid.")
    return { kind, owner, repo, ref, path }
  }
  if (kind === "asset") {
    const tag = params.get("tag") ?? ""
    const name = params.get("name") ?? ""
    if (!REF.test(tag)) throw new GhDownloadError(400, "That release tag is not valid.")
    if (!ASSET_NAME.test(name)) throw new GhDownloadError(400, "That file name is not valid.")
    return { kind, owner, repo, tag, name }
  }
  throw new GhDownloadError(400, "Unknown download kind. Use zip, tar, file or asset.")
}

/** The Nexverse address of a download, for links in the interface. */
export function ghDownloadHref(r: GhDownloadRequest): string {
  const q = new URLSearchParams({ repo: `${r.owner}/${r.repo}`, kind: r.kind })
  if (r.kind === "asset") {
    q.set("tag", r.tag)
    q.set("name", r.name)
  } else {
    q.set("ref", r.ref)
    if (r.kind === "file") q.set("path", r.path)
  }
  return `/api/gh/download?${q}`
}

/** GitHub's own address for the bytes, and the file name the member's browser should save. */
export function ghSource(r: GhDownloadRequest): { url: string; filename: string; type: string } {
  const safeRef = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "head"
  switch (r.kind) {
    case "zip":
      return { url: `https://codeload.github.com/${r.owner}/${r.repo}/zip/${enc(r.ref)}`, filename: `${r.repo}-${safeRef(r.ref)}.zip`, type: "application/zip" }
    case "tar":
      return { url: `https://codeload.github.com/${r.owner}/${r.repo}/tar.gz/${enc(r.ref)}`, filename: `${r.repo}-${safeRef(r.ref)}.tar.gz`, type: "application/gzip" }
    case "file":
      return { url: `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${enc(r.ref)}/${enc(r.path)}`, filename: r.path.split("/").pop() || "file", type: "application/octet-stream" }
    case "asset":
      return { url: `https://github.com/${r.owner}/${r.repo}/releases/download/${enc(r.tag)}/${encodeURIComponent(r.name)}`, filename: r.name, type: "application/octet-stream" }
  }
}

/** RFC 6266 content-disposition with an ASCII fallback and the exact UTF-8 name. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download"
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

const UA = "Nexverse-Downloads (+https://nexverse.app)"

/** GET with redirects followed by hand, only between GitHub's download hosts. */
async function follow(url: string, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<Response> {
  let current = url
  for (let hop = 0; hop < 6; hop++) {
    const host = new URL(current).hostname
    if (!HOSTS.has(host)) throw new GhDownloadError(502, "GitHub sent the download somewhere Nexverse does not fetch from.")
    let res: Response
    // Only the wait for GitHub's headers is bounded: the timer is cleared once they arrive, so it never cuts the body.
    const start = new AbortController()
    const timer = setTimeout(() => start.abort(new DOMException("GitHub took too long", "TimeoutError")), START_TIMEOUT_MS)
    try {
      res = await fetcher(current, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: signal ? AbortSignal.any([signal, start.signal]) : start.signal, cache: "no-store" })
    } catch (err) {
      if ((err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError") throw new GhDownloadError(504, "GitHub took too long to start the download. Try again.")
      throw new GhDownloadError(502, "Could not reach GitHub. Try again in a minute.")
    } finally {
      clearTimeout(timer)
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel().catch(() => null)
      current = new URL(res.headers.get("location")!, current).toString()
      continue
    }
    return res
  }
  throw new GhDownloadError(502, "GitHub redirected too many times.")
}

const START_TIMEOUT_MS = 30_000

/** Git LFS keeps a small pointer in the repository; the real file lives on media.githubusercontent.com. */
const LFS_POINTER = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\s/

/**
 * Fetch the download from GitHub and answer with a streamed attachment. `fetcher` is injectable for tests.
 * Errors come back as GhDownloadError with a member-readable message.
 */
export async function ghDownload(r: GhDownloadRequest, opts: { signal?: AbortSignal; fetcher?: typeof fetch; method?: "GET" | "HEAD" } = {}): Promise<Response> {
  const fetcher = opts.fetcher ?? fetch
  const src = ghSource(r)
  // follow() bounds the wait for GitHub to answer; the transfer itself may take as long as it needs.
  const signal = opts.signal
  let res = await follow(src.url, signal, fetcher)

  if (res.status === 404) {
    await res.body?.cancel().catch(() => null)
    const what = r.kind === "file" ? "file" : r.kind === "asset" ? "release file" : "branch or tag"
    throw new GhDownloadError(404, `GitHub has no public ${what} there. It may have been renamed, removed or made private.`)
  }
  if (res.status === 403 || res.status === 429) {
    await res.body?.cancel().catch(() => null)
    throw new GhDownloadError(429, "GitHub is limiting downloads from Nexverse right now. Try again in a few minutes.")
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => null)
    throw new GhDownloadError(502, `GitHub could not send this download (${res.status}). Try again.`)
  }

  let body: ReadableStream<Uint8Array> = res.body
  let length = res.headers.get("content-length")
  if (r.kind === "file" && Number(length) > 0 && Number(length) < 1024) {
    // Small enough to look at: swap a Git LFS pointer for the file it points to.
    const bytes = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(bytes)
    if (LFS_POINTER.test(text)) {
      const lfs = await follow(`https://media.githubusercontent.com/media/${r.owner}/${r.repo}/${enc(r.ref)}/${enc(r.path)}`, signal, fetcher)
      if (lfs.ok && lfs.body) {
        res = lfs
        body = lfs.body
        length = lfs.headers.get("content-length")
      } else {
        await lfs.body?.cancel().catch(() => null)
        body = new Blob([bytes]).stream()
      }
    } else {
      body = new Blob([bytes]).stream()
    }
  }

  const headers = new Headers({
    "content-type": src.type,
    "content-disposition": contentDisposition(src.filename),
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    // Branch archives change with every push; tags and commits rarely do. Browsers only, never shared caches.
    "cache-control": "private, max-age=300",
  })
  if (length && /^\d+$/.test(length)) headers.set("content-length", length)
  const etag = res.headers.get("etag")
  if (etag) headers.set("etag", etag)

  if (opts.method === "HEAD") {
    await body.cancel().catch(() => null)
    return new Response(null, { status: 200, headers })
  }
  return new Response(body, { status: 200, headers })
}
