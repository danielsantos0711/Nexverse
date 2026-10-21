"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { CalendarClockIcon, DownloadCloudIcon, LinkIcon, LockIcon, SettingsIcon, StarIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Chip, Cover, TYPE_ICONS } from "@/components/hub/bits"
import { CompareButton } from "@/components/hub/compare"
import { LikeButton } from "@/components/hub/like-button"
import { ModMenu, ReportButton } from "@/components/moderation"
import { DiscussButton } from "@/components/social/discuss-button"
import { SaveButton } from "@/components/social/save-button"
import { StatusPill } from "@/components/studio/ui"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ActivityPanel, ApiPanel, AppsPanel, CodePanel, DiscussionsPanel, FilesPanel, OverviewPanel, SettingsPanel, type PanelProps } from "@/components/studio/project-panels"
import { BenchmarksPanel, ModelFacts, ProvidersPanel } from "@/components/studio/model-panels"
import { DatasetViewer } from "@/components/studio/dataset-panels"
import { ExplainItem } from "@/components/ai/inline-ai"
import { compact, KINDS } from "@/lib/data"
import { formatBytes } from "@/lib/editor/media"
import { listFiles, type HostedFile } from "@/lib/publish/files"
import { ACCENTS, canEditProject, getProject, isScheduled, projectHref, projectTarget, pub, recordProjectView, SOURCE_SITES, typeLabel, typeOf, type Project, type ProjectType } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * A project's page (round 10: a project is a repository). One address, <kind path>/<id>, with tabs as
 * sub-paths: /models/<id>/providers, /datasets/<id>/viewer, /tools/<id>/tree/main/src … The code views of a
 * connected repository live here too, so nothing sends people to a separate Code page.
 */

const DISCUSS_CATEGORY = { model: "models", dataset: "data", tool: "show", repo: "show" } as const

type Tab = { id: string; label: string }

const CODE_VIEWS = new Set(["tree", "blob", "edit", "new", "upload", "commits", "commit", "compare", "branches", "tags", "issues", "pulls", "pull", "releases"])

function tabsFor(type: ProjectType, hasCode: boolean, mine: boolean): Tab[] {
  const code: Tab[] = hasCode
    ? [
        { id: "code", label: "Code" },
        { id: "issues", label: "Issues" },
        { id: "pulls", label: "Pull requests" },
        { id: "releases", label: "Releases" },
      ]
    : mine
      ? [{ id: "code", label: "Code" }]
      : []
  const tail: Tab[] = [{ id: "discussions", label: "Discussions" }, ...(mine ? [{ id: "settings", label: "Settings" }] : [])]
  if (type === "model")
    return [
      { id: "overview", label: "Model card" },
      { id: "providers", label: "Providers" },
      { id: "benchmarks", label: "Benchmarks" },
      { id: "api", label: "API" },
      { id: "activity", label: "Activity" },
      { id: "apps", label: "Apps using it" },
      { id: "files", label: "Files and versions" },
      ...code,
      ...tail,
    ]
  if (type === "dataset")
    return [
      { id: "overview", label: "Dataset card" },
      { id: "viewer", label: "Viewer" },
      { id: "files", label: "Files and versions" },
      { id: "api", label: "Use it" },
      { id: "activity", label: "Activity" },
      { id: "apps", label: "Built on it" },
      ...code,
      ...tail,
    ]
  return [{ id: "overview", label: "Overview" }, { id: "files", label: "Files and versions" }, ...code, { id: "activity", label: "Activity" }, { id: "apps", label: "Used by" }, ...tail]
}

