import type { Metadata } from "next"
import { TargetIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { MissionsView } from "@/components/missions/missions-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/missions", {
    title: "Missions",
    description: "Challenges members post for each other, with reputation points for whoever builds it best: models, datasets, tools and write-ups.",
  })
}

export default function MissionsPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader k="missions.header"
        title="Missions"
        lead="Challenges members post for each other. Accept one, build it, submit your entry; the poster picks the winner, who gets the points and a badge."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <TargetIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <MissionsView />
    </div>
  )
}
