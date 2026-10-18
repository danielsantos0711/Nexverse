import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ForumIndex } from "@/components/forum/forum-index"
import { PageTitle } from "@/components/hub/bits"
import { threads } from "@/lib/data"

export const metadata: Metadata = { title: "Forum", description: "Ask, answer and show what you built, in any language." }

export default function ForumPage() {
  const solved = threads.filter((t) => t.replies.some((r) => r.accepted)).length
  return (
    <div className="shell">
      <PageTitle
        eyebrow={`${threads.length} threads · ${solved} solved · 12 languages`}
        title="Forum"
        lead="Ask in your own language and get answers from people who have done it. Show what you built, argue about papers, and help the next person."
      />
      <Suspense fallback={<PageSkeleton />}>
        <ForumIndex />
      </Suspense>
    </div>
  )
}
