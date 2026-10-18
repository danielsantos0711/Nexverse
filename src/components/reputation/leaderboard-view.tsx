"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { TrophyIcon } from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { LevelChip, LevelRing } from "@/components/reputation/level-ring"
import { Skeleton } from "@/components/ui/skeleton"
import { getLeaderboard, LEVELS, PERIODS, POINTS, type LeaderRow, type Period } from "@/lib/community"
import { compact } from "@/lib/data"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const
const MEDALS = ["text-gold", "text-[#c9cfdb]", "text-[#e0a77a]"]

/** Who helped most this week, this month and of all time, from the same points as everyone's level. */
export function LeaderboardView() {
  const { ready, user } = useSession()
  const reduce = useReducedMotion()
  const [period, setPeriod] = useState<Period>("week")
  const [data, setData] = useState<Partial<Record<Period, LeaderRow[]>>>({})
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getLeaderboard(period)
      .then((rows) => !stale && setData((d) => ({ ...d, [period]: rows })))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [period, ready, user?.id])

  const rows = data[period]
  const you = rows?.find((r) => r.you)

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div role="tablist" aria-label="Period" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
          {PERIODS.map((p) => {
            const on = p.value === period
            return (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="leaderboard-panel"
                onClick={() => {
                  setError("")
                  setPeriod(p.value)
                }}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && <motion.span layoutId="leaderboard-period" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
                <span className="relative">{p.label}</span>
              </button>
            )
          })}
        </div>

        <div id="leaderboard-panel" role="tabpanel" aria-label={PERIODS.find((p) => p.value === period)?.label} aria-busy={!rows && !error}>
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              The leaderboard could not be loaded: {error}
            </p>
          ) : !rows ? (
            <ul className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-14 w-full rounded-xl" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-gold/10 text-gold">
                <TrophyIcon aria-hidden className="size-5" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {period === "all" ? "Nobody has earned points yet." : `Nobody has earned points ${period === "week" ? "this week" : "this month"} yet.`} Start a thread or answer one to be first.
              </p>
              <Link href="/forum" className="text-sm text-ion hover:underline">
                Go to the forum
              </Link>
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {rows.map((r, i) => (
                  <motion.li
                    key={`${period}-${r.who.handle ?? r.who.memberId ?? r.who.name}`}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px)" }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE, delay: reduce ? 0 : Math.min(i, 10) * 0.025 }}
                  >
                    <Row r={r} rank={i + 1} showLevel={period === "all"} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
        {!live && <p className="text-xs text-muted-foreground">This copy has no database, so the board is computed from the sample community (upvotes count as likes) plus what you did in this browser.</p>}
      </div>

      <aside aria-label="How points work" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        {you && (
          <section aria-labelledby="you-h" className="glass flex flex-col gap-3 rounded-xl p-4">
            <h2 id="you-h" className="font-sans text-sm font-semibold tracking-normal">
              You, {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
            </h2>
            {period === "all" ? (
              <LevelRing points={you.points} size={72} />
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="text-lg font-semibold text-foreground tabular">{compact(you.points)}</span> points, rank{" "}
                <span className="font-medium text-foreground tabular">#{rows!.indexOf(you) + 1}</span>
              </p>
            )}
          </section>
        )}
        <section aria-labelledby="points-h" className="glass rounded-xl p-4">
          <h2 id="points-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
            How points work
          </h2>
          <dl className="flex flex-col gap-1.5 text-sm">
            {[
              ["Start a thread", POINTS.thread],
              ["Reply", POINTS.answer],
              ["Your reply marked as the solution", POINTS.accepted],
              ["A like on your thread", POINTS.like],
              ["A reaction to your post", POINTS.reaction],
            ].map(([label, n]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="shrink-0 font-medium tabular">+{n}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Liking or reacting to your own posts earns nothing.</p>
        </section>
        <section aria-labelledby="levels-h" className="glass rounded-xl p-4">
          <h2 id="levels-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
            Levels
          </h2>
          <ol className="flex flex-col gap-2">
            {LEVELS.map((l) => (
              <li key={l.name} className="flex items-center justify-between gap-3 text-sm">
                <LevelChip points={l.min} />
                <span className="text-xs text-muted-foreground tabular">{compact(l.min)}+</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

function Row({ r, rank, showLevel }: { r: LeaderRow; rank: number; showLevel: boolean }) {
  const name = r.who.handle ? (
    <Link href={`/people/${r.who.handle}`} className="truncate rounded-sm font-medium hover:text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {r.who.name}
    </Link>
  ) : (
    <span className="truncate font-medium">{r.who.name}</span>
  )
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 sm:px-4", r.you ? "border-ion/40 bg-ion/[0.06]" : "border-border bg-card/40")}>
      <span className={cn("w-7 shrink-0 text-center font-mono text-sm tabular", rank <= 3 ? cn("font-semibold", MEDALS[rank - 1]) : "text-muted-foreground")}>
        {rank <= 3 ? <TrophyIcon aria-hidden className="mx-auto size-4" /> : rank}
        <span className="sr-only">Rank {rank}</span>
      </span>
      <PosterAvatar poster={r.who} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {name}
          {r.you && <span className="shrink-0 rounded-full bg-ion/15 px-1.5 text-[11px] text-ion">You</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[r.threads && `${compact(r.threads)} ${r.threads === 1 ? "thread" : "threads"}`, r.answers && `${compact(r.answers)} ${r.answers === 1 ? "reply" : "replies"}`, r.accepted && `${compact(r.accepted)} solved`]
            .filter(Boolean)
            .join(" · ") || "Likes and reactions"}
        </p>
      </div>
      {showLevel && <LevelChip points={r.points} className="hidden sm:inline-flex" />}
      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular">
        {compact(r.points)}
        <span className="sr-only"> points</span>
      </span>
    </div>
  )
}
