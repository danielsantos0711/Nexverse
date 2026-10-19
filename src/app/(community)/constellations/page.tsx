import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { ConstellationsGallery } from "@/components/collections/constellations-gallery"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Constellations",
  description: "Members' collections drawn as star maps: the models, datasets, papers and repos that make one idea work, in the order to read them.",
}

export default function ConstellationsPage() {
  return (
    <div className="shell pb-16">
      <PageTitle
        eyebrow="Collections, drawn as star maps"
        title="Constellations"
        lead="Every public collection with two or more things in it becomes a constellation: each item a star, joined in the order its curator put them. Point at a star to see what it is; open one to read the whole collection with its notes."
      >
        <Link href="/collections" className="mt-1 w-fit text-sm text-ion hover:underline">
          Browse collections as lists →
        </Link>
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
        <ConstellationsGallery />
      </Suspense>
    </div>
  )
}
