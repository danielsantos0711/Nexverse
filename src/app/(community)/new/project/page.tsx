import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ProjectEditor } from "@/components/studio/project-editor"

export const metadata: Metadata = { title: "New project", description: "Publish a model, dataset, tool or repo on Nexverse.", robots: { index: false } }

export default function NewProjectPage() {
  return (
    // The editor reads ?kind= from the address, so it renders inside a Suspense boundary.
    <Suspense fallback={<PageSkeleton />}>
      <ProjectEditor />
    </Suspense>
  )
}