/** Which tab a sub-path belongs to, and the code view to show for it. */
function route(rest: string[], tabs: Tab[], openOn?: string): { tab: string; code: string[] } {
  const head = rest[0]
  if (!head) {
    const start = openOn && openOn !== "settings" && tabs.some((t) => t.id === openOn) ? openOn : "overview"
    return { tab: start, code: [] }
  }
  if (head === "downloads" || head === "versions") return { tab: "files", code: [] }
  if (head === "card" || head === "model-card") return { tab: "overview", code: [] }
  if (head === "code") return { tab: "code", code: rest.slice(1) }
  if (CODE_VIEWS.has(head)) return { tab: head === "pull" ? "pulls" : head === "issues" || head === "pulls" || head === "releases" ? head : "code", code: rest }
  if (tabs.some((t) => t.id === head)) return { tab: head, code: [] }
  return { tab: "overview", code: [] }
}

/** A member's project page, loaded in the browser (drafts are visible to their owner only). */
export function ProjectView({ id, rest = [], initial }: { id: string; rest?: string[]; initial?: Project | null }) {
  const { ready, user } = useSession()
  const [state, setState] = useState<{ project: Project | null; error: string } | null>(initial ? { project: initial, error: "" } : null)

  useEffect(() => {
    if (initial) return
    // Drafts are readable by their owner only, so wait for the session before asking.
    if (live && !ready) return
    let stale = false
    getProject(id)
      .then((project) => !stale && setState({ project, error: "" }))
      .catch((e: Error) => !stale && setState({ project: null, error: e.message }))
    return () => {
      stale = true
    }
  }, [id, ready, user?.id, initial])

  const p = state?.project
  useEffect(() => {
    if (p) document.title = `${p.name} · Nexverse`
  }, [p])

  if (!state) return <PageSkeleton />
  if (state.error) return <Missing title="This project could not be loaded" detail={state.error} />
  if (!state.project)
    return (
      <Missing
        title="This project is not here"
        detail={user ? "It may have been deleted or unpublished by its owner, or the address is wrong." : "It may be for signed-in members only, not published yet, or deleted. Sign in to check."}
        signIn={!user && live}
      />
    )
  return (
    <Page
      p={state.project}
      rest={rest}
      mine={canEditProject(state.project, user?.id)}
      owner={state.project.local || Boolean(user && state.project.ownerId === user.id)}
      onProject={(project) => setState({ project, error: "" })}
    />
  )
}

