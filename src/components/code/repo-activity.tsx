"use client"

import { ActivityIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { listActivity } from "@/lib/code/api"
import { ActivityList } from "./activity"
import { useRepo } from "./repo-context"
import { EmptyState, ErrorNote, Panel, useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/** Everything that happened in this repository, newest first. */
export function RepoActivity() {
  const { repo, base } = useRepo()
  const list = useLoad(() => listActivity(repo.id, 100), [repo.id])
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold"><Copy k="code-repo.repo-activity.activity">Activity</Copy></h2>
        <p className="text-sm text-muted-foreground"><Copy k="code-repo.repo-activity.commits-branches-releases-issues-and">Commits, branches, releases, issues and pull requests, as they happened.</Copy></p>
      </div>
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !list.data.length ? (
        <Panel>
          <EmptyState icon={ActivityIcon} title={<Copy k="code-repo.repo-activity.nothing-has-happened-here-yet">Nothing has happened here yet</Copy>} />
        </Panel>
      ) : (
        <ActivityList items={list.data} base={base} />
      )}
    </div>
  )
}
