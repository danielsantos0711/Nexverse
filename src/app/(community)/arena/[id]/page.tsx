import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { DuelDetail } from "@/components/arena/duel-detail"
import { ForumHeader } from "@/components/forum/forum-header"
import { getSampleDuel, SAMPLE_DUELS } from "@/lib/arena"
import { isUuid } from "@/lib/community"

export function generateStaticParams() {
  return SAMPLE_DUELS.map((d) => ({ id: d.id }))
}

export async function generateMetadata({ params }: PageProps<"/arena/[id]">): Promise<Metadata> {
  const d = getSampleDuel((await params).id)
  // The prompt only: the model names are the answer to a blind vote.
  return { title: "Duel", description: d ? `Which answer is better? ${d.prompt.slice(0, 140)}` : "A blind duel between two models." }
}

export default function DuelPage({ params }: PageProps<"/arena/[id]">) {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader title="Duel" crumbs={[{ label: "Arena", href: "/arena" }, { label: "Duel" }]} lead="Read both answers, vote for the better one, then see which models wrote them. Keys 1 to 4 vote." />
      <Suspense fallback={<PageSkeleton />}>
        <Duel params={params} />
      </Suspense>
    </div>
  )
}

async function Duel({ params }: { params: PageProps<"/arena/[id]">["params"] }) {
  const { id } = await params
  const sample = getSampleDuel(id)
  if (sample) return <DuelDetail id={id} initial={sample} />
  // Members' duels live in the database (or this browser), so they load in the browser.
  if (isUuid(id)) return <DuelDetail id={id} />
  notFound()
}
