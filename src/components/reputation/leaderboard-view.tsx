"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { TrophyIcon } from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { MemberPlanet } from "@/components/planet/member-planet"
import { GlassTabs } from "@/components/glass/glass-tabs"
import { AmberSphere } from "@/components/reputation/fx/amber-sphere"
import { LEVEL_COLORS, LevelChip, LevelRing } from "@/components/reputation/level-ring"
import { Skeleton } from "@/components/ui/skeleton"
import { CAP_INFO, isCap, useCaps } from "@/lib/caps"
import { getLeaderboard, levelFor, PERIODS, type LeaderRow, type Period } from "@/lib/community"
import { useLevels, usePoints } from "@/lib/lists/hooks"
import { compact } from "@/lib/data"
import { useSession } from "@/lib/store"
import { Copy } from "@/components/content/copy"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const
const MEDALS = ["text-gold", "text-[#c9cfdb]", "text-[#e0a77a]"]

/** Who helped most this week, this month and of all time, from the same points as everyone's level. */
export function LeaderboardView() {
  const POINTS = usePoints()
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
        <GlassTabs
          tabs={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          value={period}
          onChange={(v) => {
            setError("")
            setPeriod(v)
          }}
          label="Period"
          controls="leaderboard-panel"
          className="w-fit max-w-full"
        />

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
            <div className="liquid-glass-flat flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-gold/10 text-gold">
                <TrophyIcon aria-hidden className="size-5" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {period === "all" ? "No stars have risen yet." : `No stars have risen ${period === "week" ? "this week" : "this month"} yet.`} Start a thread or answer one to be the first light in this sky.
              </p>
              <Link href="/forum" className="text-sm text-ion hover:underline">
                Go to the forum
              </Link>
            </div>
          ) : (
            <>
              <Podium rows={rows.slice(0, 3)} />
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
            </>
          )}
        </div>
        {!live && <p className="text-xs text-muted-foreground">This copy has no database, so the board only counts what you did in this browser.</p>}
      </div>

      <aside aria-label="How points work" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        {you && (
          <section aria-labelledby="you-h" className="liquid-glass relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4">
            <YourStar points={you.points} />
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
        <section id="how-points" aria-labelledby="points-h" className="liquid-glass scroll-mt-24 rounded-2xl p-4">
          <h2 id="points-h" className="mb-3 font-sans text-sm font-semibold tracking-normal">
            <Copy k="leaderboard.points.title">How points work</Copy>
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
        <Unlocks />
      </aside>
    </div>
  )
}

/** Your level as an Amber Sphere in the corner of your card, brighter as you near the next level. */
function YourStar({ points }: { points: number }) {
  const levels = useLevels()
  const info = levelFor(points, levels)
  const [amber, gold] = LEVEL_COLORS[info.level.name] ?? LEVEL_COLORS.Stardust
  return <AmberSphere amber={amber} gold={gold} energy={info.progress} size={88} className="pointer-events-none absolute -top-3 -right-3 opacity-90" />
}

/** "Post outside links, publish projects and the Contributor badge". */
function sentence(parts: string[]) {
  const words = parts.map((p, i) => (i === 0 ? p : p.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())))
  const text = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** What each reputation tier unlocks, from the tiers the admins set (the database checks the same list). */
function Unlocks() {
  const caps = useCaps()
  const rows = caps.tiers
    .map((t) => {
      const role = t.grantsRole ? caps.roles.find((r) => r.key === t.grantsRole) : null
      const powers = t.caps.filter(isCap).map((c) => CAP_INFO[c].label)
      return { key: t.key, label: t.label, min: t.minPoints, text: [...powers, ...(role ? [`the ${role.label} badge`] : [])] }
    })
    .filter((t) => t.text.length || t.min === 0)
  if (!rows.length) return null
  return (
    <section aria-labelledby="unlocks-h" className="liquid-glass rounded-2xl p-4">
      <h2 id="unlocks-h" className="mb-1 font-sans text-sm font-semibold tracking-normal">
        What points unlock
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">Every member can start threads, reply, chat and send messages from day one. More opens up as you help.</p>
      <ol className="flex flex-col gap-2.5">
        {rows.map((t) => (
          <li key={t.key} className="flex flex-col gap-0.5 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground tabular">{compact(t.min)}+</span>
            </p>
            <p className="text-xs text-muted-foreground">{t.text.length ? sentence(t.text) : "Where everyone starts."}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A member's profile address; null for "You" in a browser-only copy. */
const whoHref = (r: LeaderRow) => (r.who.memberId ? (`/people/${r.who.memberId}` as const) : null)

function Row({ r, rank, showLevel }: { r: LeaderRow; rank: number; showLevel: boolean }) {
  const href = whoHref(r)
  const name = href ? (
    <Link href={href} className="truncate rounded-sm font-medium hover:text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {r.who.name}
    </Link>
  ) : (
    <span className="truncate font-medium">{r.who.name}</span>
  )
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 sm:px-4", r.you ? "border-ion/40 bg-ion/[0.06]" : "border-white/[0.07] bg-white/[0.025]")}>
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

/** The top three as worlds: first in the middle and raised, each planet grown by its points for the period. */
function Podium({ rows }: { rows: LeaderRow[] }) {
  if (rows.length < 3) return null
  const order = [rows[1], rows[0], rows[2]]
  return (
    <ol aria-label="Top three" className="liquid-glass-flat mb-4 grid grid-cols-3 items-end gap-2 rounded-3xl px-2 pt-2 pb-4 sm:gap-6 sm:px-6">
      {order.map((r) => {
        const rank = rows.indexOf(r) + 1
        const seed = r.who.handle ?? r.who.memberId ?? r.who.name
        return (
          <li key={seed} className={cn("flex min-w-0 flex-col items-center gap-1 text-center", rank === 1 ? "order-2 sm:-translate-y-3" : rank === 2 ? "order-1" : "order-3")}>
            <MemberPlanet
              handle={seed}
              size={rank === 1 ? 168 : 132}
              className="max-w-full"
              label={`${r.who.name}, rank ${rank}`}
              stats={{ points: r.points, threads: r.threads, replies: r.answers, accepted: r.accepted, collections: r.collections, events: r.eventsHosted }}
            />
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", MEDALS[rank - 1])}>
              <TrophyIcon aria-hidden className="size-3.5" /> {rank === 1 ? "First" : rank === 2 ? "Second" : "Third"}
            </span>
            {whoHref(r) ? (
              <Link href={whoHref(r)!} className="pressable max-w-full truncate text-sm font-medium hover:text-ion">
                {r.who.name}
              </Link>
            ) : (
              <span className="max-w-full truncate text-sm font-medium">{r.who.name}</span>
            )}
            <span className="text-xs text-muted-foreground tabular">{compact(r.points)} points</span>
          </li>
        )
      })}
    </ol>
  )
}
