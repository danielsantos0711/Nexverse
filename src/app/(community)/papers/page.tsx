import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { QuoteIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { LinkTabs } from "@/components/live/link-tabs"
import { PaperCard } from "@/components/live/paper-card"
import { PapersSkeleton } from "@/components/live/skeletons"
import { ARXIV_AREAS, areaInfo, arxivPapers, isArxivArea, paperHref, type ArxivArea } from "@/lib/live"
import { compact } from "@/lib/data"
import { mostCitedRecent } from "@/lib/live/openalex"

export const metadata: Metadata = {
  title: "Papers",
  description: "The newest AI research on arXiv, by area: artificial intelligence, language, machine learning, vision, robotics and statistical ML.",
}

const TABS = [
  { id: "all", label: "All areas", href: "/papers" },
  ...ARXIV_AREAS.map((a) => ({ id: a.id, label: a.short, href: `/papers?area=${encodeURIComponent(a.id)}`, title: `${a.label} (${a.id})` })),
  { id: "cited", label: "Most cited", href: "/papers?view=cited", title: "The most cited AI papers on arXiv from the last twelve months" },
]

/** The most cited AI papers on arXiv from the last year, by OpenAlex's count. Fails soft with a note. */
async function MostCited() {
  const res = await mostCitedRecent(25)
  return (
    <div className="flex flex-col gap-5">
      <LinkTabs label="Research areas" tabs={TABS} current="cited" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Most cited in the last twelve months</h2>
        <p className="text-sm text-muted-foreground">AI and computer vision papers first posted to arXiv in the last year, ranked by how many works cite them. Counts from OpenAlex, refreshed daily.</p>
      </div>
      {res.ok ? (
        <ol className="flex flex-col gap-2">
          {res.data.map((w, i) => (
            <li key={w.arxivId}>
              <Link href={paperHref(w.arxivId)} className="flex items-start gap-4 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-muted-foreground tabular">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-base leading-snug font-medium">{w.title}</span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="font-mono">arXiv:{w.arxivId}</span>
                    {w.year > 0 && <span>{w.year}</span>}
                    {w.venue && <span className="text-gold">{w.venue}</span>}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-sm tabular" title={`Cited by ${w.citations.toLocaleString("en")}`}>
                  <QuoteIcon aria-hidden className="size-3.5 text-muted-foreground" />
                  {compact(w.citations)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="glass rounded-xl p-5 text-sm text-muted-foreground">
          {res.reason === "ratelimit"
            ? "The citation index has used up its free daily allowance for this site. The ranking comes back after midnight UTC."
            : "The citation index is not answering right now. This list refreshes on its own; the newest papers are under the other tabs."}
        </p>
      )}
    </div>
  )
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function Papers({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  if (params.view === "cited") return <MostCited />
  const raw = params.area
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
