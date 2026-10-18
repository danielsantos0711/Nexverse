import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArchiveIcon, CircleDotIcon, EyeIcon, FolderGit2Icon, GitBranchIcon, GitCommitHorizontalIcon, GitForkIcon, ScaleIcon, StarIcon, TagIcon } from "lucide-react"
import { Chip, Cover } from "@/components/hub/bits"
import { CopyButton } from "@/components/hub/copy-button"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { SaveButton } from "@/components/social/save-button"
import { compact } from "@/lib/data"
import { ghCommits, ghContents, ghFile, ghLanguages, ghReadme, ghReleases, ghRepo, type GhCommit, type GhEntry, type GhRelease, type GhRepoDetail } from "@/lib/live/github"
import type { FailReason } from "@/lib/live/http"
import { discussItemHref, ghBlobHref, ghHref, ghTreeHref, internalHref, liveTarget } from "@/lib/live/ids"
import { cn } from "@/lib/utils"
import { ExternalLink } from "./bits"
import { CodeView } from "./code-block"
import { bytes, DetailBanner, DiscussButton, Empty, ErrorPanel, InfoRow, Panel, SourceLink } from "./detail"
import { FileList, type FileRow } from "./file-list"
import { LanguageBar } from "./language-bar"
import { Markdown } from "./markdown"
import { TimeAgo } from "./time"

/* The in-site page of a GitHub repository, and its file and folder views. */

function Avatar({ repo: d, size = "lg" }: { repo: Pick<GhRepoDetail, "ownerAvatar" | "ownerType" | "fullName">; size?: "lg" | "sm" }) {
  const box = size === "lg" ? "size-16 md:size-20" : "size-10"
  return (
    <div className={cn("shrink-0 overflow-hidden ring-1 ring-white/15", box, d.ownerType === "Organization" ? "rounded-2xl" : "rounded-full")}>
      {d.ownerAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar, loaded directly without a referrer
        <img src={`${d.ownerAvatar}${d.ownerAvatar.includes("?") ? "&" : "?"}s=160`} alt="" width={80} height={80} referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <Cover seed={`gh-${d.fullName}`} kind="repo" />
      )}
    </div>
  )
}

const crumbs = (owner: string) => [
  {
    href: "/trending#repos",
    label: (
      <>
        <FolderGit2Icon aria-hidden className="size-4" /> GitHub
      </>
    ),
  },
  { label: owner },
]

