"use client"

import { useEffect, useState } from "react"
import { FolderGit2Icon, LinkIcon, Loader2Icon, PlusIcon, UnlinkIcon } from "lucide-react"
import { RepoEmbed } from "@/components/code/repo-app"
import { Copy } from "@/components/content/copy"
import { ConfirmDialog } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { commitTree, createRepo, listRepos, updateRepo, uploadFiles, type Repo, type Visibility } from "@/lib/code/api"
import { readmeText } from "@/lib/code/templates"
import { slugify, VALID_SLUG } from "@/lib/code/tree"
import { useCaps } from "@/lib/caps"
import { linkProjectRepo, type Project } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * Creates a Nexverse Code repository for a new project, with a first commit holding its README. Used by the
 * creation flow and by the Settings tab. Returns the repository, already connected to the project.
 */
export async function createProjectRepo(p: Pick<Project, "id" | "name" | "slug" | "summary" | "readme" | "tags" | "license">, visibility: Visibility = "public"): Promise<Repo> {
  const slug = VALID_SLUG.test(p.slug) ? p.slug : slugify(p.name)
  const repo = await createRepo({ name: p.name, slug, description: p.summary.slice(0, 350), visibility, topics: p.tags.slice(0, 20), license: p.license === "unspecified" ? null : p.license.slice(0, 40) })
  const readme = p.readme.trim() ? p.readme : readmeText(p.name, p.summary)
  try {
    const entries = await uploadFiles(repo.id, [{ path: "README.md", data: new TextEncoder().encode(readme) }])
    await commitTree(repo.id, repo.defaultBranch, null, entries, "Initial commit")
    await updateRepo(repo.id, { readme, links: [`project:${p.id}`] }).catch(() => null)
  } catch {
    // An empty repository still works: the Code tab offers to add files.
  }
  await linkProjectRepo(p.id, repo.id)
  return repo
}

/** The Settings tab's code section: the connected repository and its settings, or a way to add one. */
export function CodeLinkPanel({ p, base, onChange }: { p: Project; base: string; onChange: (repoId: string | null) => void }) {
  const { user } = useSession()
  const caps = useCaps()
  const owner = p.ownerId === user?.id
  const [mine, setMine] = useState<Repo[] | null>(null)
  const [pick, setPick] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!user || p.codeRepoId || !owner) return
    let stale = false
    listRepos({ ownerId: user.id, limit: 100, sort: "updated" })
      .then((r) => !stale && setMine(r))
      .catch(() => !stale && setMine([]))
    return () => {
      stale = true
    }
  }, [user, p.codeRepoId, owner])

  async function act(label: string, fn: () => Promise<string | null>) {
    setBusy(label)
    setError("")
    try {
      onChange(await fn())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="code-link-h" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-secondary/60">
          <FolderGit2Icon aria-hidden className="size-4 text-repo" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="code-link-h" className="text-base font-semibold">
            <Copy k="project.settings.code.title">Code repository</Copy>
          </h2>
          <p className="text-sm text-muted-foreground">
            <Copy k="project.settings.code.lead">Files with history, commits, branches, issues, pull requests and releases, as tabs of this project.</Copy>
          </p>
        </div>
      </div>

      {p.codeRepoId ? (
        <>
          {owner && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setConfirm(true)}>
                <UnlinkIcon aria-hidden /> Disconnect the repository
              </Button>
              <span className="text-xs text-muted-foreground">The repository stays; it just stops being part of this page.</span>
            </div>
          )}
          <RepoEmbed repoId={p.codeRepoId} base={base} rest={["settings"]} compact />
        </>
      ) : !owner ? (
        <p className="text-sm text-muted-foreground">Only the owner of this project adds a repository.</p>
      ) : !caps.can("repo.create") && !(mine && mine.length) ? (
        <p className="text-sm text-muted-foreground">Your account cannot create repositories yet. It earns that with a little activity on the site.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Start a repository</p>
            <p className="text-xs text-muted-foreground">
              A new repository called <span className="font-mono">{p.slug}</span> with this project&apos;s README as its first commit.
            </p>
            <Button
              size="sm"
              className="mt-auto self-start"
              disabled={busy !== null || !caps.can("repo.create")}
              onClick={() => act("create", async () => (await createProjectRepo(p)).id)}
            >
              {busy === "create" ? <Loader2Icon aria-hidden className="animate-spin" /> : <PlusIcon aria-hidden />} Create repository
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <label htmlFor="code-link-pick" className="text-sm font-medium">
              Connect one you have
            </label>
            <select
              id="code-link-pick"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={!mine?.length}
              className={cn("h-9 rounded-lg border border-input bg-background/60 px-2 text-sm", !mine?.length && "opacity-60")}
            >
              <option value="">{mine === null ? "Loading your repositories…" : mine.length ? "Choose a repository" : "You have no repositories yet"}</option>
              {mine?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.slug}
                  {r.visibility === "private" ? " (private)" : ""}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" className="mt-auto self-start" disabled={!pick || busy !== null} onClick={() => act("link", async () => (await linkProjectRepo(p.id, pick), pick))}>
              {busy === "link" ? <Loader2Icon aria-hidden className="animate-spin" /> : <LinkIcon aria-hidden />} Connect
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect the repository?"
        description="Its files, issues and pull requests stay in Nexverse Code under your name. The Code, Issues, Pulls and Releases tabs leave this project."
        confirm="Disconnect"
        onConfirm={() => act("unlink", async () => (await linkProjectRepo(p.id, null), null))}
      />
    </section>
  )
}
