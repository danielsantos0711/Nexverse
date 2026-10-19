"use client"

import Link from "next/link"
import { ArchiveIcon, CircleDotIcon, GitForkIcon, GitPullRequestIcon, StarIcon } from "lucide-react"
import { TimeAgo } from "@/components/live/time"
import { fullName, repoPath, type Repo } from "@/lib/code/api"
import { cn } from "@/lib/utils"
import { Avatar, href, VisibilityBadge } from "./ui"

/** One repository in a list: name, description, topics and the numbers that matter. */
export function RepoCard({ repo, className, style }: { repo: Repo; className?: string; style?: React.CSSProperties }) {
  return (
    <li
      style={style}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-4 transition-[background-color,border-color,transform] duration-200 ease-out hover:border-ion/30 hover:bg-card/70 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar person={repo.owner} size={20} />
        <Link href={href(repoPath(repo))} className="min-w-0 truncate font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none group-focus-within:underline">
          <span className="text-muted-foreground">{fullName(repo).split("/")[0]}/</span>
          {repo.slug}
        </Link>
        <VisibilityBadge visibility={repo.visibility} className="ml-auto shrink-0" />
      </div>
      {repo.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{repo.description}</p> : <p className="text-sm text-muted-foreground/60 italic">No description yet.</p>}
      {repo.topics.length > 0 && (
        <ul className="relative z-10 flex flex-wrap gap-1.5" aria-label="Topics">
          {repo.topics.slice(0, 5).map((t) => (
            <li key={t}>
              <Link href={href(`/code?topic=${encodeURIComponent(t)}`)} className="inline-block rounded-full bg-repo/10 px-2.5 py-0.5 text-xs text-repo transition-colors hover:bg-repo/20">
                {t}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground tabular">
        <span className="inline-flex items-center gap-1" title="Stars">
          <StarIcon aria-hidden className="size-3.5" /> {repo.stars.toLocaleString("en")}
          <span className="sr-only">stars</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Forks">
          <GitForkIcon aria-hidden className="size-3.5" /> {repo.forks.toLocaleString("en")}
          <span className="sr-only">forks</span>
        </span>
        {repo.openIssues > 0 && (
          <span className="inline-flex items-center gap-1" title="Open issues">
            <CircleDotIcon aria-hidden className="size-3.5" /> {repo.openIssues}
            <span className="sr-only">open issues</span>
          </span>
        )}
        {repo.openPulls > 0 && (
          <span className="inline-flex items-center gap-1" title="Open pull requests">
            <GitPullRequestIcon aria-hidden className="size-3.5" /> {repo.openPulls}
            <span className="sr-only">open pull requests</span>
          </span>
        )}
        {repo.archivedAt && (
          <span className="inline-flex items-center gap-1 text-gold">
            <ArchiveIcon aria-hidden className="size-3.5" /> Archived
          </span>
        )}
        {repo.license && <span>{repo.license}</span>}
        <span className="ml-auto">{repo.pushedAt ? <TimeAgo date={repo.pushedAt} prefix="Updated" /> : "Empty"}</span>
      </div>
    </li>
  )
}
