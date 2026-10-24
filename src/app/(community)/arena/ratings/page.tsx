import type { Metadata } from "next"
import { RatingsView } from "@/components/arena/ratings-view"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/arena/ratings", {
    title: "Arena ratings",
    description: "Elo ratings for models from every blind vote in the Nexverse arena, by task and language.",
  })
}

export default function RatingsPage() {
  return (
    <div className="sd-flow shell max-w-5xl pb-16">
      <ForumHeader backdrop="duel" k="arena-ratings.header"
        title="Arena ratings"
        crumbs={[{ label: "Arena", href: "/arena" }, { label: "Ratings" }]}
        lead="An Elo rating per model from every blind vote. Filter by task or language; the more votes behind a rating, the more it means."
      />
      <RatingsView />
    </div>
  )
}
