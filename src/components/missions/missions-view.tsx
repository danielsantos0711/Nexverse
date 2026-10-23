"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BellRingIcon, FileTextIcon, GiftIcon, LayoutGridIcon, ListIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, TargetIcon, UserIcon, UsersIcon, UsersRoundIcon, XIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { GlowCard } from "@/components/hub/glow-card"
import { SpaceCover } from "@/components/missions/mission-cover"
import { TimeBar } from "@/components/missions/mission-extras"
import { accentRgb, MISSION_KIND_ORDER, MISSION_KINDS, type MissionKind } from "@/lib/missions-look"
import { listFollowedMissions } from "@/lib/missions-social"
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
import { Copy } from "@/components/content/copy"

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
  const [kind, setKind] = useState<MissionKind | "all">("all")
  const [query, setQuery] = useState("")
  const [only, setOnly] = useState<"" | "following" | "mine" | "team">("")
  const [followed, setFollowed] = useState<string[]>([])
  const [view, setView] = useState<"board" | "list">("board")
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = [only !== "", difficulty !== "all", sort !== "newest", tag !== ""].filter(Boolean).length
  const reduce = useReducedMotion()
  const search = useRef<HTMLInputElement>(null)

  // The board or list view is remembered in this browser; "/" jumps to the search box.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a per-browser preference once mounted
      if (localStorage.getItem("nexverse-missions-view") === "list") setView("list")
    } catch {}
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function pickView(v: "board" | "list") {
    setView(v)
    try {
      localStorage.setItem("nexverse-missions-view", v)
    } catch {}
  }

  useEffect(() => {
    if (!live || !ready || !user) return
    let stale = false
    listFollowedMissions().then((ids) => !stale && setFollowed(ids))
    return () => {
      stale = true
    }
  }, [ready, user])
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
    const q = query.trim().toLowerCase()
    const list = missions.filter(
      (m) =>
        (status === "all" || missionState(m, now) === status) &&
        (difficulty === "all" || m.difficulty === difficulty) &&
        (kind === "all" || m.kind === kind) &&
        (!tag || m.tags.includes(tag)) &&
        (!q || m.title.toLowerCase().includes(q) || m.brief.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q))) &&
        (only !== "following" || followed.includes(m.id)) &&
        (only !== "mine" || m.local || (user && m.poster.memberId === user.id)) &&
        (only !== "team" || m.team),
    )
    const running = (m: Mission) => ["open", "in-progress", "review"].includes(missionState(m, now))
    if (sort === "ending") return list.sort((a, b) => Number(running(b)) - Number(running(a)) || a.deadline.localeCompare(b.deadline))
    if (sort === "reward") return list.sort((a, b) => b.reward - a.reward || b.createdAt.localeCompare(a.createdAt))
    // Newest first, but running missions before finished ones.
    return list.sort((a, b) => Number(running(b)) - Number(running(a)) || b.createdAt.localeCompare(a.createdAt))
  }, [missions, now, status, difficulty, tag, sort, kind, query, only, followed, user])

  const filtered = status !== "all" || difficulty !== "all" || Boolean(tag) || kind !== "all" || Boolean(query.trim()) || Boolean(only)
  const loading = missions === null || now === null
  const noneAtAll = !loading && !error && missions.length === 0

  function clearFilters() {
    setStatus("all")
    setDifficulty("all")
    setTag("")
    setKind("all")
    setQuery("")
    setOnly("")
  }

  // The running mission with the biggest reward leads the board.
  const featured = view === "board" && !filtered && now !== null ? shown.find((m) => ["open", "in-progress", "review"].includes(missionState(m, now)) && m.reward > 0)?.id : undefined

  return (
    <div className="flex flex-col gap-5">
      {/* mission control's counters only once there is something to count (a strip of zeros says nothing) */}
      {(missions?.length ?? 0) > 0 && <MissionControl counts={counts} status={status} onStatus={setStatus} live={!loading && !error} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex min-w-0 flex-1 items-center">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <span className="sr-only">Search missions</span>
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search missions"
            className="h-10 w-full rounded-full border border-input bg-background/60 pr-10 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <kbd className="pointer-events-none absolute right-3 hidden rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">/</kbd>
        </label>
        <div role="radiogroup" aria-label="Type" className="flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 sm:w-fit">
          {(["all", ...MISSION_KIND_ORDER] as const).map((k) => {
            const on = kind === k
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)} className={cn("pressable relative flex-1 shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors sm:flex-none", on ? "text-background" : "text-muted-foreground hover:text-foreground")}>
                {on && <motion.span layoutId="mission-kind" className="absolute inset-0 rounded-full bg-foreground" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }} />}
                <span className="relative">{k === "all" ? "All types" : MISSION_KINDS[k].label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Round 12: the finer filters (who, rank, order, tags) fold behind one button, so the list starts sooner. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className={cn("pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors", moreOpen || moreActive ? "border-ion/40 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
        >
          <SlidersHorizontalIcon aria-hidden className="size-3.5" /> Filters
          {moreActive > 0 && <span className="tabular text-xs text-ion">{moreActive}</span>}
        </button>
        <div role="radiogroup" aria-label="View" className="ml-auto flex rounded-full border border-border bg-card p-0.5">
          {(
            [
              ["board", "Board", LayoutGridIcon],
              ["list", "List", ListIcon],
            ] as const
          ).map(([v, label, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={label} title={label} onClick={() => pickView(v)} className={cn("pressable grid size-8 place-items-center rounded-full transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              <Icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {moreOpen && (
      <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["following", "Following", BellRingIcon],
            ["mine", "Posted by me", UserIcon],
            ["team", "Team missions", UsersRoundIcon],
          ] as const
        ).map(([id, label, Icon]) => {
          const on = only === id
          const disabled = id !== "team" && live && !user
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              title={disabled ? "Sign in first" : undefined}
              onClick={() => setOnly(on ? "" : id)}
              className={cn("pressable inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50", on ? "border-ion/50 bg-ion/15 text-ion" : "border-border text-muted-foreground hover:text-foreground")}
            >
              <Icon aria-hidden className="size-3.5" /> {label}
              {id === "following" && followed.length > 0 && <span className="tabular opacity-70">{followed.length}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Difficulty" className="border border-border bg-card flex w-full max-w-full rounded-full p-1 sm:w-fit">
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
                  {d === "all" ? <Copy k="missions.missions-view.any-rank">Any rank</Copy> : DIFFICULTIES[d].label}
                </button>
              )
            })}
          </div>
          <label htmlFor="mission-sort" className="sr-only">
            <Copy k="missions.missions-view.sort-missions">Sort missions</Copy>
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
      </>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Missions could not be loaded ({error}).{" "}
          <button type="button" onClick={() => void load()} className="underline underline-offset-2">
            <Copy k="missions.missions-view.try-again">Try again</Copy>
          </button>
        </p>
      )}

      <div aria-busy={loading} aria-live="polite">
        {loading ? (
          <ul className={cn(view === "board" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3")} aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className={cn(view === "board" && i === 0 && "sm:col-span-2")}>
                <Skeleton className={cn("w-full rounded-2xl", view === "board" ? "h-64" : "h-32")} />
              </li>
            ))}
          </ul>
        ) : shown.length ? (
          view === "board" ? (
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((m, i) => (
                  <motion.li
                    key={m.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, transform: "translateY(10px) scale(0.98)" }}
                    animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                    exit={{ opacity: 0, transform: "scale(0.97)", transition: { duration: 0.15 } }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(i, 9) * 0.03 }}
                    className={cn(m.id === featured && "sm:col-span-2")}
                  >
                    {m.id === featured ? (
                      <GlowCard className="h-full rounded-2xl">
                        <MissionTile m={m} now={now} big />
                      </GlowCard>
                    ) : (
                      <MissionTile m={m} now={now} />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          ) : (
            <ol className="flex flex-col gap-3">
              {shown.map((m, i) => (
                <li key={m.id} className={rise} style={riseDelay(i)}>
                  <MissionCard m={m} now={now} />
                </li>
              ))}
            </ol>
          )
        ) : noneAtAll ? (
          <FirstMission />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <TargetIcon aria-hidden className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{filtered ? <Copy k="missions.missions-view.no-missions-match-these-filters">No missions match these filters.</Copy> : <Copy k="missions.missions-view.no-missions-yet">No missions yet.</Copy>}</p>
            {filtered ? (
              <button type="button" onClick={clearFilters} className="text-sm text-ion hover:underline">
                <Copy k="missions.missions-view.clear-filters">Clear filters</Copy>
              </button>
            ) : (
              <Link href="/missions/new" className={primaryButton}>
                <Copy k="missions.missions-view.post-a-mission">Post a mission</Copy>
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
        <h2 className="font-sans text-base font-semibold tracking-normal"><Copy k="missions.missions-view.no-missions-yet">No missions yet</Copy></h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {live
            ? <Copy k="missions.missions-view.be-the-first-to-post" multiline>Be the first to post one: a model, dataset or tool you wish existed, with points for whoever builds it.</Copy>
            : <Copy k="missions.missions-view.missions-you-post-in-this" multiline>Missions you post in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can see them yet.</Copy>}
        </p>
        <Link href="/missions/new" className={primaryButton}>
          <PlusIcon aria-hidden className="size-4" /> <Copy k="missions.missions-view.post-the-first-mission">Post the first mission</Copy>
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
          {m.local && <span className="text-xs text-muted-foreground"><Copy k="missions.missions-view.saved-in-this-browser">Saved in this browser</Copy></span>}
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

/** A mission on the board: its cover and colour, type, status, reward, crew and how much time is left. */
export function MissionTile({ m, now, big = false }: { m: Mission; now: number; big?: boolean }) {
  const state = missionState(m, now)
  const finished = state === "completed" || state === "expired"
  return (
    <article
      style={{ "--accent-rgb": accentRgb(m.accent) } as React.CSSProperties}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[rgb(var(--accent-rgb)/0.45)] active:scale-[0.99]",
        finished && "opacity-80",
      )}
    >
      <SpaceCover seed={m.id} cover={m.cover} accent={m.accent} className={cn("transition-transform duration-500 ease-out", big ? "h-40 sm:h-48" : "h-28")}>
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{MISSION_KINDS[m.kind].label}</span>
          {m.team && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
              <UsersRoundIcon aria-hidden className="size-3" /> Team
            </span>
          )}
        </div>
        <span className="absolute top-2.5 right-2.5 rounded-full bg-black/45 px-2 py-0.5 backdrop-blur-sm">
          <Reward points={m.reward} />
        </span>
      </SpaceCover>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={state} />
          <DifficultyBadge difficulty={m.difficulty} />
        </div>
        <h2 className={cn("font-sans leading-snug font-semibold tracking-normal", big ? "text-lg" : "text-base")}>
          <Link href={`/missions/${m.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-[rgb(var(--accent-rgb))]">
            {m.title}
          </Link>
        </h2>
        {big && m.brief && <p className="line-clamp-2 text-sm text-muted-foreground">{m.brief.replace(/[#*_`>]/g, "")}</p>}
        {m.prize && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GiftIcon aria-hidden className="size-3.5 text-[rgb(var(--accent-rgb))]" /> <span className="truncate">{m.prize}</span>
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <PosterAvatar poster={m.poster} size={16} />
              <span className="max-w-28 truncate">{m.poster.name}</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular">
              <UsersIcon aria-hidden className="size-3.5" />
              {m.crewCount}
            </span>
            <span className="inline-flex items-center gap-1 tabular">
              <FileTextIcon aria-hidden className="size-3.5" />
              {m.entryCount}
            </span>
            {m.milestones.length > 0 && <span className="tabular">{m.milestones.length} steps</span>}
            {state === "completed" && m.winner ? <span className="text-ok">Won by {m.winner.name}</span> : !finished && <Deadline deadline={m.deadline} now={now} />}
          </div>
          {!finished && <TimeBar m={m} now={now} />}
        </div>
      </div>
    </article>
  )
}
