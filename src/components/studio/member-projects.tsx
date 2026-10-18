"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { HeartIcon, MessageSquareIcon } from "lucide-react"
import { Cover, KindTag, Stat } from "@/components/hub/bits"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { ago, KINDS } from "@/lib/data"
import { getProjectStats, listProjects, projectPath, type Project, type ProjectKind, type ProjectStats } from "@/lib/projects"
import { cn } from "@/lib/utils"

/** A member's project in a list: drawn cover, name, owner and the numbers that matter. */
export function ProjectCard({ p, stats, className }: { p: Project; stats?: ProjectStats; className?: string }) {
  const owner = p.local ? "You, on this device" : (p.owner?.name ?? "A member")
  return (
    <article className={cn("group relative rounded-xl border border-border bg-card/70 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-card", className)}>
      <div className="flex gap-3.5 p-3.5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <Cover seed={p.slug} kind={p.kind} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={projectPath(p.id)} className="truncate text-[15px] leading-tight font-medium text-foreground outline-none after:absolute after:inset-0">
            {p.name}
          </Link>
          <p className="line-clamp-1 text-[13px] text-muted-foreground">{p.summary}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <KindTag kind={p.kind} />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ProfileAvatar name={p.local ? "You" : p.owner?.name} seed={p.owner?.id} url={p.owner?.avatarUrl} size={16} />
              <span className="truncate">{owner}</span>
            </span>
            <span>{ago((p.publishedAt ?? p.updatedAt).slice(0, 10))}</span>
            {stats && <Stat icon={HeartIcon} value={stats.likes} label="likes" />}
            {stats && stats.replies > 0 && <Stat icon={MessageSquareIcon} value={stats.replies} label="comments" />}
          </div>
        </div>
      </div>
    </article>
  )
}

/**
 * Members' published projects, newest first, for the hub lists (Models, Datasets, Tools, Repos, Explore).
 * Renders nothing until there is at least one, so empty databases keep the page as it was.
 */
export function MemberProjects({ kind, limit = 12 }: { kind?: ProjectKind; limit?: number }) {
  const [list, setList] = useState<Project[]>([])
  const [stats, setStats] = useState<Record<string, ProjectStats>>({})
  const [shown, setShown] = useState(limit)

  useEffect(() => {
    let stale = false
    listProjects({ kind, limit: shown + 1 })
      .then(async (projects) => {
        if (stale) return
        setList(projects)
        const s = await getProjectStats(projects.map((p) => p.id)).catch(() => ({}))
        if (!stale) setStats(s)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [kind, shown])

  if (!list.length) return null
  const local = list.every((p) => p.local)
  return (
    <section aria-labelledby="member-projects-h" className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="member-projects-h" className="text-lg font-semibold">
          {local ? "Published from this browser" : `New ${kind ? KINDS[kind].plural.toLowerCase() : "projects"} from members`}
        </h2>
        <Link href={kind ? `/new/project?kind=${kind}` : "/new/project"} className="text-sm text-ion hover:underline">
          Publish yours
        </Link>
      </div>
      <ul className="grid gap-2.5 xl:grid-cols-2">
        {list.slice(0, shown).map((p) => (
          <li key={p.id}>
            <ProjectCard p={p} stats={stats[p.id]} />
          </li>
        ))}
      </ul>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + limit)} className="pressable self-start rounded-full bg-secondary px-4 py-2 text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          Show more
        </button>
      )}
    </section>
  )
}
