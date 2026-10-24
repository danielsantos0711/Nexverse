import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { primaryButton } from "@/components/forum/forum-ui"
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
    <div data-flow="clip" className="sd-flow shell max-w-5xl pb-16">
      <ForumHeader backdrop="stream" k="missions.header"
        title="Missions"
        lead="Challenges members post for each other, with points and a badge for the winner."
      >
        <Link href="/missions/new" className={primaryButton}>
          <PlusIcon aria-hidden className="size-4" /> Post a mission
        </Link>
      </ForumHeader>
      <MissionsView />
    </div>
  )
}
