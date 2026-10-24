import type { Metadata } from "next"
import { RocketIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { LaunchpadView } from "@/components/launchpad/launchpad-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/launchpad", {
    title: "Launchpad",
    description: "Project launches with a countdown, a launch day where members boost live, and a Launch of the day.",
  })
}

export default function LaunchpadPage() {
  return (
    <div data-flow="zoom" className="sd-flow shell max-w-6xl pb-16">
      <ForumHeader backdrop="ascent" k="launchpad.header"
        title="Launchpad"
        lead="Launch your project with a countdown; members boost it on the day."
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
