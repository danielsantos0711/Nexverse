import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ProjectView } from "@/components/studio/project-view"
import { isProjectId } from "@/lib/projects"

type Params = Promise<{ id: string }>

// Projects live in the database and load in the browser. One placeholder id lets the route be checked at build
// time; it renders the "not here" state, and real ids render on first visit.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Project" }

export default function ProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Project params={params} />
    </Suspense>
  )
}

async function Project({ params }: { params: Params }) {
  const { id } = await params
  if (!isProjectId(id)) notFound()
  return <ProjectView id={id.toLowerCase()} />
}
