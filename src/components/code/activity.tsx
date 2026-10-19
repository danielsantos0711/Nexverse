"use client"

import Link from "next/link"
import { ArchiveIcon, CircleCheckIcon, CircleDotIcon, EyeIcon, FolderPlusIcon, GitBranchIcon, GitCommitHorizontalIcon, GitForkIcon, GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestIcon, PackageIcon, TagIcon, type LucideIcon } from "lucide-react"
import { TimeAgo } from "@/components/live/time"
import { repoPath, type Activity, type ActivityKind } from "@/lib/code/api"
import { cn } from "@/lib/utils"
import { Avatar, href } from "./ui"

/*
 * A timeline of what happened in a repository (or across public ones): a thin orbit line with one lit node per
 * event, coloured by kind. New items rise in; reduced motion just shows them.
 */

const KIND: Record<ActivityKind, { icon: LucideIcon; verb: string; tone: string }> = {
  create: { icon: FolderPlusIcon, verb: "created the repository", tone: "text-ion bg-ion/15 ring-ion/30" },
  import: { icon: FolderPlusIcon, verb: "imported", tone: "text-ion bg-ion/15 ring-ion/30" },
  fork: { icon: GitForkIcon, verb: "forked", tone: "text-repo bg-repo/15 ring-repo/30" },
  commit: { icon: GitCommitHorizontalIcon, verb: "committed", tone: "text-foreground bg-secondary ring-border" },
  branch: { icon: GitBranchIcon, verb: "created branch", tone: "text-ion bg-ion/10 ring-ion/25" },
  tag: { icon: TagIcon, verb: "tagged", tone: "text-gold bg-gold/10 ring-gold/25" },
  release: { icon: PackageIcon, verb: "published release", tone: "text-gold bg-gold/15 ring-gold/30" },
  issue: { icon: CircleDotIcon, verb: "opened issue", tone: "text-ok bg-ok/10 ring-ok/25" },
  issue_closed: { icon: CircleCheckIcon, verb: "closed issue", tone: "text-[#b9a7ff] bg-[#b9a7ff]/10 ring-[#b9a7ff]/25" },
  issue_reopened: { icon: CircleDotIcon, verb: "reopened issue", tone: "text-ok bg-ok/10 ring-ok/25" },
  pull: { icon: GitPullRequestIcon, verb: "opened pull request", tone: "text-ok bg-ok/10 ring-ok/25" },
  pull_merged: { icon: GitMergeIcon, verb: "merged", tone: "text-[#c9b8ff] bg-[#b9a7ff]/15 ring-[#b9a7ff]/30" },
  pull_closed: { icon: GitPullRequestClosedIcon, verb: "closed pull request", tone: "text-destructive bg-destructive/10 ring-destructive/25" },
  archive: { icon: ArchiveIcon, verb: "changed archiving:", tone: "text-gold bg-gold/10 ring-gold/25" },
  visibility: { icon: EyeIcon, verb: "changed visibility:", tone: "text-muted-foreground bg-secondary ring-border" },
}

export function ActivityList({ items, compact = false, base }: { items: Activity[]; compact?: boolean; /** The repository's path, when the list is for one repository. */ base?: string }) {
  return (
    <ol className="relative flex flex-col">
      <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-gradient-to-b from-ion/40 via-border to-transparent" />
      {items.map((a, i) => {
        const k = KIND[a.kind] ?? KIND.commit
        const Icon = k.icon
        const root = base ?? (a.repo ? repoPath(a.repo) : null)
        const target = root ? (a.ref ? `${root}/${a.ref}` : root) : null
        return (
          <li
            key={a.id}
            className="relative flex gap-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:fill-mode-both"
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
            <span className={cn("relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full ring-1", k.tone)}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className={cn("min-w-0 flex-1 text-sm", compact ? "leading-snug" : "pt-0.5")}>
              <p className="min-w-0 text-muted-foreground">
                <span className="inline-flex items-center gap-1 align-middle font-medium text-foreground/90">
                  {!compact && <Avatar person={a.actor} size={16} />}
                  {a.actor ? (a.actor.handle ?? a.actor.name) : "Someone"}
                </span>{" "}
                {k.verb}{" "}
                {a.title &&
                  (target ? (
                    <Link href={href(target)} className="break-words text-foreground hover:text-ion hover:underline">
                      {a.title}
                    </Link>
                  ) : (
                    <span className="text-foreground">{a.title}</span>
                  ))}
                {!base && a.repo && (
                  <>
                    {" "}
                    in{" "}
                    <Link href={href(repoPath(a.repo))} className="text-foreground/80 hover:text-ion hover:underline">
                      {a.repo.owner.handle ?? a.repo.owner.name}/{a.repo.slug}
                    </Link>
                  </>
                )}
              </p>
              <TimeAgo date={a.createdAt} className="text-xs text-muted-foreground/80" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
