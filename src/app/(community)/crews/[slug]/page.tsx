import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CrewPage } from "@/components/crews/crew-page"
import { CREW_SLUG, getSampleCrew, SAMPLE_CREWS } from "@/lib/crews"
import { live } from "@/lib/supabase"

// The sample crews are prerendered; crews members start later render on first visit.
export function generateStaticParams() {
  return SAMPLE_CREWS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps<"/crews/[slug]">): Promise<Metadata> {
  const c = getSampleCrew((await params).slug)
  return c ? { title: `${c.name} · Crews`, description: c.blurb } : { title: "Crew" }
}

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
      <CrewPage slug={slug} initial={live ? undefined : getSampleCrew(slug)} />
    </Suspense>
  )
}
