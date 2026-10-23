import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ListIcon, OrbitIcon, PlusIcon } from "lucide-react"
import { CosmosView } from "@/components/cosmos/cosmos-view"
import { ResourceIndex } from "@/components/hub/resource-index"
import { RowsSkeleton } from "@/components/live/skeletons"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import { LinkTabs } from "@/components/site/link-tabs"
import { PageHead } from "@/components/site/page-head"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { githubTrendingAi } from "@/lib/live"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/explore", { title: "Explore", description: "Everything members published or shared on Nexverse: models, datasets, tools and repos, as a list or as a star map." })
}

/*
 * Explore (round 12): one page for everything members published or shared, in two views.
 *   List      the hub's catalogue with search and filters (?q= from search lands here)
 *   Star map  what was /cosmos: the whole hub drawn as stars (?show=map, /cosmos redirects here, ?focus= flies to one)
 * The old map of the site's places is gone from here: the menus are that map now, grouped the same way.
 */
type Params = PageProps<"/explore">["searchParams"]

export default function Page({ searchParams }: PageProps<"/explore">) {
  return (
    <div data-flow="clip" className="sd-flow shell pb-16">
      <PageHead
        k="explore.header"
        crumbs={<AreaCrumbs />}
        title="Explore"
        lead="Every model, dataset, tool and repo members published or shared."
        actions={
          <Button nativeButton={false} render={<Link href="/new/project" />}>
            <PlusIcon aria-hidden /> Publish
          </Button>
        }
      >
        <Suspense fallback={<Skeleton className="h-10 w-56 rounded-full" />}>
          <Views searchParams={searchParams} />
        </Suspense>
      </PageHead>
      <Suspense fallback={<RowsSkeleton rows={4} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const isMap = async (searchParams: Params) => (await searchParams).show === "map"

async function Views({ searchParams }: { searchParams: Params }) {
  const map = await isMap(searchParams)
  return (
    <LinkTabs
      label="View"
      current={map ? "/explore?show=map" : "/explore"}
      tabs={[
        { href: "/explore", label: "List", icon: ListIcon },
        { href: "/explore?show=map", label: "Star map", icon: OrbitIcon },
      ]}
    />
  )
}

async function Body({ searchParams }: { searchParams: Params }) {
  if (!(await isMap(searchParams))) return <ResourceIndex />
  // Rising GitHub repositories are fetched on the server (cached); members' data loads in the browser.
  const feed = await githubTrendingAi(40)
  return <CosmosView github={feed.items} embedded />
}
