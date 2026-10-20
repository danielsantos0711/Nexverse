import type { Metadata } from "next"
import { NewEventForm } from "@/components/events/new-event"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/events/new", { title: "Create an event", robots: { index: false } })
}

export default function NewEventPage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <ForumHeader k="events-new.header"
        title="Create an event"
        crumbs={[{ label: "Events", href: "/events" }, { label: "Create an event" }]}
        lead="Host a paper club, a meetup, office hours or an AMA. Pick the time in your own time zone; everyone else sees it in theirs."
      />
      <NewEventForm />
    </div>
  )
}
