import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowDownIcon, ArrowUpIcon, FileTextIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { BenchmarkDetail } from "@/components/benchmarks/benchmark-detail"
import { ForumHeader } from "@/components/forum/forum-header"
import { BENCHMARKS } from "@/lib/benchmarks"
import { getBenchmarks } from "@/lib/lists/server"
import { Copy } from "@/components/content/copy"

export function generateStaticParams() {
  return BENCHMARKS.map((b) => ({ slug: b.slug }))
}

export async function generateMetadata({ params }: PageProps<"/benchmarks/[slug]">): Promise<Metadata> {
  const slug = (await params).slug
  const b = (await getBenchmarks()).find((x) => x.slug === slug)
  return b ? { title: `${b.name} results`, description: b.description } : { title: "Benchmark" }
}

export default function BenchmarkPage({ params }: PageProps<"/benchmarks/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Benchmark params={params} />
    </Suspense>
  )
}

async function Benchmark({ params }: { params: PageProps<"/benchmarks/[slug]">["params"] }) {
  const slug = (await params).slug
  // The admins' list (/admin/lists): renamed, retuned and newly added benchmarks included.
  const b = (await getBenchmarks()).find((x) => x.slug === slug)
  if (!b) notFound()
  return (
    <div className="sd-flow shell max-w-5xl pb-16">
      <ForumHeader backdrop="spectrum" title={b.name} crumbs={[{ label: "Benchmarks", href: "/benchmarks" }, { label: b.name }]} lead={b.description} />
      <ul className="-mt-2 mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <li className="rounded-full border border-border px-2.5 py-1">{b.area}</li>
        <li className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
          {b.higherIsBetter ? <ArrowUpIcon aria-hidden className="size-3" /> : <ArrowDownIcon aria-hidden className="size-3" />}
          {b.metric}, {b.higherIsBetter ? "higher" : "lower"} is better
        </li>
        <li className="rounded-full border border-border px-2.5 py-1">
          Reproduced within ±{b.tolerance}
          {b.unit === "%" ? " points" : ""}
        </li>
        {b.usualShots !== undefined && <li className="rounded-full border border-border px-2.5 py-1">Usually {b.usualShots}-shot</li>}
        <li>
          <a
            href={`https://arxiv.org/abs/${b.arxiv}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 transition-colors hover:border-ion/40 hover:text-foreground"
          >
            <FileTextIcon aria-hidden className="size-3" /> <Copy k="benchmark.page.the-paper-on-arxiv">The paper on arXiv</Copy>
          </a>
        </li>
      </ul>
      <BenchmarkDetail slug={b.slug} />
    </div>
  )
}
