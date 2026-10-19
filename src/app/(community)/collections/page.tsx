import type { Metadata } from "next"
import { Suspense } from "react"
import { LayersIcon } from "lucide-react"
import { CollectionsView } from "@/components/collections/collections-view"
import { ForumHeader } from "@/components/forum/forum-header"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Collections",
  description: "Lists of models, datasets, tools, repos and threads, curated by members with a note on why each one matters.",
}

export default function CollectionsPage() {
  return (
    <div className="shell pb-16">
      <ForumHeader
        title="Collections"
        lead="Reading lists and starter kits curated by members: models, datasets, tools, repos and threads, each with a note on why it matters."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <LayersIcon aria-hidden className="size-5" />
          </span>
        }
      />
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
