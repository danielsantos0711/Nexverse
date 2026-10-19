import type { Metadata } from "next"
import { Suspense } from "react"
import { CosmosView } from "@/components/cosmos/cosmos-view"

export const metadata: Metadata = {
  title: "Cosmos",
  description: "The whole Nexverse hub as a star map: every model, dataset, tool, repo, project, person and forum category, grouped into galaxies and joined by what they build together.",
}

export default function CosmosPage() {
  return (
    // The focused star lives in the query string (?focus=model:orbit-8b), which is read in the browser.
    <Suspense fallback={<MapSkeleton />}>
      <CosmosView />
    </Suspense>
  )
}

function MapSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the star map" className="relative h-[calc(100dvh-4rem)] min-h-[560px] w-full overflow-hidden bg-background">
      <div aria-hidden className="starfield absolute inset-0 opacity-60">
        <i />
        <i />
        <i />
      </div>
      <div className="absolute top-4 left-4 h-40 w-[min(380px,calc(100%-2rem))] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
    </div>
  )
}
