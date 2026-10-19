import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ShareDetail } from "@/components/hub/share-detail"
import { isHubId } from "@/lib/refs"

// Stories are members' shares: database ids, unknown at build time. One placeholder id lets the route be checked
// during the build and renders the "not here" state; real ids render on first visit. Old sample slugs 404.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "News" }

export default function Page({ params }: PageProps<"/news/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Story params={params} />
    </Suspense>
  )
}

async function Story({ params }: { params: PageProps<"/news/[id]">["params"] }) {
  const { id } = await params
  if (!isHubId(id)) notFound()
  return <ShareDetail kind="news" id={id.toLowerCase()} />
}
