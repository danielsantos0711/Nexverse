import type { Metadata } from "next"
import { Suspense } from "react"
import { ResourceIndex } from "@/components/hub/resource-index"
import { RowsSkeleton } from "@/components/live/skeletons"
import { Copy } from "@/components/content/copy"
import { ExploreMap } from "@/components/site/explore-map"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/explore", { title: "Explore", description: "The map of Nexverse: every place to discover, build and meet people, with what members made in each." })
}

export default function Page() {
  return (
    <>
      <ExploreMap />
      {/* Everything members published or shared, filterable (the hub's own index, ?q= from search lands here). */}
      <section aria-labelledby="everything-h" className="shell flex flex-col gap-4 pb-16">
        <h2 id="everything-h" className="section-glow text-xl font-semibold">
          <Copy k="explore.members">Everything members published</Copy>
        </h2>
        <Suspense fallback={<RowsSkeleton rows={4} />}>
          <ResourceIndex />
        </Suspense>
      </section>
    </>
  )
}
