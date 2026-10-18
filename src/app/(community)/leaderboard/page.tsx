import type { Metadata } from "next"
import { TrophyIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { LeaderboardView } from "@/components/reputation/leaderboard-view"

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The members who helped most this week, this month and of all time, from Stardust to Galaxy.",
}

export default function LeaderboardPage() {
  return (
    <div className="shell pb-16">
      <ForumHeader
        title="Leaderboard"
        lead="Points come from helping: starting good threads, replying, and having your answer marked as the solution. Levels go from Stardust to Galaxy."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
            <TrophyIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <LeaderboardView />
    </div>
  )
}
