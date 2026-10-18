import Link from "next/link"
import { GitForkIcon, StarIcon } from "lucide-react"
import { Cover, Stat } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import { ghHref } from "@/lib/live/ids"
import type { GhRepo } from "@/lib/live"
import { cn } from "@/lib/utils"
import { TimeAgo } from "./time"

const LANG_DOT: Record<string, string> = {
  Python: "#6c9bd2",
  TypeScript: "#5b8fd6",
  JavaScript: "#e6cf6a",
  Rust: "#d39a74",
  Go: "#6cc6d9",
  "C++": "#e07aa5",
  C: "#9aa3b2",
  "Jupyter Notebook": "#e59a5a",
  Swift: "#f08a5d",
  Java: "#c99a5b",
}

/** A new open-source AI repository that is gathering stars. */
export function GitHubRepoCard({ repo: r, rank, className }: { repo: GhRepo; rank?: number; className?: string }) {
  return (
    <Spotlight className={cn("group relative flex h-full flex-col gap-2.5 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:bg-card", className)}>
      <div className="flex items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <Cover seed={`gh-${r.fullName}`} kind="repo" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-muted-foreground">
            {rank !== undefined && <span className="mr-1.5 font-mono text-repo">#{rank}</span>}
            {r.owner}
          </span>
          <Link href={ghHref(r.owner, r.name)} className="truncate leading-tight font-medium after:absolute after:inset-0">
            {r.name}
          </Link>
        </div>
      </div>
      <p className="line-clamp-2 text-[13px] text-muted-foreground">{r.description || "No description yet."}</p>
      {r.topics.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
          {r.topics.map((t) => (
            <li key={t} className="rounded-full bg-repo/10 px-2 py-0.5 text-[11px] text-repo">
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
        {r.language && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: LANG_DOT[r.language] ?? "#8a93a6" }} />
            {r.language}
          </span>
        )}
        <Stat icon={StarIcon} value={r.stars} label="stars" />
        <Stat icon={GitForkIcon} value={r.forks} label="forks" />
        <TimeAgo date={r.pushedAt} prefix="Pushed" className="ml-auto" />
      </div>
    </Spotlight>
  )
}
