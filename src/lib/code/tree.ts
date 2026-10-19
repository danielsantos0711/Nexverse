/*
 * A commit's tree is a flat map from path to blob: {"src/a.ts": {sha, size, mode}}. Folders are implied by paths.
 * These helpers list one folder, change a tree, compare two trees and merge three of them.
 */

export type TreeEntry = { sha: string; size: number; mode: "100644" | "100755" }
export type Tree = Record<string, TreeEntry>

export type DirItem = { name: string; path: string; type: "dir" | "file"; size: number; sha?: string }

/** The immediate children of `dir` ("" for the root): folders first, then files, each alphabetical. */
export function listDir(tree: Tree, dir: string): DirItem[] | null {
  const prefix = dir ? `${dir}/` : ""
  const dirs = new Map<string, number>()
  const files: DirItem[] = []
  let any = !dir
  for (const [path, e] of Object.entries(tree)) {
    if (!path.startsWith(prefix)) continue
    any = true
    const rest = path.slice(prefix.length)
    const slash = rest.indexOf("/")
    if (slash < 0) files.push({ name: rest, path, type: "file", size: e.size, sha: e.sha })
    else {
      const name = rest.slice(0, slash)
      dirs.set(name, (dirs.get(name) ?? 0) + e.size)
    }
  }
  if (!any) return null
  const cmp = (a: DirItem, b: DirItem) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })
  return [
    ...[...dirs].map(([name, size]): DirItem => ({ name, path: prefix + name, type: "dir", size })).sort(cmp),
    ...files.sort(cmp),
  ]
}

export const isDir = (tree: Tree, path: string) => !path || Object.keys(tree).some((p) => p.startsWith(`${path}/`))

/** Normalises a path typed or dropped by a member; null when it is not allowed. Mirrors code_valid_path in SQL. */
export function cleanPath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "").trim()
  if (!p || p.length > 400) return null
  if (/[\u0000-\u001f\u007f]/.test(p)) return null
  if (p.split("/").some((s) => !s || s === "." || s === "..")) return null
  return p
}

export const VALID_REF = /^(?![./-])(?!.*(\.\.|\/\/|@\{|\/\.|\.lock$))(?!.*[/.]$)[A-Za-z0-9._/-]{1,100}$/
export const VALID_SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/

/** Turns a name into a repository slug ("My Model!" → "my-model"). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/g, "")
    .replace(/\.(git|atom)$/, "")
    .slice(0, 100)
}

/** A path that is a file in one and a folder prefix in the other would be refused by the database. */
export function treeClash(tree: Tree): string | null {
  const keys = new Set(Object.keys(tree))
  for (const k of keys) {
    const parts = k.split("/")
    for (let i = 1; i < parts.length; i++) {
      const pre = parts.slice(0, i).join("/")
      if (keys.has(pre)) return pre
    }
  }
  return null
}

export type FileChange = { path: string; oldPath: string | null; status: "added" | "modified" | "removed" | "renamed"; old: TreeEntry | null; new: TreeEntry | null }

/** What changed from `a` to `b`. A removed and an added file with the same blob count as a rename. */
export function compareTrees(a: Tree | null, b: Tree): FileChange[] {
  const from = a ?? {}
  const out: FileChange[] = []
  const removed: FileChange[] = []
  const added: FileChange[] = []
  for (const [path, e] of Object.entries(b)) {
    const o = from[path]
    if (!o) added.push({ path, oldPath: null, status: "added", old: null, new: e })
    else if (o.sha !== e.sha || o.mode !== e.mode) out.push({ path, oldPath: path, status: "modified", old: o, new: e })
  }
  for (const [path, o] of Object.entries(from)) if (!b[path]) removed.push({ path, oldPath: path, status: "removed", old: o, new: null })
  for (const r of removed) {
    const i = added.findIndex((x) => x.new!.sha === r.old!.sha)
    if (i >= 0) {
      const ad = added.splice(i, 1)[0]
      out.push({ path: ad.path, oldPath: r.path, status: "renamed", old: r.old, new: ad.new })
    } else out.push(r)
  }
  out.push(...added)
  return out.sort((x, y) => x.path.localeCompare(y.path))
}

export type MergeResult = { tree: Tree; conflicts: string[] }

/**
 * Three-way merge by file: a file changed on one side only takes that side; changed the same way on both sides is
 * fine; changed differently on both sides is a conflict. (Changes to different lines of the same file count as a
 * conflict too: the merge is per file, and it says so instead of guessing.)
 */
export function mergeTrees(base: Tree, ours: Tree, theirs: Tree): MergeResult {
  const out: Tree = {}
  const conflicts: string[] = []
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  const same = (x?: TreeEntry, y?: TreeEntry) => (!x && !y) || (!!x && !!y && x.sha === y.sha && x.mode === y.mode)
  for (const p of paths) {
    const b = base[p]
    const o = ours[p]
    const t = theirs[p]
    let pick: TreeEntry | undefined
    if (same(o, t)) pick = o
    else if (same(b, o)) pick = t
    else if (same(b, t)) pick = o
    else {
      conflicts.push(p)
      continue
    }
    if (pick) out[p] = pick
  }
  const clash = treeClash(out)
  if (clash) conflicts.push(clash)
  return { tree: out, conflicts: conflicts.sort() }
}

/**
 * The best common ancestor of two commits, given a way to read parents. Breadth-first from both sides; the first
 * commit reached from both is the merge base (good enough for the shallow histories of a web host).
 */
export async function mergeBase(a: string, b: string, parents: (id: string) => Promise<string[] | null>, limit = 5000): Promise<string | null> {
  const seenA = new Set([a])
  const seenB = new Set([b])
  let qa = [a]
  let qb = [b]
  let steps = 0
  while ((qa.length || qb.length) && steps < limit) {
    for (const id of qa) if (seenB.has(id)) return id
    for (const id of qb) if (seenA.has(id)) return id
    const na: string[] = []
    for (const id of qa) for (const p of (await parents(id)) ?? []) {
      if (!seenA.has(p)) {
        seenA.add(p)
        na.push(p)
      }
    }
    const nb: string[] = []
    for (const id of qb) for (const p of (await parents(id)) ?? []) {
      if (!seenB.has(p)) {
        seenB.add(p)
        nb.push(p)
      }
    }
    qa = na
    qb = nb
    steps += na.length + nb.length + 1
    for (const id of qa) if (seenB.has(id)) return id
    for (const id of qb) if (seenA.has(id)) return id
  }
  return null
}
