import type { Metadata } from "next"
import { TrophyIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { LeaderboardView } from "@/components/reputation/leaderboard-view"
import { LevelsShowcase } from "@/components/reputation/levels-showcase"

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The members who helped most this week, this month and of all time, from Stardust to Galaxy.",
}

export default function LeaderboardPage() {
  return (
    <div className="shell pb-16">
      <PageTitle
        k="leaderboard.header"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <TrophyIcon aria-hidden className="size-4 text-gold" /> The brightest stars in the sky
          </span>
        }
        title="Leaderboard"
        lead="Every member starts as stardust. Points come from helping: starting good threads, replying, and having your answer marked as the solution. Shine long enough and you become a galaxy."
      />
      <LeaderboardView />
      <LevelsShowcase />
    </div>
  )
}
