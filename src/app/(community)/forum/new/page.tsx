import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewThread } from "@/components/forum/new-thread"

export const metadata: Metadata = { title: "Start a thread" }

export default function NewThreadPage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <ForumHeader
        title="Start a thread"
        crumbs={[{ label: "Forum", href: "/forum" }, { label: "Start a thread" }]}
        lead="Pick the category that fits, give it a clear title, and say what you tried or what you want to talk about."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewThread />
      </Suspense>
    </div>
  )
}
