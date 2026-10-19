import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { EventDetail } from "@/components/events/event-detail"
import { isUuid } from "@/lib/community"

// Members' events live in the database (or this browser) and load on first visit. One placeholder id lets the
// route be checked at build time; it renders the "not found" state.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Event" }

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Event params={params} />
    </Suspense>
  )
}

async function Event({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  return <EventDetail id={id.toLowerCase()} />
}
