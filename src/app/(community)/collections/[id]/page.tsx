import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CollectionDetail } from "@/components/collections/collection-detail"
import { getSampleCollection, isUuid, SAMPLE_COLLECTIONS } from "@/lib/community"

export function generateStaticParams() {
  return SAMPLE_COLLECTIONS.map((c) => ({ id: c.id }))
}

export async function generateMetadata({ params }: PageProps<"/collections/[id]">): Promise<Metadata> {
  const c = getSampleCollection((await params).id)
  return c ? { title: c.title, description: c.description } : { title: "Collection" }
}

export default function CollectionPage({ params }: PageProps<"/collections/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Collection params={params} />
    </Suspense>
  )
}

async function Collection({ params }: { params: PageProps<"/collections/[id]">["params"] }) {
  const { id } = await params
  const sample = getSampleCollection(id)
  if (sample) return <CollectionDetail id={id} initial={sample} />
  // Members' collections live in the database (or this browser) and may be private, so they load in the browser.
  if (isUuid(id)) return <CollectionDetail id={id} />
  notFound()
}
