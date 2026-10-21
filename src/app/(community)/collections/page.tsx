import type { Metadata } from "next"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import Link from "next/link"
import { Suspense } from "react"
import { LayersIcon } from "lucide-react"
import { CollectionsView } from "@/components/collections/collections-view"
import { PageTitle } from "@/components/hub/bits"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Collections",
  description: "Lists of models, datasets, tools, repos and threads, curated by members with a note on why each one matters.",
}

export default function CollectionsPage() {
  return (
    <div data-flow="fan" className="sd-flow shell pb-16">
      <PageTitle
        k="collections.header"
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <AreaCrumbs />
            <span aria-hidden className="opacity-40">·</span>
            <span className="inline-flex items-center gap-2">
              <LayersIcon aria-hidden className="size-4 text-ion" /> Star charts drawn by members
            </span>
          </span>
        }
        title="Collections"
        lead="Reading lists and starter kits curated by members: the models, datasets, tools, repos and threads worth charting, each with a note on why it matters. Two or more and a collection becomes a constellation."
        backdrop="warp"
      >
        <Link href="/constellations" className="mt-1 w-fit text-sm text-ion hover:underline">
          See them drawn as constellations →
        </Link>
      </PageTitle>
      {/* The tab lives in the query string (?view=mine), which is read in the browser. */}
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
