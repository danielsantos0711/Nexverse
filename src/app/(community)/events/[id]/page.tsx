import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { EventDetail } from "@/components/events/event-detail"
import { getSampleEvent, isUuid, SAMPLE_EVENTS } from "@/lib/community"

export function generateStaticParams() {
  return SAMPLE_EVENTS.map((e) => ({ id: e.id }))
}

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const e = getSampleEvent((await params).id)
  return e ? { title: e.title, description: e.description.split("\n")[0].slice(0, 160) } : { title: "Event" }
}

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Event params={params} />
    </Suspense>
  )
}

async function Event({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const { id } = await params
  const sample = getSampleEvent(id)
  if (sample) return <EventDetail id={id} initial={sample} />
  // Members' events live in the database (or this browser), so they load in the browser.
  if (isUuid(id)) return <EventDetail id={id} />
  notFound()
}
