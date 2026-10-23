import type { Metadata } from "next"
import { Suspense } from "react"
import { CollectionsView } from "@/components/collections/collections-view"
import { PageTitle } from "@/components/hub/bits"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Collections",
  description: "Lists of models, datasets, tools, repos and threads, curated by members with a note on why each one matters, as lists or as star maps.",
}

/*
 * Collections (round 12): one page, two views. "List" is the cards; "Star map" (?show=map) is what /constellations
 * was, every public collection drawn as a constellation. /constellations redirects here.
 */
export default function CollectionsPage() {
  return (
    <div data-flow="fan" className="sd-flow shell pb-16">
      <PageTitle backdrop="warp" k="collections.header" title="Collections" lead="Lists members curate, with a note on why each thing matters." />
      {/* The tab and the view live in the query string (?view=mine, ?show=map), which is read in the browser. */}
      <Suspense fallback={<ListSkeleton />}>
        <CollectionsView />
      </Suspense>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading collections">
      <Skeleton className="h-10 w-72 max-w-full rounded-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}
