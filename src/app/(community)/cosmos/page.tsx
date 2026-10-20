import type { Metadata } from "next"
import { Suspense } from "react"
import { CosmosView } from "@/components/cosmos/cosmos-view"
import { githubTrendingAi } from "@/lib/live"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/cosmos", {
    title: "Cosmos",
    description: "Nexverse as a star map: what members published and shared, the members themselves, every forum category and the AI repositories rising on GitHub.",
  })
}

export default function CosmosPage() {
  return (
    // The focused star lives in the query string (?focus=project:<id>), which is read in the browser.
    <Suspense fallback={<MapSkeleton />}>
      <StarMapWithRepos />
    </Suspense>
  )
}

/** Rising GitHub repositories are fetched on the server (cached); members' data loads in the browser. */
async function StarMapWithRepos() {
  const feed = await githubTrendingAi(40)
  return <CosmosView github={feed.items} />
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
