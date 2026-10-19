"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FileTextIcon, PlusIcon, TargetIcon, UsersIcon, XIcon } from "lucide-react"
import { primaryButton, rise, riseDelay, PosterAvatar } from "@/components/forum/forum-ui"
import { useNow } from "@/components/live/time"
import { Deadline, DifficultyBadge, Insignia, Reward, StatusBadge } from "@/components/missions/mission-bits"
import { MissionControl } from "@/components/missions/mission-control"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DIFFICULTIES,
  isDifficulty,
  listMissions,
  missionCounts,
  missionState,
  missionTags,
  STATUSES,
  subscribeMissions,
  type Difficulty,
  type Mission,
  type MissionStatus,
} from "@/lib/missions"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Sort = "newest" | "ending" | "reward"
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
  { value: "reward", label: "Biggest reward" },
]

const isStatus = (s: string): s is MissionStatus => s in STATUSES

/** Every mission with mission control on top, filters by status, difficulty and tag, and live updates. */
export function MissionsView() {
  const { ready, user } = useSession()
  const now = useNow()
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState<MissionStatus | "all">("all")
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all")
  const [tag, setTag] = useState<string>("")
  const [sort, setSort] = useState<Sort>("newest")
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filters can come in the address (?status=open&difficulty=pilot&tag=speech), from tag links and the home page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const s = q.get("status") ?? ""
    const d = q.get("difficulty") ?? ""
    const t = q.get("tag") ?? ""
    // Read once after mount: the page is prerendered without search params.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the database (or reads the address) once mounted; state is set when it answers
    if (isStatus(s)) setStatus(s)
    if (isDifficulty(d)) setDifficulty(d)
    if (/^[a-z0-9-]{1,24}$/.test(t)) setTag(t)
  }, [])

  const load = useCallback(() => {
    return listMissions()
      .then((list) => {
        setMissions(list)
        setError("")
      })
      .catch((e: Error) => {
        setError(e.message)
        setMissions((m) => m ?? [])
      })
  }, [])

  useEffect(() => {
    if (live && !ready) return
    void load()
    const stop = subscribeMissions(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => void load(), 400)
    })
    return () => {
      stop()
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [ready, user?.id, load])

  const counts = useMemo(() => (missions && now !== null ? missionCounts(missions, now) : null), [missions, now])
  const tags = useMemo(() => (missions ? missionTags(missions).slice(0, 10) : []), [missions])

  const shown = useMemo(() => {
    if (!missions || now === null) return []
    const list = missions.filter((m) => (status === "all" || missionState(m, now) === status) && (difficulty === "all" || m.difficulty === difficulty) && (!tag || m.tags.includes(tag)))
    const running = (m: Mission) => ["open", "in-progress", "review"].includes(missionState(m, now))
    if (sort === "ending") return list.sort((a, b) => Number(running(b)) - Number(running(a)) || a.deadline.localeCompare(b.deadline))
    if (sort === "reward") return list.sort((a, b) => b.reward - a.reward || b.createdAt.localeCompare(a.createdAt))
    // Newest first, but running missions before finished ones.
    return list.sort((a, b) => Number(running(b)) - Number(running(a)) || b.createdAt.localeCompare(a.createdAt))
  }, [missions, now, status, difficulty, tag, sort])

  const filtered = status !== "all" || difficulty !== "all" || Boolean(tag)
  const loading = missions === null || now === null
  const noneAtAll = !loading && !error && missions.length === 0

  function clearFilters() {
    setStatus("all")
    setDifficulty("all")
    setTag("")
  }

  return (
    <div className="flex flex-col gap-5">
      <MissionControl counts={counts} status={status} onStatus={setStatus} live={!loading && !error} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Difficulty" className="glass flex w-full max-w-full rounded-full p-1 sm:w-fit">
            {(["all", "cadet", "pilot", "commander"] as const).map((d) => {
              const on = difficulty === d
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "pressable inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm sm:flex-none sm:px-3 whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d !== "all" && <Insignia difficulty={d} className={cn("hidden sm:block", on && "text-primary-foreground")} />}
                  {d === "all" ? "Any rank" : DIFFICULTIES[d].label}
                </button>
              )
            })}
          </div>
          <label htmlFor="mission-sort" className="sr-only">
            Sort missions
          </label>
          <select
            id="mission-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value} className="bg-popover">
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <Link href="/missions/new" className={cn(primaryButton, "w-fit")}>
          <PlusIcon aria-hidden className="size-4" /> Post a mission
        </Link>
      </div>

      {tags.length > 0 && (
        <div role="group" aria-label="Filter by tag" className="-mt-1 flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = tag === t
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTag(on ? "" : t)}
                className={cn(
                  "pressable inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-ion/50 bg-ion/15 text-ion" : "border-border text-muted-foreground hover:border-white/20 hover:text-foreground",
                )}
              >
                #{t}
                {on && <XIcon aria-hidden className="size-3" />}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Missions could not be loaded ({error}).{" "}
          <button type="button" onClick={() => void load()} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      <div aria-busy={loading} aria-live="polite">
        {loading ? (
          <ul className="flex flex-col gap-3" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <Skeleton className="h-32 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : shown.length ? (
          <ol className="flex flex-col gap-3">
            {shown.map((m, i) => (
              <li key={m.id} className={rise} style={riseDelay(i)}>
                <MissionCard m={m} now={now} />
              </li>
            ))}
          </ol>
        ) : noneAtAll ? (
          <FirstMission />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <TargetIcon aria-hidden className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{filtered ? "No missions match these filters." : "No missions yet."}</p>
            {filtered ? (
              <button type="button" onClick={clearFilters} className="text-sm text-ion hover:underline">
                Clear filters
              </button>
            ) : (
              <Link href="/missions/new" className={primaryButton}>
                Post a mission
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const HOW_IT_WORKS = [
  { title: "Post", body: "Describe something you wish existed, list how you will judge it, and pledge points from your reputation." },
  { title: "Build", body: "Members join the crew, build it, and submit a project page, a GitHub repository or a paper before the deadline." },
  { title: "Pick", body: "You pick the winning entry. The winner gets the points and a badge; an unclaimed pledge goes back to you." },
]

/** No missions at all yet: say so plainly, invite the first one, and explain how a mission runs. */
function FirstMission() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-ion/30 bg-ion/[0.04] px-5 py-10 sm:px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
          <TargetIcon aria-hidden className="size-5" />
        </span>
        <h2 className="font-sans text-base font-semibold tracking-normal">No missions yet</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {live
            ? "Be the first to post one: a model, dataset or tool you wish existed, with points for whoever builds it."
            : "Missions you post in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can see them yet."}
        </p>
        <Link href="/missions/new" className={primaryButton}>
          <PlusIcon aria-hidden className="size-4" /> Post the first mission
        </Link>
      </div>
      <ol className="mx-auto grid w-full max-w-3xl gap-3 pt-2 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="rounded-lg border border-border bg-card/40 p-3">
            <p className="text-xs text-muted-foreground tabular">Step {i + 1}</p>
            <p className="text-sm font-medium">{step.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

const PATCH_TONE: Record<Difficulty, string> = {
  cadet: "border-ok/30 bg-ok/[0.08]",
  pilot: "border-ion/30 bg-ion/[0.08]",
  commander: "border-gold/35 bg-gold/[0.08]",
}

export function MissionCard({ m, now }: { m: Mission; now: number }) {
  const state = missionState(m, now)
  const finished = state === "completed" || state === "expired"
  return (
    <article className={cn("group relative flex gap-4 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03]", finished && "opacity-85")}>
      <span aria-hidden className={cn("hidden size-12 shrink-0 place-items-center rounded-full border sm:grid", PATCH_TONE[m.difficulty])}>
        <Insignia difficulty={m.difficulty} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={state} />
          <DifficultyBadge difficulty={m.difficulty} />
          {m.local && <span className="text-xs text-muted-foreground">Saved in this browser</span>}
        </div>
        <h2 className="font-sans text-base leading-snug font-semibold tracking-normal">
          <Link
            href={`/missions/${m.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
          >
            {m.title}
          </Link>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <PosterAvatar poster={m.poster} size={18} />
            {m.poster.name}
          </span>
          <span className="inline-flex items-center gap-1 tabular">
            <UsersIcon aria-hidden className="size-3.5" />
            {m.crewCount} {m.crewCount === 1 ? "pilot" : "pilots"}
          </span>
          <span className="inline-flex items-center gap-1 tabular">
            <FileTextIcon aria-hidden className="size-3.5" />
            {m.entryCount} {m.entryCount === 1 ? "entry" : "entries"}
          </span>
          {state === "completed" && m.winner && <span className="text-ok">Won by {m.winner.name}</span>}
          {!finished && <Deadline deadline={m.deadline} now={now} />}
        </div>
        {m.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {m.tags.map((t) => (
              <li key={t} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-muted-foreground">
                #{t}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Reward points={m.reward} />
      </div>
    </article>
  )
}
