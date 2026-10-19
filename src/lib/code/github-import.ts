import { sha256Hex } from "./hash"
import { CodeError, putBlob, rest, rpc, type Member } from "./server"
import { untar } from "./tar"
import { cleanPath, slugify, VALID_REF, VALID_SLUG, type Tree } from "./tree"

/*
 * Import a public GitHub repository into Nexverse Code: one snapshot of one branch becomes the first commit
 * ("Imported from github.com/owner/repo at <sha>"). Git history is not copied. Everything is written with the
 * member's own session, so the usual permission checks apply. GITHUB_TOKEN (optional, server only) raises
 * GitHub's rate limit for the two API calls; the tarball comes from codeload.github.com.
 */

export const IMPORT_LIMITS = { files: 3000, totalBytes: 80 * 1024 * 1024, fileBytes: 25 * 1024 * 1024, tarballBytes: 150 * 1024 * 1024 } as const

export type ImportResult = { owner: string; slug: string; files: number; skipped: number; sha: string }

/** "https://github.com/o/r", "github.com/o/r/tree/dev", "o/r" → owner, repo, optional branch. */
export function parseGithubUrl(raw: string): { owner: string; repo: string; branch: string | null } | null {
  const s = raw.trim().replace(/^git\+/, "").replace(/\.git$/, "")
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:\/tree\/([^?#]+))?\/?(?:[?#].*)?$/) ??
    s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/)
  if (!m) return null
  return { owner: m[1], repo: m[2], branch: m[3] ? decodeURIComponent(m[3]).replace(/\/+$/, "") : null }
}

function ghHeaders(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { accept, "user-agent": "Nexverse-Code-Import", "x-github-api-version": "2022-11-28" }
  const token = process.env.GITHUB_TOKEN?.trim()
  if (token) h.authorization = `Bearer ${token}`
  return h
}

type GhRepo = { private: boolean; default_branch: string; description: string | null; topics?: string[]; license?: { spdx_id?: string | null } | null; homepage?: string | null; size: number; name: string; archived: boolean }

async function gh<T>(path: string, accept?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com${path}`, { headers: ghHeaders(accept), signal: AbortSignal.timeout(15_000), cache: "no-store" })
  } catch {
    throw new CodeError(502, "Could not reach GitHub. Try again in a minute.")
  }
  if (res.status === 404) throw new CodeError(404, "GitHub has no public repository or branch at that address.")
  if (res.status === 403 || res.status === 429) throw new CodeError(429, "GitHub's rate limit for this site is used up for now. Try again later.")
  if (!res.ok) throw new CodeError(502, `GitHub answered with an error (${res.status}).`)
  return (accept?.includes("sha") ? await res.text() : await res.json()) as T
}

/** Downloads and gunzips the tarball, refusing to read past the cap. */
async function tarball(owner: string, repo: string, sha: string): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`, { headers: { "user-agent": "Nexverse-Code-Import" }, signal: AbortSignal.timeout(120_000), cache: "no-store" })
  } catch {
    throw new CodeError(502, "Could not download the repository from GitHub. Try again.")
  }
  if (!res.ok || !res.body) throw new CodeError(502, "GitHub did not send the repository archive.")
  const reader = res.body.pipeThrough(new DecompressionStream("gzip")).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > IMPORT_LIMITS.tarballBytes) {
      await reader.cancel()
      throw new CodeError(413, "This repository is too big to import (over 150 MB unpacked).")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it)
    })
  )
}

