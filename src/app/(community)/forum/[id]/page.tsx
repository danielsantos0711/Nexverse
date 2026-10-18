import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MemberThread } from "@/components/forum/member-thread"
import { SampleThread } from "@/components/forum/thread-view"
import { getThread, isQuestionId, threads, threadTitle } from "@/lib/data"

export function generateStaticParams() {
  return threads.map((t) => ({ id: t.id }))
}

export async function generateMetadata({ params }: PageProps<"/forum/[id]">): Promise<Metadata> {
  const t = getThread((await params).id)
  return { title: t ? threadTitle(t) : "Thread" }
}

export default function ThreadPage({ params }: PageProps<"/forum/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Thread params={params} />
    </Suspense>
  )
}

async function Thread({ params }: { params: PageProps<"/forum/[id]">["params"] }) {
  const { id } = await params
  const t = getThread(id)
  // Members' threads live in the database, so they load in the browser rather than at build time.
  if (!t && isQuestionId(id)) return <MemberThread id={id} />
  if (!t) notFound()
  return <SampleThread t={t} />
}
