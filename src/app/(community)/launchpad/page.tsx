import type { Metadata } from "next"
import { RocketIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { LaunchpadView } from "@/components/launchpad/launchpad-view"

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Project launches with a countdown, a launch day where members boost live, and a Launch of the day.",
}

export default function LaunchpadPage() {
  return (
    <div className="shell max-w-6xl pb-16">
      <ForumHeader
        title="Launchpad"
        lead="Schedule a launch for your project. A countdown builds up to it, then for 24 hours members boost it once each. The most boosted launch of each day becomes Launch of the day."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <RocketIcon aria-hidden className="size-5 -rotate-45" />
          </span>
        }
      />
      <LaunchpadView />
    </div>
  )
}
