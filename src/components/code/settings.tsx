"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, GlobeIcon, LinkIcon, LoaderCircleIcon, LockIcon, PlusIcon, SettingsIcon, ShieldIcon, TagIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { addCollaborator, createLabel, deleteLabel, deleteRepo, fullName, listCollaborators, listLabels, ownerKey, removeCollaborator, setCollaboratorRole, updateRepo, type Collaborator, type RepoPatch } from "@/lib/code/api"
import { VALID_REF, VALID_SLUG } from "@/lib/code/tree"
import { cn } from "@/lib/utils"
import { parseTopics } from "./new-repo"
import { useRepo } from "./repo-context"
import { EmptyState, ErrorNote, FormError, href, inputCls, LabelChip, Panel, PersonName, StaffHide, textareaCls, useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/* Repository settings, for its owner and admins: details, links, people, labels and the danger zone. */

export function SettingsPage() {
  const { repo, admin, setRepo } = useRepo()
  if (!admin)
    return (
      <Panel>
        <EmptyState icon={ShieldIcon} title={<Copy k="code-repo.settings.only-the-owner-and-admins">Only the owner and admins can change settings</Copy>}>
          <div className="mt-2 flex justify-center">
            <StaffHide kind="repo" id={repo.id} hidden={Boolean(repo.hiddenAt)} onDone={(h) => setRepo({ ...repo, hiddenAt: h ? new Date().toISOString() : null })} />
          </div>
        </EmptyState>
      </Panel>
    )
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <SettingsIcon aria-hidden className="size-5 text-ion" /> <Copy k="code-repo.settings.settings">Settings</Copy>
      </h2>
      {repo.hiddenAt && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          Moderators hid this repository{repo.hiddenReason ? `: ${repo.hiddenReason}` : "."} It is read-only and only you, collaborators and staff can see it.
        </p>
      )}
      <General />
      <Links />
      <People />
      <Labels />
      <Danger />
    </div>
  )
}

