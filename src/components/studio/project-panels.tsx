"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CodeIcon, ExternalLinkIcon, FileTextIcon, FolderGit2Icon, LinkIcon, MonitorPlayIcon, OrbitIcon, PlusIcon, ScaleIcon, TagIcon, UsersIcon } from "lucide-react"
import { RepoEmbed } from "@/components/code/repo-app"
import { Copy } from "@/components/content/copy"
import { DownloadsPanel } from "@/components/downloads/downloads-panel"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Cover, LangTag } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { Markdown } from "@/components/live/markdown"
import { TimeAgo } from "@/components/live/time"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { FollowButton } from "@/components/social/follow-button"
import { ActivityChart } from "@/components/studio/activity-chart"
import { CodeLinkPanel } from "@/components/studio/code-link"
import { DatasetFacts } from "@/components/studio/dataset-panels"
import { Gallery } from "@/components/studio/gallery"
import { datasetSnippets, modelSnippets, Snippets, SpecsTable } from "@/components/studio/model-panels"
import { ProjectEditor } from "@/components/studio/project-editor"
import { Button } from "@/components/ui/button"
import { formatDate, KINDS, LANGUAGES } from "@/lib/data"
import type { HostedFile } from "@/lib/publish/files"
import { findLicense } from "@/lib/publish/licenses"
import { getProjectsById, licenseLabel, listUsing, projectHref, projectThreadId, pub, typeLabel, typeOf, type Project } from "@/lib/projects"

/*
 * The tabs of a project's page, below the header (project-view.tsx). Each panel gets the project and, where it
 * needs them, the project's hosted files (loaded once by the page and shared).
 */

export type PanelProps = { p: Project; files: HostedFile[]; filesReady: boolean; mine: boolean; owner: boolean; base: string; onProject: (p: Project) => void }

// ─── Overview ───────────────────────────────────────────────────────────────────────────────────────────────

export function OverviewPanel({ p, files, mine, owner, base }: PanelProps) {
  const o = pub(p)
  const type = typeOf(p)
  const card = type === "model" ? "Model card" : type === "dataset" ? "Dataset card" : "README"
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-10">
        <section aria-labelledby="card-h" className="flex flex-col gap-3">
          <h2 id="card-h" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileTextIcon aria-hidden className="size-4" /> {card}
          </h2>
          {p.readme.trim() ? (
            <div className="rounded-2xl border border-border bg-card p-5 md:p-7">
              <Markdown source={p.readme} ctx={{ source: "none" }} embeds />
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {mine ? (
                <>
                  No {card.toLowerCase()} yet.{" "}
                  <Link href={`${base}/settings` as "/"} className="text-ion hover:underline">
                    Write one
                  </Link>{" "}
                  so people know how to use it.
                </>
              ) : (
                `The authors have not written a ${card.toLowerCase()} yet.`
              )}
            </p>
          )}
        </section>
        {o.gallery.length > 0 && <Gallery items={o.gallery} name={p.name} />}
        {type === "dataset" && files.length > 0 && (
          <section aria-labelledby="use-h" className="flex flex-col gap-3">
            <h2 id="use-h" className="text-base font-semibold">
              <Copy k="project.dataset.use">Use this dataset</Copy>
            </h2>
            <Snippets snippets={datasetSnippets(p, files)} />
          </section>
        )}
      </div>
      <aside aria-label="About this project" className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        {type === "model" && p.specs?.model && <SpecsTable specs={p.specs.model} />}
        {type === "dataset" && <DatasetFacts p={p} files={files} />}
        <Details p={p} />
        <BuiltWith p={p} />
        <Links p={p} />
        <People p={p} owner={owner} />
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  )
}

