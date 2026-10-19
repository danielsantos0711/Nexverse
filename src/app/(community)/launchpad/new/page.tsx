import type { Metadata } from "next"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewLaunchForm } from "@/components/launchpad/new-launch"

export const metadata: Metadata = { title: "Schedule a launch", robots: { index: false } }

export default function NewLaunchPage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <ForumHeader
        title="Schedule a launch"
        crumbs={[{ label: "Launchpad", href: "/launchpad" }, { label: "Schedule a launch" }]}
        lead="Pick what you are launching and when. Members see a countdown, then boost it for 24 hours from launch time."
      />
      <NewLaunchForm />
    </div>
  )
}
