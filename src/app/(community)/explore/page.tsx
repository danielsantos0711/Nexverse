import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHead } from "@/components/app/bits"
import { ExploreView } from "@/components/app/explore-view"
import { MemberQuestions } from "@/components/app/member"

export const metadata: Metadata = { title: "Explore" }

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Explore"
        lead="Every question asked here and everything built from the answers, in one place."
      />
      <MemberQuestions className="mb-12" />
      <Suspense>
        <ExploreView />
      </Suspense>
    </div>
  )
}
