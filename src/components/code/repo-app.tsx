"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIcon,
  ArchiveIcon,
  CircleDotIcon,
  CodeIcon,
  EyeIcon,
  EyeOffIcon,
  FolderGit2Icon,
  GitForkIcon,
  GitPullRequestIcon,
  LoaderCircleIcon,
  PackageIcon,
  SettingsIcon,
  StarIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Breadcrumbs } from "@/components/forum/forum-ui"
import { ReportButton } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { canAdmin, canWrite, forkRepo, getMarks, getRepo, getRepoById, listRefs, myId, myRole, ownerKey, repoPath, setMark, type Ref, type Repo, type Role } from "@/lib/code/api"
import { useCaps } from "@/lib/caps"
import { parseView, type RepoView } from "@/lib/code/route"
import { slugify, VALID_SLUG } from "@/lib/code/tree"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { RepoActivity } from "./repo-activity"
import { RepoContext, useRepo, type RepoState } from "./repo-context"
import { BlobPage, EditPage, RepoHome, TreePage, UploadPage } from "./files"
import { CommitPage, ComparePage, HistoryPage } from "./history"
import { IssuePage, IssuesPage, NewIssuePage } from "./issues"
import { PullPage, PullsPage } from "./pulls"
import { BranchesPage, NewReleasePage, ReleasesPage, TagsPage } from "./refs"
import { SettingsPage } from "./settings"
import { EmptyState, ErrorNote, FormError, href, inputCls, useLoad, VisibilityBadge } from "./ui"

/*
 * Every page inside one repository. The repository, your role and its refs load once and are shared through
 * RepoContext; the URL segments after /code/<owner>/<repo> pick the page (lib/code/route.ts).
 */

export function RepoSkeleton() {
  return (
    <div className="shell max-w-7xl pt-8 pb-16" aria-busy="true" aria-label="Loading repository">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-4 h-9 w-80 max-w-full" />
      <Skeleton className="mt-6 h-10 w-full" />
      <Skeleton className="mt-6 h-96 w-full rounded-xl" />
    </div>
  )
}

type Loaded = { repo: Repo; role: Role; refs: Ref[]; me: string | null; parent: Repo | null }

export function RepoApp({ owner, slug, rest }: { owner: string; slug: string; rest: string[] }) {
  const session = useSession()
  const data = useLoad<Loaded | null>(async () => {
    const repo = await getRepo(owner, slug)
    if (!repo) return null
    const [role, refs, me, parent] = await Promise.all([myRole(repo), listRefs(repo.id), myId(), repo.forkedFrom ? getRepoById(repo.forkedFrom).catch(() => null) : Promise.resolve(null)])
    return { repo, role, refs, me, parent }
  }, [owner, slug, session.user?.id])

  const [repo, setRepo] = useState<Repo | null>(null)
  const [refs, setRefs] = useState<Ref[]>([])
  useEffect(() => {
    if (data.data) {
      setRepo(data.data.repo)
      setRefs(data.data.refs)
    }
  }, [data.data])

  const reloadRefs = useCallback(async () => {
    if (!repo) return
    setRefs(await listRefs(repo.id))
  }, [repo])

  const state = useMemo<RepoState | null>(() => {
    if (!repo || !data.data) return null
    const role = data.data.role
    return { repo, setRepo, role, me: data.data.me, refs, reloadRefs, base: repoPath(repo), writable: canWrite(role, repo), admin: canAdmin(role) }
  }, [repo, refs, data.data, reloadRefs])

  if (data.error) {
    return (
      <div className="shell max-w-7xl pt-10 pb-16">
        <ErrorNote error={data.error} onRetry={data.reload} />
      </div>
    )
  }
  if (data.loading && !state) return <RepoSkeleton />
  if (!data.data || !state) {
    return (
      <div className="shell max-w-7xl pt-10 pb-16">
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={FolderGit2Icon}
            title="Repository not found"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/code" />}>
                  Explore repositories
                </Button>
                {!session.user && (
                  <Button size="sm" nativeButton={false} render={<Link href={href(`/sign-in?next=${encodeURIComponent(`/code/${owner}/${slug}`)}`)} />}>
                    Sign in
                  </Button>
                )}
              </div>
            }
          >
            Nothing lives at {owner}/{slug}. If it is private, sign in with an account that has access.
          </EmptyState>
        </div>
      </div>
    )
  }

  const view = parseView(rest, state.refs, state.repo.defaultBranch)
  return (
    <RepoContext.Provider value={state}>
      <div className="shell max-w-7xl pb-16">
        <RepoHeader parent={data.data.parent} view={view} />
        <main className="pt-6" id="repo-main">
          <Page view={view} />
        </main>
      </div>
    </RepoContext.Provider>
  )
}

