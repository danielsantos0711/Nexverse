import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MissionDetail } from "@/components/missions/mission-detail"
import { isUuid } from "@/lib/community"

// Missions live in the database (or in this browser) and load on the client, where the clock decides what is
// open and expired. One placeholder id lets the route be checked at build time; it renders the "not found" state.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Mission" }

export default function MissionPage({ params }: PageProps<"/missions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Mission params={params} />
    </Suspense>
  )
}

async function Mission({ params }: { params: PageProps<"/missions/[id]">["params"] }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  return <MissionDetail id={id.toLowerCase()} />
}
