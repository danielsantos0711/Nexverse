import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ShareDetail } from "@/components/hub/share-detail"
import { StoryView } from "@/components/news/story-view"
import { generatedCoverUrl } from "@/components/news/bits"
import { storyHref } from "@/lib/newsroom"
import { newsCategoryNames, storyByKey, storyExtras } from "@/lib/newsroom/public"
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
  const seo = (await storyExtras([story.id]))[story.id]?.seo ?? null
  // The share image: the story's photo, or its generated cover with the headline on it.
  const image = story.cover ? { url: story.cover, alt: story.coverAlt || story.title } : { url: generatedCoverUrl(story.id, "title"), width: 1200, height: 630, alt: story.title }
  const description = seo?.description || story.dek || undefined
  return {
    title: seo?.title || story.title,
    description,
    keywords: seo?.keywords.length ? seo.keywords : undefined,
    alternates: { canonical: storyHref(story) },
    openGraph: { title: story.title, description, type: "article", publishedTime: story.publishedAt ?? undefined, images: [image] },
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
  if (story)
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleLd(story) }} />
        <StoryView story={story} names={names} />
      </>
    )
  if (!isHubId(id)) notFound()
  return <ShareDetail kind="news" id={id.toLowerCase()} />
}

/** Structured data for search engines: a NewsArticle with its sources as citations. Escaped for a script tag. */
function articleLd(story: NonNullable<Awaited<ReturnType<typeof storyByKey>>["story"]>): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.title.slice(0, 110),
    description: story.dek || undefined,
    datePublished: story.publishedAt ?? undefined,
    dateModified: story.updatedAt ?? story.publishedAt ?? undefined,
    image: story.cover ? [story.cover] : [generatedCoverUrl(story.id, "title")],
    author: { "@type": "Organization", name: "Nexverse newsroom" },
    publisher: { "@type": "Organization", name: "Nexverse" },
    mainEntityOfPage: storyHref(story),
    citation: story.sources.map((s) => ({ "@type": "CreativeWork", name: s.title || s.url, url: s.url })),
  }
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
