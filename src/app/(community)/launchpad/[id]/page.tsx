import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LaunchDetail } from "@/components/launchpad/launch-detail"
import { isUuid } from "@/lib/community"

// Launches live in the database (or this browser). One placeholder id lets the route be checked at build time;
// it renders the "not found" state.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Launch" }

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
  if (!isUuid(id)) notFound()
  return <LaunchDetail id={id.toLowerCase()} />
}
