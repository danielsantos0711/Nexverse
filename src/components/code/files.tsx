"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpenIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  HistoryIcon,
  LinkIcon,
  MessagesSquareIcon,
  PencilIcon,
  RocketIcon,
  ScaleIcon,
  ShieldAlertIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  EyeIcon,
  GitForkIcon,
} from "lucide-react"
import { Markdown } from "@/components/live/markdown"
import { LanguageBar } from "@/components/live/language-bar"
import { bytes } from "@/components/live/detail"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { blobUrl, encPath, fullName, getCommit, LIMITS, readBlob, updateRepo, uploadFiles, type Commit, type Upload } from "@/lib/code/api"
import { shortSha } from "@/lib/code/hash"
import { countsAsCode, imageType, isMarkdown, isReadme, langOf, looksLikeText } from "@/lib/code/lang"
import { cleanPath, listDir, treeClash, type DirItem, type Tree } from "@/lib/code/tree"
import { resolveTargets, type Resolved } from "@/lib/hub"
import { getLaunch } from "@/lib/launchpad"
import { cn } from "@/lib/utils"
import { RepoSummaryCard, ExplainButton, useExplain } from "./ai"
import { CodeLines } from "./code-view"
import { CommitBox, commitOnto, type CommitTarget } from "./commit-box"
import { CodeMenu, RefPicker } from "./ref-picker"
import { resolveRef, useRepo } from "./repo-context"
import { Avatar, EmptyState, ErrorNote, FormError, href, inputCls, Panel, PanelHead, plural, useLoad } from "./ui"

/* The Code tab: the file explorer, the file viewer, the in-browser editor and uploads. */

// ─── Loading a snapshot ─────────────────────────────────────────────────────────────────────────────────────

function useSnapshot(refName: string) {
  const { repo, refs } = useRepo()
  const r = resolveRef(refs, refName)
  const load = useLoad<Commit | null>(async () => (r.commit ? getCommit(repo.id, r.commit) : null), [repo.id, r.commit])
  return { ...load, kind: r.kind, branch: r.kind === "branch" ? refName : null }
}

function Crumbs({ refName, path, leaf = "tree" }: { refName: string; path: string; leaf?: "tree" | "blob" }) {
  const { repo, base } = useRepo()
  const parts = path ? path.split("/") : []
  return (
    <nav aria-label="File path" className="min-w-0 font-mono text-[13px]">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        <li>
          <Link href={href(`${base}/tree/${encPath(refName)}`)} className="font-sans font-medium text-ion hover:underline">
            {repo.slug}
          </Link>
        </li>
        {parts.map((p, i) => {
          const last = i === parts.length - 1
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              <span aria-hidden className="text-muted-foreground/60">
                /
              </span>
              {last ? (
                <span className="break-all text-foreground" aria-current="page">
                  {p}
                </span>
              ) : (
                <Link href={href(`${base}/tree/${encPath(refName)}/${encPath(parts.slice(0, i + 1).join("/"))}`)} className="break-all text-ion hover:underline">
                  {p}
                </Link>
              )}
            </li>
          )
        })}
        {leaf === "tree" && parts.length > 0 && (
          <li aria-hidden className="text-muted-foreground/60">
            /
          </li>
        )}
      </ol>
    </nav>
  )
}

function iconFor(item: DirItem) {
  if (item.type === "dir") return FolderIcon
  if (imageType(item.name)) return FileImageIcon
  if (langOf(item.name)) return FileCodeIcon
  if (/\.(md|txt|rst)$/i.test(item.name) || isReadme(item.name)) return FileTextIcon
  return FileIcon
}

// ─── Home and folders ───────────────────────────────────────────────────────────────────────────────────────

export function RepoHome() {
  const { repo, refs } = useRepo()
  if (!refs.some((r) => r.kind === "branch")) return <EmptyRepo />
  return <Browser refName={refs.some((r) => r.name === repo.defaultBranch) ? repo.defaultBranch : refs.find((r) => r.kind === "branch")!.name} path="" home />
}

export function TreePage({ refName, path }: { refName: string; path: string }) {
  return <Browser refName={refName} path={path} />
}

