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
      <PageTitle backdrop="podium"
        k="leaderboard.header"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <TrophyIcon aria-hidden className="size-4 text-gold" /> The brightest stars in the sky
          </span>
        }
        title="Leaderboard"
        lead="Points come from helping and building. Every member starts as stardust."
      />
      <LeaderboardView />
      <details className="group mt-10 rounded-xl border border-border bg-card/30">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          How points and levels work
        </summary>
        <div className="flex flex-col gap-6 border-t border-border p-4">
          <HowToRise />
          <LevelsShowcase />
        </div>
      </details>
    </div>
  )
}
