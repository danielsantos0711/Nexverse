"use client"

import { useId, useState } from "react"
import { GitBranchPlusIcon, GitCommitHorizontalIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { commitTree, StaleHead } from "@/lib/code/api"
import { VALID_REF, type Tree } from "@/lib/code/tree"
import { cn } from "@/lib/utils"
import { useRepo } from "./repo-context"
import { FormError, inputCls, textareaCls } from "./ui"
import { Copy } from "@/components/content/copy"

export type CommitTarget = { message: string; branch: string; isNew: boolean }

/**
 * Commit a new tree on top of `baseCommit`: straight to the branch you are on, or to a new branch (always the case
 * when you are looking at a tag or a commit). The database refuses the commit if the branch moved meanwhile.
 */
export async function commitOnto(repoId: string, baseCommit: string | null, tree: Tree, target: CommitTarget): Promise<string> {
  return commitTree(repoId, target.branch, baseCommit, tree, target.message)
}

export function CommitBox({
  branch,
  defaultMessage,
  busyLabel,
  disabled,
  onCommit,
  submitLabel = "Commit changes",
}: {
  /** The branch being edited, or null when the page shows a tag or a commit. */
  branch: string | null
  defaultMessage: string
  busyLabel?: string | null
  disabled?: boolean
  onCommit: (t: CommitTarget) => Promise<void>
  submitLabel?: string
}) {
  const id = useId()
  const { refs } = useRepo()
  const [summary, setSummary] = useState("")
  const [details, setDetails] = useState("")
  const [mode, setMode] = useState<"direct" | "new">(branch ? "direct" : "new")
  const [newBranch, setNewBranch] = useState(() => {
    let n = 1
    while (refs.some((r) => r.name === `patch-${n}`)) n++
    return `patch-${n}`
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setStale(false)
    const message = [(summary.trim() || defaultMessage).slice(0, 200), details.trim()].filter(Boolean).join("\n\n")
    const target = mode === "direct" && branch ? { message, branch, isNew: false } : { message, branch: newBranch.trim(), isNew: true }
    if (target.isNew && !VALID_REF.test(target.branch)) return setError("That branch name is not allowed. Use letters, numbers, dashes, dots and slashes.")
    if (target.isNew && refs.some((r) => r.name === target.branch)) return setError("A branch or tag with that name already exists.")
    setBusy(true)
    try {
      await onCommit(target)
    } catch (err) {
      if (err instanceof StaleHead) setStale(true)
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <GitCommitHorizontalIcon aria-hidden className="size-4 text-ion" /> <Copy k="code-repo.commit-box.commit">Commit</Copy>
      </h2>
      <label htmlFor={`${id}-s`} className="sr-only">
        Commit message
      </label>
      <input id={`${id}-s`} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={defaultMessage} maxLength={200} className={inputCls} />
      <label htmlFor={`${id}-d`} className="sr-only">
        Extended description
      </label>
      <textarea id={`${id}-d`} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Add an optional extended description" rows={2} className={textareaCls} />
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="sr-only"><Copy k="code-repo.commit-box.where-to-commit">Where to commit</Copy></legend>
        {branch && (
          <label className="flex items-center gap-2">
            <input type="radio" name={`${id}-m`} checked={mode === "direct"} onChange={() => setMode("direct")} className="accent-[var(--ion)]" />
            Commit directly to <span className="font-mono text-ion">{branch}</span>
          </label>
        )}
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name={`${id}-m`} checked={mode === "new"} onChange={() => setMode("new")} className="accent-[var(--ion)]" />
          <GitBranchPlusIcon aria-hidden className="size-4 text-muted-foreground" />
          <Copy k="code-repo.commit-box.create-a-new-branch-for">Create a new branch for this commit</Copy>
        </label>
        {mode === "new" && (
          <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} aria-label="New branch name" className={cn(inputCls, "ml-6 max-w-xs font-mono")} />
        )}
      </fieldset>
      <FormError message={error} />
      {stale && <p className="text-xs text-muted-foreground"><Copy k="code-repo.commit-box.copy-your-changes-somewhere-safe" multiline>Copy your changes somewhere safe, reload the page, and apply them to the latest version. Or commit them to a new branch instead.</Copy></p>}
      <div>
        <Button type="submit" disabled={busy || disabled}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {busy ? (busyLabel ?? "Committing…") : submitLabel}
        </Button>
      </div>
    </form>
  )
}
