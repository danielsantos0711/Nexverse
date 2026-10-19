"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { DownloadIcon, FileArchiveIcon, GitBranchIcon, GitPullRequestIcon, LoaderCircleIcon, PackageIcon, PaperclipIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PostBody } from "@/components/forum/post-body"
import { bytes } from "@/components/live/detail"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { blobUrl, createRef, createRelease, deleteRef, deleteRelease, encPath, getCommit, getCommitMetas, listReleases, updateRepo, uploadFiles, type Ref, type ReleaseAsset } from "@/lib/code/api"
import { downloadZip } from "@/lib/code/download"
import { shortSha } from "@/lib/code/hash"
import { mimeOf } from "@/lib/code/lang"
import { VALID_REF } from "@/lib/code/tree"
import { cn } from "@/lib/utils"
import { resolveRef, useRepo } from "./repo-context"
import { EmptyState, ErrorNote, FormError, href, inputCls, Panel, PanelHead, PersonName, plural, useLoad } from "./ui"

/* Branches, tags and releases. */

function useHeads(refs: Ref[]) {
  const { repo } = useRepo()
  return useLoad(() => getCommitMetas(repo.id, refs.map((r) => r.commit)), [repo.id, refs.map((r) => r.commit).join()])
}

function NewRefForm({ kind }: { kind: "branch" | "tag" }) {
  const id = useId()
  const { repo, refs, reloadRefs } = useRepo()
  const branches = refs.filter((r) => r.kind === "branch")
  const [name, setName] = useState("")
  const [from, setFrom] = useState(repo.defaultBranch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!VALID_REF.test(n)) return setError("Use letters, numbers, dots, dashes and slashes.")
        const at = resolveRef(refs, from).commit
        if (!at) return setError("Pick where it starts.")
        setBusy(true)
        setError(null)
        try {
          await createRef(repo.id, kind, n, at)
          await reloadRefs()
          setName("")
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-n`} className="sr-only">
          New {kind} name
        </label>
        <input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "branch" ? "new-branch" : "v1.0.0"} className={cn(inputCls, "h-8 w-48 flex-1 font-mono sm:flex-none")} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          from
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputCls, "h-8 w-auto font-mono")}>
            {branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
        <Button size="sm" type="submit" disabled={busy || !name.trim()}>
          {busy ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <PlusIcon aria-hidden />}
          Create {kind}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  )
}

export function BranchesPage() {
  const { repo, setRepo, refs, base, writable, admin, reloadRefs } = useRepo()
  const branches = refs.filter((r) => r.kind === "branch").sort((a, b) => Number(b.name === repo.defaultBranch) - Number(a.name === repo.defaultBranch) || b.updatedAt.localeCompare(a.updatedAt))
  const heads = useHeads(branches)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <GitBranchIcon aria-hidden className="size-5 text-ion" /> Branches
      </h2>
      {writable && branches.length > 0 && <NewRefForm kind="branch" />}
      <FormError message={error} />
      {!branches.length ? (
        <Panel>
          <EmptyState icon={GitBranchIcon} title="No branches yet">
            The first commit creates the {repo.defaultBranch} branch.
          </EmptyState>
        </Panel>
      ) : (
        <Panel>
          <ul>
            {branches.map((b) => {
              const h = heads.data?.get(b.commit)
              const isDefault = b.name === repo.defaultBranch
              return (
                <li key={b.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-0">
                  <Link href={href(`${base}/tree/${encPath(b.name)}`)} className="font-mono text-sm text-ion hover:underline">
                    {b.name}
                  </Link>
                  {isDefault && <span className="rounded-full border border-border px-2 text-[11px] text-muted-foreground">default</span>}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {h ? (
                      <>
                        {h.message.split("\n")[0]} · <TimeAgo date={h.createdAt} />
                      </>
                    ) : (
                      shortSha(b.commit)
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isDefault && (
                      <Button size="sm" variant="outline" className="h-7 rounded-full" nativeButton={false} render={<Link href={href(`${base}/compare?base=${encodeURIComponent(repo.defaultBranch)}&head=${encodeURIComponent(b.name)}`)} />}>
                        <GitPullRequestIcon aria-hidden /> Compare
                      </Button>
                    )}
                    {admin && !isDefault && !repo.archivedAt && (
                      <Button size="sm" variant="ghost" className="h-7 rounded-full" disabled={busy === b.name} onClick={() => act(b.name, async () => setRepo(await updateRepo(repo.id, { default_branch: b.name })))}>
                        Make default
                      </Button>
                    )}
                    {writable && !isDefault && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete branch ${b.name}`} className="hover:text-destructive" disabled={busy === b.name} onClick={() => act(b.name, async () => (await deleteRef(repo.id, "branch", b.name), await reloadRefs()))}>
                        {busy === b.name ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <Trash2Icon aria-hidden />}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function ZipButton({ commit, name, label = "Zip" }: { commit: string; name: string; label?: string }) {
  const { repo } = useRepo()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 rounded-full"
        disabled={Boolean(busy)}
        onClick={async () => {
          setBusy("…")
          setError(null)
          try {
            const c = await getCommit(repo.id, commit)
            if (!c) throw new Error("That commit is gone.")
            await downloadZip(repo.id, repo.slug, name, c.tree, c.createdAt, (d, t) => setBusy(`${d}/${t}`))
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(null)
          }
        }}
      >
        {busy ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <FileArchiveIcon aria-hidden />}
        {busy && busy !== "…" ? busy : label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  )
}

export function TagsPage() {
  const { repo, refs, base, writable, reloadRefs } = useRepo()
  const tags = refs.filter((r) => r.kind === "tag").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const heads = useHeads(tags)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <TagIcon aria-hidden className="size-5 text-gold" /> Tags
      </h2>
      {writable && refs.some((r) => r.kind === "branch") && <NewRefForm kind="tag" />}
      <FormError message={error} />
      {!tags.length ? (
        <Panel>
          <EmptyState icon={TagIcon} title="No tags yet">
            A tag marks one commit for good, like a version. Releases are built on tags.
          </EmptyState>
        </Panel>
      ) : (
        <Panel>
          <ul>
            {tags.map((t) => {
              const h = heads.data?.get(t.commit)
              return (
                <li key={t.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-0">
                  <Link href={href(`${base}/tree/${encPath(t.name)}`)} className="font-mono text-sm text-gold hover:underline">
                    {t.name}
                  </Link>
                  <Link href={href(`${base}/commit/${t.commit}`)} className="font-mono text-xs text-muted-foreground hover:text-ion">
                    {shortSha(t.commit)}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{h && <TimeAgo date={h.createdAt} />}</span>
                  <ZipButton commit={t.commit} name={t.name} />
                  {writable && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete tag ${t.name}`}
                      className="hover:text-destructive"
                      onClick={async () => {
                        setError(null)
                        try {
                          await deleteRef(repo.id, "tag", t.name)
                          await reloadRefs()
                        } catch (err) {
                          setError((err as Error).message)
                        }
                      }}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}

export function ReleasesPage() {
  const { repo, refs, base, writable } = useRepo()
  const list = useLoad(() => listReleases(repo.id), [repo.id])
  const [error, setError] = useState<string | null>(null)
  const download = async (a: ReleaseAsset) => {
    setError(null)
    try {
      location.href = await blobUrl(repo.id, a.sha, a.name)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <PackageIcon aria-hidden className="size-5 text-gold" /> Releases
        </h2>
        {writable && refs.some((r) => r.kind === "branch") && (
          <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href={href(`${base}/releases/new`)} />}>
            <PlusIcon aria-hidden /> New release
          </Button>
        )}
      </div>
      <FormError message={error} />
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !list.data.length ? (
        <Panel>
          <EmptyState icon={PackageIcon} title="No releases yet">
            A release is a tagged version with notes and downloadable files, such as model weights or a build.
          </EmptyState>
        </Panel>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l border-border pl-5">
          {list.data.map((r, i) => {
            const tag = refs.find((x) => x.kind === "tag" && x.name === r.tag)
            return (
              <li key={r.id} className="relative motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both" style={{ animationDelay: `${i * 40}ms` }}>
                <span aria-hidden className={cn("absolute top-5 -left-[26px] size-2.5 rounded-full ring-4 ring-background", i === 0 ? "bg-gold shadow-[0_0_12px_rgb(216_197_158/0.7)]" : "bg-border")} />
                <Panel>
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{r.title}</h3>
                      {i === 0 && !r.prerelease && <span className="rounded-full border border-ok/30 bg-ok/10 px-2 text-[11px] text-ok">Latest</span>}
                      {r.prerelease && <span className="rounded-full border border-gold/30 bg-gold/10 px-2 text-[11px] text-gold">Pre-release</span>}
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        <TagIcon aria-hidden className="size-3.5" />
                        <Link href={href(`${base}/tree/${encPath(r.tag)}`)} className="font-mono hover:text-ion">
                          {r.tag}
                        </Link>
                        · <PersonName person={r.author} avatar={16} /> · <TimeAgo date={r.createdAt} />
                      </span>
                    </div>
                    {r.notes && <PostBody source={r.notes} />}
                  </div>
                  <PanelHead className="border-t border-b-0">
                    <span className="font-medium">Assets</span>
                    <span className="text-muted-foreground">{r.assets.length + (tag ? 1 : 0)}</span>
                  </PanelHead>
                  <ul>
                    {r.assets.map((a) => (
                      <li key={a.sha + a.name} className="flex items-center gap-3 border-t border-border px-4 py-2 text-sm">
                        <PaperclipIcon aria-hidden className="size-4 text-muted-foreground" />
                        <button onClick={() => download(a)} className="min-w-0 flex-1 truncate text-left text-ion hover:underline">
                          {a.name}
                        </button>
                        <span className="text-xs text-muted-foreground tabular">{bytes(a.size)}</span>
                      </li>
                    ))}
                    {tag && (
                      <li className="flex items-center gap-3 border-t border-border px-4 py-2 text-sm">
                        <FileArchiveIcon aria-hidden className="size-4 text-muted-foreground" />
                        <span className="flex-1 text-muted-foreground">Source code</span>
                        <ZipButton commit={tag.commit} name={r.tag} label="Download zip" />
                      </li>
                    )}
                  </ul>
                  {writable && <DeleteRelease id={r.id} onDone={list.reload} />}
                </Panel>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function DeleteRelease({ id, onDone }: { id: string; onDone: () => void }) {
  const [sure, setSure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant={sure ? "destructive" : "ghost"}
        className="h-7 rounded-full"
        onClick={async () => {
          if (!sure) return setSure(true)
          try {
            await deleteRelease(id)
            onDone()
          } catch (err) {
            setError((err as Error).message)
          }
        }}
        onBlur={() => setSure(false)}
      >
        <Trash2Icon aria-hidden /> {sure ? "Delete this release" : "Delete"}
      </Button>
    </div>
  )
}

export function NewReleasePage() {
  const id = useId()
  const { repo, refs, base, writable, reloadRefs } = useRepo()
  const router = useRouter()
  const tags = refs.filter((r) => r.kind === "tag")
  const branches = refs.filter((r) => r.kind === "branch")
  const [tag, setTag] = useState("")
  const [target, setTarget] = useState(repo.defaultBranch)
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [pre, setPre] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!writable) {
    return (
      <Panel>
        <EmptyState icon={PackageIcon} title="Only people who can write to this repository publish releases" />
      </Panel>
    )
  }
  const existing = tags.some((t) => t.name === tag.trim())
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const t = tag.trim()
    if (!VALID_REF.test(t)) return setError("Give the release a tag, like v1.0.0.")
    if (files.length > 20) return setError("Attach at most 20 files.")
    const badName = files.find((f) => !/^[A-Za-z0-9._ +()-]{1,120}$/.test(f.name))
    if (badName) return setError(`Rename ${badName.name}: use letters, numbers, spaces, dots, dashes and brackets.`)
    try {
      if (!existing) {
        const at = resolveRef(refs, target).commit
        if (!at) throw new Error("Pick the branch to tag.")
        setBusy("Creating the tag…")
        await createRef(repo.id, "tag", t, at)
        await reloadRefs()
      }
      let assets: ReleaseAsset[] = []
      if (files.length) {
        setBusy("Uploading files…")
        const entries = await uploadFiles(
          repo.id,
          await Promise.all(files.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.arrayBuffer()) }))),
          (d, n, phase) => setBusy(phase === "hashing" ? `Hashing ${d}/${n}…` : `Uploading ${d}/${n}…`)
        )
        assets = files.map((f) => ({ name: f.name, sha: entries[f.name].sha, size: entries[f.name].size, type: f.type && /^[a-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(f.type) ? f.type : mimeOf(f.name) }))
      }
      setBusy("Publishing…")
      await createRelease(repo.id, { tag: t, title: title.trim() || t, notes, prerelease: pre, assets })
      router.push(href(`${base}/releases`))
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }
  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <PackageIcon aria-hidden className="size-5 text-gold" /> New release
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-tag`} className="text-sm font-medium">
            Tag
          </label>
          <input id={`${id}-tag`} list={`${id}-tags`} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.0.0" className={cn(inputCls, "font-mono")} required />
          <datalist id={`${id}-tags`}>
            {tags.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">{existing ? "An existing tag." : tag.trim() ? "A new tag, created when you publish." : "Pick an existing tag or type a new one."}</p>
        </div>
        {!existing && (
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-target`} className="text-sm font-medium">
              Tag the latest commit on
            </label>
            <select id={`${id}-target`} value={target} onChange={(e) => setTarget(e.target.value)} className={cn(inputCls, "font-mono")}>
              {branches.map((b) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          Title
        </label>
        <input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder={tag || "Release title"} className={inputCls} />
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Notes</span>
        <MarkdownComposer id={`${id}-notes`} value={notes} onChange={setNotes} label="Release notes" placeholder="What changed, what to download, how to upgrade." rows={8} maxLength={20000} mentions={false} />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Files</span>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground transition-colors hover:border-ion/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <DownloadIcon aria-hidden className="size-5 rotate-180" />
          Attach binaries, weights or archives (up to 25 MB each)
          <input type="file" multiple className="sr-only" onChange={(e) => setFiles([...files, ...(e.target.files ?? [])])} />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                <PaperclipIcon aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{bytes(f.size)}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-destructive">
                  <Trash2Icon aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
            <li className="text-xs text-muted-foreground">{plural(files.length, "file")}</li>
          </ul>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pre} onChange={(e) => setPre(e.target.checked)} className="size-4 accent-[var(--ion)]" />
        This is a pre-release
      </label>
      <FormError message={error} />
      <div>
        <Button type="submit" disabled={Boolean(busy)}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {busy ?? "Publish release"}
        </Button>
      </div>
    </form>
  )
}
