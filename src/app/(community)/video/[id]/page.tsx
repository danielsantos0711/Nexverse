import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { VideoDetail } from "@/components/video/video-detail"
import { isUuid } from "@/lib/community"

/** One sample so the route builds; it is not a post id, so it renders the 404 page. */
export function generateStaticParams() {
  return [{ id: "sample" }]
}

export const metadata: Metadata = { title: "Video" }

export default function VideoPostPage({ params }: PageProps<"/video/[id]">) {
  return (
    <div className="shell max-w-6xl pb-16">
      <Suspense fallback={<PageSkeleton />}>
        <Post params={params} />
      </Suspense>
    </div>
  )
}

async function Post({ params }: { params: PageProps<"/video/[id]">["params"] }) {
  const { id } = await params
  // Posts load in the browser, where the member's session decides what they may see (drafts, hidden posts).
  if (!isUuid(id)) notFound()
  return <VideoDetail id={id} />
}
