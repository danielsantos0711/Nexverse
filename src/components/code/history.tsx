"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowLeftRightIcon, CopyIcon, FolderTreeIcon, GitCommitHorizontalIcon, GitCompareIcon, GitMergeIcon, GitPullRequestIcon, HistoryIcon, LoaderCircleIcon } from "lucide-react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import { createPull, encPath, getCommit, getRepoById, history, listForks, listRefs, repoPath, ownerKey, type CommitMeta, type Repo } from "@/lib/code/api"
import { compare } from "@/lib/code/compare"
import { shortSha } from "@/lib/code/hash"
import { compareTrees } from "@/lib/code/tree"
import { cn } from "@/lib/utils"
import { DiffList } from "./diff-view"
import { RefPicker } from "./ref-picker"
import { resolveRef, useRepo } from "./repo-context"
import { Avatar, EmptyState, ErrorNote, FormError, href, inputCls, Panel, PanelHead, PersonName, plural, useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/* History, one commit with its diff, and comparing two refs (where pull requests start). */

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })
}

export function CommitRows({ commits, base }: { commits: CommitMeta[]; base: string }) {
  const groups = useMemo(() => {
    const out: { day: string; list: CommitMeta[] }[] = []
    for (const c of commits) {
      const d = dayOf(c.createdAt)
      if (out[out.length - 1]?.day !== d) out.push({ day: d, list: [] })
      out[out.length - 1].list.push(c)
    }
    return out
  }, [commits])
  return (
    <ol className="relative flex flex-col gap-5">
      {groups.map((g) => (
        <li key={g.day} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <GitCommitHorizontalIcon aria-hidden className="size-4" /> Commits on {g.day}
          </h3>
          <Panel>
            <ul>
              {g.list.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-0 motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={href(`${base}/commit/${c.id}`)} className="truncate font-medium hover:text-ion hover:underline">
                      {c.message.split("\n")[0]}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Avatar person={c.author} size={16} />
                      <span className="text-foreground/80">{c.author?.handle ?? c.authorName}</span> committed <TimeAgo date={c.createdAt} />
                      {c.parents.length > 1 && <span className="rounded-full border border-border px-1.5"><Copy k="code-repo.history.merge">merge</Copy></span>}
                      {c.stats.added !== undefined && (
                        <span className="tabular">
                          · {[c.stats.added && `${c.stats.added} added`, c.stats.modified && `${c.stats.modified} changed`, c.stats.removed && `${c.stats.removed} removed`].filter(Boolean).join(", ") || "no file changes"}
                        </span>
                      )}
                    </span>
                  </div>
                  <ShaChip sha={c.id} base={base} />
                  <Link href={href(`${base}/tree/${c.id}`)} aria-label="Browse the files at this commit" title="Browse files" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <FolderTreeIcon aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </li>
      ))}
    </ol>
  )
}

function ShaChip({ sha, base }: { sha: string; base: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex h-7 items-center overflow-hidden rounded-full border border-border font-mono text-xs">
      <Link href={href(`${base}/commit/${sha}`)} className="px-2.5 hover:bg-secondary hover:text-ion">
        {shortSha(sha)}
      </Link>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(sha).catch(() => null)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        aria-label={copied ? "Copied" : "Copy the full commit id"}
        className="grid h-full w-7 place-items-center border-l border-border hover:bg-secondary"
      >
        <CopyIcon aria-hidden className={cn("size-3", copied && "text-ok")} />
      </button>
    </span>
  )
}

export function HistoryPage({ refName, path }: { refName: string; path: string }) {
  const { repo, refs, base } = useRepo()
  const head = resolveRef(refs, refName).commit
  const [pages, setPages] = useState(1)
  const list = useLoad(async () => {
    if (!head) return null
    const full = head.length === 64 ? head : (await getCommit(repo.id, head))?.id
    return full ? history(repo.id, full, { path: path || undefined, limit: 30 * pages }) : null
  }, [repo.id, head, path, pages])
  const to = (r: string) => `${base}/commits/${encPath(r)}${path ? `/${encPath(path)}` : ""}`
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RefPicker current={refName} commit={head} to={to} />
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
          History {path && <span className="font-mono text-muted-foreground">of {path}</span>}
        </h2>
      </div>
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : !list.data && list.loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : !list.data || !list.data.commits.length ? (
        <Panel>
          <EmptyState icon={HistoryIcon} title={<Copy k="code-repo.history.no-commits-here">No commits here</Copy>}>
            {head ? "Nothing on this branch changed this path." : "There is no branch, tag or commit with that name."}
          </EmptyState>
        </Panel>
      ) : (
        <>
          <CommitRows commits={list.data.commits} base={base} />
          {list.data.more && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setPages((p) => p + 1)} disabled={list.loading}>
                {list.loading && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Older commits
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function CommitPage({ sha }: { sha: string }) {
  const { repo, base } = useRepo()
  const data = useLoad(async () => {
    const c = await getCommit(repo.id, sha)
    if (!c) return null
    const parent = c.parents[0] ? await getCommit(repo.id, c.parents[0]) : null
    return { c, parent, changes: compareTrees(parent?.tree ?? null, c.tree) }
  }, [repo.id, sha])
  if (data.error) return <ErrorNote error={data.error} onRetry={data.reload} />
  if (!data.data) return data.loading ? <Skeleton className="h-96 w-full rounded-xl" /> : <Panel><EmptyState icon={GitCommitHorizontalIcon} title={<Copy k="code-repo.history.there-is-no-commit-with">There is no commit with that id in this repository</Copy>} /></Panel>
  const { c, changes } = data.data
  const [title, ...rest] = c.message.split("\n")
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex flex-col gap-2 p-4">
          <h2 className="text-lg font-semibold tracking-[-0.01em] break-words">{title}</h2>
          {rest.join("\n").trim() && <pre className="font-sans text-sm whitespace-pre-wrap text-muted-foreground">{rest.join("\n").trim()}</pre>}
        </div>
        <PanelHead className="justify-between border-t border-b-0">
          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <PersonName person={c.author} /> committed <TimeAgo date={c.createdAt} />
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {c.parents.length === 0 ? "First commit" : plural(c.parents.length, "parent")}
            {c.parents.map((p) => (
              <Link key={p} href={href(`${base}/commit/${p}`)} className="font-mono text-ion hover:underline">
                {shortSha(p)}
              </Link>
            ))}
            <ShaChip sha={c.id} base={base} />
            <Button size="sm" variant="outline" className="h-7 rounded-full" nativeButton={false} render={<Link href={href(`${base}/tree/${c.id}`)} />}>
              Browse files
            </Button>
          </span>
        </PanelHead>
      </Panel>
      {c.parents.length > 1 && <p className="text-sm text-muted-foreground"><Copy k="code-repo.history.a-merge-commit-the-diff">A merge commit: the diff below is against its first parent.</Copy></p>}
      <DiffList changes={changes} oldRepo={repo.id} newRepo={repo.id} base={base} newRef={c.id} />
    </div>
  )
}

// ─── Compare and open a pull request ────────────────────────────────────────────────────────────────────────

export function ComparePage() {
  const { repo, refs, base, me } = useRepo()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const caps = useCaps()
  const baseRef = params.get("base") || repo.defaultBranch
  const headRef = params.get("head") || ""
  const forkId = params.get("fork")

  const repos = useLoad(async () => {
    const forks = await listForks(repo.id).catch(() => [] as Repo[])
    const head = forkId && forkId !== repo.id ? ((await getRepoById(forkId)) ?? null) : null
    const headRefs = head ? await listRefs(head.id) : refs
    return { forks, head, headRefs }
  }, [repo.id, forkId, refs])

  const headRepo = repos.data?.head ?? repo
  const headRefs = repos.data?.headRefs ?? refs
  const set = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    router.replace(href(`${pathname}?${sp.toString()}`), { scroll: false })
  }

  const baseCommit = resolveRef(refs, baseRef).commit
  const headCommit = headRef ? resolveRef(headRefs, headRef).commit : null
  const cmp = useLoad(async () => (baseCommit && headCommit ? compare(repo.id, baseCommit, headRepo.id, headCommit) : null), [repo.id, baseCommit, headRepo.id, headCommit])

  const branches = refs.filter((r) => r.kind === "branch")
  const headBranches = headRefs.filter((r) => r.kind === "branch")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GitCompareIcon aria-hidden className="size-5 text-ion" /> <Copy k="code-repo.history.compare-changes">Compare changes</Copy>
        </h2>
        <p className="text-sm text-muted-foreground"><Copy k="code-repo.history.pick-a-branch-to-merge" multiline>Pick a branch to merge into, and the branch (here or in a fork) with the changes. The diff shows what the second one would bring in.</Copy></p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/40 p-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground"><Copy k="code-repo.history.into">into</Copy></span>
          <select value={baseRef} onChange={(e) => set({ base: e.target.value })} className={cn(inputCls, "h-8 w-auto font-mono")}>
            {branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
        <ArrowLeftRightIcon aria-hidden className="size-4 text-muted-foreground" />
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground"><Copy k="code-repo.history.from">from</Copy></span>
          <select value={headRepo.id} onChange={(e) => set({ fork: e.target.value === repo.id ? null : e.target.value, head: null })} className={cn(inputCls, "h-8 w-auto")} aria-label="Repository with the changes">
            <option value={repo.id}>{ownerKey(repo.owner)}/{repo.slug}</option>
            {(repos.data?.forks ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {ownerKey(f.owner)}/{f.slug}
              </option>
            ))}
            {repos.data?.head && !repos.data.forks.some((f) => f.id === repos.data!.head!.id) && (
              <option value={repos.data.head.id}>
                {ownerKey(repos.data.head.owner)}/{repos.data.head.slug}
              </option>
            )}
          </select>
          <select value={headRef} onChange={(e) => set({ head: e.target.value })} className={cn(inputCls, "h-8 w-auto font-mono")} aria-label="Branch with the changes">
            <option value="">Choose a branch</option>
            {headBranches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!headRef ? (
        <Panel>
          <EmptyState icon={GitCompareIcon} title={<Copy k="code-repo.history.choose-a-branch-to-compare">Choose a branch to compare</Copy>}>
            Branches you create while editing, or branches in your fork, can be compared here and turned into a pull request.
          </EmptyState>
        </Panel>
      ) : cmp.error ? (
        <ErrorNote error={cmp.error} onRetry={cmp.reload} />
      ) : !cmp.data ? (
        cmp.loading ? <Skeleton className="h-72 w-full rounded-xl" /> : <Panel><EmptyState icon={GitCompareIcon} title={<Copy k="code-repo.history.one-of-those-branches-does">One of those branches does not exist</Copy>} /></Panel>
      ) : cmp.data.base.id === cmp.data.head.id || (!cmp.data.commits.length && !cmp.data.changes.length) ? (
        <Panel>
          <EmptyState icon={GitCompareIcon} title={<Copy k="code-repo.history.there-is-nothing-to-compare">There is nothing to compare</Copy>}>
            {baseRef} already has everything in {headRef}.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm">
            {cmp.data.fastForward ? (
              <span className="flex items-center gap-2 text-ok">
                <GitMergeIcon aria-hidden className="size-4" /> Able to merge: {baseRef} can move straight to {headRef}.
              </span>
            ) : cmp.data.merge && !cmp.data.merge.conflicts.length ? (
              <span className="flex items-center gap-2 text-ok">
                <GitMergeIcon aria-hidden className="size-4" /> <Copy k="code-repo.history.able-to-merge-with-a">Able to merge with a merge commit. No file changed on both sides.</Copy>
              </span>
            ) : cmp.data.merge ? (
              <span className="flex items-center gap-2 text-gold">
                <GitMergeIcon aria-hidden className="size-4" /> {plural(cmp.data.merge.conflicts.length, "file")} changed on both branches. You can still open a pull request; it can be merged once they are reconciled.
              </span>
            ) : (
              <span className="text-gold"><Copy k="code-repo.history.these-branches-share-no-history">These branches share no history, so they cannot be merged.</Copy></span>
            )}
            <span className="ml-auto text-muted-foreground">
              {plural(cmp.data.commits.length, "commit")} · {plural(cmp.data.changes.length, "file")}
            </span>
          </div>
          {me && caps.can("issue.create") && !repo.archivedAt && <NewPullForm headRepo={headRepo} headRef={headRef} baseRef={baseRef} firstMessage={cmp.data.commits[cmp.data.commits.length - 1]?.message ?? ""} />}
          {!me && (
            <p className="text-sm text-muted-foreground">
              <Link href={href(`/sign-in?next=${encodeURIComponent(`${base}/compare`)}`)} className="text-ion hover:underline">
                Sign in
              </Link>{" "}
              to open a pull request.
            </p>
          )}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium"><Copy k="code-repo.history.commits">Commits</Copy></h3>
            <CommitRows commits={cmp.data.commits} base={repoPath(headRepo)} />
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium"><Copy k="code-repo.history.files-changed">Files changed</Copy></h3>
            <DiffList changes={cmp.data.changes} oldRepo={cmp.data.baseBlobsRepo} newRepo={headRepo.id} base={repoPath(headRepo)} newRef={headRef} />
          </section>
        </>
      )}
    </div>
  )
}

function NewPullForm({ headRepo, headRef, baseRef, firstMessage }: { headRepo: Repo; headRef: string; baseRef: string; firstMessage: string }) {
  const { repo, base, setRepo } = useRepo()
  const router = useRouter()
  const [title, setTitle] = useState(firstMessage.split("\n")[0] || headRef)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return setError("Give the pull request a title.")
        setBusy(true)
        setError(null)
        try {
          const p = await createPull({ repoId: repo.id, fromRepo: headRepo.id, fromBranch: headRef, toBranch: baseRef, title, body })
          setRepo({ ...repo, openPulls: repo.openPulls + 1 })
          router.push(href(`${base}/pulls/${p.number}`))
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-ion/25 bg-ion/[0.04] p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <GitPullRequestIcon aria-hidden className="size-4 text-ion" /> <Copy k="code-repo.history.open-a-pull-request">Open a pull request</Copy>
      </h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Title" className={inputCls} />
      <MarkdownComposer id="pull-body" value={body} onChange={setBody} label="Description" placeholder="What does this change, and why?" rows={5} maxLength={30000} />
      <FormError message={error} />
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Create pull request
        </Button>
      </div>
    </form>
  )
}
