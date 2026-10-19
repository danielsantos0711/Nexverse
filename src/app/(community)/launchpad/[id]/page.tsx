import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LaunchDetail } from "@/components/launchpad/launch-detail"
import { isUuid } from "@/lib/community"
import { getSampleLaunchMeta, SAMPLE_LAUNCH_IDS } from "@/lib/launchpad"

export function generateStaticParams() {
  return SAMPLE_LAUNCH_IDS.map((id) => ({ id }))
}

export async function generateMetadata({ params }: PageProps<"/launchpad/[id]">): Promise<Metadata> {
  const meta = getSampleLaunchMeta((await params).id)
  return meta ? { title: `${meta.title} · Launchpad`, description: meta.description } : { title: "Launch" }
}

export default function LaunchPage({ params }: PageProps<"/launchpad/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Launch params={params} />
    </Suspense>
  )
}

async function Launch({ params }: { params: PageProps<"/launchpad/[id]">["params"] }) {
  const { id } = await params
  // Launch times are relative to the viewer's clock (countdown, launch day), so the page renders in the browser.
  if (getSampleLaunchMeta(id) || isUuid(id)) return <LaunchDetail id={id} />
  notFound()
}