function Page({ view }: { view: RepoView }) {
  switch (view.view) {
    case "home":
      return <RepoHome />
    case "tree":
      return <TreePage refName={view.ref} path={view.path} />
    case "blob":
      return <BlobPage refName={view.ref} path={view.path} />
    case "edit":
      return <EditPage refName={view.ref} path={view.path} mode="edit" />
    case "new":
      return <EditPage refName={view.ref} path={view.path} mode="new" />
    case "upload":
      return <UploadPage refName={view.ref} path={view.path} />
    case "commits":
      return <HistoryPage refName={view.ref} path={view.path} />
    case "commit":
      return <CommitPage sha={view.sha} />
    case "compare":
      return <ComparePage />
    case "branches":
      return <BranchesPage />
    case "tags":
      return <TagsPage />
    case "releases":
      return <ReleasesPage />
    case "release-new":
      return <NewReleasePage />
    case "issues":
      return <IssuesPage />
    case "issue-new":
      return <NewIssuePage />
    case "issue":
      return <IssuePage number={view.number} />
    case "pulls":
      return <PullsPage />
    case "pull":
      return <PullPage number={view.number} tab={view.tab} />
    case "settings":
      return <SettingsPage />
    case "activity":
      return <RepoActivity />
    default:
      return (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState icon={FolderGit2Icon} title="There is no such page in this repository">
            Check the address, or start from the Code tab.
          </EmptyState>
        </div>
      )
  }
}

// ─── Header ─────────────────────────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "code", label: "Code", icon: CodeIcon, path: "", match: ["home", "tree", "blob", "edit", "new", "upload", "commits", "commit", "compare", "branches", "tags"] },
  { id: "issues", label: "Issues", icon: CircleDotIcon, path: "/issues", match: ["issues", "issue", "issue-new"] },
  { id: "pulls", label: "Pull requests", icon: GitPullRequestIcon, path: "/pulls", match: ["pulls", "pull"] },
  { id: "releases", label: "Releases", icon: PackageIcon, path: "/releases", match: ["releases", "release-new"] },
  { id: "activity", label: "Activity", icon: ActivityIcon, path: "/activity", match: ["activity"] },
  { id: "settings", label: "Settings", icon: SettingsIcon, path: "/settings", match: ["settings"] },
] as const

