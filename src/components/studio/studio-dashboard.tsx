"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import {
  BookmarkIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  Link2Icon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import { Cover, KIND_ICONS } from "@/components/hub/bits"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { ConfirmDialog, SignInPrompt, StatusPill, StudioHead } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TimeAgo } from "@/components/live/time"
import { compact, KINDS, type ResourceKind } from "@/lib/data"
import { useProfile } from "@/lib/profile"
import { deleteProject, isScheduled, getProjectStats, listMyProjects, projectPath, setProjectStatus, type Project, type ProjectStats } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Filter = "all" | "published" | "draft"
const EASE = [0.23, 1, 0.32, 1] as const
const ZERO: ProjectStats = { likes: 0, saves: 0, replies: 0 }

/**
 * Your projects with their numbers and drafts to finish. Since round 12 it is the Projects tab of your page (/you,
 * where /studio now leads): `embedded` leaves out the page header and the shortcuts column, which /you already has.
 */
export function StudioDashboard({ embedded = false }: { embedded?: boolean }) {
  const { ready, user } = useSession()
  if (live && !ready) return <DashboardSkeleton />
  if (live && !user) {
    return (
      <>
        {!embedded && <StudioHead title="Your projects" lead="Publish models, datasets, tools and repos, and see how people respond to them." />}
        <SignInPrompt title="Sign in to see your projects" detail="It takes an email address and nothing else." next="/you" />
      </>
    )
  }
  return <Dashboard key={user?.id ?? "local"} embedded={embedded} />
}