function Page({ p, rest, mine, owner, onProject }: { p: Project; rest: string[]; mine: boolean; owner: boolean; onProject: (p: Project) => void }) {
  const o = pub(p)
  const type = typeOf(p)
  const draft = p.status === "draft"
  const scheduled = isScheduled(p)
  const base = projectHref(p)
  const tabs = useMemo(() => tabsFor(type, Boolean(p.codeRepoId), mine), [type, p.codeRepoId, mine])
  const { tab, code } = route(rest, tabs, p.appearance?.openOn)
  const accent = ACCENTS.find((a) => a.id === p.appearance?.accent)?.hex ?? "#8fb4ff"
  const TypeIcon = TYPE_ICONS[type]
  const ownerName = p.local ? "You" : (p.owner?.name ?? "A member")
  const reduce = useReducedMotion()

  const [files, setFiles] = useState<HostedFile[]>([])
  const [loadedFiles, setFilesReady] = useState(false)
  const filesReady = loadedFiles || Boolean(p.local)
  useEffect(() => {
    if (p.local) return
    let stale = false
    listFiles("project", p.id)
      .then((r) => !stale && setFiles(r.files))
      .catch(() => null)
      .finally(() => !stale && setFilesReady(true))
    return () => {
      stale = true
    }
  }, [p.id, p.local])

  useEffect(() => {
    if (!draft && !p.local && !mine) recordProjectView(p.id).catch(() => null)
  }, [p.id, draft, p.local, mine])

  const downloads = files.reduce((n, f) => n + f.downloads, 0)
  const bytes = files.reduce((n, f) => n + f.size, 0)
  const props: PanelProps = { p, files, filesReady, mine, owner, base, onProject }
  const enter = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay, ease: [0.23, 1, 0.32, 1] as const } })
  const ds = p.specs?.dataset

  return (
    <div style={{ "--project-accent": accent } as React.CSSProperties}>
      <div className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 opacity-50">
          {o.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member cover picture
            <img src={o.coverUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <Cover seed={p.slug + "banner"} kind={p.kind} />
          )}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        <div className="shell flex flex-col gap-5 pt-7 pb-0 md:pt-9">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={KINDS[p.kind].path} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <TypeIcon aria-hidden className="size-4" />
              {KINDS[p.kind].plural}
            </Link>
            <span aria-hidden>/</span>
            {p.owner ? (
              <Link href={`/people/${p.owner.handle ?? p.owner.id}` as "/"} className="truncate hover:text-foreground">
                {ownerName}
              </Link>
            ) : (
              <span className="truncate">{ownerName}</span>
            )}
            <span aria-hidden>/</span>
            <span className="truncate text-foreground">{p.slug}</span>
          </nav>

          {!draft && !p.local && (scheduled || o.visibility !== "public") && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
              {scheduled ? <CalendarClockIcon aria-hidden className="size-4 text-gold" /> : o.visibility === "members" ? <LockIcon aria-hidden className="size-4 text-ion" /> : <LinkIcon aria-hidden className="size-4 text-ion" />}
              <span className="text-muted-foreground">
                {scheduled
                  ? `Scheduled: goes live on ${new Date(o.publishAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Until then only its editors see it.`
                  : o.visibility === "members"
                    ? "Members only: visitors who are not signed in cannot open this page."
                    : "Unlisted: it opens from its link but is not shown in lists or search."}
              </span>
            </div>
          )}
          {(draft || p.local) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
              {p.local ? <StatusPill tone="local">On this device</StatusPill> : <StatusPill tone="draft">Draft</StatusPill>}
              <span className="text-muted-foreground">{p.local ? "This copy of Nexverse has no database, so only you can see this page." : "Only you can see this page until you publish it."}</span>
              {mine && !p.local && (
                <Link href={`${base}/settings` as "/"} className="ml-auto text-ion hover:underline">
                  Review and publish
                </Link>
              )}
            </div>
          )}

          <motion.div {...enter()} className="flex flex-wrap items-start gap-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/15 md:size-20">
              <Cover seed={p.slug} kind={p.kind} />
              {p.appearance?.emoji && <span className="absolute inset-0 grid place-items-center text-3xl md:text-4xl">{p.appearance.emoji}</span>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `color-mix(in oklab, ${accent} 15%, transparent)`, color: accent }}>
                  <TypeIcon aria-hidden className="size-3" /> {typeLabel(type)}
                </span>
                {o.featuredAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                    <StarIcon aria-hidden className="size-3" /> Featured
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] break-words md:text-3xl">{p.name}</h1>
              <p className="text-muted-foreground">{p.summary}</p>
              {p.source && (
                <p className="text-xs text-muted-foreground">
                  Imported from {SOURCE_SITES[p.source.site]} · <span className="font-mono">{p.source.ref}</span>
                </p>
              )}
            </div>
          </motion.div>

          {type === "model" && p.specs?.model && <ModelFacts specs={p.specs.model} />}
          {type === "dataset" && (ds?.rows || ds?.bytes || files.length > 0) && (
            <div className="flex flex-wrap gap-2 text-sm">
              {ds?.rows ? <Chip>{compact(ds.rows)} rows</Chip> : null}
              {ds?.bytes || bytes ? <Chip>{formatBytes(ds?.bytes || bytes)}</Chip> : null}
              {ds?.splits?.length ? <Chip>{ds.splits.length} splits</Chip> : null}
              {ds?.formats?.map((f) => (
                <Chip key={f} className="font-mono">
                  {f}
                </Chip>
              ))}
            </div>
          )}

          <motion.div {...enter(0.05)} className="flex flex-wrap items-center gap-2">
            {!draft && <LikeButton target={projectTarget(p.id)} />}
            {!draft && <SaveButton target={projectTarget(p.id)} />}
            {!draft && <CompareButton project={{ id: p.id, name: p.name, kind: p.kind }} />}
            {!draft && <DiscussButton title={p.name} href={base} category={DISCUSS_CATEGORY[p.kind]} />}
            {!draft && !mine && <ReportButton targetKind="project" targetId={p.id} targetUrl={base} />}
            {!draft && <ModMenu kind="project" id={p.id} />}
            {filesReady && files.length > 0 && (
              <Link href={`${base}/files` as "/"} className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm hover:border-white/20">
                <DownloadCloudIcon aria-hidden className="size-4" /> {files.length} {files.length === 1 ? "file" : "files"}
                {downloads > 0 && <span className="text-muted-foreground">· {compact(downloads)} downloads</span>}
              </Link>
            )}
            {mine && (
              <Link href={`${base}/settings` as "/"} className="pressable inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <SettingsIcon aria-hidden className="size-4" /> Settings
              </Link>
            )}
          </motion.div>

          {!draft && tab === "overview" && (
            <ExplainItem
              kind={type}
              name={p.name}
              summary={p.summary}
              readme={p.readme}
              details={[`Kind: ${typeLabel(type)}`, `License: ${p.license}`, p.tags.length ? `Tags: ${p.tags.join(", ")}` : "", p.langs.length ? `Languages: ${p.langs.join(", ")}` : ""].filter(Boolean).join("\n")}
              url={base}
            />
          )}

          <TabBar tabs={tabs} current={tab} base={base} />
        </div>
      </div>

      <div className="shell pt-7 pb-16">
        <motion.div key={tab} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          {tab === "overview" && <OverviewPanel {...props} />}
          {tab === "providers" && <ProvidersPanel p={p} />}
          {tab === "benchmarks" && <BenchmarksPanel p={p} />}
          {tab === "api" && <ApiPanel {...props} />}
          {tab === "activity" && <ActivityPanel {...props} />}
          {tab === "apps" && <AppsPanel {...props} />}
          {tab === "files" && <FilesPanel {...props} />}
          {tab === "viewer" && (filesReady ? <DatasetViewer p={p} files={files} /> : <div className="h-96 animate-pulse rounded-2xl bg-card" />)}
          {(tab === "code" || tab === "issues" || tab === "pulls" || tab === "releases") && <CodePanel {...props} rest={tab === "code" ? code : code.length ? code : [tab]} />}
          {tab === "discussions" && <DiscussionsPanel {...props} />}
          {tab === "settings" && (mine ? <SettingsPanel {...props} /> : <p className="text-sm text-muted-foreground">Only the authors change this project&apos;s settings.</p>)}
        </motion.div>
      </div>
    </div>
  )
}