function Details({ p }: { p: Project }) {
  const licence = findLicense(p.license)
  return (
    <section aria-label="Details" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
      <Row label="Type" value={typeLabel(typeOf(p))} />
      <Row
        label="Licence"
        value={
          licence?.url ? (
            <a href={licence.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ion" title={licence.short}>
              <ScaleIcon aria-hidden className="size-3.5" /> {licenseLabel(p.license)}
            </a>
          ) : (
            licenseLabel(p.license)
          )
        }
      />
      {p.versions[0] && <Row label="Latest" value={<span className="font-mono">{p.versions[0].version}</span>} />}
      <Row label="Updated" value={<TimeAgo date={p.updatedAt} />} />
      {p.publishedAt && <Row label="Published" value={<time dateTime={p.publishedAt}>{formatDate(p.publishedAt)}</time>} />}
      {p.langs.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Languages</span>
          <div className="flex flex-wrap gap-1.5">
            {p.langs.map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs">
                <LangTag lang={l} className="border-0 p-0" /> <span lang={l}>{LANGUAGES[l]?.native ?? l}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {p.tags.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <TagIcon aria-hidden className="size-3.5" /> Tags
          </span>
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <Link key={t} href={`${KINDS[p.kind].path}?q=${encodeURIComponent(t)}` as "/"} className="pressable rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                #{t}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function BuiltWith({ p }: { p: Project }) {
  const [list, setList] = useState<Project[] | null>(null)
  const ids = (p.related ?? []).join(",")
  useEffect(() => {
    if (!ids) return
    let stale = false
    getProjectsById(ids.split(",")).then((l) => !stale && setList(l))
    return () => {
      stale = true
    }
  }, [ids])
  if (!ids || !list?.length) return null
  return (
    <section aria-labelledby="built-h" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <h2 id="built-h" className="text-xs font-medium text-muted-foreground">
        <Copy k="project.builtwith">Built with</Copy>
      </h2>
      <ul className="flex flex-col gap-1">
        {list.map((x) => (
          <li key={x.id}>
            <Link href={projectHref(x) as "/"} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-secondary/60">
              <span className="size-6 shrink-0 overflow-hidden rounded-md">
                <Cover seed={x.slug} kind={x.kind} />
              </span>
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="text-xs text-muted-foreground">{typeLabel(typeOf(x))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function External({ href, icon: Icon, label }: { href: string; icon: typeof FileTextIcon; label: string }) {
  let host = href
  try {
    host = new URL(href).hostname.replace(/^www\./, "")
  } catch {}
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-2 hover:text-ion">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
      <span className="truncate text-xs text-muted-foreground">{host}</span>
      <ExternalLinkIcon aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

function Links({ p }: { p: Project }) {
  const o = pub(p)
  const gh = p.links.repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/)
  if (!p.links.repo && !p.links.paper && !p.links.demo && !o.extraLinks.length) return null
  return (
    <section aria-labelledby="links-h" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <h2 id="links-h" className="mb-1 text-xs font-medium text-muted-foreground">
        Links
      </h2>
      {gh && (
        <Link href={`/gh/${gh[1]}/${gh[2]}` as "/"} className="flex items-center gap-2 hover:text-ion">
          <FolderGit2Icon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {gh[1]}/{gh[2]}
          </span>
        </Link>
      )}
      {p.links.paper && <External href={p.links.paper} icon={FileTextIcon} label="Paper" />}
      {p.links.demo && <External href={p.links.demo} icon={MonitorPlayIcon} label="Demo" />}
      {o.extraLinks.map((l) => (
        <External key={l.url} href={l.url} icon={LinkIcon} label={l.label} />
      ))}
    </section>
  )
}

function People({ p, owner }: { p: Project; owner: boolean }) {
  const o = pub(p)
  const name = p.local ? "You" : (p.owner?.name ?? "A member")
  return (
    <section aria-label="Authors" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <ProfileAvatar name={name} seed={p.owner?.id} url={p.owner?.avatarUrl} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          {p.owner ? (
            <Link href={`/people/${p.owner.handle ?? p.owner.id}` as "/"} className="truncate font-medium hover:text-ion">
              {name}
            </Link>
          ) : (
            <span className="truncate font-medium">{name}</span>
          )}
          {p.owner?.handle && <span className="truncate text-xs text-muted-foreground">@{p.owner.handle}</span>}
        </div>
        {p.owner && !owner && <FollowButton followee={`member:${p.owner.id}`} name={p.owner.name} showCount={false} />}
      </div>
      {o.coauthors.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersIcon aria-hidden className="size-3.5" /> Co-authors
          </span>
          <ul className="flex flex-wrap gap-2">
            {o.coauthors.map((c) => (
              <li key={c.id}>
                <Link href={`/people/${c.handle ?? c.id}` as "/"} className="flex items-center gap-1.5 rounded-full bg-secondary/60 py-0.5 pr-2.5 pl-0.5 text-xs hover:text-ion">
                  <ProfileAvatar name={c.name} seed={c.id} url={c.avatarUrl} size={20} />
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─── Files and versions ─────────────────────────────────────────────────────────────────────────────────────

export function FilesPanel({ p, mine }: PanelProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {p.local ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Files need the site&apos;s database. This copy keeps projects in your browser only.</p>
      ) : (
        <DownloadsPanel kind="project" targetId={p.id} canEdit={mine} zipName={`${p.slug}${p.versions[0] ? `-${p.versions[0].version}` : ""}`} versions={p.versions.map((v) => v.version)} />
      )}
      <section aria-labelledby="changelog-h" className="flex flex-col gap-4">
        <h2 id="changelog-h" className="text-sm font-semibold">
          Versions
        </h2>
        {p.versions.length ? (
          <ol className="relative flex flex-col gap-5 border-l border-border pl-5">
            {p.versions.map((v, i) => (
              <li key={v.id ?? v.version} className="relative flex flex-col gap-1.5">
                <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background ${i === 0 ? "bg-[var(--project-accent,#8fb4ff)]" : "bg-muted-foreground/50"}`} />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-mono text-sm font-semibold">{v.version}</h3>
                  <time dateTime={v.releasedOn} className="text-xs text-muted-foreground">
                    {formatDate(v.releasedOn)}
                  </time>
                  {i === 0 && <span className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">Latest</span>}
                </div>
                {v.notes ? <Markdown source={v.notes} ctx={{ source: "none" }} className="text-sm [&_p]:my-1.5" /> : <p className="text-sm text-muted-foreground">No notes.</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{mine ? "No versions yet. Add one in Settings, then tag files with it as you upload them." : "No versions listed yet."}</p>
        )}
      </section>
    </div>
  )
}

// ─── Apps using it ──────────────────────────────────────────────────────────────────────────────────────────

export function AppsPanel({ p }: PanelProps) {
  const [list, setList] = useState<Project[] | null>(null)
  useEffect(() => {
    let stale = false
    listUsing(p.id).then((l) => !stale && setList(l))
    return () => {
      stale = true
    }
  }, [p.id])
  if (!list) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <OrbitIcon aria-hidden className="size-6 text-ion" />
        <p className="font-medium">
          <Copy k="project.apps.empty.title">Nothing orbits this one yet</Copy>
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          <Copy k="project.apps.empty.body">Built an app, a tool or a model with it? Add it under Built with in your project&apos;s settings and it shows up here.</Copy>
        </p>
        <Button size="sm" variant="secondary" nativeButton={false} render={<Link href="/new/project?type=app" />}>
          <PlusIcon aria-hidden /> Publish what you built
        </Button>
      </div>
    )
  }
  return (
    <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((x) => (
        <Item as="li" key={x.id}>
          <Link href={projectHref(x) as "/"} className="pressable group flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-white/20">
            <span className="flex items-center gap-3">
              <span className="size-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105">
                <Cover seed={x.slug} kind={x.kind} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground">
                  {typeLabel(typeOf(x))} · {x.owner?.name ?? "A member"}
                </span>
              </span>
            </span>
            <span className="line-clamp-2 text-sm text-muted-foreground">{x.summary}</span>
          </Link>
        </Item>
      ))}
    </Stagger>
  )
}

// ─── Quick start ────────────────────────────────────────────────────────────────────────────────────────────

export function ApiPanel({ p, files, filesReady }: PanelProps) {
  if (!filesReady) return <div className="h-64 animate-pulse rounded-2xl bg-card" />
  const type = typeOf(p)
  const list = type === "dataset" ? datasetSnippets(p, files) : modelSnippets(p, files)
  return (
    <Snippets
      snippets={list}
      lead={
        type === "dataset"
          ? "Download the files from Files and versions, then load them with any of these."
          : p.specs?.model?.endpoints?.length || p.specs?.model?.pricing
            ? "Set BASE_URL and API_KEY for a provider from the Providers tab. The requests follow the OpenAI chat format most providers speak."
            : "Download the weights from Files and versions, then load them locally."
      }
    />
  )
}

// ─── Activity, discussion, code, settings ───────────────────────────────────────────────────────────────────

export function ActivityPanel({ p, base }: PanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <ActivityChart projectId={p.id} />
      {p.codeRepoId && <RepoActivityBlock repoId={p.codeRepoId} base={base} />}
    </div>
  )
}

function RepoActivityBlock({ repoId, base }: { repoId: string; base: string }) {
  return (
    <section aria-labelledby="repo-activity-h" className="flex flex-col gap-3">
      <h2 id="repo-activity-h" className="text-sm font-semibold">
        Code activity
      </h2>
      <RepoEmbed repoId={repoId} base={base} rest={["activity"]} compact />
    </section>
  )
}

export function DiscussionsPanel({ p }: PanelProps) {
  const o = pub(p)
  if (p.status === "draft") return <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">The discussion opens when the project is published.</p>
  return <ThreadDiscussion threadId={projectThreadId(p.id)} heading="Discussion" locked={!o.commentsEnabled} lockedNote={o.commentsEnabled ? undefined : "The authors closed comments on this project."} />
}

export function CodePanel({ p, mine, base, rest }: PanelProps & { rest: string[] }) {
  if (!p.codeRepoId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <CodeIcon aria-hidden className="size-6 text-repo" />
        <p className="font-medium">
          <Copy k="project.code.empty.title">No code repository yet</Copy>
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          <Copy k="project.code.empty.body">A repository gives this project files with full history, branches, commits, issues, pull requests and releases, right here.</Copy>
        </p>
        {mine && (
          <Button size="sm" nativeButton={false} render={<Link href={`${base}/settings#code` as "/"} />}>
            <PlusIcon aria-hidden /> Add a repository
          </Button>
        )}
      </div>
    )
  }
  return <RepoEmbed repoId={p.codeRepoId} base={base} rest={rest} />
}

export function SettingsPanel({ p, base, onProject }: PanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <ProjectEditor id={p.id} embedded onSaved={onProject} />
      {!p.local && (
        <div id="code" className="scroll-mt-24">
          <CodeLinkPanel p={p} base={base} onChange={(repoId) => onProject({ ...p, codeRepoId: repoId })} />
        </div>
      )}
    </div>
  )
}
