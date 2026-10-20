"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { CheckIcon, CircleDotIcon, LoaderCircleIcon, MessageSquareIcon, PencilIcon, PlusIcon, SearchIcon, TagIcon, Trash2Icon } from "lucide-react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PostBody } from "@/components/forum/post-body"
import { TimeAgo } from "@/components/live/time"
import { Gate, ReportButton } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import { addIssueComment, createIssue, createLabel, deleteComment, getIssue, listCollaborators, listIssueComments, listIssues, listLabels, updateIssue, type Comment, type Issue, type Label } from "@/lib/code/api"
import { cn } from "@/lib/utils"
import { useRepo } from "./repo-context"
import { Avatar, EmptyState, ErrorNote, FormError, href, inputCls, LabelChip, Panel, PanelHead, PersonName, plural, StaffHide, StateBadge, StateIcon, useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/* Issues: the list with filters, a new issue, and one issue with its conversation. */

export function IssuesPage() {
  const { repo, base } = useRepo()
  const [state, setState] = useState<"open" | "closed">("open")
  const [label, setLabel] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const labels = useLoad(() => listLabels(repo.id), [repo.id])
  const list = useLoad(() => listIssues(repo.id, { state, label: label ?? undefined, q }), [repo.id, state, label, q])
  const byName = new Map((labels.data ?? []).map((l) => [l.name, l]))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only"><Copy k="code-repo.issues.search-issues">Search issues</Copy></span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search issue titles" className={cn(inputCls, "rounded-full pl-9")} />
        </label>
        <LabelFilter labels={labels.data ?? []} value={label} onChange={setLabel} />
        {!repo.archivedAt && (
          <Button className="ml-auto" nativeButton={false} render={<Link href={href(`${base}/issues/new`)} />}>
            <PlusIcon aria-hidden /> <Copy k="code-repo.issues.new-issue">New issue</Copy>
          </Button>
        )}
      </div>
      <Panel>
        <PanelHead>
          {(["open", "closed"] as const).map((s) => (
            <button key={s} aria-pressed={state === s} onClick={() => setState(s)} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 capitalize transition-colors", state === s ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {s === "open" ? <CircleDotIcon aria-hidden className="size-4" /> : <CheckIcon aria-hidden className="size-4" />}
              {s}
              {s === "open" && <span className="tabular">{repo.openIssues}</span>}
            </button>
          ))}
          {label && (
            <button onClick={() => setLabel(null)} className="ml-auto text-xs text-ion hover:underline">
              <Copy k="code-repo.issues.clear-label">Clear label</Copy>
            </button>
          )}
        </PanelHead>
        {list.error ? (
          <ErrorNote error={list.error} onRetry={list.reload} className="m-3" />
        ) : !list.data ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !list.data.length ? (
          <EmptyState icon={CircleDotIcon} title={q || label ? "No issues match" : state === "open" ? "No open issues" : "No closed issues"}>
            {state === "open" && !q && !label ? "Issues track bugs, ideas and questions. Anyone signed in can open one." : undefined}
          </EmptyState>
        ) : (
          <ul>
            {list.data.map((i, n) => (
              <IssueRow key={i.id} issue={i} labels={byName} href={`${base}/issues/${i.number}`} kind="issue" delay={n} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function IssueRow({ issue, labels, href: to, kind, delay, extra }: { issue: Pick<Issue, "id" | "number" | "title" | "author" | "createdAt" | "comments"> & { state: "open" | "closed" | "merged"; labels?: string[] }; labels?: Map<string, Label>; href: string; kind: "issue" | "pull"; delay: number; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both" style={{ animationDelay: `${Math.min(delay, 12) * 20}ms` }}>
      <StateIcon state={issue.state} kind={kind} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={href(to)} className="font-medium break-words hover:text-ion hover:underline">
            {issue.title}
          </Link>
          {issue.labels?.map((l) => (
            <LabelChip key={l} label={labels?.get(l) ?? l} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          #{issue.number} opened <TimeAgo date={issue.createdAt} /> by {issue.author?.handle ?? issue.author?.name ?? "a former member"}
          {extra}
        </p>
      </div>
      {issue.comments > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular">
          <MessageSquareIcon aria-hidden className="size-3.5" /> {issue.comments}
        </span>
      )}
    </li>
  )
}

function LabelFilter({ labels, value, onChange }: { labels: Label[]; value: string | null; onChange: (v: string | null) => void }) {
  if (!labels.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-9 rounded-full" />}>
        <TagIcon aria-hidden /> {value ?? "Label"}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 p-1">
        {labels.map((l) => (
          <button key={l.name} onClick={() => onChange(l.name === value ? null : l.name)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary">
            <CheckIcon aria-hidden className={cn("size-3.5", l.name === value ? "text-ion" : "invisible")} />
            <LabelChip label={l} />
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewIssuePage() {
  return (
    <Gate cap="issue.create" action="open an issue">
      <NewIssueForm />
    </Gate>
  )
}

function NewIssueForm() {
  const { repo, base, setRepo, writable } = useRepo()
  const router = useRouter()
  const labels = useLoad(() => listLabels(repo.id), [repo.id])
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (repo.archivedAt) return <Panel><EmptyState icon={CircleDotIcon} title={<Copy k="code-repo.issues.this-repository-is-archived-so">This repository is archived, so it takes no new issues</Copy>} /></Panel>
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return setError("Give the issue a title.")
        setBusy(true)
        setError(null)
        try {
          const i = await createIssue(repo.id, { title, body, labels: writable ? picked : [] })
          setRepo({ ...repo, openIssues: repo.openIssues + 1 })
          router.push(href(`${base}/issues/${i.number}`))
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
        }
      }}
      className="flex max-w-3xl flex-col gap-4"
    >
      <h2 className="text-lg font-semibold"><Copy k="code-repo.issues.new-issue">New issue</Copy></h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Title" aria-label="Title" className={inputCls} autoFocus />
      <MarkdownComposer id="issue-body" value={body} onChange={setBody} label="Description" placeholder="What happened, what you expected, and how to reproduce it." rows={8} maxLength={30000} />
      {writable && (labels.data?.length ?? 0) > 0 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-sm font-medium"><Copy k="code-repo.issues.labels">Labels</Copy></legend>
          {labels.data!.map((l) => (
            <button key={l.name} type="button" aria-pressed={picked.includes(l.name)} onClick={() => setPicked(picked.includes(l.name) ? picked.filter((x) => x !== l.name) : [...picked, l.name])} className={cn("rounded-full transition-opacity", !picked.includes(l.name) && "opacity-50 hover:opacity-80")}>
              <LabelChip label={l} />
            </button>
          ))}
        </fieldset>
      )}
      <FormError message={error} />
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Open issue
        </Button>
      </div>
    </form>
  )
}

export function IssuePage({ number }: { number: number }) {
  const { repo, base, me, writable, setRepo } = useRepo()
  const caps = useCaps()
  const data = useLoad(() => getIssue(repo.id, number), [repo.id, number])
  const comments = useLoad(async () => (data.data ? listIssueComments(data.data.id) : []), [data.data?.id])
  const labels = useLoad(() => listLabels(repo.id), [repo.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState("")
  const [editing, setEditing] = useState(false)
  if (data.error) return <ErrorNote error={data.error} onRetry={data.reload} />
  if (!data.data) return data.loading ? <Skeleton className="h-96 w-full rounded-xl" /> : <Panel><EmptyState icon={CircleDotIcon} title={`There is no issue #${number} here`}>It may be a pull request: try <Link className="text-ion hover:underline" href={href(`${base}/pulls/${number}`)}>#{number} in pull requests</Link>.</EmptyState></Panel>
  const issue = data.data
  const mine = me === issue.author?.id
  const canClose = mine || writable
  const byName = new Map((labels.data ?? []).map((l) => [l.name, l]))

  const patch = async (p: Parameters<typeof updateIssue>[1]) => {
    setBusy(true)
    setError(null)
    try {
      const next = await updateIssue(issue.id, p)
      if (p.state && p.state !== issue.state) setRepo({ ...repo, openIssues: repo.openIssues + (p.state === "open" ? 1 : -1) })
      data.set(next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const send = async (close: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (reply.trim()) {
        const c = await addIssueComment(issue.id, reply.trim())
        comments.set([...(comments.data ?? []), c])
        setReply("")
      }
      setBusy(false)
      if (close) await patch({ state: issue.state === "open" ? "closed" : "open" })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {editing ? (
          <EditTitle initial={issue} onCancel={() => setEditing(false)} onSave={async (t, b) => (await patch({ title: t, body: b }), setEditing(false))} />
        ) : (
          <header className="flex flex-col gap-2 border-b border-border pb-4">
            <h2 className="text-xl font-semibold tracking-[-0.01em] break-words">
              {issue.title} <span className="font-normal text-muted-foreground">#{issue.number}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StateBadge state={issue.state} kind="issue" />
              <PersonName person={issue.author} /> opened this <TimeAgo date={issue.createdAt} /> · {plural(comments.data?.length ?? issue.comments, "comment")}
              <span className="ml-auto flex items-center gap-1">
                {(mine || writable) && (
                  <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setEditing(true)}>
                    <PencilIcon aria-hidden /> <Copy k="code-repo.issues.edit">Edit</Copy>
                  </Button>
                )}
                <ReportButton targetKind="code_issue" targetId={issue.id} targetUrl={`${base}/issues/${issue.number}`} iconOnly />
                <StaffHide kind="issue" id={issue.id} hidden={Boolean(issue.hiddenAt)} onDone={(h) => data.set({ ...issue, hiddenAt: h ? new Date().toISOString() : null })} />
              </span>
            </div>
          </header>
        )}
        {issue.hiddenAt && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"><Copy k="code-repo.issues.moderators-hid-this-issue-only">Moderators hid this issue. Only its author and staff can see it.</Copy></p>}
        <CommentCard author={issue.author} createdAt={issue.createdAt} body={issue.body || "_No description._"} highlight />
        {comments.data?.map((c) => (
          <CommentCard
            key={c.id}
            author={c.author}
            createdAt={c.createdAt}
            body={c.body}
            hidden={Boolean(c.hiddenAt)}
            onDelete={me === c.author?.id || writable ? async () => (await deleteComment("issue", c.id), comments.set(comments.data!.filter((x) => x.id !== c.id))) : undefined}
            staff={<StaffHide kind="issue_comment" id={c.id} hidden={Boolean(c.hiddenAt)} onDone={(h) => comments.set(comments.data!.map((x) => (x.id === c.id ? { ...x, hiddenAt: h ? new Date().toISOString() : null } : x)) as Comment[])} />}
          />
        ))}
        {me && caps.can("reply.create") && !repo.archivedAt ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
            <MarkdownComposer id="issue-reply" value={reply} onChange={setReply} label="Add a comment" placeholder="Add a comment" rows={4} maxLength={20000} onSubmit={() => send(false)} />
            <FormError message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              {canClose && (
                <Button variant="outline" disabled={busy} onClick={() => send(true)}>
                  {issue.state === "open" ? (reply.trim() ? "Close with comment" : "Close issue") : reply.trim() ? "Reopen with comment" : "Reopen issue"}
                </Button>
              )}
              <Button disabled={busy || !reply.trim()} onClick={() => send(false)}>
                {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Comment
              </Button>
            </div>
          </div>
        ) : !me ? (
          <p className="text-sm text-muted-foreground">
            <Link href={href(`/sign-in?next=${encodeURIComponent(`${base}/issues/${number}`)}`)} className="text-ion hover:underline">
              Sign in
            </Link>{" "}
            to comment.
          </p>
        ) : null}
      </div>
      <aside className="flex flex-col gap-5 text-sm" aria-label="Issue details">
        <LabelsBox labels={labels.data ?? []} value={issue.labels} byName={byName} editable={writable} onChange={(l) => patch({ labels: l })} onCreated={labels.reload} />
        <AssigneesBox value={issue.assignees} editable={writable} onChange={(a) => patch({ assignees: a })} />
      </aside>
    </div>
  )
}

export function CommentCard({ author, createdAt, body, highlight, hidden, onDelete, staff }: { author: Comment["author"]; createdAt: string; body: string; highlight?: boolean; hidden?: boolean; onDelete?: () => Promise<void>; staff?: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <article className="flex gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
      <Avatar person={author} size={32} className="mt-1 hidden sm:block" />
      <div className={cn("min-w-0 flex-1 overflow-hidden rounded-xl border bg-card/40", highlight ? "border-ion/25" : "border-border")}>
        <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm", highlight ? "border-ion/20 bg-ion/[0.06]" : "border-border bg-secondary/30")}>
          <PersonName person={author} avatar={false} />
          <TimeAgo date={createdAt} className="text-xs text-muted-foreground" />
          <span className="ml-auto flex items-center gap-1">
            {staff}
            {onDelete && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete comment"
                className="hover:text-destructive"
                onClick={async () => {
                  if (!window.confirm("Delete this comment?")) return
                  try {
                    await onDelete()
                  } catch (err) {
                    setError((err as Error).message)
                  }
                }}
              >
                <Trash2Icon aria-hidden />
              </Button>
            )}
          </span>
        </div>
        <div className="px-4 py-3">{hidden ? <p className="text-sm text-muted-foreground italic"><Copy k="code-repo.issues.hidden-by-moderators">Hidden by moderators.</Copy></p> : <PostBody source={body} />}</div>
        {error && <p className="px-4 pb-2 text-xs text-destructive">{error}</p>}
      </div>
    </article>
  )
}

export function EditTitle({ initial, onSave, onCancel }: { initial: { title: string; body: string }; onSave: (title: string, body: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Title" className={inputCls} />
      <MarkdownComposer id="edit-body" value={body} onChange={setBody} label="Description" rows={6} maxLength={30000} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          <Copy k="code-repo.issues.cancel">Cancel</Copy>
        </Button>
        <Button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true)
            await onSave(title.trim(), body).finally(() => setBusy(false))
          }}
        >
          <Copy k="code-repo.issues.save">Save</Copy>
        </Button>
      </div>
    </div>
  )
}

function LabelsBox({ labels, value, byName, editable, onChange, onCreated }: { labels: Label[]; value: string[]; byName: Map<string, Label>; editable: boolean; onChange: (v: string[]) => void; onCreated: () => void }) {
  const { repo } = useRepo()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="flex flex-col gap-2 border-b border-border pb-4">
      <h3 className="font-medium"><Copy k="code-repo.issues.labels">Labels</Copy></h3>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <LabelChip key={l} label={byName.get(l) ?? l} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground"><Copy k="code-repo.issues.none-yet">None yet</Copy></p>
      )}
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className="h-7 w-fit rounded-full" />}>Edit labels</DropdownMenuTrigger>
          <DropdownMenuContent className="w-60 p-1">
            {labels.map((l) => (
              <button key={l.name} onClick={() => onChange(value.includes(l.name) ? value.filter((x) => x !== l.name) : [...value, l.name])} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary">
                <CheckIcon aria-hidden className={cn("size-3.5", value.includes(l.name) ? "text-ion" : "invisible")} />
                <LabelChip label={l} />
                <span className="truncate text-xs text-muted-foreground">{l.description}</span>
              </button>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setError(null)
                try {
                  const colors = ["8fb4ff", "d3b4ff", "9fe3cf", "e9c79a", "ff9f8f", "7fe0b0"]
                  await createLabel(repo.id, { name: name.trim(), color: colors[labels.length % colors.length], description: "" })
                  setName("")
                  onCreated()
                } catch (err) {
                  setError((err as Error).message)
                }
              }}
              className="mt-1 flex gap-1 border-t border-border p-1 pt-2"
            >
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={40} placeholder="New label" aria-label="New label name" className={cn(inputCls, "h-7 text-xs")} />
              <Button size="sm" type="submit" className="h-7" disabled={!name.trim()}>
                <Copy k="code-repo.issues.add">Add</Copy>
              </Button>
            </form>
            {error && <p className="px-2 pb-1 text-xs text-destructive">{error}</p>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </section>
  )
}

function AssigneesBox({ value, editable, onChange }: { value: string[]; editable: boolean; onChange: (v: string[]) => void }) {
  const { repo } = useRepo()
  const collabs = useLoad(() => listCollaborators(repo.id), [repo.id])
  const people = [repo.owner, ...(collabs.data ?? []).map((c) => c.member)]
  const assigned = people.filter((p) => value.includes(p.id))
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium"><Copy k="code-repo.issues.assignees">Assignees</Copy></h3>
      {assigned.length ? (
        <ul className="flex flex-col gap-1.5">
          {assigned.map((p) => (
            <li key={p.id}>
              <PersonName person={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground"><Copy k="code-repo.issues.no-one">No one</Copy></p>
      )}
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className="h-7 w-fit rounded-full" />}>Assign</DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 p-1">
            {people.map((p) => (
              <button key={p.id} onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary">
                <CheckIcon aria-hidden className={cn("size-3.5", value.includes(p.id) ? "text-ion" : "invisible")} />
                <Avatar person={p} size={18} />
                <span className="truncate">{p.handle ?? p.name}</span>
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </section>
  )
}