/** The tabs: links (each has its own address), a sliding underline, scrolls sideways on small screens, and ←/→ move between them. */
function TabBar({ tabs, current, base }: { tabs: Tab[]; current: string; base: string }) {
  const uid = useId()
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const href = useCallback((id: string) => (id === "overview" ? base : `${base}/${id}`), [base])

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]')
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [current])

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const i = tabs.findIndex((t) => t.id === current)
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]
    e.preventDefault()
    router.push(href(next.id) as "/", { scroll: false })
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus())
  }

  return (
    <div ref={ref} onKeyDown={onKey} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <nav aria-label="Project sections" className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.id === current
          return (
            <Link
              key={t.id}
              data-tab={t.id}
              href={href(t.id) as "/"}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn("relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {on && <motion.span layoutId={`${uid}-tab`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--project-accent)]" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function Missing({ title, detail, signIn }: { title: string; detail: string; signIn?: boolean }) {
  const path = usePathname()
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {signIn && (
          <Link href={`/sign-in?next=${encodeURIComponent(path)}` as "/sign-in"} className="text-ion hover:underline">
            Sign in
          </Link>
        )}
        <Link href="/explore" className="text-ion hover:underline">
          Explore projects
        </Link>
      </EmptyContent>
    </Empty>
  )
}
