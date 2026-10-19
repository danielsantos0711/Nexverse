"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { BadgeCheckIcon, CalendarHeartIcon, FlameIcon, HandHelpingIcon, LibraryIcon, SunriseIcon, TelescopeIcon, type LucideIcon } from "lucide-react"
import { LevelRing } from "@/components/reputation/level-ring"
import { Skeleton } from "@/components/ui/skeleton"
import { BADGES, getMemberReputation, POINTS, type RepStats } from "@/lib/community"
import { compact } from "@/lib/data"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const BADGE_ICONS: Record<string, LucideIcon> = {
  "first-light": SunriseIcon,
  "helping-hand": HandHelpingIcon,
  "problem-solver": BadgeCheckIcon,
  "guiding-star": TelescopeIcon,
  "well-liked": FlameIcon,
  host: CalendarHeartIcon,
  curator: LibraryIcon,
}

/** Earned badges first, then the ones still to earn (dimmed, described for screen readers). */
export function Badges({ stats, showLocked = true, className }: { stats: RepStats; showLocked?: boolean; className?: string }) {
  const list = BADGES.map((b) => ({ ...b, has: b.earned(stats) })).filter((b) => showLocked || b.has)
  const earned = list.filter((b) => b.has).length
  if (!list.length) return null
  return (
    <ul aria-label={`Badges, ${earned} of ${BADGES.length} earned`} className={cn("flex flex-wrap gap-1.5", className)}>
      {[...list].sort((a, b) => Number(b.has) - Number(a.has)).map((b) => {
        const Icon = BADGE_ICONS[b.id] ?? BadgeCheckIcon
        return (
          <li
            key={b.id}
            title={`${b.name}: ${b.description}${b.has ? "" : " (not earned yet)"}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              b.has ? "border-gold/30 bg-gold/10 text-gold" : "border-dashed border-border text-muted-foreground/60"
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {b.name}
            <span className="sr-only">
              : {b.description} {b.has ? "Earned." : "Not earned yet."}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Level ring, points breakdown and badges for a profile: `memberId` for a member (from the database). Without it,
 * it shows the signed-in member, or, without a database, what this browser holds.
 */
export function ReputationCard({ memberId, className }: { memberId?: string; className?: string }) {
  const { ready, user } = useSession()
  const subject = memberId ?? user?.id ?? null
  const [loaded, setLoaded] = useState<{ key: string; stats: RepStats } | null>(null)
  const [error, setError] = useState("")
  const key = `member:${subject ?? "local"}`

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getMemberReputation(subject)
      .then((s) => !stale && setLoaded({ key, stats: s }))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [subject, ready, key])

  const stats = loaded?.key === key ? loaded.stats : null

  if (error) return <p className="text-sm text-muted-foreground">Reputation could not be loaded.</p>
  if (!stats) {
    return (
      <div className={cn("glass flex flex-col gap-3 rounded-2xl p-5", className)} aria-busy="true" aria-label="Loading reputation">
        <div className="flex items-center gap-3">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-7 w-full" />
      </div>
    )
  }

  const rows: { label: string; value: number; each: number }[] = [
    { label: "Threads", value: stats.threads, each: POINTS.thread },
    { label: "Replies", value: stats.answers, each: POINTS.answer },
    { label: "Solutions", value: stats.accepted, each: POINTS.accepted },
    { label: "Likes", value: stats.likes, each: POINTS.like },
  ]

  return (
    <section aria-labelledby={`rep-${key}`} className={cn("glass flex flex-col gap-4 rounded-2xl p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`rep-${key}`} className="font-sans text-sm font-semibold tracking-normal">
          Reputation
        </h2>
        <Link href="/leaderboard" className="text-xs text-ion hover:underline">
          Leaderboard
        </Link>
      </div>
      <LevelRing points={stats.points} size={84} />
      <dl className="grid grid-cols-4 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-white/[0.03] px-1 py-2" title={`${r.each} points each`}>
            <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
            <dd className="text-sm font-semibold tabular">{compact(r.value)}</dd>
          </div>
        ))}
      </dl>
      <Badges stats={stats} />
    </section>
  )
}
