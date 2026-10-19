"use client"

import { ActivityIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { listActivity } from "@/lib/code/api"
import { ActivityList } from "./activity"
import { useRepo } from "./repo-context"
import { EmptyState, ErrorNote, Panel, useLoad } from "./ui"

/** Everything that happened in this repository, newest first. */
export function RepoActivity() {
  const { repo, base } = useRepo()
  const list = useLoad(() => listActivity(repo.id, 100), [repo.id])
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground">Commits, branches, releases, issues and pull requests, as they happened.</p>
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
          <EmptyState icon={ActivityIcon} title="Nothing has happened here yet" />
        </Panel>
      ) : (
        <ActivityList items={list.data} base={base} />
      )}
    </div>
  )
}
