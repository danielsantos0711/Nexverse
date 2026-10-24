import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { DuelDetail } from "@/components/arena/duel-detail"
import { ForumHeader } from "@/components/forum/forum-header"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Duels live in the database and load in the browser. The build needs one param; it is not a duel, so it 404s.
export function generateStaticParams() {
  return [{ id: "example" }]
}

// The prompt is not in the metadata: the page loads it in the browser, and the model names are the answer to a blind vote.
export const metadata: Metadata = { title: "Duel · Arena", description: "A blind duel between two models. Read both answers, vote, then see which models wrote them." }

export default function DuelPage({ params }: PageProps<"/arena/[id]">) {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader backdrop="pixels" k="duel.header" title="Duel" crumbs={[{ label: "Arena", href: "/arena" }, { label: "Duel" }]} lead="Read both answers, vote for the better one, then see which models wrote them. Keys 1 to 4 vote." />
      <Suspense fallback={<PageSkeleton />}>
        <Duel params={params} />
      </Suspense>
    </div>
  )
}

async function Duel({ params }: { params: PageProps<"/arena/[id]">["params"] }) {
  const { id } = await params
  // Without a database, duels saved in this browser also have random UUIDs.
  if (!UUID.test(id)) notFound()
  return <DuelDetail id={id} />
}