function StatPill({ icon: Icon, value, label }: { icon: typeof StarIcon; value: number; label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm" title={label}>
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <span className="tabular">{compact(value)}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

function RepoHeader({ d }: { d: GhRepoDetail }) {
  const target = liveTarget("ghrepo", d.fullName)
  const discuss = discussItemHref(d.fullName, `About ${d.fullName}${d.description ? `: ${d.description}` : ""}\n\n${ghHref(d.owner, d.name)}`)
  return (
    <DetailBanner seed={`gh-${d.fullName}`} kind="repo" crumbs={crumbs(d.owner)}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar repo={d} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] break-words md:text-4xl">
            <span className="text-muted-foreground">{d.owner}/</span>
            {d.name}
          </h1>
          {d.description && <p className="max-w-[70ch] text-muted-foreground">{d.description}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {target && <LikeButton target={target} />}
        {target && <SaveButton target={target} />}
        <DiscussButton href={discuss} />
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <StatPill icon={StarIcon} value={d.stars} label="stars" />
        <StatPill icon={GitForkIcon} value={d.forks} label="forks" />
        {d.archived && (
          <Chip className="gap-1 text-gold">
            <ArchiveIcon aria-hidden className="size-3" /> Archived
          </Chip>
        )}
      </div>
      {d.topics.length > 0 && (
        <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
          {d.topics.map((t) => (
            <li key={t} className="rounded-full bg-repo/10 px-2.5 py-0.5 text-xs text-repo">
              {t}
            </li>
          ))}
        </ul>
      )}
    </DetailBanner>
  )
}

function entryRows(owner: string, repo: string, branch: string, entries: GhEntry[]): FileRow[] {
  return entries.map((e) => ({
    name: e.name,
    type: e.type,
    size: e.size,
    href: e.type === "dir" ? ghTreeHref(owner, repo, branch, e.path) : e.type === "file" || e.type === "symlink" ? ghBlobHref(owner, repo, branch, e.path) : null,
    note: e.type === "submodule" ? "submodule" : undefined,
  }))
}

function Commits({ commits }: { commits: GhCommit[] }) {
  if (!commits.length) return <Empty>No commits yet.</Empty>
  return (
    <ol className="overflow-hidden rounded-xl border border-border">
      {commits.map((c) => (
        <li key={c.sha} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
          {c.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar
            <img src={`${c.avatar}${c.avatar.includes("?") ? "&" : "?"}s=48`} alt="" width={24} height={24} referrerPolicy="no-referrer" loading="lazy" className="mt-0.5 size-6 shrink-0 rounded-full" />
          ) : (
            <GitCommitHorizontalIcon aria-hidden className="mt-0.5 size-6 shrink-0 p-0.5 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm leading-snug break-words">{c.message}</p>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{c.login || c.author || "unknown"}</span>
              <TimeAgo date={c.date} />
            </p>
          </div>
          <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{c.sha.slice(0, 7)}</code>
        </li>
      ))}
    </ol>
  )
}

function Releases({ releases, owner, repo, branch }: { releases: GhRelease[]; owner: string; repo: string; branch: string }) {
  if (!releases.length) return <Empty>No releases published yet.</Empty>
  return (
    <ol className="flex flex-col gap-3">
      {releases.map((r, i) => (
        <li key={r.tag}>
          <details open={i === 0} className="group rounded-xl border border-border bg-card/50">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <TagIcon aria-hidden className="size-4 text-repo" />
              <span className="font-medium">{r.name}</span>
              {r.name !== r.tag && <code className="font-mono text-xs text-muted-foreground">{r.tag}</code>}
              {i === 0 && !r.prerelease && <Chip className="text-ok">Latest</Chip>}
              {r.prerelease && <Chip className="text-gold">Pre-release</Chip>}
              <TimeAgo date={r.publishedAt} className="ml-auto text-xs text-muted-foreground" />
            </summary>
            <div className="border-t border-border px-4 py-3">
              {r.body.trim() ? <Markdown source={r.body} ctx={{ source: "github", owner, repo, branch, dir: "" }} className="text-sm" /> : <p className="text-sm text-muted-foreground">No release notes.</p>}
            </div>
          </details>
        </li>
      ))}
    </ol>
  )
}

function Section<T>({ result, what, children }: { result: { ok: true; data: T } | { ok: false; reason: FailReason }; what: string; children: (data: T) => React.ReactNode }) {
  return result.ok ? <>{children(result.data)}</> : <ErrorPanel reason={result.reason} what={what} />
}

function Clone({ fullName }: { fullName: string }) {
  const cmd = `git clone https://github.com/${fullName}.git`
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Clone</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-[#07080d] py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-[#cfd8ea]" title={cmd}>
          {cmd}
        </code>
        <span className="shrink-0 text-xs text-muted-foreground">
          <CopyButton text={cmd} />
        </span>
      </div>
    </div>
  )
}

/** Shown when the repository itself could not be loaded (rate limit, outage). */
function RepoUnavailable({ owner, repo, reason }: { owner: string; repo: string; reason: FailReason }) {
  return (
    <>
      <DetailBanner seed={`gh-${owner}/${repo}`} kind="repo" crumbs={crumbs(owner)}>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] break-words md:text-4xl">
          <span className="text-muted-foreground">{owner}/</span>
          {repo}
        </h1>
      </DetailBanner>
      <div className="shell flex max-w-3xl flex-col gap-6 pt-8">
        <ErrorPanel reason={reason} />
      </div>
    </>
  )
}

export async function RepoView({ owner, repo }: { owner: string; repo: string }) {
  const res = await ghRepo(owner, repo)
  if (!res.ok) {
    if (res.reason === "notfound") notFound()
    return <RepoUnavailable owner={owner} repo={repo} reason={res.reason} />
  }
  const d = res.data
  // Renamed or differently cased: send visitors to the canonical address.
  if (d.fullName !== `${owner}/${repo}`) redirect(ghHref(d.owner, d.name))
  const [o, n, branch] = [d.owner, d.name, d.defaultBranch]
  const [langs, readme, contents, commits, releases] = await Promise.all([ghLanguages(o, n), ghReadme(o, n, branch), ghContents(o, n, branch, ""), ghCommits(o, n), ghReleases(o, n)])

  const readmeTab = readme.ok ? (
    /\.(md|markdown|mdx)$/i.test(readme.data.path) || !/\./.test(readme.data.path) ? (
      <Markdown source={readme.data.text} ctx={{ source: "github", owner: o, repo: n, branch, dir: readme.data.path.split("/").slice(0, -1).join("/") }} />
    ) : (
      <CodeView text={readme.data.text} name={readme.data.path} />
    )
  ) : readme.reason === "notfound" ? (
    <Empty>This repository has no README yet.</Empty>
  ) : (
    <ErrorPanel reason={readme.reason} what="README" />
  )

  return (
    <>
      <RepoHeader d={d} />
      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MotionTabs
          className="min-w-0"
          tabs={[
            { id: "readme", label: "README", content: readmeTab },
            {
              id: "files",
              label: "Files",
              count: contents.ok ? contents.data.length : undefined,
              content: <Section result={contents} what="files">{(entries) => (entries.length ? <FileList rows={entryRows(o, n, branch, entries)} /> : <Empty>This repository is empty.</Empty>)}</Section>,
            },
            {
              id: "commits",
              label: "Commits",
              content: <Section result={commits} what="commits">{(list) => <Commits commits={list} />}</Section>,
            },
            {
              id: "releases",
              label: "Releases",
              count: releases.ok ? releases.data.length : undefined,
              content: <Section result={releases} what="releases">{(list) => <Releases releases={list} owner={o} repo={n} branch={branch} />}</Section>,
            },
          ]}
        />

        <aside className="flex flex-col gap-6">
          <Panel label="Details">
            <InfoRow label="Stars">
              <span className="tabular">{d.stars.toLocaleString("en")}</span>
            </InfoRow>
            <InfoRow label="Forks">
              <span className="tabular">{d.forks.toLocaleString("en")}</span>
            </InfoRow>
            <InfoRow label="Watchers">
              <span className="inline-flex items-center gap-1 tabular">
                <EyeIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {d.watchers.toLocaleString("en")}
              </span>
            </InfoRow>
            <InfoRow label="Open issues">
              <span className="inline-flex items-center gap-1 tabular">
                <CircleDotIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {d.openIssues.toLocaleString("en")}
              </span>
            </InfoRow>
            <InfoRow label="Licence">
              <span className="inline-flex items-center gap-1">
                <ScaleIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {d.license || "None stated"}
              </span>
            </InfoRow>
            <InfoRow label="Default branch">
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                <GitBranchIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {d.defaultBranch}
              </span>
            </InfoRow>
            <InfoRow label="Last push">
              <TimeAgo date={d.pushedAt} />
            </InfoRow>
            {d.size > 0 && <InfoRow label="Size">{bytes(d.size * 1024)}</InfoRow>}
            {d.fork && d.parent && (
              <InfoRow label="Forked from">
                <Link href={internalHref(`https://github.com/${d.parent}`) ?? "#"} className="text-ion hover:underline">
                  {d.parent}
                </Link>
              </InfoRow>
            )}
            {d.homepage && (
              <InfoRow label="Website">
                <ExternalLink href={d.homepage} className="text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground">
                  {d.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40)}
                </ExternalLink>
              </InfoRow>
            )}
            <div className="border-t border-border pt-3">
              <Clone fullName={d.fullName} />
            </div>
          </Panel>

          {langs.ok && langs.data.length > 0 && (
            <Panel label="Languages">
              <h2 className="text-sm font-medium">Languages</h2>
              <LanguageBar languages={langs.data} />
            </Panel>
          )}
        </aside>
      </div>
      <div className="shell mt-12">
        <SourceLink href={`https://github.com/${d.fullName}`} label="View source on GitHub" />
      </div>
    </>
  )
}

/** Path breadcrumbs for file and folder views: repo / dir / dir / file. */
function PathCrumbs({ owner, repo, branch, path }: { owner: string; repo: string; branch: string; path: string }) {
  const parts = path.split("/")
  return (
    <nav aria-label="Path" className="flex flex-wrap items-center gap-1 font-mono text-sm">
      <Link href={ghHref(owner, repo)} className="text-ion hover:underline">
        {repo}
      </Link>
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          {i < parts.length - 1 ? (
            <Link href={ghTreeHref(owner, repo, branch, parts.slice(0, i + 1).join("/"))} className="text-ion hover:underline">
              {p}
            </Link>
          ) : (
            <span className="text-foreground">{p}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** A file (blob) or a folder (tree) of a repository, inside Nexverse. */
export async function RepoPathView({ owner, repo, mode, branch, path }: { owner: string; repo: string; mode: "blob" | "tree"; branch: string; path: string }) {
  const info = await ghRepo(owner, repo)
  if (!info.ok && info.reason === "notfound") notFound()
  const d = info.ok ? info.data : null
  const [o, n] = d ? [d.owner, d.name] : [owner, repo]
  const up = path.includes("/") ? ghTreeHref(o, n, branch, path.split("/").slice(0, -1).join("/")) : ghHref(o, n)

  let body: React.ReactNode
  if (mode === "blob") {
    const file = await ghFile(o, n, branch, path)
    if (!file.ok && file.reason === "notfound") {
      // GitHub's own blob links sometimes point at folders: try that before giving up.
      const dir = await ghContents(o, n, branch, path)
      if (!dir.ok) notFound()
      body = <FileList rows={entryRows(o, n, branch, dir.data)} up={up} />
    } else if (!file.ok) {
      body = <ErrorPanel reason={file.reason} what={path.split("/").pop()} />
    } else {
      const f = file.data
      const name = path.split("/").pop() ?? path
      if (f.kind === "text" && /\.(md|markdown|mdx)$/i.test(path)) {
        body = (
          <div className="rounded-xl border border-border p-5 md:p-8">
            <Markdown source={f.text} ctx={{ source: "github", owner: o, repo: n, branch, dir: path.split("/").slice(0, -1).join("/") }} />
          </div>
        )
      } else if (f.kind === "text") {
        body = <CodeView text={f.text} name={name} actions={<span className="tabular">{bytes(f.bytes)}</span>} />
      } else if (f.kind === "image") {
        body = (
          <div className="flex justify-center rounded-xl border border-border bg-[repeating-conic-gradient(#0d0f16_0%_25%,#0a0b11_0%_50%)] bg-[length:20px_20px] p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- raw file from the repository */}
            <img src={f.src} alt={name} referrerPolicy="no-referrer" className="max-h-[70vh] max-w-full object-contain" />
          </div>
        )
      } else {
        body = (
          <Empty>
            {f.kind === "toolarge" ? "This file is larger than 200 KB, too big to show here." : "This is a binary file, so there is nothing to read here."} Clone the repository to get it.
          </Empty>
        )
      }
    }
  } else {
    const dir = await ghContents(o, n, branch, path)
    if (!dir.ok && dir.reason === "notfound") notFound()
    body = dir.ok ? <FileList rows={entryRows(o, n, branch, dir.data)} up={up} /> : <ErrorPanel reason={dir.reason} what="this folder" />
  }

  return (
    <>
      <DetailBanner seed={`gh-${o}/${n}`} kind="repo" crumbs={crumbs(o)}>
        <div className="flex flex-wrap items-center gap-3">
          {d && <Avatar repo={d} size="sm" />}
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link href={ghHref(o, n)} className="text-xl font-semibold tracking-[-0.02em] break-words hover:underline md:text-2xl">
              <span className="text-muted-foreground">{o}/</span>
              {n}
            </Link>
            {d?.description && <p className="line-clamp-1 text-sm text-muted-foreground">{d.description}</p>}
          </div>
        </div>
      </DetailBanner>
      <div className="shell flex flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PathCrumbs owner={o} repo={n} branch={branch} path={path} />
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            <GitBranchIcon aria-hidden className="size-3" />
            {branch}
          </span>
        </div>
        {body}
        <SourceLink className="mt-8" href={`https://github.com/${o}/${n}/${mode}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`} label="View on GitHub" />
      </div>
    </>
  )
}
