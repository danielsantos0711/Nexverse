import type { Metadata } from "next"
import { Suspense } from "react"
import { ForumIndex, LegacyCategoryRedirect } from "@/components/forum/forum-index"
import { ForumHeader } from "@/components/forum/forum-header"

export const metadata: Metadata = { title: "Forum", description: "Ask, answer and show what you built, in any language." }

export default function ForumPage() {
  return (
    <div className="shell pb-16">
      <ForumHeader title="Forum" lead="Ask in your own language and get answers from people who have done it. Pick a category below, or search first: someone may have asked already." />
      <ForumIndex />
      {/* Old links (/forum?c=<slug>) read the query in the browser and move to /forum/c/<slug>. */}
      <Suspense fallback={null}>
        <LegacyCategoryRedirect />
      </Suspense>
    </div>
  )
}
