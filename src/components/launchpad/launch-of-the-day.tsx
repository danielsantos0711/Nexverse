"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRightIcon, CrownIcon } from "lucide-react"
import { useNow } from "@/components/live/time"
import { BoostButton, boostState, LaunchCover, PhaseBadge, shortCountdown } from "@/components/launchpad/launch-bits"
import { useLaunches } from "@/components/launchpad/use-launches"
import { Skeleton } from "@/components/ui/skeleton"
import { dailyWinners, dayKey, launchOfTheDay, launchPhase, type Launch } from "@/lib/launchpad"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * A compact card for the home page: today's Launch of the day with its live boost count and button. With no
 * launch today it shows the next one with a countdown, or yesterday's winner, so it is never empty for long.
 */
export function LaunchOfTheDay({ className }: { className?: string }) {
  const now = useNow()
  const { user } = useSession()
  const { launches, incoming, boost } = useLaunches()
  const [error, setError] = useState("")

  const pick = useMemo((): {
    l: Launch
    kind: "today" | "next" | "past"
  } | null => {
    if (!launches || now === null) return null
    const today = launchOfTheDay(launches, dayKey(now), now)
    if (today) return { l: today, kind: "today" }
    const next = launches.filter((l) => launchPhase(l, now) === "scheduled").sort((a, b) => a.launchAt.localeCompare(b.launchAt))[0]
    if (next) return { l: next, kind: "next" }
    const past = dailyWinners(launches, now)[0]
    return past ? { l: past.winner, kind: "past" } : null
  }, [launches, now])

  if (launches === null || now === null) {
    return <Skeleton className={cn("h-[148px] w-full rounded-2xl", className)} />
  }

  if (!pick) {
    return (
      <section className={cn("glass flex flex-col items-start gap-2 rounded-2xl p-4", className)}>
        <p className="flex items-center gap-1.5 text-xs font-medium text-gold">
          <CrownIcon aria-hidden className="size-3.5" /> Launch of the day
        </p>
        <p className="text-sm text-muted-foreground">Nothing on the pad yet.</p>
        <Link href="/launchpad/new" className="text-sm text-ion hover:underline">
          Schedule the first launch
        </Link>
      </section>
    )
  }

  const { l, kind } = pick
  const phase = launchPhase(l, now)
  const isOwner = l.local || Boolean(user && l.owner.memberId === user.id)

  return (
    <section aria-labelledby="lotd-h" className={cn("glass group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-gold">
          <CrownIcon aria-hidden className="size-3.5" />
          {kind === "today" ? "Launch of the day" : kind === "next" ? "Next launch" : "Latest Launch of the day"}
        </p>
        <PhaseBadge phase={phase} />
      </div>
      <div className="flex items-start gap-3">
        <LaunchCover launch={l} className="size-14 shrink-0" rounded="rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id="lotd-h" className="truncate font-sans text-base font-semibold tracking-normal">
            <Link href={`/launchpad/${l.id}`} className="rounded-sm hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {l.name}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{l.tagline}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {phase === "scheduled" ? (
          <span className="text-sm text-ion tabular">Launches in {shortCountdown(Date.parse(l.launchAt) - now)}</span>
        ) : (
          <BoostButton
            launch={l}
            size="sm"
            state={boostState(l, now, { isOwner, readOnly: l.sample && live })}
            count={l.boosts}
            incoming={incoming[l.id]}
            onBoost={() => {
              setError("")
              boost(l).catch((e: Error) => setError(e.message))
            }}
          />
        )}
        <Link href="/launchpad" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Launchpad <ArrowRightIcon aria-hidden className="size-3.5" />
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
