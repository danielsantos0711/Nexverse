"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { FolderGit2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getIssueById, getPullById, getRepoById, repoPath } from "@/lib/code/api"
import { EmptyState, ErrorNote, href, useLoad } from "./ui"
import { Skeleton } from "@/components/ui/skeleton"

/** Resolves "repo-<uuid>", "issue-<uuid>" or "pull-<uuid>" to the current address and moves there. */
export function GoTo({ id }: { id: string }) {
  const router = useRouter()
  const m = id.match(/^(repo|issue|pull)-([0-9a-f-]{36})$/i)
  const target = useLoad(async () => {
    if (!m) return null
    const kind = m[1].toLowerCase()
    const uuid = m[2].toLowerCase()
    if (kind === "repo") {
      const r = await getRepoById(uuid)
      return r ? repoPath(r) : null
    }
    const item = kind === "issue" ? await getIssueById(uuid) : await getPullById(uuid)
    if (!item) return null
    const r = await getRepoById(item.repoId)
    return r ? `${repoPath(r)}/${kind === "issue" ? "issues" : "pulls"}/${item.number}` : null
  }, [id])

  useEffect(() => {
    if (target.data) router.replace(href(target.data))
  }, [target.data, router])

  if (target.error) return <ErrorNote error={target.error} className="mt-10" />
  if (target.loading || target.data) return <Skeleton className="mt-10 h-40 w-full rounded-xl" />
  return (
    <div className="pt-10">
      <EmptyState icon={FolderGit2Icon} title="This is no longer here" action={<Button size="sm" variant="outline" nativeButton={false} render={<Link href="/code" />}>Explore repositories</Button>}>
        It was deleted, made private, or the link is wrong.
      </EmptyState>
    </div>
  )
}
