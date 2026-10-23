"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckIcon, FileDiffIcon, GitCommitHorizontalIcon, GitMergeIcon, GitPullRequestArrowIcon, GitPullRequestClosedIcon, GitPullRequestIcon, LoaderCircleIcon, MessageSquareIcon, PencilIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { TimeAgo } from "@/components/live/time"
import { ReportButton } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import { addPullComment, deleteComment, getPull, getRepoById, listPullComments, listPulls, listRefs, mergePull, ownerKey, ownerLabel, repoPath, StaleHead, updatePull, type Comment, type Pull, type Repo } from "@/lib/code/api"
import { compare, type Comparison } from "@/lib/code/compare"
import { shortSha } from "@/lib/code/hash"
import { cn } from "@/lib/utils"
import { CommitRows } from "./history"
import { DiffList } from "./diff-view"
import { CommentCard, EditTitle, IssueRow } from "./issues"
import { resolveRef, useRepo } from "./repo-context"
import { EmptyState, ErrorNote, FormError, href, inputCls, Panel, PanelHead, PersonName, plural, StaffHide, StateBadge, useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/* Pull requests: the list, and one pull request with its conversation, changed files and commits. */

export function PullsPage() {
  const { repo, base } = useRepo()
  const [state, setState] = useState<"open" | "closed">("open")
  const list = useLoad(() => listPulls(repo.id, state), [repo.id, state])
  const parent = useLoad(async () => (repo.forkedFrom ? getRepoById(repo.forkedFrom) : null), [repo.forkedFrom])
  return (
    <div className="flex flex-col gap-4">
      {parent.data && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ion/25 bg-ion/[0.05] px-4 py-3 text-sm">
          <GitPullRequestArrowIcon aria-hidden className="size-4 text-ion" />
          <span className="min-w-0 flex-1">
            This is a fork of{" "}
            <Link href={href(repoPath(parent.data))} className="font-medium hover:text-ion hover:underline">
              {ownerLabel(parent.data.owner)}/{parent.data.slug}
            </Link>
            . Send your changes back with a pull request there.
          </span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={href(`${repoPath(parent.data)}/compare?fork=${repo.id}&head=${encodeURIComponent(repo.defaultBranch)}&base=${encodeURIComponent(parent.data.defaultBranch)}`)} />}>
            Contribute upstream
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground"><Copy k="code-repo.pulls.propose-changes-from-a-branch">Propose changes from a branch or a fork, review them line by line, and merge.</Copy></p>
        {!repo.archivedAt && (
          <Button nativeButton={false} render={<Link href={href(`${base}/compare`)} />}>
            <PlusIcon aria-hidden /> <Copy k="code-repo.pulls.new-pull-request">New pull request</Copy>
          </Button>
        )}
      </div>
      <Panel>
        <PanelHead>
          {(["open", "closed"] as const).map((s) => (
            <button key={s} aria-pressed={state === s} onClick={() => setState(s)} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 capitalize transition-colors", state === s ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {s === "open" ? <GitPullRequestIcon aria-hidden className="size-4" /> : <CheckIcon aria-hidden className="size-4" />}
              {s}
              {s === "open" && <span className="tabular">{repo.openPulls}</span>}
            </button>
          ))}
        </PanelHead>
        {list.error ? (
          <ErrorNote error={list.error} onRetry={list.reload} className="m-3" />
        ) : !list.data ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !list.data.length ? (
          <EmptyState icon={GitPullRequestIcon} title={state === "open" ? "No open pull requests" : "No closed pull requests"}>
            {state === "open" ? "Edit a file onto a new branch, or fork and change things, then open a pull request from Compare." : undefined}
          </EmptyState>
        ) : (
          <ul>
            {list.data.map((p, n) => (
              <IssueRow
                key={p.id}
                issue={p}
                href={`${base}/pulls/${p.number}`}
                kind="pull"
                delay={n}
                extra={
                  <>
                    {" "}
                    · <span className="font-mono">{p.fromRepo === repo.id ? p.fromBranch : `fork:${p.fromBranch}`}</span> → <span className="font-mono">{p.toBranch}</span>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

type Loaded = { pull: Pull; fromRepo: Repo | null; cmp: Comparison | null; note: string | null; baseId: string | null; headId: string | null }

export function PullPage({ number, tab }: { number: number; tab: "conversation" | "files" | "commits" }) {
  const { repo, base, refs, me, writable, setRepo, reloadRefs } = useRepo()
  const data = useLoad(async (): Promise<Loaded | null> => {
    const pull = await getPull(repo.id, number)
    if (!pull) return null
    const fromRepo = pull.fromRepo === repo.id ? repo : await getRepoById(pull.fromRepo)
    if (pull.state === "merged" && pull.baseCommit && pull.headCommit) {
      // Merged: the history now lives in this repository, so compare what was there before with what came in.
      return { pull, fromRepo, cmp: await compare(repo.id, pull.baseCommit, repo.id, pull.headCommit), note: null, baseId: pull.baseCommit, headId: pull.headCommit }
    }
    const baseId = resolveRef(refs, pull.toBranch).commit
    const headRefs = pull.fromRepo === repo.id ? refs : fromRepo ? await listRefs(fromRepo.id) : []
    const headId = headRefs.find((r) => r.kind === "branch" && r.name === pull.fromBranch)?.commit ?? null
    if (!fromRepo) return { pull, fromRepo, cmp: null, note: "The repository these changes came from was deleted or is private.", baseId, headId }
    if (!baseId) return { pull, fromRepo, cmp: null, note: `The target branch ${pull.toBranch} no longer exists.`, baseId, headId }
    if (!headId) return { pull, fromRepo, cmp: null, note: `The branch ${pull.fromBranch} no longer exists, so its changes cannot be shown.`, baseId, headId }
    return { pull, fromRepo, cmp: await compare(repo.id, baseId, fromRepo.id, headId), note: null, baseId, headId }
  }, [repo.id, number, refs])
  const comments = useLoad(async () => (data.data ? listPullComments(data.data.pull.id) : []), [data.data?.pull.id])
  const [editing, setEditing] = useState(false)

  if (data.error) return <ErrorNote error={data.error} onRetry={data.reload} />
  if (!data.data)
    return data.loading ? (
      <Skeleton className="h-96 w-full rounded-xl" />
    ) : (
      <Panel>
        <EmptyState icon={GitPullRequestIcon} title={`There is no pull request #${number} here`}>
          It may be an issue: try{" "}
          <Link className="text-ion hover:underline" href={href(`${base}/issues/${number}`)}>
            #{number} in issues
          </Link>
          .
        </EmptyState>
      </Panel>
    )

  const { pull, fromRepo, cmp, note } = data.data
  const mine = me === pull.author?.id
  const setPull = (p: Pull) => data.set({ ...data.data!, pull: p })
  const headLabel = fromRepo && fromRepo.id !== repo.id ? `${ownerKey(fromRepo.owner)}:${pull.fromBranch}` : pull.fromBranch
  const all = comments.data ?? []
  const lineComments = all.filter((c) => c.path && c.line)
  const tabs = [
    { id: "conversation", label: "Conversation", icon: MessageSquareIcon, count: all.length, path: "" },
    { id: "commits", label: "Commits", icon: GitCommitHorizontalIcon, count: cmp?.commits.length, path: "/commits" },
    { id: "files", label: "Files changed", icon: FileDiffIcon, count: cmp?.changes.length, path: "/files" },
  ] as const

  const addComment = async (body: string, at?: { path: string; line: number; side: "old" | "new" }) => {
    const c = await addPullComment(pull.id, body, at)
    comments.set([...(comments.data ?? []), c])
  }

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <EditTitle
          initial={pull}
          onCancel={() => setEditing(false)}
          onSave={async (title, body) => {
            setPull(await updatePull(pull.id, { title, body }))
            setEditing(false)
          }}
        />
      ) : (
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.01em] break-words">
            {pull.title} <span className="font-normal text-muted-foreground">#{pull.number}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StateBadge state={pull.state} kind="pull" />
            <PersonName person={pull.author} />
            <span>
              {pull.state === "merged" ? "merged" : "wants to merge"} {cmp ? plural(cmp.commits.length, "commit") : ""} into <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">{pull.toBranch}</code> from{" "}
              {fromRepo ? (
                <Link href={href(`${repoPath(fromRepo)}/tree/${encodeURIComponent(pull.fromBranch)}`)} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground hover:text-ion">
                  {headLabel}
                </Link>
              ) : (
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{pull.fromBranch}</code>
              )}
            </span>
            <span className="ml-auto flex items-center gap-1">
              {(mine || writable) && pull.state !== "merged" && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setEditing(true)}>
                  <PencilIcon aria-hidden /> <Copy k="code-repo.pulls.edit">Edit</Copy>
                </Button>
              )}
              <ReportButton targetKind="code_pull" targetId={pull.id} targetUrl={`${base}/pulls/${pull.number}`} iconOnly />
              <StaffHide kind="pull" id={pull.id} hidden={Boolean(pull.hiddenAt)} onDone={(h) => setPull({ ...pull, hiddenAt: h ? new Date().toISOString() : null })} />
            </span>
          </div>
        </header>
      )}
      {pull.hiddenAt && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"><Copy k="code-repo.pulls.moderators-hid-this-pull-request" multiline>Moderators hid this pull request. Only its author, the repository&apos;s writers and staff can see it.</Copy></p>}

      <nav aria-label="Pull request" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={href(`${base}/pulls/${pull.number}${t.path}`)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm transition-colors", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <t.icon aria-hidden className="size-4" />
            {t.label}
            {t.count != null && <span className="rounded-full bg-secondary px-1.5 text-xs tabular">{t.count}</span>}
            {tab === t.id && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ion motion-safe:animate-in motion-safe:fade-in" />}
          </Link>
        ))}
      </nav>

      {note && (
        <p className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-gold" /> {note}
        </p>
      )}

      {tab === "files" ? (
        cmp ? (
          <DiffList
            changes={cmp.changes}
            oldRepo={cmp.baseBlobsRepo}
            newRepo={pull.state === "merged" ? repo.id : (fromRepo?.id ?? repo.id)}
            base={pull.state === "merged" ? base : fromRepo ? repoPath(fromRepo) : base}
            newRef={cmp.head.id}
            review={{ comments: lineComments, onComment: me && !repo.archivedAt ? (at, body) => addComment(body, at) : undefined }}
          />
        ) : !note ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : null
      ) : tab === "commits" ? (
        cmp ? <CommitRows commits={cmp.commits} base={pull.state === "merged" ? base : fromRepo ? repoPath(fromRepo) : base} /> : null
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <CommentCard author={pull.author} createdAt={pull.createdAt} body={pull.body || "_No description._"} highlight />
            {all.map((c) => (
              <PullComment key={c.id} comment={c} pull={pull} canDelete={me === c.author?.id || writable} onChange={(next) => comments.set(next ? all.map((x) => (x.id === c.id ? next : x)) : all.filter((x) => x.id !== c.id))} />
            ))}
            {pull.state === "open" && cmp && <MergeBox pull={pull} cmp={cmp} headId={data.data.headId} onMerged={async () => (setRepo({ ...repo, openPulls: Math.max(0, repo.openPulls - 1) }), await reloadRefs(), data.reload())} />}
            {pull.state === "merged" && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#b894ff]/30 bg-[#b894ff]/[0.07] px-4 py-3 text-sm">
                <GitMergeIcon aria-hidden className="size-5 text-[#c9adff]" />
                <span>
                  <PersonName person={pull.mergedBy} avatar={false} /> merged this {pull.mergedAt && <TimeAgo date={pull.mergedAt} />}
                  {pull.mergeCommit && (
                    <>
                      {" "}
                      as{" "}
                      <Link href={href(`${base}/commit/${pull.mergeCommit}`)} className="font-mono text-ion hover:underline">
                        {shortSha(pull.mergeCommit)}
                      </Link>
                    </>
                  )}
                  .
                </span>
              </div>
            )}
            <PullReply pull={pull} canClose={mine || writable} onState={setPull} onComment={(b) => addComment(b)} />
          </div>
          <aside className="flex flex-col gap-4 text-sm" aria-label="Pull request details">
            <section className="flex flex-col gap-1.5 border-b border-border pb-4">
              <h3 className="font-medium"><Copy k="code-repo.pulls.into">Into</Copy></h3>
              <span className="font-mono text-xs">
                {ownerLabel(repo.owner)}/{repo.slug}:{pull.toBranch}
              </span>
            </section>
            <section className="flex flex-col gap-1.5 border-b border-border pb-4">
              <h3 className="font-medium"><Copy k="code-repo.pulls.from">From</Copy></h3>
              <span className="font-mono text-xs break-all">{fromRepo ? `${ownerKey(fromRepo.owner)}/${fromRepo.slug}:${pull.fromBranch}` : pull.fromBranch}</span>
            </section>
            {cmp && (
              <section className="flex flex-col gap-1.5">
                <h3 className="font-medium"><Copy k="code-repo.pulls.changes">Changes</Copy></h3>
                <span className="text-muted-foreground">
                  {plural(cmp.changes.length, "file")} · {plural(cmp.commits.length, "commit")}
                </span>
                {lineComments.length > 0 && (
                  <Link href={href(`${base}/pulls/${pull.number}/files`)} className="text-ion hover:underline">
                    {plural(lineComments.length, "review comment")}
                  </Link>
                )}
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function PullComment({ comment: c, pull, canDelete, onChange }: { comment: Comment; pull: Pull; canDelete: boolean; onChange: (next: Comment | null) => void }) {
  const { base } = useRepo()
  return (
    <div className="flex flex-col gap-1">
      {c.path && c.line && (
        <Link href={href(`${base}/pulls/${pull.number}/files`)} className="ml-0 w-fit rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-ion sm:ml-11">
          {c.path}:{c.line} ({c.side === "old" ? "before" : "after"})
        </Link>
      )}
      <CommentCard
        author={c.author}
        createdAt={c.createdAt}
        body={c.body}
        hidden={Boolean(c.hiddenAt)}
        onDelete={canDelete ? async () => (await deleteComment("pull", c.id), onChange(null)) : undefined}
        staff={<StaffHide kind="pull_comment" id={c.id} hidden={Boolean(c.hiddenAt)} onDone={(h) => onChange({ ...c, hiddenAt: h ? new Date().toISOString() : null })} />}
      />
    </div>
  )
}

function PullReply({ pull, canClose, onState, onComment }: { pull: Pull; canClose: boolean; onState: (p: Pull) => void; onComment: (body: string) => Promise<void> }) {
  const { repo, base, me, setRepo } = useRepo()
  const caps = useCaps()
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!me)
    return (
      <p className="text-sm text-muted-foreground">
        <Link href={href(`/sign-in?next=${encodeURIComponent(`${base}/pulls/${pull.number}`)}`)} className="text-ion hover:underline">
          Sign in
        </Link>{" "}
        to comment.
      </p>
    )
  if (!caps.can("reply.create") || repo.archivedAt) return null
  const run = async (toggle: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (reply.trim()) {
        await onComment(reply.trim())
        setReply("")
      }
      if (toggle && pull.state !== "merged") {
        const next = await updatePull(pull.id, { state: pull.state === "open" ? "closed" : "open" })
        setRepo({ ...repo, openPulls: Math.max(0, repo.openPulls + (next.state === "open" ? 1 : -1)) })
        onState(next)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
      <MarkdownComposer id="pull-reply" value={reply} onChange={setReply} label="Add a comment" placeholder="Add a comment" rows={4} maxLength={20000} onSubmit={() => run(false)} />
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {canClose && pull.state !== "merged" && (
          <Button variant="outline" disabled={busy} onClick={() => run(true)}>
            {pull.state === "open" ? <GitPullRequestClosedIcon aria-hidden /> : <GitPullRequestIcon aria-hidden />}
            {pull.state === "open" ? "Close pull request" : "Reopen pull request"}
          </Button>
        )}
        <Button disabled={busy || !reply.trim()} onClick={() => run(false)}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Comment
        </Button>
      </div>
    </div>
  )
}

function MergeBox({ pull, cmp, headId, onMerged }: { pull: Pull; cmp: Comparison; headId: string | null; onMerged: () => Promise<void> }) {
  const { writable, base } = useRepo()
  const [message, setMessage] = useState(`Merge pull request #${pull.number}: ${pull.title}`)
  const [mode, setMode] = useState<"ff" | "merge">(cmp.fastForward ? "ff" : "merge")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nothing = !cmp.changes.length && !cmp.commits.length
  const conflicts = cmp.merge?.conflicts ?? []
  const unrelated = !cmp.fastForward && !cmp.merge
  const ok = !nothing && !unrelated && !conflicts.length

  const merge = async () => {
    if (!headId) return
    setBusy(true)
    setError(null)
    try {
      if (mode === "ff" && cmp.fastForward) await mergePull(pull.id, cmp.base.id, headId, true, null, "")
      else await mergePull(pull.id, cmp.base.id, headId, false, cmp.fastForward ? cmp.head.tree : cmp.merge!.tree, message.trim())
      await onMerged()
    } catch (err) {
      setError(err instanceof StaleHead ? `${err.message} Your page shows an older state of the branches.` : (err as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border p-4", ok ? "border-ok/30 bg-ok/[0.05]" : "border-gold/30 bg-gold/[0.06]")} aria-label="Merge">
      <div className="flex items-start gap-3">
        {ok ? <GitMergeIcon aria-hidden className="mt-0.5 size-5 text-ok" /> : <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 text-gold" />}
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {nothing ? (
            <p className="font-medium">{pull.toBranch} already has everything in this branch.</p>
          ) : unrelated ? (
            <p className="font-medium"><Copy k="code-repo.pulls.these-branches-share-no-history">These branches share no history, so they cannot be merged.</Copy></p>
          ) : conflicts.length ? (
            <>
              <p className="font-medium">{plural(conflicts.length, "file")} changed on both branches</p>
              <p className="text-muted-foreground">
                Nexverse merges whole files: when both sides changed the same file it will not guess. Bring {pull.toBranch} into {pull.fromBranch} (copy the other side&apos;s edits into these files on that branch), and this box turns green.
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
                {conflicts.map((p) => (
                  <li key={p} className="break-all">
                    {p}
                  </li>
                ))}
              </ul>
            </>
          ) : cmp.fastForward ? (
            <p className="font-medium">No conflicts. {pull.toBranch} can move straight to the latest commit of this branch.</p>
          ) : (
            <p className="font-medium"><Copy k="code-repo.pulls.no-conflicts-every-file-changed">No conflicts. Every file changed on only one side, so a merge commit can combine them.</Copy></p>
          )}
          {!writable && ok && <p className="text-muted-foreground"><Copy k="code-repo.pulls.only-people-who-can-write">Only people who can write to this repository can merge.</Copy></p>}
        </div>
      </div>
      {writable && ok && (
        <div className="flex flex-col gap-3 border-t border-border/70 pt-3">
          {cmp.fastForward && (
            <div className="flex flex-wrap gap-2 text-sm" role="radiogroup" aria-label="How to merge">
              {(
                [
                  ["ff", "Fast-forward", "Move the branch; no extra commit"],
                  ["merge", "Merge commit", "Record the merge as its own commit"],
                ] as const
              ).map(([m, label, hint]) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("flex flex-col rounded-lg border px-3 py-2 text-left transition-colors", mode === m ? "border-ion/50 bg-ion/10" : "border-border hover:border-foreground/30")}>
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          )}
          {mode === "merge" && <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} aria-label="Merge commit message" className={inputCls} />}
          <FormError message={error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || !headId || (mode === "merge" && !message.trim())} onClick={merge} className="bg-ok text-background hover:bg-ok/90">
              {busy ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <GitMergeIcon aria-hidden />}
              {mode === "ff" ? "Fast-forward merge" : "Merge pull request"}
            </Button>
            <Link href={href(`${base}/pulls/${pull.number}/files`)} className="text-sm text-muted-foreground hover:text-foreground">
              Review the {plural(cmp.changes.length, "file")} first
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
