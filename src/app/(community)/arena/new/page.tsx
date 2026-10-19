import type { Metadata } from "next"
import { NewDuelForm } from "@/components/arena/new-duel"
import { ForumHeader } from "@/components/forum/forum-header"

export const metadata: Metadata = { title: "Post a duel", robots: { index: false } }

export default function NewDuelPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader
        title="Post a duel"
        crumbs={[{ label: "Arena", href: "/arena" }, { label: "Post a duel" }]}
        lead="Give two models the same prompt and paste both answers. The community votes without seeing the names."
      />
      <NewDuelForm />
    </div>
  )
}
