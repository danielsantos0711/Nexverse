import type { Ref } from "./api"

/*
 * The pages inside a repository, parsed from the URL segments after /code/<owner>/<repo>. Branch and tag names
 * may contain slashes ("feature/login"), so a "tree", "blob" or "commits" address is split like GitHub does it:
 * the longest prefix that names a known ref (or looks like a commit id) is the ref, the rest is the path.
 */

export type RepoView =
  | { view: "home" }
  | { view: "tree" | "blob" | "edit" | "new" | "upload" | "commits"; ref: string; path: string }
  | { view: "commit"; sha: string }
  | { view: "compare" }
  | { view: "branches" | "tags" | "releases" | "release-new" | "issues" | "issue-new" | "pulls" | "settings" | "activity" }
  | { view: "issue"; number: number }
  | { view: "pull"; number: number; tab: "conversation" | "files" | "commits" }
  | { view: "missing" }

const PATHED = new Set(["tree", "blob", "edit", "new", "upload", "commits"])

/** Splits "a/b/c/d" into a ref and a path, using the repository's refs. */
export function splitRef(segments: string[], refs: Ref[], fallback: string): { ref: string; path: string } {
  if (!segments.length) return { ref: fallback, path: "" }
  const names = new Set(refs.map((r) => r.name))
  for (let i = segments.length; i >= 1; i--) {
    const cand = segments.slice(0, i).join("/")
    if (names.has(cand)) return { ref: cand, path: segments.slice(i).join("/") }
  }
  // A commit id, or a ref we do not know (deleted): the first segment.
  return { ref: segments[0], path: segments.slice(1).join("/") }
}

export function parseView(rest: string[], refs: Ref[], defaultBranch: string): RepoView {
  const [head, ...tail] = rest
  if (!head) return { view: "home" }
  if (PATHED.has(head)) {
    const { ref, path } = splitRef(tail, refs, defaultBranch)
    return { view: head as "tree", ref, path }
  }
  switch (head) {
    case "commit":
      return tail[0] && /^[0-9a-f]{7,64}$/.test(tail[0]) ? { view: "commit", sha: tail[0] } : { view: "missing" }
    case "compare":
      return { view: "compare" }
    case "branches":
    case "tags":
    case "settings":
    case "activity":
      return tail.length ? { view: "missing" } : { view: head }
    case "releases":
      return tail[0] === "new" ? { view: "release-new" } : tail.length ? { view: "missing" } : { view: "releases" }
    case "issues":
      if (!tail.length) return { view: "issues" }
      if (tail[0] === "new") return { view: "issue-new" }
      return /^\d{1,9}$/.test(tail[0]) ? { view: "issue", number: Number(tail[0]) } : { view: "missing" }
    case "pulls":
    case "pull":
      if (!tail.length) return { view: "pulls" }
      if (/^\d{1,9}$/.test(tail[0])) return { view: "pull", number: Number(tail[0]), tab: tail[1] === "files" ? "files" : tail[1] === "commits" ? "commits" : "conversation" }
      return { view: "missing" }
    default:
      return { view: "missing" }
  }
}
