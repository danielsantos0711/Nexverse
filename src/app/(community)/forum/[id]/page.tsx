import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MemberThread } from "@/components/forum/member-thread"

// Threads live in the database and load in the browser. The build needs one param; it is not a thread, so it 404s.
export function generateStaticParams() {
  return [{ id: "example" }]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = { title: "Thread · Forum" }

export default function ThreadPage({ params }: PageProps<"/forum/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Thread params={params} />
    </Suspense>
  )
}

async function Thread({ params }: { params: PageProps<"/forum/[id]">["params"] }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return <MemberThread id={id} />
}
