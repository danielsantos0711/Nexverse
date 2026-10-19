import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Gate } from "@/components/moderation/gate"
import { ProjectEditor } from "@/components/studio/project-editor"

export const metadata: Metadata = { title: "New project", description: "Publish a model, dataset, tool or repo on Nexverse.", robots: { index: false } }

export default function NewProjectPage() {
  return (
    // The editor reads ?kind= from the address, so it renders inside a Suspense boundary. Publishing needs the
    // project.create power (from reputation or a role); members without it are told how to get it.
    <Suspense fallback={<PageSkeleton />}>
      <Gate cap="project.create" action="publish a project" blockedClassName="mx-(--gutter) mt-10 mb-16 md:mx-auto md:max-w-3xl">
        <ProjectEditor />
      </Gate>
    </Suspense>
  )
}
