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
    <div className="shell max-w-6xl pb-16">
      <ForumHeader k="crews.header"
        title="Crews"
        lead="Labs, study groups and project teams. Each crew has a wall, its own chat room, shared collections and a members list."
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
