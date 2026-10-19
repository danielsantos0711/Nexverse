"use client"

import { createContext, useContext } from "react"
import type { Ref, Repo, Role } from "@/lib/code/api"

/** What every page inside a repository needs: the repository, your role, its refs and a way to refresh them. */
export type RepoState = {
  repo: Repo
  setRepo: (r: Repo) => void
  role: Role
  me: string | null
  refs: Ref[]
  reloadRefs: () => Promise<void>
  /** "/code/<owner>/<slug>". */
  base: string
  writable: boolean
  admin: boolean
}

export const RepoContext = createContext<RepoState | null>(null)

export function useRepo(): RepoState {
  const c = useContext(RepoContext)
  if (!c) throw new Error("useRepo outside a repository")
  return c
}

/** The commit a ref name points at: a branch, a tag, or a commit id (full or short). */
export function resolveRef(refs: Ref[], name: string): { commit: string | null; kind: "branch" | "tag" | "commit" | null } {
  const b = refs.find((r) => r.kind === "branch" && r.name === name)
  if (b) return { commit: b.commit, kind: "branch" }
  const t = refs.find((r) => r.kind === "tag" && r.name === name)
  if (t) return { commit: t.commit, kind: "tag" }
  if (/^[0-9a-f]{7,64}$/.test(name)) return { commit: name, kind: "commit" }
  return { commit: null, kind: null }
}
