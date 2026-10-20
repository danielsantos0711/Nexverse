import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ProjectRedirect } from "@/components/studio/project-redirect"
import { isProjectId } from "@/lib/projects"

type Params = Promise<{ id: string }>

export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Edit project", robots: { index: false } }

export default function EditProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={params} />
    </Suspense>
  )
}

async function Edit({ params }: { params: Params }) {
  const { id } = await params
  if (!isProjectId(id)) notFound()
  return <ProjectRedirect id={id.toLowerCase()} tab="settings" />
}
