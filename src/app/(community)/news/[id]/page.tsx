import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ShareDetail } from "@/components/hub/share-detail"
import { StoryView } from "@/components/news/story-view"
import { storyByKey } from "@/lib/newsroom/public"
import { isHubId } from "@/lib/refs"

/*
 * /news/<slug>: a newsroom story. /news/<uuid>: a newsroom story by id, or else a story a member shared
 * (submissions of kind "news", read in the browser). Both are unknown at build time; one placeholder id lets
 * the route be checked during the build and renders the "not here" state.
 */
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export async function generateMetadata({ params }: PageProps<"/news/[id]">): Promise<Metadata> {
  const { id } = await params
  const { story } = await storyByKey(id)
  if (!story) return { title: "News" }
  return {
    title: story.title,
    description: story.dek || undefined,
    openGraph: { title: story.title, description: story.dek || undefined, type: "article", publishedTime: story.publishedAt ?? undefined },
  }
}

export default function Page({ params }: PageProps<"/news/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Story params={params} />
    </Suspense>
  )
}

async function Story({ params }: { params: PageProps<"/news/[id]">["params"] }) {
  const { id } = await params
  const { story } = await storyByKey(id)
  if (story) return <StoryView story={story} />
  if (!isHubId(id)) notFound()
  return <ShareDetail kind="news" id={id.toLowerCase()} />
}
