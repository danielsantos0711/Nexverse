import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { LinkTabs } from "@/components/live/link-tabs"
import { PaperCard } from "@/components/live/paper-card"
import { PapersSkeleton } from "@/components/live/skeletons"
import { ARXIV_AREAS, areaInfo, arxivPapers, isArxivArea, type ArxivArea } from "@/lib/live"

export const metadata: Metadata = {
  title: "Papers",
  description: "The newest AI research on arXiv, by area: artificial intelligence, language, machine learning, vision, robotics and statistical ML.",
}

const TABS = [
  { id: "all", label: "All areas", href: "/papers" },
  ...ARXIV_AREAS.map((a) => ({ id: a.id, label: a.short, href: `/papers?area=${encodeURIComponent(a.id)}`, title: `${a.label} (${a.id})` })),
]

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function Papers({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).area
  const area: ArxivArea | "all" = typeof raw === "string" && isArxivArea(raw) ? raw : "all"
  const feed = await arxivPapers(area, 30)
  const info = area === "all" ? null : areaInfo(area)
  return (
    <div className="flex flex-col gap-5">
      <LinkTabs label="Research areas" tabs={TABS} current={area} />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{info ? `${info.label} · ${info.id}` : "Newest across all areas"}</h2>
        <p className="text-sm text-muted-foreground">{info ? info.blurb : "cs.AI, cs.CL, cs.LG, cs.CV, cs.RO and stat.ML, newest submissions first."}</p>
      </div>
      <FeedMeta feed={feed} />
      {feed.items.length ? (
        <Stagger key={area} as="ol" className="flex flex-col gap-3" gap={0.04}>
          {feed.items.map((p) => (
            <Item as="li" key={p.id}>
              <PaperCard paper={p} />
            </Item>
          ))}
        </Stagger>
      ) : feed.ok ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No new papers in this area right now. Try another area.</p>
      ) : (
        <FeedUnavailable source="arxiv" />
      )}
    </div>
  )
}

export default function PapersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="shell max-w-5xl pb-16">
      <PageTitle
        eyebrow="Live from arXiv"
        title="Papers"
        lead="The newest research in AI, by area. Open any paper to read the abstract and the PDF right here, see who cites it and what it builds on, or start a thread to talk it through."
      />
      <Suspense fallback={<PapersSkeleton />}>
        <Papers searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
