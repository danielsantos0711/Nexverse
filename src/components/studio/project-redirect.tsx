"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ProjectView } from "@/components/studio/project-view"
import { getProject, projectHref } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * /p/<id> and /p/<id>/edit, the round 9 addresses: find the project's kind and move to its page (inside
 * Nexverse, replacing the history entry). When it cannot be found, the page's own "not here" state shows.
 */
export function ProjectRedirect({ id, tab = "" }: { id: string; tab?: string }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getProject(id)
      .then((p) => {
        if (stale) return
        if (p) router.replace(projectHref(p, tab) as "/")
        else setMissing(true)
      })
      .catch(() => !stale && setMissing(true))
    return () => {
      stale = true
    }
  }, [id, tab, ready, user?.id, router])

  return missing ? <ProjectView id={id} /> : <PageSkeleton />
}