function RepoHeader({ parent, view }: { parent: Repo | null; view: RepoView }) {
  const { repo, base, admin } = useRepo()
  const ownerName = ownerKey(repo.owner)
  const tabs = TABS.filter((t) => t.id !== "settings" || admin)
  const counts: Record<string, number | undefined> = { issues: repo.openIssues, pulls: repo.openPulls }
  return (
    <header className="relative isolate flex flex-col gap-4 pt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-48 w-screen -translate-x-1/2 bg-[radial-gradient(40%_70%_at_15%_0%,rgb(143_180_255/0.12),transparent_70%),radial-gradient(30%_60%_at_85%_0%,rgb(211_180_255/0.08),transparent_70%)]"
      />
      <Breadcrumbs items={[{ label: "Code", href: "/code" }, { label: ownerName, href: `/code/${ownerName}` }, { label: repo.slug }]} className="sr-only sm:not-sr-only" />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold tracking-[-0.02em] md:text-2xl">
            <FolderGit2Icon aria-hidden className="size-5 shrink-0 text-repo" />
            <Link href={href(`/code/${ownerName}`)} className="font-normal text-muted-foreground hover:text-foreground hover:underline">
              {ownerName}
            </Link>
            <span aria-hidden className="text-muted-foreground/60">
              /
            </span>
            <Link href={href(base)} className="break-all hover:underline">
              {repo.slug}
            </Link>
            <VisibilityBadge visibility={repo.visibility} />
            {repo.archivedAt && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 text-[11px] font-medium text-gold">
                <ArchiveIcon aria-hidden className="size-3" /> Archived
              </span>
            )}
          </h1>
          {parent && (
            <p className="text-xs text-muted-foreground">
              Forked from{" "}
              <Link href={href(repoPath(parent))} className="text-ion hover:underline">
                {ownerKey(parent.owner)}/{parent.slug}
              </Link>
            </p>
          )}
          {repo.forkedFrom && !parent && <p className="text-xs text-muted-foreground">Forked from a repository that is private or gone.</p>}
        </div>
        <RepoActions />
      </div>

      {repo.hiddenAt && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <EyeOffIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          Moderators hid this repository{repo.hiddenReason ? `: ${repo.hiddenReason}` : ""}. Only you, its collaborators and staff can see it, and it is read-only.
        </p>
      )}
      {repo.archivedAt && !repo.hiddenAt && <p className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm text-foreground/90">This repository is archived. It is read-only: no new commits, issues or pull requests.</p>}

      <nav aria-label="Repository" className="-mx-[var(--gutter)] overflow-x-auto border-b border-border px-[var(--gutter)]">
        <ul className="flex min-w-max gap-1">
          {tabs.map((t) => {
            const active = (t.match as readonly string[]).includes(view.view)
            const n = counts[t.id]
            return (
              <li key={t.id}>
                <Link
                  href={href(`${base}${t.path}`)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon aria-hidden className="size-4" />
                  {t.label}
                  {n ? <span className="rounded-full bg-secondary px-1.5 text-xs tabular text-foreground/80">{n}</span> : null}
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-ion via-[#b9a7ff] to-gold motion-safe:animate-in motion-safe:fade-in" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}

function RepoActions() {
  const { repo, setRepo, me, base } = useRepo()
  const marks = useLoad(() => getMarks(repo.id), [repo.id, me])
  const [busy, setBusy] = useState<"star" | "watch" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const signIn = href(`/sign-in?next=${encodeURIComponent(base)}`)

  const toggle = async (kind: "star" | "watch") => {
    if (!marks.data) return
    const on = kind === "star" ? !marks.data.starred : !marks.data.watching
    setBusy(kind)
    setError(null)
    // Optimistic: the count and state change at once; a failure puts them back.
    const prev = { marks: marks.data, repo }
    marks.set(kind === "star" ? { ...marks.data, starred: on } : { ...marks.data, watching: on })
    setRepo(kind === "star" ? { ...repo, stars: repo.stars + (on ? 1 : -1) } : { ...repo, watchers: repo.watchers + (on ? 1 : -1) })
    try {
      await setMark(kind, repo.id, on)
    } catch (err) {
      marks.set(prev.marks)
      setRepo(prev.repo)
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const pill = "h-8 gap-1.5 rounded-full px-3 text-[13px]"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {me ? (
        <>
          <Button variant="outline" size="sm" className={pill} aria-pressed={marks.data?.watching ?? false} disabled={!marks.data || busy !== null} onClick={() => toggle("watch")}>
            <EyeIcon aria-hidden className={cn(marks.data?.watching && "text-ion")} />
            {marks.data?.watching ? "Watching" : "Watch"}
            <span className="tabular text-muted-foreground">{repo.watchers}</span>
          </Button>
          <ForkButton className={pill} />
          <Button variant="outline" size="sm" className={pill} aria-pressed={marks.data?.starred ?? false} disabled={!marks.data || busy !== null} onClick={() => toggle("star")}>
            <StarIcon aria-hidden key={String(marks.data?.starred)} className={cn(marks.data?.starred && "fill-gold text-gold motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300")} />
            {marks.data?.starred ? "Starred" : "Star"}
            <span className="tabular text-muted-foreground">{repo.stars}</span>
          </Button>
        </>
      ) : (
        <>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-muted-foreground tabular">
            <GitForkIcon aria-hidden className="size-3.5" /> {repo.forks}
          </span>
          <Button variant="outline" size="sm" className={pill} nativeButton={false} render={<Link href={signIn} />}>
            <StarIcon aria-hidden /> Star <span className="tabular text-muted-foreground">{repo.stars}</span>
          </Button>
        </>
      )}
      <ReportButton targetKind="code_repo" targetId={repo.id} targetUrl={base} iconOnly />
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function ForkButton({ className }: { className: string }) {
  const { repo, me, setRepo } = useRepo()
  const caps = useCaps()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(repo.slug)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const own = me === repo.owner.id
  const slug = slugify(name)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!VALID_SLUG.test(slug)) return setError("Use letters or numbers in the name.")
    setBusy(true)
    setError(null)
    try {
      const id = await forkRepo(repo.id, slug, name)
      setRepo({ ...repo, forks: repo.forks + 1 })
      const fork = await getRepoById(id)
      router.push(href(fork ? repoPath(fork) : "/code"))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={own || !caps.can("repo.create")}
        title={own ? "This is your repository. Make a branch instead." : !caps.can("repo.create") ? "Your account cannot create repositories yet." : undefined}
        onClick={() => setOpen(true)}
      >
        <GitForkIcon aria-hidden /> Fork <span className="tabular text-muted-foreground">{repo.forks}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Fork {repo.slug}</DialogTitle>
              <DialogDescription>Your own copy with all branches, tags and history. Change it freely, then open a pull request to offer changes back.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} autoFocus />
            </label>
            <FormError message={error} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Create fork
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
