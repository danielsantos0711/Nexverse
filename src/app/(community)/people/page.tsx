import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { PeopleDirectory } from "@/components/social/people-directory"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "People", description: "The members of Nexverse: what they build, share and write." }

export default function PeoplePage() {
  return (
    <div className="shell pb-16">
      <PageTitle eyebrow="Members" title="People" lead="Everyone with an account on Nexverse. Open a profile to see what they published, shared and wrote, and follow the people whose work you use." />
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <PeopleDirectory />
      </Suspense>
    </div>
  )
}
