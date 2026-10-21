import type { Metadata } from "next"
import { TrophyIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { HowToRise } from "@/components/reputation/how-to-rise"
import { LeaderboardView } from "@/components/reputation/leaderboard-view"
import { LevelsShowcase } from "@/components/reputation/levels-showcase"

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The members who helped most this week, this month and of all time, from Stardust to Galaxy, and every way to earn points.",
}

export default function LeaderboardPage() {
  return (
    <div className="sd-flow shell pb-16">
      <PageTitle
        k="leaderboard.header"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <TrophyIcon aria-hidden className="size-4 text-gold" /> The brightest stars in the sky
          </span>
        }
        title="Leaderboard"
        lead="Every member starts as stardust. Points come from helping and building: threads and replies, projects and releases, events, missions, benchmarks and more. Shine long enough and you become a galaxy."
      />
      <LeaderboardView />
      <HowToRise className="mt-10" />
      <LevelsShowcase />
    </div>
  )
}
