import { getCommit, getCommitMetas, history, type Commit, type CommitMeta } from "./api"
import { compareTrees, mergeBase, mergeTrees, type FileChange, type Tree } from "./tree"

/*
 * Comparing two commits, possibly in two repositories (a fork and its source share history, because forking
 * copies commit rows). Like GitHub's three-dot compare, the diff runs from the merge base to the head: what the
 * head branch would bring in.
 */

export type Comparison = {
  base: Commit
  head: Commit
  mergeBase: Commit | null
  /** Repository holding the merge base's blobs (the base repository when it has the commit). */
  baseBlobsRepo: string
  changes: FileChange[]
  /** Commits on head that base does not have, newest first. */
  commits: CommitMeta[]
  /** True when base is an ancestor of head, so a merge can move the branch without a merge commit. */
  fastForward: boolean
  /** Base has commits that head lacks. */
  behind: boolean
  /** The per-file three-way merge, when not a fast-forward. */
  merge: { tree: Tree; conflicts: string[] } | null
}

export async function compare(baseRepo: string, baseId: string, headRepo: string, headId: string): Promise<Comparison | null> {
  const [base, head] = await Promise.all([getCommit(baseRepo, baseId), getCommit(headRepo, headId)])
  if (!base || !head) return null

  const cache = new Map<string, string[]>()
  const parents = async (id: string) => {
    const hit = cache.get(id)
    if (hit) return hit
    let m = (await getCommitMetas(baseRepo, [id])).get(id)
    if (!m && headRepo !== baseRepo) m = (await getCommitMetas(headRepo, [id])).get(id)
    const p = m?.parents ?? null
    if (p) cache.set(id, p)
    return p
  }
  const mb = await mergeBase(base.id, head.id, parents)
  let mergeCommit: Commit | null = null
  let baseBlobsRepo = baseRepo
  if (mb) {
    mergeCommit = await getCommit(baseRepo, mb)
    if (!mergeCommit && headRepo !== baseRepo) {
      mergeCommit = await getCommit(headRepo, mb)
      baseBlobsRepo = headRepo
    }
  }

  // Commits reachable from head but not from the merge base.
  const known = new Set<string>()
  if (mb) {
    const anc = await history(baseBlobsRepo, mb, { limit: 1000 })
    anc.commits.forEach((c) => known.add(c.id))
  }
  const onHead = await history(headRepo, head.id, { limit: 300 })
  const commits = onHead.commits.filter((c) => !known.has(c.id) && c.id !== base.id)

  const fastForward = mb === base.id
  const behind = mb !== base.id
  const changes = compareTrees(mergeCommit?.tree ?? {}, head.tree)
  const merge = fastForward || !mergeCommit ? null : mergeTrees(mergeCommit.tree, base.tree, head.tree)
  return { base, head, mergeBase: mergeCommit, baseBlobsRepo, changes, commits, fastForward, behind, merge }
}
