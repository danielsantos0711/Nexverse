import type { Metadata } from "next"
import { Suspense } from "react"
import { FileTextIcon, SparklesIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { PaperCard } from "@/components/live/paper-card"
import { PillTabs } from "@/components/live/pill-tabs"
import { PapersSkeleton } from "@/components/live/skeletons"
import { arxivLatest, hfDailyPapers, type Feed, type Paper } from "@/lib/live"

export const metadata: Metadata = {
  title: "Papers",
  description: "Today's most upvoted papers on Hugging Face and the newest arXiv submissions in AI, language and machine learning.",
}

function PaperList({ feed, href, label, ranked }: { feed: Feed<Paper>; href: string; label: string; ranked?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} href={href} label={label} />
      {feed.items.length ? (
        <Stagger as="ol" className="flex flex-col gap-3" gap={0.04}>
          {feed.items.map((p, i) => (
            <Item as="li" key={p.id}>
              <PaperCard paper={p} rank={ranked ? i + 1 : undefined} />
            </Item>
          ))}
        </Stagger>
      ) : (
        <FeedUnavailable source={feed.source} href={href} />
      )}
    </div>
  )
}

async function PaperFeeds() {
  const [daily, latest] = await Promise.all([hfDailyPapers(30), arxivLatest(30)])
  return (
    <PillTabs
      label="Paper sources"
      tabs={[
        {
          id: "daily",
          label: "Daily on Hugging Face",
          icon: <SparklesIcon aria-hidden className="size-3.5" />,
          count: daily.items.length,
          content: <PaperList feed={daily} href="https://huggingface.co/papers" label="Open Daily Papers" ranked />,
        },
        {
          id: "arxiv",
          label: "Newest on arXiv",
          icon: <FileTextIcon aria-hidden className="size-3.5" />,
          count: latest.items.length,
          content: <PaperList feed={latest} href="https://arxiv.org/list/cs.AI/new" label="Open arXiv listings" />,
        },
      ]}
    />
  )
}

export default function PapersPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <PageTitle
        eyebrow="Hugging Face Daily Papers · arXiv cs.AI, cs.CL, cs.LG"
        title="Papers"
        lead="What researchers are reading today, ranked by the community, next to the newest submissions on arXiv. Open any abstract, jump to the PDF, or start a thread to talk it through."
      />
      <Suspense fallback={<PapersSkeleton />}>
        <PaperFeeds />
      </Suspense>
    </div>
  )
}