function Dashboard({ embedded }: { embedded: boolean }) {
  const reduce = useReducedMotion()
  const { profile } = useProfile()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [stats, setStats] = useState<Record<string, ProjectStats>>({})
  const [error, setError] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [toDelete, setToDelete] = useState<Project | null>(null)
  const [status, setStatus] = useState("")
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setError("")
    setProjects(null)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let stale = false
    listMyProjects()
      .then(async (list) => {
        if (stale) return
        setProjects(list)
        const s = await getProjectStats(list.map((p) => p.id)).catch(() => ({}))
        if (!stale) setStats(s)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [attempt])

  async function toggleStatus(p: Project) {
    const next = p.status === "published" ? "draft" : "published"
    const before = projects
    // Optimistic: the row flips at once and flips back if the database says no.
    setProjects((list) => list?.map((x) => (x.id === p.id ? { ...x, status: next, publishedAt: x.publishedAt ?? new Date().toISOString() } : x)) ?? null)
    try {
      await setProjectStatus(p.id, next)
      setStatus(next === "published" ? `${p.name} is published.` : `${p.name} is back to draft.`)
    } catch (e) {
      setProjects(before)
      setStatus(`Could not change ${p.name}: ${(e as Error).message}`)
    }
  }

  async function remove(p: Project) {
    await deleteProject(p.id)
    setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null)
    setStatus(`${p.name} was deleted.`)
  }

  const all = projects ?? []
  const published = all.filter((p) => p.status === "published")
  const drafts = all.filter((p) => p.status === "draft")
  const shown = filter === "all" ? all : filter === "published" ? published : drafts
  const total = all.reduce((t, p) => {
    const s = stats[p.id] ?? ZERO
    return { likes: t.likes + s.likes, saves: t.saves + s.saves, replies: t.replies + s.replies }
  }, ZERO)

  return (
    <>
      {!embedded && (
        <StudioHead title="Your projects" lead={live ? "Everything you publish on Nexverse, how it is doing, and what is still a draft." : "This copy has no database, so your projects are kept in this browser."}>
          <Link
            href="/new/project"
            className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <PlusIcon aria-hidden className="size-4" /> New project
          </Link>
        </StudioHead>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div className={cn("grid grid-cols-1 gap-8", !embedded && "pb-16 lg:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Tile label="Published" value={projects ? published.length : null} hint={projects ? `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}` : undefined} icon={RocketIcon} />
            <Tile label="Likes" value={projects ? total.likes : null} icon={HeartIcon} />
            <Tile label="Saves" value={projects ? total.saves : null} icon={BookmarkIcon} />
            <Tile label="Comments" value={projects ? total.replies : null} icon={MessageSquareIcon} />
          </dl>

          {error ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
              <p>Your projects could not be loaded: {error}</p>
              <Button variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            </div>
          ) : !projects ? (
            <ListSkeleton />
          ) : all.length === 0 ? (
            <EmptyStudio />
          ) : (
            <section aria-labelledby="projects-h" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="projects-h" className="text-base font-semibold">
                  Your projects
                </h2>
                <div role="group" aria-label="Show" className="glass flex gap-1 rounded-full p-1">
                  {(
                    [
                      ["all", "All", all.length],
                      ["published", "Published", published.length],
                      ["draft", "Drafts", drafts.length],
                    ] as const
                  ).map(([id, label, n]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                      className={cn(
                        "relative rounded-full px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        filter === id ? "text-ion-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {filter === id && (
                        <motion.span layoutId="studio-filter" aria-hidden className="absolute inset-0 rounded-full bg-ion" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }} />
                      )}
                      <span className="relative">
                        {label} <span className="tabular opacity-70">{n}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {filter === "draft" ? "No drafts. Everything you made is out in the world." : "Nothing published yet. Publish a draft when it is ready."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {shown.map((p) => (
                      <motion.li
                        key={p.id}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: EASE }}
                      >
                        <ProjectRow p={p} stats={stats[p.id] ?? ZERO} onToggle={() => toggleStatus(p)} onDelete={() => setToDelete(p)} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>
          )}
        </div>

        <aside aria-label="Shortcuts" className={cn("flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start", embedded && "hidden")}>
          {profile && (
            <div className="glass flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <ProfileAvatar name={profile.name} seed={profile.id} url={profile.avatarUrl} size={40} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{profile.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{profile.handle ? `@${profile.handle}` : "No handle yet"}</span>
                </div>
              </div>
              {!profile.local && !profile.onboardedAt && (
                <Link href="/welcome" className="inline-flex items-center gap-1.5 rounded-lg bg-ion/10 px-3 py-2 text-sm text-ion hover:bg-ion/15">
                  <SparklesIcon aria-hidden className="size-4" /> Finish setting up your feed
                </Link>
              )}
            </div>
          )}
          <nav aria-label="Quick actions" className="flex flex-col rounded-2xl border border-border bg-card/60 p-2">
            <Quick href="/new/project" icon={PlusIcon} label="New project" />
            <Quick href="/share" icon={Link2Icon} label="Share a link" />
            <Quick href="/forum/new" icon={MessageSquarePlusIcon} label="Start a thread" />
            <Quick href="/saved" icon={BookmarkIcon} label="Saved" />
            <Quick href="/settings" icon={SettingsIcon} label="Profile and settings" />
          </nav>
        </aside>
      </div>

      {toDelete && (
        <ConfirmDialog
          open={Boolean(toDelete)}
          onOpenChange={(o) => !o && setToDelete(null)}
          title={`Delete ${toDelete.name}?`}
          description="The page, its changelog and its discussion go for everyone. This cannot be undone."
          confirm="Delete project"
          onConfirm={() => remove(toDelete)}
        />
      )}
    </>
  )
}

function ProjectRow({ p, stats, onToggle, onDelete }: { p: Project; stats: ProjectStats; onToggle: () => void; onDelete: () => void }) {
  const isLive = p.status === "published"
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3.5">
        <div className="size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          {p.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member cover picture
            <img src={p.coverUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <Cover seed={p.slug} kind={p.kind} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={isLive || p.local ? projectPath(p.id) : `${projectPath(p.id)}/edit`} className="truncate text-[15px] font-medium hover:underline">
              {p.name}
            </Link>
            {isLive && isScheduled(p) ? <StatusPill tone="draft">Scheduled</StatusPill> : isLive ? <StatusPill tone="live">Published</StatusPill> : <StatusPill tone="draft">Draft</StatusPill>}
            {isLive && p.visibility === "members" && <StatusPill tone="local">Members only</StatusPill>}
            {isLive && p.visibility === "unlisted" && <StatusPill tone="local">Unlisted</StatusPill>}
            {p.featuredAt && <StatusPill tone="live">Featured</StatusPill>}
          </div>
          <p className="line-clamp-1 text-[13px] text-muted-foreground">{p.summary}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{KINDS[p.kind].label}</span>
            <TimeAgo date={p.updatedAt} prefix="Edited" />
            <span className="inline-flex items-center gap-1 tabular" title="Likes">
              <HeartIcon aria-hidden className="size-3.5" /> {compact(stats.likes)}
              <span className="sr-only">likes</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular" title="Saves">
              <BookmarkIcon aria-hidden className="size-3.5" /> {compact(stats.saves)}
              <span className="sr-only">saves</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular" title="Comments">
              <MessageSquareIcon aria-hidden className="size-3.5" /> {compact(stats.replies)}
              <span className="sr-only">comments</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
        <Link href={`${projectPath(p.id)}/edit`} aria-label={`Edit ${p.name}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <PencilIcon aria-hidden className="size-3.5" /> Edit
        </Link>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-label={isLive ? `Unpublish ${p.name}` : `Publish ${p.name}`}>
          {isLive ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />} {isLive ? "Unpublish" : "Publish"}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete ${p.name}`} title="Delete">
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </article>
  )
}

function Tile({ label, value, hint, icon: Icon }: { label: string; value: number | null; hint?: string; icon: LucideIcon }) {
  return (
    <div className="glass flex flex-col gap-1 rounded-xl p-3.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-3.5" /> {label}
      </dt>
      <dd className="text-xl font-semibold tabular">{value === null ? <Skeleton className="mt-1 h-6 w-10" /> : compact(value)}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

function Quick({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Icon aria-hidden className="size-4" /> {label}
    </Link>
  )
}

function EmptyStudio() {
  return (
    <section aria-labelledby="empty-h" className="flex flex-col gap-4 rounded-2xl border border-dashed border-border p-6">
      <div className="flex flex-col gap-1">
        <h2 id="empty-h" className="text-base font-semibold">
          Nothing here yet
        </h2>
        <p className="text-sm text-muted-foreground">Start with what you have. A draft stays private until you publish it.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
          const Icon = KIND_ICONS[k]
          return (
            <li key={k}>
              <Link
                href={`/new/project?kind=${k}`}
                className="pressable flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card/50 p-3 text-sm transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon aria-hidden className="size-5 text-ion" />
                <span className="font-medium">A {KINDS[k].label.toLowerCase()}</span>
                <span className="text-xs text-muted-foreground">{KINDS[k].blurb}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading your projects">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 pt-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <ListSkeleton />
    </div>
  )
}