function EmptyRepo() {
  const { repo, base, writable } = useRepo()
  const b = encPath(repo.defaultBranch)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Panel>
        <EmptyState
          icon={FolderOpenIcon}
          title="This repository is empty"
          action={
            writable ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" nativeButton={false} render={<Link href={href(`${base}/new/${b}`)} />}>
                  <FilePlusIcon aria-hidden /> Create a file
                </Button>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={href(`${base}/upload/${b}`)} />}>
                  <UploadIcon aria-hidden /> Upload files
                </Button>
              </div>
            ) : undefined
          }
        >
          {writable ? "Start with a README, or drop a folder of files in. Every change becomes a commit you can look back on." : "Nothing has been committed yet."}
        </EmptyState>
      </Panel>
      <About tree={{}} commit={null} />
    </div>
  )
}

function Browser({ refName, path, home = false }: { refName: string; path: string; home?: boolean }) {
  const { base, writable } = useRepo()
  const snap = useSnapshot(refName)
  const router = useRouter()
  const items = useMemo(() => (snap.data ? listDir(snap.data.tree, path) : null), [snap.data, path])

  // A file address typed into /tree/ shows the file.
  useEffect(() => {
    if (snap.data && !items && snap.data.tree[path]) router.replace(href(`${base}/blob/${encPath(refName)}/${encPath(path)}`))
  }, [snap.data, items, path, base, refName, router])

  const readme = items?.find((i) => i.type === "file" && isReadme(i.name))
  const to = (r: string) => `${base}/tree/${encPath(r)}${path ? `/${encPath(path)}` : ""}`

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RefPicker current={refName} commit={snap.data?.id ?? null} to={to} />
        {!home && <Crumbs refName={refName} path={path} />}
        <div className="ml-auto flex items-center gap-2">
          {writable && snap.branch && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-[13px]" />}>
                <FilePlusIcon aria-hidden /> Add file <ChevronDownIcon aria-hidden className="opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={href(`${base}/new/${encPath(refName)}${path ? `/${encPath(path)}` : ""}`)} />}>
                  <FilePlusIcon aria-hidden /> Create new file
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={href(`${base}/upload/${encPath(refName)}${path ? `/${encPath(path)}` : ""}`)} />}>
                  <UploadIcon aria-hidden /> Upload files
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {snap.data && <CodeMenu refName={refName} tree={snap.data.tree} at={snap.data.createdAt} />}
        </div>
      </div>

      {snap.error ? (
        <ErrorNote error={snap.error} onRetry={snap.reload} />
      ) : snap.loading && !snap.data ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : !snap.data ? (
        <Panel>
          <EmptyState icon={FolderIcon} title={`There is no branch, tag or commit called ${refName}`}>
            It may have been deleted. Pick another one above.
          </EmptyState>
        </Panel>
      ) : !items ? (
        snap.data.tree[path] ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <Panel>
            <EmptyState icon={FolderIcon} title="This folder does not exist here">
              It may only exist on another branch.
            </EmptyState>
          </Panel>
        )
      ) : (
        <>
          <Panel>
            <LastCommit commit={snap.data} refName={refName} path={path} />
            <ul>
              {path && (
                <li className="border-b border-border">
                  <Link href={href(`${base}/tree/${encPath(refName)}${path.includes("/") ? `/${encPath(path.slice(0, path.lastIndexOf("/")))}` : ""}`)} className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground hover:bg-white/[0.03] hover:text-foreground">
                    <FolderIcon aria-hidden className="size-4" />
                    <span className="font-mono">..</span>
                  </Link>
                </li>
              )}
              {items.map((it, i) => {
                const Icon = iconFor(it)
                return (
                  <li key={it.path} className="border-b border-border last:border-0 motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both" style={{ animationDelay: `${Math.min(i, 20) * 12}ms` }}>
                    <Link
                      href={href(`${base}/${it.type === "dir" ? "tree" : "blob"}/${encPath(refName)}/${encPath(it.path)}`)}
                      className="group flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                    >
                      <Icon aria-hidden className={cn("size-4 shrink-0", it.type === "dir" ? "text-ion" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1 truncate group-hover:text-ion group-hover:underline">{it.name}</span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular">{it.type === "file" ? bytes(it.size) : ""}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>
          {readme && <ReadmePanel name={readme.name} sha={readme.sha!} />}
        </>
      )}
    </div>
  )

  if (!home) return main
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {main}
      <About tree={snap.data?.tree ?? {}} commit={snap.data ?? null} />
    </div>
  )
}

function LastCommit({ commit, refName, path }: { commit: Commit; refName: string; path: string }) {
  const { base } = useRepo()
  const title = commit.message.split("\n")[0]
  return (
    <PanelHead className="gap-x-3">
      <Avatar person={commit.author} size={20} />
      <span className="font-medium">{commit.author?.handle ?? commit.authorName}</span>
      <Link href={href(`${base}/commit/${commit.id}`)} className="min-w-0 flex-1 truncate text-muted-foreground hover:text-ion hover:underline">
        {title}
      </Link>
      <Link href={href(`${base}/commit/${commit.id}`)} className="font-mono text-xs text-muted-foreground hover:text-ion">
        {shortSha(commit.id)}
      </Link>
      <TimeAgo date={commit.createdAt} className="text-xs text-muted-foreground" />
      <Link href={href(`${base}/commits/${encPath(refName)}${path ? `/${encPath(path)}` : ""}`)} className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-ion">
        <HistoryIcon aria-hidden className="size-3.5" /> History
      </Link>
    </PanelHead>
  )
}

function ReadmePanel({ name, sha }: { name: string; sha: string }) {
  const { repo } = useRepo()
  const text = useLoad(async () => new TextDecoder().decode((await readBlob(repo.id, sha)).bytes), [repo.id, sha])
  return (
    <Panel>
      <PanelHead>
        <BookOpenIcon aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium">{name}</span>
      </PanelHead>
      <div className="px-5 py-5 md:px-8">
        {text.error ? (
          <p className="text-sm text-destructive">{text.error.message}</p>
        ) : text.data === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : isMarkdown(name) ? (
          <Markdown source={text.data} ctx={{ source: "none" }} />
        ) : (
          <pre className="font-mono text-[13px] whitespace-pre-wrap">{text.data}</pre>
        )}
      </div>
    </Panel>
  )
}

// ─── About (sidebar) ────────────────────────────────────────────────────────────────────────────────────────

function languages(tree: Tree) {
  const by = new Map<string, number>()
  let total = 0
  for (const [p, e] of Object.entries(tree)) {
    const l = langOf(p)
    if (!l || !countsAsCode(l)) continue
    by.set(l.name, (by.get(l.name) ?? 0) + e.size)
    total += e.size
  }
  if (!total) return []
  return [...by].map(([name, n]) => ({ name, share: n / total })).sort((a, b) => b.share - a.share)
}

/** Hub keys resolve through the hub; launches through Launchpad. */
async function resolveLinks(keys: string[]): Promise<Record<string, Resolved>> {
  const out = await resolveTargets(keys)
  await Promise.all(
    keys
      .filter((k) => k.startsWith("launch:"))
      .map(async (k) => {
        const l = await getLaunch(k.slice(7)).catch(() => null)
        if (l) out[k] = { target: k, group: "other", type: "Launch", label: l.name, summary: l.tagline, href: `/launchpad/${l.id}`, found: true }
      }),
  )
  return out
}

const LINK_ICON: Record<string, typeof LinkIcon> = { thread: MessagesSquareIcon, launch: RocketIcon }

function About({ tree, commit }: { tree: Tree; commit: Commit | null }) {
  const { repo, base, admin } = useRepo()
  const langs = useMemo(() => languages(tree), [tree])
  const links = useLoad<Record<string, Resolved>>(() => (repo.links.length ? resolveLinks(repo.links) : Promise.resolve({})), [repo.links.join(" ")])
  const resolved = repo.links.map((l) => links.data?.[l]).filter((r): r is Resolved => Boolean(r?.found))
  const thread = resolved.find((r) => r.target.startsWith("thread:"))
  const project = resolved.find((r) => r.target.startsWith("project:"))
  const launch = resolved.find((r) => r.target.startsWith("launch:"))
  const name = fullName(repo)
  const discuss = `/forum/new?title=${encodeURIComponent(`About ${name}`)}&body=${encodeURIComponent(`${repo.description ? `${repo.description}\n\n` : ""}Repository: /code/${name}`)}`
  const files = useMemo(() => Object.keys(tree).slice(0, 300), [tree])
  const [readme, setReadme] = useState(repo.readme)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the repository's cached README
  useEffect(() => setReadme(repo.readme), [repo.readme])

  // Keep the README cache in step with the default branch, for search and AI summaries.
  const { writable, setRepo } = useRepo()
  useEffect(() => {
    if (!writable || !commit) return
    const path = Object.keys(commit.tree).find((p) => !p.includes("/") && isReadme(p))
    if (!path) return
    let live = true
    readBlob(repo.id, commit.tree[path].sha)
      .then(({ bytes: b }) => {
        const text = new TextDecoder().decode(b).slice(0, 100_000)
        if (!live) return
        setReadme(text)
        if (text !== repo.readme) updateRepo(repo.id, { readme: text }).then((r) => live && setRepo(r)).catch(() => null)
      })
      .catch(() => null)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the snapshot changes
  }, [commit?.id, writable])

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="About this repository">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">About</h2>
        {repo.description ? <p className="text-sm text-foreground/90">{repo.description}</p> : <p className="text-sm text-muted-foreground italic">{admin ? "No description yet. Add one in Settings." : "No description."}</p>}
        {repo.homepage && (
          <a href={repo.homepage} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ion hover:underline">
            <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{repo.homepage.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
        {repo.topics.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
            {repo.topics.map((t) => (
              <li key={t}>
                <Link href={href(`/code?topic=${encodeURIComponent(t)}`)} className="inline-block rounded-full bg-repo/10 px-2.5 py-0.5 text-xs text-repo hover:bg-repo/20">
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {repo.license && (
            <li className="flex items-center gap-2">
              <ScaleIcon aria-hidden className="size-4" /> {repo.license}
            </li>
          )}
          <li className="flex items-center gap-2">
            <StarIcon aria-hidden className="size-4" /> {plural(repo.stars, "star")}
          </li>
          <li className="flex items-center gap-2">
            <EyeIcon aria-hidden className="size-4" /> {plural(repo.watchers, "watcher")}
          </li>
          <li className="flex items-center gap-2">
            <GitForkIcon aria-hidden className="size-4" /> {plural(repo.forks, "fork")}
          </li>
          <li className="flex items-center gap-2">
            <HistoryIcon aria-hidden className="size-4" />
            <Link href={href(`${base}/branches`)} className="hover:text-ion">
              Branches
            </Link>
            ·
            <Link href={href(`${base}/tags`)} className="hover:text-ion">
              Tags
            </Link>
          </li>
        </ul>
      </section>

      {langs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Languages</h2>
          <LanguageBar languages={langs} />
        </section>
      )}

      <RepoSummaryCard repo={name} description={repo.description} readme={readme} files={files} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">On Nexverse</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {resolved.map((r) => {
            const Icon = LINK_ICON[r.target.split(":")[0]] ?? LinkIcon
            return (
              <li key={r.target}>
                <Link href={href(r.href ?? "#")} className="flex min-w-0 items-center gap-2 rounded-md text-foreground/90 hover:text-ion">
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{r.type}</span>
                </Link>
              </li>
            )
          })}
          {!thread && (
            <li>
              <Link href={href(discuss)} className="flex items-center gap-2 text-foreground/90 hover:text-ion">
                <MessagesSquareIcon aria-hidden className="size-4 text-muted-foreground" /> Start a discussion in the forum
              </Link>
            </li>
          )}
          {project && !launch && admin && (
            <li>
              <Link href="/launchpad/new" className="flex items-center gap-2 text-foreground/90 hover:text-ion">
                <RocketIcon aria-hidden className="size-4 text-muted-foreground" /> Launch {project.label} on Launchpad
              </Link>
            </li>
          )}
        </ul>
        {admin && (
          <p className="text-xs text-muted-foreground">
            Link models, datasets, a project, a launch or the discussion thread in{" "}
            <Link href={href(`${base}/settings`)} className="text-ion hover:underline">
              Settings
            </Link>
            .
          </p>
        )}
      </section>
    </aside>
  )
}

// ─── One file ───────────────────────────────────────────────────────────────────────────────────────────────

export function BlobPage({ refName, path }: { refName: string; path: string }) {
  const { repo, base, writable } = useRepo()
  const snap = useSnapshot(refName)
  const entry = snap.data?.tree[path]
  const blob = useLoad(async () => (entry ? readBlob(repo.id, entry.sha) : null), [repo.id, entry?.sha])
  const text = useMemo(() => (blob.data && looksLikeText(blob.data.bytes) ? new TextDecoder().decode(blob.data.bytes) : null), [blob.data])
  const image = imageType(path)
  const [preview, setPreview] = useState(true)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const explain = useExplain(fullName(repo), path, text)
  const to = (r: string) => `${base}/blob/${encPath(r)}/${encPath(path)}`

  useEffect(() => {
    if (!blob.data || !image) return
    const url = URL.createObjectURL(new Blob([blob.data.bytes.slice().buffer], { type: image }))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an object URL is an external resource tied to this effect
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob.data, image])

  const open = async (download: boolean) => {
    if (!entry) return
    const url = await blobUrl(repo.id, entry.sha, download ? path.split("/").pop() : undefined)
    if (download) location.href = url
    else window.open(url, "_blank", "noopener,noreferrer")
  }

  const lines = text === null ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0)
  const md = isMarkdown(path)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RefPicker current={refName} commit={snap.data?.id ?? null} to={to} />
        <Crumbs refName={refName} path={path} leaf="blob" />
      </div>
      {snap.error ? (
        <ErrorNote error={snap.error} onRetry={snap.reload} />
      ) : !snap.data ? (
        snap.loading ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <Panel>
            <EmptyState icon={FileIcon} title={`There is no branch, tag or commit called ${refName}`} />
          </Panel>
        )
      ) : !entry ? (
        <Panel>
          <EmptyState icon={FileIcon} title="This file does not exist here">
            It may have been moved or deleted, or it only exists on another branch.{" "}
            <Link href={href(`${base}/commits/${encPath(refName)}/${encPath(path)}`)} className="text-ion hover:underline">
              See its history
            </Link>
            .
          </EmptyState>
        </Panel>
      ) : (
        <>
          <LastCommitFor refName={refName} path={path} head={snap.data} />
          <div className="overflow-hidden rounded-xl border border-border bg-[#07080d]">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              {md && text !== null && (
                <div className="inline-flex rounded-full border border-border p-0.5" role="group" aria-label="View">
                  {(["Preview", "Code"] as const).map((l) => (
                    <button key={l} aria-pressed={preview === (l === "Preview")} onClick={() => setPreview(l === "Preview")} className={cn("h-6 rounded-full px-2.5 transition-colors", preview === (l === "Preview") ? "bg-secondary text-foreground" : "hover:text-foreground")}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <span className="tabular">
                {text !== null && `${plural(lines, "line")} · `}
                {bytes(entry.size)}
                {entry.mode === "100755" && " · executable"}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <ExplainButton onClick={explain.run} busy={explain.busy} />
                <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => open(false)}>
                  Raw
                </Button>
                {text !== null && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={copied ? "Copied" : "Copy file contents"}
                    onClick={async () => {
                      await navigator.clipboard.writeText(text).catch(() => null)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    <CopyIcon aria-hidden className={cn(copied && "text-ok")} />
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" aria-label="Download file" onClick={() => open(true)}>
                  <DownloadIcon aria-hidden />
                </Button>
                {writable && snap.branch && text !== null && (
                  <Button size="icon-sm" variant="ghost" aria-label="Edit this file" nativeButton={false} render={<Link href={href(`${base}/edit/${encPath(refName)}/${encPath(path)}`)} />}>
                    <PencilIcon aria-hidden />
                  </Button>
                )}
                {writable && snap.branch && (
                  <Button size="icon-sm" variant="ghost" aria-label="Delete this file" className="hover:text-destructive" onClick={() => setDeleting(true)}>
                    <Trash2Icon aria-hidden />
                  </Button>
                )}
              </div>
            </div>
            {explain.panel}
            {blob.data && !blob.data.verified && (
              <p role="alert" className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
                <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                The stored bytes do not match this file&apos;s fingerprint. Do not trust this copy; tell the repository owner.
              </p>
            )}
            {blob.error ? (
              <p className="p-4 text-sm text-destructive">{blob.error.message}</p>
            ) : !blob.data ? (
              <div className="h-60 animate-pulse bg-white/[0.02]" aria-label="Loading file" />
            ) : image ? (
              <div className="grid place-items-center bg-[conic-gradient(#ffffff08_25%,transparent_0_50%,#ffffff08_0_75%,transparent_0)] bg-[length:16px_16px] p-6">
                {imgUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL for a file in this repository
                  <img src={imgUrl} alt={path.split("/").pop() ?? ""} className="max-h-[70vh] max-w-full object-contain" />
                )}
              </div>
            ) : text === null ? (
              <p className="p-6 text-sm text-muted-foreground">This is a binary file. Download it to open it.</p>
            ) : md && preview ? (
              <div className="bg-background px-5 py-6 md:px-8">
                <Markdown source={text} ctx={{ source: "none" }} />
              </div>
            ) : (
              <CodeLines text={text} path={path} />
            )}
          </div>
          {deleting && snap.data && <DeleteFile open={deleting} onOpenChange={setDeleting} commit={snap.data} branch={snap.branch} path={path} />}
        </>
      )}
    </div>
  )
}

function LastCommitFor({ refName, path, head }: { refName: string; path: string; head: Commit }) {
  const { base } = useRepo()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm">
      <Avatar person={head.author} size={20} />
      <span className="font-medium">{head.author?.handle ?? head.authorName}</span>
      <Link href={href(`${base}/commit/${head.id}`)} className="min-w-0 flex-1 truncate text-muted-foreground hover:text-ion">
        {head.message.split("\n")[0]}
      </Link>
      <Link href={href(`${base}/commits/${encPath(refName)}/${encPath(path)}`)} className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-ion">
        <HistoryIcon aria-hidden className="size-3.5" /> History of this file
      </Link>
    </div>
  )
}

function DeleteFile({ open, onOpenChange, commit, branch, path }: { open: boolean; onOpenChange: (v: boolean) => void; commit: Commit; branch: string | null; path: string }) {
  const { repo, base, reloadRefs } = useRepo()
  const router = useRouter()
  const onCommit = async (t: CommitTarget) => {
    const tree = { ...commit.tree }
    delete tree[path]
    await commitOnto(repo.id, commit.id, tree, t)
    await reloadRefs()
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
    onOpenChange(false)
    router.push(href(`${base}/tree/${encPath(t.branch)}${dir && listDir(tree, dir) ? `/${encPath(dir)}` : ""}`))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {path.split("/").pop()}</DialogTitle>
          <DialogDescription>The file leaves this branch in a new commit. Its earlier versions stay in the history.</DialogDescription>
        </DialogHeader>
        <CommitBox branch={branch} defaultMessage={`Delete ${path}`} onCommit={onCommit} submitLabel="Delete and commit" />
      </DialogContent>
    </Dialog>
  )
}

// ─── Editing ────────────────────────────────────────────────────────────────────────────────────────────────

export function EditPage({ refName, path, mode }: { refName: string; path: string; mode: "edit" | "new" }) {
  const { repo, base, writable, refs, reloadRefs } = useRepo()
  const router = useRouter()
  const empty = !refs.some((r) => r.kind === "branch")
  const snap = useSnapshot(refName)
  const entry = mode === "edit" ? snap.data?.tree[path] : undefined
  const original = useLoad(async () => (entry ? new TextDecoder().decode((await readBlob(repo.id, entry.sha)).bytes) : ""), [repo.id, entry?.sha])
  const [name, setName] = useState(mode === "edit" ? path : path ? `${path}/` : "")
  const [text, setText] = useState<string | null>(null)
  const [tab, setTab] = useState<"edit" | "preview">("edit")
  const area = useRef<HTMLTextAreaElement>(null)
  const value = text ?? original.data ?? ""

  if (!writable) {
    return (
      <Panel>
        <EmptyState icon={PencilIcon} title="You cannot edit this repository">
          Fork it to make changes in your own copy, then open a pull request.
        </EmptyState>
      </Panel>
    )
  }
  if (!empty && snap.loading && !snap.data) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!empty && (!snap.data || snap.kind !== "branch")) {
    return (
      <Panel>
        <EmptyState icon={PencilIcon} title="Pick a branch to edit">
          Files can be changed on branches, not on tags or single commits.
        </EmptyState>
      </Panel>
    )
  }
  if (mode === "edit" && snap.data && !entry) {
    return (
      <Panel>
        <EmptyState icon={FileIcon} title="This file does not exist on this branch" />
      </Panel>
    )
  }

  const onCommit = async (t: CommitTarget) => {
    const clean = cleanPath(name)
    if (!clean) throw new Error("Give the file a name. Folders are written with slashes, like docs/intro.md.")
    const tree: Tree = { ...(snap.data?.tree ?? {}) }
    if (mode === "new" && tree[clean]) throw new Error("A file with that name already exists. Edit it instead.")
    const data = new TextEncoder().encode(value)
    const entries = await uploadFiles(repo.id, [{ path: clean, data, mode: entry?.mode }])
    if (mode === "edit" && clean !== path) delete tree[path]
    tree[clean] = entries[clean]
    const clash = treeClash(tree)
    if (clash) throw new Error(`"${clash}" would be both a file and a folder.`)
    await commitOnto(repo.id, snap.data?.id ?? null, tree, empty ? { ...t, branch: repo.defaultBranch, isNew: false } : t)
    await reloadRefs()
    router.push(href(`${base}/blob/${encPath(empty ? repo.defaultBranch : t.branch)}/${encPath(clean)}`))
  }

  // Tab inserts two spaces instead of leaving the editor; Escape then Tab still moves focus on.
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return
    const el = e.currentTarget
    if (el.dataset.escaped === "1") return
    e.preventDefault()
    const s = el.selectionStart
    const next = value.slice(0, s) + "  " + value.slice(el.selectionEnd)
    setText(next)
    requestAnimationFrame(() => area.current?.setSelectionRange(s + 2, s + 2))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ion">{repo.slug}</span>
          <span className="text-muted-foreground">/</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="File name, with folders" placeholder="Name your file, e.g. src/index.ts" className={cn(inputCls, "max-w-md flex-1 font-mono")} autoFocus={mode === "new"} />
          <span className="text-xs text-muted-foreground">
            in <span className="font-mono">{empty ? repo.defaultBranch : refName}</span>
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-[#07080d]">
          <div className="flex items-center gap-1 border-b border-border bg-card/60 px-2 py-1.5">
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={cn("h-7 rounded-full px-3 text-xs capitalize", tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t === "edit" ? (mode === "new" ? "Edit new file" : "Edit file") : "Preview"}
              </button>
            ))}
            {original.loading && mode === "edit" && <span className="ml-auto text-xs text-muted-foreground">Loading…</span>}
          </div>
          {tab === "edit" ? (
            <textarea
              ref={area}
              value={value}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.currentTarget.dataset.escaped = "1"
                else if (e.key !== "Tab") e.currentTarget.dataset.escaped = "0"
                onKey(e)
              }}
              spellCheck={false}
              aria-label="File contents"
              className="block min-h-[60vh] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-[1.65] text-[#d6deec] outline-none"
              placeholder={mode === "new" ? "Write the file here." : ""}
            />
          ) : isMarkdown(cleanPath(name) ?? "") ? (
            <div className="min-h-[60vh] bg-background px-5 py-6">
              <Markdown source={value} ctx={{ source: "none" }} />
            </div>
          ) : (
            <div className="min-h-[60vh]">
              <CodeLines text={value} path={cleanPath(name) ?? "file.txt"} />
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <CommitBox
          branch={empty ? repo.defaultBranch : snap.branch}
          defaultMessage={mode === "new" ? `Create ${cleanPath(name)?.split("/").pop() ?? "file"}` : cleanPath(name) !== path ? `Rename ${path.split("/").pop()} to ${cleanPath(name)?.split("/").pop() ?? ""}` : `Update ${path.split("/").pop()}`}
          disabled={mode === "edit" && text === null && cleanPath(name) === path}
          onCommit={onCommit}
        />
        <Button variant="ghost" nativeButton={false} render={<Link href={href(mode === "edit" ? `${base}/blob/${encPath(refName)}/${encPath(path)}` : `${base}/tree/${encPath(refName)}${path ? `/${encPath(path)}` : ""}`)} />}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Uploading ──────────────────────────────────────────────────────────────────────────────────────────────

type Picked = { path: string; file: File }

/** Reads dropped files and folders (folders through the entries API, recursively). */
async function readDrop(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.push({ path: prefix + entry.name, file })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`)
      }
    }
  }
  const entries = [...items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e))
  for (const e of entries) await walk(e, "")
  return out
}

export function UploadPage({ refName, path }: { refName: string; path: string }) {
  const { repo, base, writable, refs, reloadRefs } = useRepo()
  const router = useRouter()
  const empty = !refs.some((r) => r.kind === "branch")
  const snap = useSnapshot(refName)
  const [files, setFiles] = useState<Picked[]>([])
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dirInput.current?.setAttribute("webkitdirectory", "")
  }, [])

  if (!writable) {
    return (
      <Panel>
        <EmptyState icon={UploadIcon} title="You cannot upload to this repository">
          Fork it to make changes in your own copy, then open a pull request.
        </EmptyState>
      </Panel>
    )
  }
  if (!empty && snap.loading && !snap.data) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!empty && (!snap.data || snap.kind !== "branch")) {
    return (
      <Panel>
        <EmptyState icon={UploadIcon} title="Pick a branch to upload to" />
      </Panel>
    )
  }

  const add = (list: Picked[]) => {
    setError(null)
    const skip = /(^|\/)(\.git|node_modules|\.DS_Store|__pycache__)(\/|$)/
    const next = new Map(files.map((f) => [f.path, f]))
    for (const f of list) if (!skip.test(f.path)) next.set(f.path, f)
    setFiles([...next.values()].sort((a, b) => a.path.localeCompare(b.path)))
  }
  const total = files.reduce((n, f) => n + f.file.size, 0)
  const tooBig = files.find((f) => f.file.size > LIMITS.fileBytes)

  const onCommit = async (t: CommitTarget) => {
    if (!files.length) throw new Error("Add some files first.")
    if (tooBig) throw new Error(`${tooBig.path} is over the 25 MB limit for one file.`)
    const uploads: Upload[] = []
    for (const f of files) {
      const p = cleanPath(path ? `${path}/${f.path}` : f.path)
      if (!p) throw new Error(`"${f.path}" is not a name we can store.`)
      uploads.push({ path: p, data: new Uint8Array(await f.file.arrayBuffer()) })
    }
    const entries = await uploadFiles(repo.id, uploads, (done, n, phase) => setProgress(phase === "hashing" ? `Hashing ${done}/${n}…` : `Uploading ${done}/${n}…`))
    setProgress("Committing…")
    const tree: Tree = { ...(snap.data?.tree ?? {}), ...entries }
    if (Object.keys(tree).length > LIMITS.files) throw new Error("A commit can hold at most 5,000 files.")
    const clash = treeClash(tree)
    if (clash) throw new Error(`"${clash}" would be both a file and a folder.`)
    try {
      await commitOnto(repo.id, snap.data?.id ?? null, tree, empty ? { ...t, branch: repo.defaultBranch, isNew: false } : t)
    } finally {
      setProgress(null)
    }
    await reloadRefs()
    router.push(href(`${base}/tree/${encPath(empty ? repo.defaultBranch : t.branch)}${path ? `/${encPath(path)}` : ""}`))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Upload into <span className="font-mono text-foreground">{path || "/"}</span> on <span className="font-mono text-foreground">{empty ? repo.defaultBranch : refName}</span>. Files with the same name are replaced. Only files the repository does not already have are uploaded.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setOver(false)
            try {
              add(await readDrop(e.dataTransfer.items))
            } catch {
              setError("Could not read those files. Try the buttons instead.")
            }
          }}
          className={cn(
            "relative isolate flex min-h-56 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-[border-color,background-color,transform] duration-200",
            over ? "scale-[1.01] border-ion bg-ion/10" : "border-border bg-card/30"
          )}
        >
          <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40%_60%_at_50%_100%,rgb(143_180_255/0.14),transparent_70%)] transition-opacity", over ? "opacity-100" : "opacity-40")} />
          <UploadIcon aria-hidden className={cn("size-8 transition-transform duration-300", over ? "-translate-y-1 text-ion" : "text-muted-foreground")} />
          <p className="font-medium">Drag files or folders here</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              Choose files
            </Button>
            <Button size="sm" variant="outline" onClick={() => dirInput.current?.click()}>
              Choose a folder
            </Button>
          </div>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => add([...(e.target.files ?? [])].map((f) => ({ path: f.name, file: f })))} />
          <input ref={dirInput} type="file" multiple hidden onChange={(e) => add([...(e.target.files ?? [])].map((f) => ({ path: f.webkitRelativePath || f.name, file: f })))} />
          <p className="text-xs text-muted-foreground">Up to 25 MB per file. .git, node_modules and __pycache__ folders are skipped.</p>
        </div>
        {files.length > 0 && (
          <Panel>
            <PanelHead>
              <span className="font-medium">{plural(files.length, "file")}</span>
              <span className="text-muted-foreground">{bytes(total)}</span>
              <button onClick={() => setFiles([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </PanelHead>
            <ul className="max-h-80 overflow-y-auto">
              {files.map((f) => (
                <li key={f.path} className="flex items-center gap-3 border-b border-border px-4 py-1.5 text-sm last:border-0 motion-safe:animate-in motion-safe:fade-in">
                  <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{f.path}</span>
                  {snap.data?.tree[path ? `${path}/${f.path}` : f.path] && <span className="text-xs text-gold">replaces</span>}
                  <span className={cn("text-xs tabular", f.file.size > LIMITS.fileBytes ? "text-destructive" : "text-muted-foreground")}>{bytes(f.file.size)}</span>
                  <button onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f.path}`} className="text-muted-foreground hover:text-destructive">
                    <Trash2Icon aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <FormError message={error} />
      </div>
      <CommitBox branch={empty ? repo.defaultBranch : snap.branch} defaultMessage={`Add ${files.length === 1 ? files[0].path.split("/").pop() : plural(files.length, "file")}`} disabled={!files.length} busyLabel={progress} onCommit={onCommit} />
    </div>
  )
}
