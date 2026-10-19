"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRightIcon, SwordsIcon, TargetIcon } from "lucide-react"
import { useNow } from "@/components/live/time"
import { Deadline, Insignia, Reward } from "@/components/missions/mission-bits"
import { TaskBadge } from "@/components/arena/arena-bits"
import { Skeleton } from "@/components/ui/skeleton"
import { getRatings, listDuels, type Duel, type Rating } from "@/lib/arena"
import { isTakingEntries, listMissions, type Mission } from "@/lib/missions"

/** The three open missions with the biggest rewards, for the home page. */
export function MissionsToday() {
  const now = useNow()
  const [missions, setMissions] = useState<Mission[] | null>(null)

  useEffect(() => {
    let on = true
    listMissions()
      .then((all) => on && setMissions(all))
      .catch(() => on && setMissions([]))
    return () => {
      on = false
    }
  }, [])

  const open =
    missions && now !== null
      ? missions
          .filter((m) => isTakingEntries(m, now))
          .sort((a, b) => b.reward - a.reward)
          .slice(0, 3)
      : null

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <TargetIcon aria-hidden className="size-4 text-gold" />
        Open missions
      </div>
      {open === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/[0.1] px-4 py-5 text-sm text-muted-foreground">No mission is taking entries right now. Post one: describe the challenge, set a reward, and pilots sign up.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((m) => (
            <li key={m.id}>
              <Link href={`/missions/${m.id}`} className="press group flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 hover:bg-white/[0.06]">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05]">
                  <Insignia difficulty={m.difficulty} className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium group-hover:text-ion">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    <Deadline deadline={m.deadline} now={now} /> · {m.crewCount} {m.crewCount === 1 ? "pilot" : "pilots"}
                  </span>
                </span>
                <Reward points={m.reward} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href="/missions" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          See all missions <ArrowRightIcon aria-hidden className="size-3.5" />
        </Link>
        <Link href="/missions/new" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
          Post a mission
        </Link>
      </div>
    </div>
  )
}

/** The newest duel waiting for a verdict, and the top of the community's model ratings. */
export function ArenaToday() {
  const [duel, setDuel] = useState<Duel | null | undefined>(undefined)
  const [top, setTop] = useState<Rating[] | null>(null)

  useEffect(() => {
    let on = true
    listDuels()
      .then((all) => on && setDuel(all[0] ?? null))
      .catch(() => on && setDuel(null))
    // only ratings members' votes produced; never example numbers
    getRatings({ task: null, lang: null })
      .then((r) => on && setTop(r.source === "members" ? r.rows.slice(0, 4) : []))
      .catch(() => on && setTop([]))
    return () => {
      on = false
    }
  }, [])

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <SwordsIcon aria-hidden className="size-4 text-ion" />
        Blind duel
      </div>
      {duel === undefined ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : duel ? (
        <Link href={`/arena/${duel.id}`} className="press group flex flex-col gap-2 rounded-xl bg-white/[0.03] p-3 hover:bg-white/[0.06]">
          <TaskBadge task={duel.task} className="self-start" />
          <span className="line-clamp-2 text-sm group-hover:text-ion">{duel.prompt}</span>
          <span className="text-xs text-muted-foreground">Two answers, names hidden until you vote</span>
        </Link>
      ) : (
        <p className="rounded-xl border border-dashed border-white/[0.1] px-4 py-5 text-sm text-muted-foreground">No duel is waiting for a verdict. Post one: a prompt and two answers, names hidden until people vote.</p>
      )}
      {top && top.length > 0 && (
        <ol className="grid grid-cols-2 gap-2" aria-label="Top rated models">
          {top.map((r, i) => (
            <li key={r.model} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-2 text-xs">
              <span className="tabular text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.model}</span>
              <span className="tabular font-medium">{Math.round(r.rating)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href="/arena" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          Play duels <ArrowRightIcon aria-hidden className="size-3.5" />
        </Link>
        <Link href="/arena/ratings" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
          Ratings
        </Link>
      </div>
    </div>
  )
}
