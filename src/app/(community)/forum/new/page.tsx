import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { NewThread } from "@/components/forum/new-thread"
import { PageTitle } from "@/components/hub/bits"

export const metadata: Metadata = { title: "Start a thread" }

export default function NewThreadPage() {
  return (
    <div className="shell max-w-4xl">
      <PageTitle title="Start a thread" lead="A good thread says what you tried and what happened. Questions, show and tell, paper discussions: all welcome." />
      <Suspense fallback={<PageSkeleton />}>
        <NewThread />
      </Suspense>
    </div>
  )
}
