import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"
import { PageTitle, SectionHead } from "@/components/hub/bits"
import { MemberNews } from "@/components/hub/member-news"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { PaperCard } from "@/components/live/paper-card"
import { ReleaseList } from "@/components/live/release-list"
import { RowsSkeleton } from "@/components/live/skeletons"
import { arxivPapers, githubReleases } from "@/lib/live"

export const metadata: Metadata = {
  title: "News",
  description: "Stories members shared with why they matter, the latest releases of open-source AI projects and the newest arXiv papers.",
}

async function Releases() {
  const feed = await githubReleases(8)
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? <ReleaseList items={feed.items} /> : <FeedUnavailable source="github" />}
    </div>
  )
}

async function Papers() {
  // The same arguments as /papers, so both share one cache entry.
  const feed = await arxivPapers("all", 30)
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? (
        <Stagger as="ol" className="grid gap-3 lg:grid-cols-2" gap={0.04}>
          {feed.items.slice(0, 6).map((p) => (
            <Item as="li" key={p.id}>
              <PaperCard paper={p} className="h-full" />
            </Item>
          ))}
        </Stagger>
      ) : (
        <FeedUnavailable source="arxiv" />
      )}
    </div>
  )
}

export default function NewsPage() {
  return (
    <div className="shell pb-16">
      <PageTitle
        eyebrow="Shared by members · releases from GitHub · papers from arXiv"
        title="News"
        lead="What changed in AI, shared by the people who build with it, each with a line on why it matters. Below, the releases and papers that just came out."
      >
        <Link href="/share?kind=news" className="pressable mt-1 inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <PlusIcon aria-hidden className="size-4" /> Share a story
        </Link>
      </PageTitle>

      <section aria-labelledby="shared-h" className="flex flex-col gap-4">
        <h2 id="shared-h" className="text-xl font-semibold">
          Shared by members
        </h2>
        <MemberNews />
      </section>

      <section aria-labelledby="releases-h" className="mt-14 border-t border-border pt-10">
        <SectionHead id="releases-h" title="Fresh releases" href="/trending#releases" action="Trending">
          <p className="text-sm text-muted-foreground">What just shipped in the projects much of the open AI stack runs on.</p>
        </SectionHead>
        <Suspense fallback={<RowsSkeleton rows={6} />}>
          <Releases />
        </Suspense>
      </section>

      <section aria-labelledby="papers-h" className="mt-14 border-t border-border pt-10">
        <SectionHead id="papers-h" title="New on arXiv" href="/papers" action="All papers">
          <p className="text-sm text-muted-foreground">The newest submissions in AI, language, learning, vision and robotics.</p>
        </SectionHead>
        <Suspense fallback={<RowsSkeleton rows={6} />}>
          <Papers />
        </Suspense>
      </section>
    </div>
  )
}
