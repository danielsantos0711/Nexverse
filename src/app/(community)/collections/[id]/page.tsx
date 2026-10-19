import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CollectionDetail } from "@/components/collections/collection-detail"
import { isUuid } from "@/lib/community"

// Collections are members' (database ids, or ids saved in this browser) and may be private, so they load in the
// browser. One placeholder id lets the route be checked at build time; it renders the "not here" state.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Collection" }

export default function CollectionPage({ params }: PageProps<"/collections/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Collection params={params} />
    </Suspense>
  )
}

async function Collection({ params }: { params: PageProps<"/collections/[id]">["params"] }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  return <CollectionDetail id={id.toLowerCase()} />
}
