import type { Metadata } from "next"
import { Suspense } from "react"
import { ForumIndex, LegacyCategoryRedirect } from "@/components/forum/forum-index"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/forum", { title: "Forum", description: "Discussions for people building with AI, organised by category, in any language." })
}

export default function ForumPage() {
  return (
    <div className="sd-flow shell pb-16">
      <ForumHeader k="forum.header" title="Forum" lead="Discussions for people building with AI, organised by category. Anyone can read; members start threads and reply, in whatever language they think in." />
      <ForumIndex />
      {/* Old links (/forum?c=<slug>) read the query in the browser and move to /forum/c/<slug>. */}
      <Suspense fallback={null}>
        <LegacyCategoryRedirect />
      </Suspense>
    </div>
  )
}
