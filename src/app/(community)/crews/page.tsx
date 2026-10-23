import type { Metadata } from "next"
import { UsersIcon } from "lucide-react"
import { CrewsIndex } from "@/components/crews/crews-index"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/crews", {
    title: "Crews",
    description: "Labs, study groups and project teams on Nexverse, each with a wall, a chat room and shared collections.",
  })
}

export default function CrewsPage() {
  return (
    <div data-flow="fan" className="sd-flow shell max-w-6xl pb-16">
      <ForumHeader k="crews.header"
        title="Crews"
        lead="Labs, study groups and teams, each with a wall and a chat room."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <UsersIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <CrewsIndex />
    </div>
  )
}
