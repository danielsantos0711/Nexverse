import type { Metadata } from "next"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import Link from "next/link"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { ConstellationsGallery } from "@/components/collections/constellations-gallery"
import { Skeleton } from "@/components/ui/skeleton"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/constellations", {
    title: "Constellations",
    description: "Members' collections drawn as star maps: the models, datasets, tools and repos that make one idea work, in the order to read them.",
  })
}

export default function ConstellationsPage() {
  return (
    <div data-flow="zoom" className="sd-flow shell pb-16">
      <PageTitle
        k="constellations.header"
        backdrop="warp"
        eyebrow={<span className="flex flex-wrap items-center gap-x-2.5 gap-y-1"><AreaCrumbs /><span aria-hidden className="opacity-40">·</span>Collections, drawn as star maps</span>}
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
