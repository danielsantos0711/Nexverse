import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CrewPage } from "@/components/crews/crew-page"
import { CREW_SLUG } from "@/lib/crews"

// Crews live in the database (or this browser) and load on first visit. One placeholder slug lets the route be
// checked at build time; it renders the "not found" state.
export function generateStaticParams() {
  return [{ slug: "crew-placeholder" }]
}

export const metadata: Metadata = { title: "Crew" }

export default function Page({ params }: PageProps<"/crews/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Crew params={params} />
    </Suspense>
  )
}

async function Crew({ params }: { params: PageProps<"/crews/[slug]">["params"] }) {
  const { slug } = await params
  if (!CREW_SLUG.test(slug)) notFound()
  // The page reads ?invite= in the browser, so it waits inside its own boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CrewPage slug={slug} />
    </Suspense>
  )
}
