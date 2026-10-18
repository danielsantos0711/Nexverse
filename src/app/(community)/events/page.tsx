import type { Metadata } from "next"
import { CalendarDaysIcon } from "lucide-react"
import { EventsView } from "@/components/events/events-view"
import { ForumHeader } from "@/components/forum/forum-header"

export const metadata: Metadata = {
  title: "Events",
  description: "Paper clubs, meetups, office hours and AMAs, online and in person. Times are shown in your time zone.",
}

export default function EventsPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader
        title="Events"
        lead="Paper clubs, meetups, office hours and AMAs, online and in person. Times are shown in your own time zone."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <CalendarDaysIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <EventsView />
    </div>
  )
}
