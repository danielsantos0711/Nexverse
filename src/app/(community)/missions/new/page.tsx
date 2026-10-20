import type { Metadata } from "next"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewMissionForm } from "@/components/missions/new-mission"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/missions/new", { title: "Post a mission", robots: { index: false } })
}

export default function NewMissionPage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <ForumHeader k="missions-new.header"
        title="Post a mission"
        crumbs={[{ label: "Missions", href: "/missions" }, { label: "Post a mission" }]}
        lead="Describe something you wish existed, say how you will judge it, and pledge points from your reputation for whoever builds it best."
      />
      <NewMissionForm />
    </div>
  )
}