function Section({ title, icon: Icon, hint, children, className }: { title: string; icon: typeof SettingsIcon; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card/40 p-4 sm:p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1", className)}>
      <div>
        <h3 className="flex items-center gap-2 font-medium">
          <Icon aria-hidden className="size-4 text-muted-foreground" /> {title}
        </h3>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function useSave() {
  const { repo, setRepo } = useRepo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = async (patch: RepoPatch) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await updateRepo(repo.id, patch)
      setRepo(next)
      setSaved(true)
      return next
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, saved, save }
}

function General() {
  const { repo, refs } = useRepo()
  const router = useRouter()
  const { busy, error, saved, save } = useSave()
  const [name, setName] = useState(repo.name)
  const [slug, setSlug] = useState(repo.slug)
  const [description, setDescription] = useState(repo.description)
  const [homepage, setHomepage] = useState(repo.homepage ?? "")
  const [topics, setTopics] = useState(repo.topics.join(" "))
  const [branch, setBranch] = useState(repo.defaultBranch)
  const [local, setLocal] = useState<string | null>(null)
  const branches = refs.filter((r) => r.kind === "branch")
  return (
    <Section title="General" icon={SettingsIcon}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setLocal(null)
          if (!VALID_SLUG.test(slug)) return setLocal("Use lowercase letters, numbers, dots, dashes and underscores for the URL name.")
          if (homepage && !/^https?:\/\/[^\s<>"]+$/.test(homepage)) return setLocal("The website must start with http:// or https://.")
          if (!VALID_REF.test(branch)) return setLocal("Pick a valid default branch.")
          const next = await save({ name: name.trim(), slug, description: description.trim(), homepage: homepage.trim() || null, topics: parseTopics(topics), default_branch: branch })
          if (next && next.slug !== repo.slug) router.replace(href(`/code/${ownerKey(next.owner)}/${next.slug}/settings`))
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium"><Copy k="code-repo.settings.name">Name</Copy></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium"><Copy k="code-repo.settings.url-name">URL name</Copy></span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"))} maxLength={100} className={cn(inputCls, "font-mono")} />
            {slug !== repo.slug && <span className="text-xs text-gold">Old links to /code/{ownerKey(repo.owner)}/{repo.slug} will stop working.</span>}
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium"><Copy k="code-repo.settings.description">Description</Copy></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} rows={2} className={textareaCls} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium"><Copy k="code-repo.settings.website">Website</Copy></span>
            <input value={homepage} onChange={(e) => setHomepage(e.target.value)} type="url" placeholder="https://" maxLength={300} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium"><Copy k="code-repo.settings.default-branch">Default branch</Copy></span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={cn(inputCls, "font-mono")} disabled={!branches.length}>
              {!branches.some((b) => b.name === branch) && <option>{branch}</option>}
              {branches.map((b) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium"><Copy k="code-repo.settings.topics">Topics</Copy></span>
          <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="machine-learning rust cli" className={inputCls} />
          <span className="text-xs text-muted-foreground"><Copy k="code-repo.settings.up-to-20-separated-by">Up to 20, separated by spaces or commas. People find repositories by topic on /code.</Copy></span>
        </label>
        <FormError message={local ?? error} />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Save changes
          </Button>
          {saved && !busy && <span className="text-sm text-ok motion-safe:animate-in motion-safe:fade-in"><Copy k="code-repo.settings.saved">Saved</Copy></span>}
        </div>
      </form>
    </Section>
  )
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** A Nexverse address (or key) as a link key: "project:<id>", "share:<id>", "thread:<id>" or "launch:<id>". */
export function linkKey(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  const key = s.match(new RegExp(`^(project|share|thread|launch):(${UUID})$`))
  if (key) return `${key[1]}:${key[2]}`
  let path = s
  try {
    if (/^https?:\/\//.test(s)) path = new URL(s).pathname
  } catch {
    return null
  }
  const m = path.match(new RegExp(`^/(p|models|datasets|tools|news|forum|launchpad)/(${UUID})(?:[/?#]|$)`))
  if (!m) return null
  const kind = m[1] === "p" ? "project" : m[1] === "forum" ? "thread" : m[1] === "launchpad" ? "launch" : "share"
  return `${kind}:${m[2]}`
}

const KEY_LABEL: Record<string, string> = { project: "Project", share: "Hub item", thread: "Forum thread", launch: "Launch" }

function Links() {
  const { repo } = useRepo()
  const { busy, error, save } = useSave()
  const [raw, setRaw] = useState("")
  const [local, setLocal] = useState<string | null>(null)
  const set = (links: string[]) => save({ links })
  return (
    <Section title="On Nexverse" icon={LinkIcon} hint="Link the models, datasets or tools this code belongs to, your project, its launch and its forum thread. They show on the repository's front page.">
      {repo.links.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {repo.links.map((l) => {
            const [kind, id] = l.split(":")
            const to = kind === "project" ? `/p/${id}` : kind === "thread" ? `/forum/${id}` : kind === "launch" ? `/launchpad/${id}` : null
            return (
              <li key={l} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">{KEY_LABEL[kind] ?? kind}</span>
                {to ? (
                  <Link href={href(to)} className="min-w-0 truncate font-mono text-xs hover:text-ion">
                    {id}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-mono text-xs">{id}</span>
                )}
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Remove link" disabled={busy} onClick={() => set(repo.links.filter((x) => x !== l))}>
                  <XIcon aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setLocal(null)
          const key = linkKey(raw)
          if (!key) return setLocal("Paste the address of a Nexverse project (/p/…), model, dataset or tool, forum thread or launch.")
          if (repo.links.includes(key)) return setLocal("That is already linked.")
          if (repo.links.length >= 12) return setLocal("A repository links to at most 12 items.")
          if (await set([...repo.links, key])) setRaw("")
        }}
      >
        <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="https://…/p/… or /forum/…" aria-label="Nexverse address to link" className={inputCls} />
        <Button type="submit" variant="outline" disabled={busy || !raw.trim()}>
          <PlusIcon aria-hidden /> <Copy k="code-repo.settings.link">Link</Copy>
        </Button>
      </form>
      <FormError message={local ?? error} />
    </Section>
  )
}

function People() {
  const { repo, role } = useRepo()
  const list = useLoad(() => listCollaborators(repo.id), [repo.id])
  const [handle, setHandle] = useState("")
  const [newRole, setNewRole] = useState<Collaborator["role"]>("write")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      list.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Collaborators" icon={UsersIcon} hint="Read lets people see a private repository. Write lets them commit, merge and manage issues. Admin also opens these settings.">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        <li className="flex items-center gap-3 px-3 py-2 text-sm">
          <PersonName person={repo.owner} />
          <span className="ml-auto text-xs text-muted-foreground"><Copy k="code-repo.settings.owner">Owner</Copy></span>
        </li>
        {list.error ? (
          <li className="p-3">
            <ErrorNote error={list.error} onRetry={list.reload} />
          </li>
        ) : !list.data ? (
          <li className="p-3">
            <Skeleton className="h-8 w-full" />
          </li>
        ) : (
          list.data.map((c) => (
            <li key={c.member.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <PersonName person={c.member} />
              <select value={c.role} disabled={busy} onChange={(e) => run(() => setCollaboratorRole(repo.id, c.member.id, e.target.value as Collaborator["role"]))} aria-label={`Role for ${c.member.handle ?? c.member.name}`} className={cn(inputCls, "ml-auto h-8 w-auto")}>
                <option value="read">Read</option>
                <option value="write">Write</option>
                {role === "owner" || c.role === "admin" ? <option value="admin">Admin</option> : null}
              </select>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${c.member.handle ?? c.member.name}`}
                className="hover:text-destructive"
                disabled={busy}
                onClick={() => window.confirm(`Remove ${c.member.handle ?? c.member.name} from ${fullName(repo)}?`) && run(() => removeCollaborator(repo.id, c.member.id))}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))
        )}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!handle.trim()) return
          void run(async () => {
            await addCollaborator(repo.id, handle, newRole)
            setHandle("")
          })
        }}
      >
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" aria-label="Member handle" className={cn(inputCls, "min-w-0 flex-1")} />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value as Collaborator["role"])} aria-label="Role" className={cn(inputCls, "w-auto")}>
          <option value="read">Read</option>
          <option value="write">Write</option>
          {role === "owner" && <option value="admin">Admin</option>}
        </select>
        <Button type="submit" variant="outline" disabled={busy || !handle.trim()}>
          <PlusIcon aria-hidden /> <Copy k="code-repo.settings.add">Add</Copy>
        </Button>
      </form>
      <FormError message={error} />
    </Section>
  )
}

const COLORS = ["8fb4ff", "d3b4ff", "9fe3cf", "e9c79a", "ff9f8f", "7fe0b0", "f5a3d7", "b0b8c8"]

function Labels() {
  const { repo } = useRepo()
  const list = useLoad(() => listLabels(repo.id), [repo.id])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(COLORS[0])
  const [error, setError] = useState<string | null>(null)
  return (
    <Section title="Labels" icon={TagIcon} hint="Sort issues by kind. Issues that already carry a deleted label keep it until someone edits their labels.">
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(list.data ?? []).map((l) => (
            <li key={l.name} className="flex items-center gap-3 text-sm">
              <LabelChip label={l} />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.description}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete label ${l.name}`}
                className="hover:text-destructive"
                onClick={async () => {
                  if (!window.confirm(`Delete the label "${l.name}"?`)) return
                  setError(null)
                  try {
                    await deleteLabel(repo.id, l.name)
                    list.set(list.data!.filter((x) => x.name !== l.name))
                  } catch (err) {
                    setError((err as Error).message)
                  }
                }}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await createLabel(repo.id, { name: name.trim(), color, description: description.trim() })
            setName("")
            setDescription("")
            list.reload()
          } catch (err) {
            setError((err as Error).message)
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Label name" aria-label="Label name" className={cn(inputCls, "sm:w-40")} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={100} placeholder="Description (optional)" aria-label="Label description" className={cn(inputCls, "min-w-0 flex-1")} />
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`#${c}`} onClick={() => setColor(c)} className={cn("size-5 rounded-full ring-offset-2 ring-offset-background transition-transform", color === c ? "scale-110 ring-2 ring-foreground/70" : "hover:scale-110")} style={{ background: `#${c}` }} />
          ))}
        </div>
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          <PlusIcon aria-hidden /> <Copy k="code-repo.settings.add">Add</Copy>
        </Button>
      </form>
      <FormError message={error} />
    </Section>
  )
}

function Danger() {
  const { repo, role, setRepo } = useRepo()
  const router = useRouter()
  const { busy, error, save } = useSave()
  const [confirm, setConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const name = fullName(repo)
  const priv = repo.visibility === "private"
  return (
    <Section title="Danger zone" icon={ShieldIcon} className="border-destructive/30">
      <Row title={priv ? "Make public" : "Make private"} hint={priv ? "Everyone will be able to see the code, issues and pull requests." : "Only you, collaborators and staff will see it. Stars from others stay counted."}>
        <Button variant="outline" disabled={busy} onClick={() => window.confirm(`Make ${name} ${priv ? "public" : "private"}?`) && save({ visibility: priv ? "public" : "private" })}>
          {priv ? <GlobeIcon aria-hidden /> : <LockIcon aria-hidden />}
          {priv ? "Make public" : "Make private"}
        </Button>
      </Row>
      <Row title={repo.archivedAt ? "Unarchive" : "Archive"} hint={repo.archivedAt ? "Open it for commits, issues and pull requests again." : "Make it read-only: no commits, issues or pull requests. It stays visible."}>
        <Button variant="outline" disabled={busy} onClick={() => save({ archived_at: repo.archivedAt ? null : new Date().toISOString() })}>
          {repo.archivedAt ? <ArchiveRestoreIcon aria-hidden /> : <ArchiveIcon aria-hidden />}
          {repo.archivedAt ? "Unarchive" : "Archive"}
        </Button>
      </Row>
      <FormError message={error} />
      {role === "owner" && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.05] p-3">
          <p className="text-sm font-medium"><Copy k="code-repo.settings.delete-this-repository">Delete this repository</Copy></p>
          <p className="text-xs text-muted-foreground"><Copy k="code-repo.settings.its-code-issues-pull-requests" multiline>Its code, issues, pull requests and releases go away for everyone, and the name becomes free. Forks keep their own copy.</Copy></p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              Type <code className="rounded bg-secondary px-1 font-mono text-xs">{name}</code> to confirm
            </span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cn(inputCls, "font-mono")} autoComplete="off" />
          </label>
          <FormError message={delError} />
          <div>
            <Button
              variant="destructive"
              disabled={confirm !== name || deleting}
              onClick={async () => {
                setDeleting(true)
                setDelError(null)
                try {
                  await deleteRepo(repo.id)
                  router.replace(href(`/code/${ownerKey(repo.owner)}`))
                } catch (err) {
                  setDelError((err as Error).message)
                  setDeleting(false)
                }
              }}
            >
              {deleting ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <Trash2Icon aria-hidden />}
              Delete repository
            </Button>
          </div>
        </div>
      )}
      <StaffHide kind="repo" id={repo.id} hidden={Boolean(repo.hiddenAt)} onDone={(h) => setRepo({ ...repo, hiddenAt: h ? new Date().toISOString() : null })} />
    </Section>
  )
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
