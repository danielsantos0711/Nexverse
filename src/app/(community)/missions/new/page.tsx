import type { Metadata } from "next"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewMissionForm } from "@/components/missions/new-mission"

export const metadata: Metadata = { title: "Post a mission", robots: { index: false } }

export default function NewMissionPage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <ForumHeader
        title="Post a mission"
        crumbs={[{ label: "Missions", href: "/missions" }, { label: "Post a mission" }]}
        lead="Describe something you wish existed, say how you will judge it, and pledge points from your reputation for whoever builds it best."
      />
      <NewMissionForm />
    </div>
  )
}
