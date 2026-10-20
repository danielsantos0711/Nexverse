import type { Metadata } from "next"
import { NewCrew } from "@/components/crews/crew-form"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/crews/new", { title: "Start a crew", description: "Start a crew for your lab, study group or project team." })
}

export default function NewCrewPage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <ForumHeader k="crews-new.header"
        title="Start a crew"
        lead="A crew gets a wall, its own chat room, shared collections and a members list. You can change everything but the address later."
        crumbs={[{ label: "Crews", href: "/crews" }, { label: "New" }]}
      />
      <NewCrew />
    </div>
  )
}
