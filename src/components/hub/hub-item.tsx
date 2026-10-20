"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ShareDetail } from "@/components/hub/share-detail"
import { ProjectView } from "@/components/studio/project-view"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { KINDS, type ResourceKind } from "@/lib/data"
import { getProject, type Project } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * /models/<id>, /datasets/<id> … hold two things: a member's project (with tabs as sub-paths) and a shared
 * link (no sub-paths). Try the project first; if it lives under another kind, move to its own address.
 */
export function HubItem({ kind, id, rest }: { kind: ResourceKind; id: string; rest: string[] }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const [found, setFound] = useState<{ project: Project | null } | null>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getProject(id)
      .then((project) => !stale && setFound({ project }))
      .catch(() => !stale && setFound({ project: null }))
    return () => {
      stale = true
    }
  }, [id, ready, user?.id])

  const project = found?.project
  const wrongPlace = project && project.kind !== kind
  useEffect(() => {
    if (project && wrongPlace) {
      const tail = rest.map(encodeURIComponent).join("/")
      router.replace(`${KINDS[project.kind].path}/${project.id}${tail ? `/${tail}` : ""}` as "/")
    }
  }, [project, wrongPlace, rest, router])

  if (!found || wrongPlace) return <PageSkeleton />
  if (project) return <ProjectView key={`${project.id}:${user?.id ?? ""}`} id={id} rest={rest} initial={project} />
  if (!rest.length) return <ShareDetail kind={kind} id={id} />
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>This page is not here</EmptyTitle>
        <EmptyDescription>Shared links have a single page. Check the address.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
