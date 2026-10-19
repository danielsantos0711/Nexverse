import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MissionDetail } from "@/components/missions/mission-detail"
import { isUuid } from "@/lib/community"
import { getSampleMissionMeta, SAMPLE_MISSION_IDS } from "@/lib/missions"

export function generateStaticParams() {
  return SAMPLE_MISSION_IDS.map((id) => ({ id }))
}

export async function generateMetadata({ params }: PageProps<"/missions/[id]">): Promise<Metadata> {
  const meta = getSampleMissionMeta((await params).id)
  return meta ?? { title: "Mission" }
}

export default function MissionPage({ params }: PageProps<"/missions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Mission params={params} />
    </Suspense>
  )
}

async function Mission({ params }: { params: PageProps<"/missions/[id]">["params"] }) {
  const { id } = await params
  // Samples and members' missions (from the database, or this browser) both load in the browser, where the
  // clock decides what is open and expired.
  if (getSampleMissionMeta(id) || isUuid(id)) return <MissionDetail id={id} />
  notFound()
}
