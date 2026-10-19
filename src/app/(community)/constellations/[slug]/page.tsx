import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { isUuid } from "@/lib/community"

// A constellation is a collection drawn as a map, so its page is the collection's page (which shows the map).
// One placeholder id lets the route be checked at build time. Old sample slugs 404.
export function generateStaticParams() {
  return [{ slug: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Constellation" }

export default function Page({ params }: PageProps<"/constellations/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Forward params={params} />
    </Suspense>
  )
}

async function Forward({ params }: { params: PageProps<"/constellations/[slug]">["params"] }): Promise<React.ReactNode> {
  const { slug } = await params
  if (!isUuid(slug)) notFound()
  redirect(`/collections/${slug.toLowerCase()}`)
}