export async function importFromGithub(m: Member, input: { url: string; name?: string; visibility?: "public" | "private" }): Promise<ImportResult> {
  const where = parseGithubUrl(input.url)
  if (!where) throw new CodeError(400, "Paste the address of a GitHub repository, like https://github.com/owner/repo.")
  const meta = await gh<GhRepo>(`/repos/${where.owner}/${where.repo}`)
  if (meta.private) throw new CodeError(400, "Only public GitHub repositories can be imported.")
  if (meta.size > 400_000) throw new CodeError(413, "This repository is too big to import here.")
  const branch = where.branch ?? meta.default_branch
  const sha = (await gh<string>(`/repos/${where.owner}/${where.repo}/commits/${encodeURIComponent(branch)}`, "application/vnd.github.sha")).trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new CodeError(404, "Could not find that branch on GitHub.")

  const files = untar(await tarball(where.owner, where.repo, sha))
  const picked: { path: string; data: Uint8Array; exec: boolean }[] = []
  let skipped = 0
  let total = 0
  for (const f of files) {
    // GitHub's archives put everything under "<owner>-<repo>-<sha>/".
    const rel = f.path.slice(f.path.indexOf("/") + 1)
    const path = cleanPath(rel)
    if (!path || path.startsWith(".git/")) continue
    if (f.data.length > IMPORT_LIMITS.fileBytes || picked.length >= IMPORT_LIMITS.files || total + f.data.length > IMPORT_LIMITS.totalBytes) {
      skipped++
      continue
    }
    total += f.data.length
    picked.push({ path, data: f.data, exec: (f.mode & 0o111) !== 0 })
  }
  if (!picked.length) throw new CodeError(400, "That repository has no files we could import.")

  const name = (input.name?.trim() || meta.name).slice(0, 100)
  const slug = slugify(name)
  if (!VALID_SLUG.test(slug)) throw new CodeError(400, "Pick a name with letters or numbers in it.")
  const topics = (meta.topics ?? []).filter((t) => /^[a-z0-9][a-z0-9-]{0,34}$/.test(t)).slice(0, 20)
  const license = meta.license?.spdx_id && /^[A-Za-z0-9.+-]{1,40}$/.test(meta.license.spdx_id) && meta.license.spdx_id !== "NOASSERTION" ? meta.license.spdx_id : null
  const defaultBranch = VALID_REF.test(branch) ? branch : "main"

  const created = await rest<{ id: string }[]>(m, "code_repos?select=id", {
    method: "POST",
    prefer: "return=representation",
    body: {
      owner_id: m.id,
      name,
      slug,
      description: (meta.description ?? "").slice(0, 350),
      visibility: input.visibility === "private" ? "private" : "public",
      default_branch: defaultBranch,
      topics,
      license,
      homepage: meta.homepage && /^https?:\/\/[^\s<>"]+$/.test(meta.homepage) && meta.homepage.length <= 300 ? meta.homepage : null,
    },
  })
  const repoId = created[0]?.id
  if (!repoId) throw new CodeError(400, "Could not create the repository.")

  try {
    const tree: Tree = {}
    const blobs = new Map<string, Uint8Array>()
    for (const f of picked) {
      const s = await sha256Hex(f.data)
      tree[f.path] = { sha: s, size: f.data.length, mode: f.exec ? "100755" : "100644" }
      blobs.set(s, f.data)
    }
    await pool([...blobs.keys()], 8, (s) => putBlob(m, repoId, s, blobs.get(s)!))
    const shas = [...blobs.keys()]
    for (let i = 0; i < shas.length; i += 500) await rpc<string[]>(m, "code_register_blobs", { repo: repoId, shas: shas.slice(i, i + 500) })

    const note = skipped ? `\n\n${skipped} ${skipped === 1 ? "file was" : "files were"} left out because of the size limits.` : ""
    const message = `Imported from github.com/${where.owner}/${where.repo} at ${sha}${note}`
    const commit = await rpc<string>(m, "code_commit", { repo: repoId, branch: defaultBranch, expected_head: null, tree, message })

    const readmePath = Object.keys(tree).find((p) => /^readme(\.(md|markdown|txt))?$/i.test(p))
    if (readmePath) {
      const text = new TextDecoder().decode(blobs.get(tree[readmePath].sha)!).slice(0, 100_000)
      await rest(m, `code_repos?id=eq.${repoId}`, { method: "PATCH", body: { readme: text } }).catch(() => null)
    }
    return { owner: m.handle ?? m.id, slug, files: picked.length, skipped, sha: commit }
  } catch (err) {
    // Leave nothing half-imported behind.
    await rpc(m, "code_delete_repo", { repo: repoId }).catch(() => null)
    throw err
  }
}
