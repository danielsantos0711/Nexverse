import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ShareDetail } from "@/components/hub/share-detail"
import { StoryView } from "@/components/news/story-view"
import { generatedCoverUrl } from "@/components/news/bits"
import { newsCategoryNames, storyByKey } from "@/lib/newsroom/public"
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
  // The share image: the story's photo, or its generated cover with the headline on it.
  const image = story.cover ? { url: story.cover, alt: story.coverAlt || story.title } : { url: generatedCoverUrl(story.id, "title"), width: 1200, height: 630, alt: story.title }
  return {
    title: story.title,
    description: story.dek || undefined,
    openGraph: { title: story.title, description: story.dek || undefined, type: "article", publishedTime: story.publishedAt ?? undefined, images: [image] },
    twitter: { card: "summary_large_image", title: story.title, description: story.dek || undefined, images: [image.url] },
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
  const [{ story }, names] = await Promise.all([storyByKey(id), newsCategoryNames()])
  if (story) return <StoryView story={story} names={names} />
  if (!isHubId(id)) notFound()
  return <ShareDetail kind="news" id={id.toLowerCase()} />
}
