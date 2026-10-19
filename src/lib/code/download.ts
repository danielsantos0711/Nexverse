import { LIMITS, readBlob } from "./api"
import type { Tree } from "./tree"
import { zipStore } from "./zip"

/*
 * "Download ZIP": the browser fetches every blob of a tree (with the viewer's own access, so private repositories
 * work for the people who may read them), builds a STORE zip and saves it. Files sit under "<repo>-<ref>/", like
 * GitHub's archives.
 */

export async function downloadZip(repoId: string, slug: string, ref: string, tree: Tree, at: string, onProgress?: (done: number, total: number) => void) {
  const paths = Object.keys(tree).sort()
  const total = paths.reduce((n, p) => n + tree[p].size, 0)
  if (total > LIMITS.zipBytes) throw new Error("This snapshot is over 200 MB, too big to zip in the browser.")
  const root = `${slug}-${ref.replace(/[^A-Za-z0-9._-]+/g, "-")}`
  const date = new Date(at)
  const entries: { path: string; data: Uint8Array; date: Date }[] = []
  let done = 0
  const queue = [...paths]
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
        const { bytes } = await readBlob(repoId, tree[p].sha)
        entries.push({ path: `${root}/${p}`, data: bytes, date })
        onProgress?.(++done, paths.length)
      }
    })
  )
  entries.sort((a, b) => a.path.localeCompare(b.path))
  const zip = zipStore(entries)
  saveBytes(zip, `${root}.zip`, "application/zip")
}

export function saveBytes(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
