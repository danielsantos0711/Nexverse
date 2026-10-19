"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  AwardIcon,
  CheckIcon,
  CircleCheckBigIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FlagIcon,
  GitBranchIcon,
  HourglassIcon,
  LogOutIcon,
  RocketIcon,
  ScrollTextIcon,
  SendIcon,
  Trash2Icon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { AvatarStack } from "@/components/events/event-bits"
import { Breadcrumbs, PosterAvatar } from "@/components/forum/forum-ui"
import { PostBody } from "@/components/forum/post-body"
import { TimeAgo, useNow } from "@/components/live/time"
import { Deadline, deadlineText, DifficultyBadge, Reward, StatusBadge } from "@/components/missions/mission-bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { Who } from "@/lib/community"
import {
  deleteMission,
  ENTRY_KINDS,
  entryHref,
  entryLabel,
  getMission,
  getMissionCrew,
  isTakingEntries,
  joinCrew,
  leaveCrew,
  LIMITS,
  missionState,
  missionTimeline,
  pickWinner,
  REVIEW_GRACE_DAYS,
  submitEntry,
  subscribeMissions,
  validateEntry,
  withdrawEntry,
  type EntryKind,
  type Mission,
  type MissionCrew,
  type MissionEntry,
  type TimelineEvent,
} from "@/lib/missions"
import { listMyProjects, type Project } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

const sameWho = (a: Who, b: Who) => (a.memberId ? a.memberId === b.memberId : a.handle ? a.handle === b.handle : a.name === b.name)

/** One mission: brief, criteria, crew, entries, the winner and a timeline of everything that happened. */
export function MissionDetail({ id }: { id: string }) {
  const { ready, user } = useSession()
  const [mission, setMission] = useState<Mission | null | undefined>(undefined)
  const [crew, setCrew] = useState<MissionCrew | null>(null)
  const [error, setError] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const m = await getMission(id)
      setMission(m)
      if (m) {
        document.title = `${m.title} · Nexverse`
        setCrew(await getMissionCrew(m))
      }
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    if (live && !ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the database (or reads the address) once mounted; state is set when it answers
    void load()
    const stop = subscribeMissions(() => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void load(), 300)
    }, id)
    return () => {
      stop()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [id, load, ready, user?.id])

  if (error && !mission) return <Missing title="This mission could not be loaded" detail={error} />
  if (mission === undefined) return <PageSkeleton />
  if (mission === null) return <Missing title="This mission is not here" detail="It may have been called off by the member who posted it." />
  return <MissionPage m={mission} crew={crew} reload={load} />
}

function MissionPage({ m, crew, reload }: { m: Mission; crew: MissionCrew | null; reload: () => Promise<void> }) {
  const router = useRouter()
  const now = useNow()
  const { user } = useSession()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState("")
  const state = now === null ? null : missionState(m, now)
  const isPoster = m.local || Boolean(user && m.poster.memberId === user.id)
  const readOnly = m.sample && live
  const winnerEntry = crew?.entries.find((e) => e.id === m.winnerEntryId) ?? null

  async function remove() {
    setConfirmDelete(false)
    try {
      await deleteMission(m.id)
      router.push("/missions")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Missions", href: "/missions" }, { label: m.title }]} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-7">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {state ? <StatusBadge status={state} /> : <Skeleton className="h-5 w-20 rounded-full" />}
              <DifficultyBadge difficulty={m.difficulty} />
              {readOnly && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">Example mission</span>}
              {m.local && <span className="text-xs text-muted-foreground">Saved in this browser only</span>}
            </div>
            <h1 className="text-xl leading-snug font-semibold tracking-[-0.015em] md:text-2xl">{m.title}</h1>
            <WhoLine who={m.poster} prefix="Posted by" date={m.createdAt} />
          </header>

          <dl className="glass grid grid-cols-2 gap-4 rounded-xl p-4 sm:grid-cols-4 md:p-5">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Reward</dt>
              <dd>
                <Reward points={m.reward} size="lg" />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{now !== null && Date.parse(m.deadline) < now ? "Deadline was" : "Deadline"}</dt>
              <dd className="text-sm">
                {now === null ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <span className="flex flex-col">
                    <span className="font-medium tabular">{deadlineText(m.deadline, now)}</span>
                    <time dateTime={m.deadline} className="text-xs text-muted-foreground">
                      {new Date(m.deadline).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Crew</dt>
              <dd className="text-lg font-semibold tabular">{m.crewCount}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Entries</dt>
              <dd className="text-lg font-semibold tabular">{m.entryCount}</dd>
            </div>
          </dl>

          {!isPoster && !readOnly && now !== null && isTakingEntries(m, now) && (
            <a
              href="#crew"
              className="pressable inline-flex h-10 w-fit items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
            >
              <RocketIcon aria-hidden className="size-4" /> Accept or submit an entry
            </a>
          )}

          {m.status === "completed" && m.winner && <WinnerBanner m={m} entry={winnerEntry} />}

          <section aria-labelledby="brief-h" className="flex flex-col gap-2">
            <h2 id="brief-h" className="font-sans text-base font-semibold tracking-normal">
              Brief
            </h2>
            {m.brief ? <PostBody source={m.brief} /> : <p className="text-sm text-muted-foreground">No brief beyond the title and criteria.</p>}
            {m.tags.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Tags">
                {m.tags.map((t) => (
                  <li key={t}>
                    <Link href={`/missions?tag=${t}`} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                      #{t}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="criteria-h" className="flex flex-col gap-3">
            <h2 id="criteria-h" className="font-sans text-base font-semibold tracking-normal">
              Acceptance criteria
            </h2>
            <ul className="flex flex-col gap-2">
              {m.criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm">
                  <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", m.status === "completed" ? "border-ok/50 bg-ok/15 text-ok" : "border-white/20")}>
                    {m.status === "completed" && <CheckIcon className="size-3" />}
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </section>

          <EntriesSection m={m} crew={crew} isPoster={isPoster && !readOnly} now={now} reload={reload} />

          <section aria-labelledby="timeline-h" className="flex flex-col gap-3">
            <h2 id="timeline-h" className="font-sans text-base font-semibold tracking-normal">
              Timeline
            </h2>
            {crew && now !== null ? <Timeline events={missionTimeline(m, crew, now)} now={now} /> : <Skeleton className="h-32 w-full rounded-xl" />}
          </section>

          {isPoster && !readOnly && m.status !== "completed" && m.entryCount === 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon aria-hidden /> Call off this mission
              </Button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <aside id="crew" aria-label="Crew and your entry" className="scroll-mt-20 flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <CrewPanel m={m} crew={crew} isPoster={isPoster} readOnly={readOnly} now={now} reload={reload} />
          {!isPoster && !readOnly && crew && now !== null && (isTakingEntries(m, now) || crew.myEntry) && <EntryForm m={m} crew={crew} now={now} reload={reload} />}
        </aside>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call off this mission?</DialogTitle>
            <DialogDescription>
              The mission and its crew list are removed
              {m.reward > 0 ? ` and the ${m.reward} points you pledged come back to you` : ""}. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove}>
              Call it off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WhoLine({ who, prefix, date }: { who: Who; prefix: string; date?: string }) {
  const inner = (
    <>
      <PosterAvatar poster={who} size={24} />
      <span>
        {prefix} <span className="font-medium text-foreground">{who.name}</span>
        {date && (
          <>
            {" "}
            · <TimeAgo date={date} />
          </>
        )}
      </span>
    </>
  )
  return who.handle ? (
    <Link
      href={`/people/${who.handle}`}
      className="flex w-fit items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {inner}
    </Link>
  ) : (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">{inner}</p>
  )
}

/** The winner, with a medal that lands once (a still medal with reduced motion). */
function WinnerBanner({ m, entry }: { m: Mission; entry: MissionEntry | null }) {
  const reduce = useReducedMotion()
  return (
    <section aria-label="Winner" className="relative overflow-hidden rounded-xl border border-ok/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(110_231_183/0.14),transparent_60%)] p-4 md:p-5">
      <div className="flex items-start gap-4">
        <motion.span
          aria-hidden
          initial={reduce ? false : { scale: 0.4, rotate: -25, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.45, duration: 0.7 }}
          className="relative grid size-12 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/15 text-gold shadow-[0_0_24px_rgb(216_197_158/0.25)]"
        >
          <TrophyIcon className="size-6" />
          {!reduce &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full bg-gold"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: Math.cos((i / 6) * Math.PI * 2) * 34,
                  y: Math.sin((i / 6) * Math.PI * 2) * 34,
                  opacity: 0,
                }}
                transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
              />
            ))}
        </motion.span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-ok uppercase">Mission accomplished</p>
          <p className="text-base">
            <span className="font-semibold">{m.winner?.name}</span> won
            {m.reward > 0 ? ` ${m.reward.toLocaleString("en")} reputation points` : ""} and the{" "}
            <span className="inline-flex items-center gap-1 text-gold">
              <AwardIcon aria-hidden className="size-4" />
              {m.difficulty === "commander" ? "Commander" : "Mission accomplished"}
            </span>{" "}
            badge.
          </p>
          {entry && <EntryLink entry={entry} className="mt-1" />}
        </div>
      </div>
    </section>
  )
}

const KIND_ICON: Record<EntryKind, typeof FileTextIcon> = {
  project: RocketIcon,
  repo: GitBranchIcon,
  paper: ScrollTextIcon,
}

function EntryLink({ entry, className }: { entry: Pick<MissionEntry, "kind" | "url">; className?: string }) {
  const { href, internal } = entryHref(entry)
  const Icon = KIND_ICON[entry.kind]
  const label = entryLabel(entry)
  const cls = cn("inline-flex max-w-full min-w-0 items-center gap-1.5 text-sm text-ion hover:underline", className)
  return internal ? (
    <Link href={href as never} className={cls}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

function EntriesSection({ m, crew, isPoster, now, reload }: { m: Mission; crew: MissionCrew | null; isPoster: boolean; now: number | null; reload: () => Promise<void> }) {
  const [picking, setPicking] = useState<MissionEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const canPick = isPoster && now !== null && m.status !== "completed" && missionState(m, now) !== "expired"

  async function confirmPick() {
    if (!picking) return
    setBusy(true)
    setError("")
    try {
      await pickWinner(m.id, picking.id)
      setPicking(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="entries-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="entries-h" className="font-sans text-base font-semibold tracking-normal">
          Entries {crew && <span className="text-sm font-normal text-muted-foreground tabular">({crew.entries.length})</span>}
        </h2>
        {canPick && crew && crew.entries.length > 0 && (
          <p className="text-xs text-muted-foreground">Check each entry against the criteria, then pick the winner. You have until {REVIEW_GRACE_DAYS} days after the deadline.</p>
        )}
      </div>
      {!crew ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : crew.entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {now !== null && isTakingEntries(m, now) ? "No entries yet. The first pilot to submit puts the mission into review." : "Nobody submitted an entry."}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {crew.entries.map((e) => {
            const won = e.id === m.winnerEntryId
            return (
              <li key={e.id} className={cn("flex flex-col gap-2 rounded-xl border bg-card/40 p-4", won ? "border-ok/40 bg-ok/[0.04]" : "border-border")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <PosterAvatar poster={e.author} size={22} />
                    <span className="font-medium">{e.author.name}</span>
                    <span className="text-xs text-muted-foreground">
                      <TimeAgo date={e.createdAt} />
                    </span>
                    {won && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">
                        <TrophyIcon aria-hidden className="size-3" /> Winner
                      </span>
                    )}
                    {e.mine && !won && <span className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">Your entry</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{ENTRY_KINDS[e.kind].label}</span>
                </div>
                <EntryLink entry={e} />
                {e.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{e.notes}</p>}
                {canPick && (
                  <div>
                    <Button size="sm" variant="secondary" onClick={() => setPicking(e)}>
                      <TrophyIcon aria-hidden /> Pick as winner
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <Dialog open={Boolean(picking)} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick {picking?.author.name}’s entry?</DialogTitle>
            <DialogDescription>
              {picking?.author.name} gets {m.reward > 0 ? `the ${m.reward} points you pledged and ` : ""}the mission badge, and everyone on the crew is told. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPicking(null)}>
              Not yet
            </Button>
            <Button onClick={confirmPick} disabled={busy}>
              {busy ? "Picking…" : "Pick the winner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function CrewPanel({ m, crew, isPoster, readOnly, now, reload }: { m: Mission; crew: MissionCrew | null; isPoster: boolean; readOnly: boolean; now: number | null; reload: () => Promise<void> }) {
  const router = useRouter()
  const { user } = useSession()
  const reduce = useReducedMotion()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const open = now !== null && isTakingEntries(m, now)
  const signedIn = !live || Boolean(user)

  async function toggle() {
    if (!crew || busy) return
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    setBusy(true)
    setError("")
    try {
      if (crew.joined) {
        await leaveCrew(m.id)
        setStatus("You left the crew.")
      } else {
        await joinCrew(m.id)
        setStatus("You’re on the crew. Submit your entry before the deadline.")
      }
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="crew-h" className="glass flex flex-col gap-4 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="crew-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
          <UsersIcon aria-hidden className="size-4 text-ion" /> Crew
        </h2>
        {crew && (
          <span className="text-xs text-muted-foreground tabular">
            {crew.crew.length} {crew.crew.length === 1 ? "pilot" : "pilots"}
          </span>
        )}
      </div>
      {!crew ? (
        <Skeleton className="h-8 w-2/3" />
      ) : crew.crew.length ? (
        <ul className="flex flex-col gap-2">
          {crew.crew.slice(0, 8).map((c, i) => (
            <motion.li
              key={`${c.who.memberId ?? c.who.handle ?? c.who.name}-${i}`}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.25,
                delay: Math.min(i, 8) * 0.04,
                ease: EASE,
              }}
              className="flex items-center gap-2 text-sm"
            >
              <PosterAvatar poster={c.who} size={24} />
              <span className="min-w-0 flex-1 truncate">{c.mine ? "You" : c.who.name}</span>
              {crew.entries.some((e) => (c.mine ? e.mine : sameWho(e.author, c.who))) && <span className="text-[11px] text-ok">Entered</span>}
              <span className="text-[11px] text-muted-foreground">
                <TimeAgo date={c.joinedAt} />
              </span>
            </motion.li>
          ))}
          {crew.crew.length > 8 && (
            <li>
              <AvatarStack people={crew.crew.slice(8).map((c) => c.who)} max={10} size={22} label={`${crew.crew.length - 8} more pilots`} />
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{open ? "No pilots yet. Be the first to accept." : "Nobody flew this one."}</p>
      )}

      {readOnly ? (
        <p className="text-xs text-muted-foreground">This is an example, so it can’t be accepted. Real missions from members appear on the missions page.</p>
      ) : isPoster ? (
        <p className="text-xs text-muted-foreground">You posted this mission. Pilots’ entries appear on this page for you to review.</p>
      ) : open && crew ? (
        <Button onClick={toggle} disabled={busy || Boolean(crew.joined && crew.myEntry)} variant={crew.joined ? "secondary" : "default"} className="h-10 w-full rounded-full">
          {crew.joined ? (
            <>
              <LogOutIcon aria-hidden /> Leave the crew
            </>
          ) : (
            <>
              <RocketIcon aria-hidden /> Accept mission
            </>
          )}
        </Button>
      ) : null}
      {crew?.joined && crew.myEntry && open && <p className="text-xs text-muted-foreground">Withdraw your entry first if you want to leave the crew.</p>}
      {!signedIn && open && !readOnly && <p className="text-xs text-muted-foreground">Sign in to accept. It takes an email address and nothing else.</p>}
      <p role="status" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
        {error || status}
      </p>
    </section>
  )
}

function EntryForm({ m, crew, now, reload }: { m: Mission; crew: MissionCrew; now: number; reload: () => Promise<void> }) {
  const router = useRouter()
  const { user } = useSession()
  const mine = crew.myEntry
  const [editing, setEditing] = useState(!mine)
  const [kind, setKind] = useState<EntryKind>(mine?.kind ?? "repo")
  const [url, setUrl] = useState(mine?.url ?? "")
  const [notes, setNotes] = useState(mine?.notes ?? "")
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [errors, setErrors] = useState<Partial<Record<"url" | "notes" | "form", string>>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState("")
  const open = isTakingEntries(m, now)
  const signedIn = !live || Boolean(user)

  useEffect(() => {
    if (kind !== "project" || projects) return
    let stale = false
    listMyProjects()
      .then((list) => !stale && setProjects(list.filter((p) => p.status === "published")))
      .catch(() => !stale && setProjects([]))
    return () => {
      stale = true
    }
  }, [kind, projects])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const found = validateEntry({ kind, url, notes })
    setErrors(found)
    if (found.url || found.notes) {
      document.getElementById(found.url ? "entry-url" : "entry-notes")?.focus()
      return
    }
    setBusy(true)
    try {
      await submitEntry(m.id, { kind, url, notes })
      setDone(mine ? "Entry updated." : "Entry submitted. The poster has been told.")
      setEditing(false)
      await reload()
    } catch (err) {
      setErrors({ form: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    setBusy(true)
    try {
      await withdrawEntry(m.id)
      setUrl("")
      setNotes("")
      setEditing(true)
      setDone("Entry withdrawn.")
      await reload()
    } catch (err) {
      setErrors({ form: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (mine && !editing) {
    return (
      <section aria-labelledby="entry-h" className="flex flex-col gap-3 rounded-xl border border-ok/30 bg-ok/[0.04] p-4">
        <h2 id="entry-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
          <CircleCheckBigIcon aria-hidden className="size-4 text-ok" /> Your entry is in
        </h2>
        <EntryLink entry={mine} />
        {mine.notes && <p className="line-clamp-4 text-sm text-muted-foreground">{mine.notes}</p>}
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit entry
            </Button>
            <Button size="sm" variant="ghost" onClick={withdraw} disabled={busy}>
              Withdraw
            </Button>
          </div>
        )}
        <p role="status" className={cn("text-sm", errors.form ? "text-destructive" : done ? "text-muted-foreground" : "sr-only")}>
          {errors.form || done}
        </p>
      </section>
    )
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="entry-h" className="glass flex flex-col gap-4 rounded-xl p-4">
      <h2 id="entry-h" className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
        <FlagIcon aria-hidden className="size-4 text-ion" /> {mine ? "Edit your entry" : "Submit an entry"}
      </h2>
      <div role="radiogroup" aria-label="Kind of entry" className="grid grid-cols-3 gap-1.5">
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map((k) => {
          const on = kind === k
          const Icon = KIND_ICON[k]
          return (
            <label
              key={k}
              className={cn(
                "pressable flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center text-xs transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                on ? "border-ion/60 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="entry-kind"
                value={k}
                checked={on}
                onChange={() => {
                  setKind(k)
                  setUrl("")
                  setErrors({})
                }}
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
              {k === "project" ? "Project" : k === "repo" ? "Repo" : "Paper"}
            </label>
          )
        })}
      </div>
      <Field data-invalid={errors.url ? true : undefined}>
        <FieldLabel htmlFor="entry-url">{ENTRY_KINDS[kind].label}</FieldLabel>
        {kind === "project" ? (
          projects === null ? (
            <Skeleton className="h-10 w-full" />
          ) : projects.length ? (
            <select
              id="entry-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={errors.url ? "entry-url-error" : undefined}
              className="h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" className="bg-popover">
                Pick a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={`/p/${p.id}`} className="bg-popover">
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <p id="entry-url" tabIndex={-1} className="text-sm text-muted-foreground">
              You have no published projects yet.{" "}
              <Link href="/studio" className="text-ion hover:underline">
                Publish one in the studio
              </Link>{" "}
              or submit a repo or paper.
            </p>
          )
        ) : (
          <Input
            id="entry-url"
            value={url}
            inputMode="url"
            maxLength={500}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={ENTRY_KINDS[kind].placeholder}
            className="h-10 bg-background/60"
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={errors.url ? "entry-url-error" : undefined}
          />
        )}
        {errors.url ? <FieldError id="entry-url-error">{errors.url}</FieldError> : <FieldDescription>{ENTRY_KINDS[kind].hint}</FieldDescription>}
      </Field>
      <Field data-invalid={errors.notes ? true : undefined}>
        <FieldLabel htmlFor="entry-notes">Notes for the reviewer</FieldLabel>
        <Textarea
          id="entry-notes"
          value={notes}
          maxLength={LIMITS.notes}
          rows={4}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How your entry meets each criterion, with numbers."
          className="bg-background/60"
          aria-invalid={errors.notes ? true : undefined}
        />
        {errors.notes && <FieldError>{errors.notes}</FieldError>}
      </Field>
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy} className="rounded-full">
          <SendIcon aria-hidden /> {busy ? "Sending…" : mine ? "Save entry" : "Submit entry"}
        </Button>
        {mine && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {crew.joined ? "" : "Submitting puts you on the crew. "}You can edit it until the deadline (
        <Deadline deadline={m.deadline} now={now} className="inline-flex align-middle" />
        ).
      </p>
      <p role="status" className="sr-only">
        {done}
      </p>
    </form>
  )
}

const TIMELINE_ICON: Record<TimelineEvent["kind"], typeof FileTextIcon> = {
  posted: CircleDotIcon,
  joined: UsersIcon,
  entry: FlagIcon,
  won: TrophyIcon,
  deadline: HourglassIcon,
  expired: HourglassIcon,
}

const TIMELINE_TONE: Record<TimelineEvent["kind"], string> = {
  posted: "text-ion border-ion/30 bg-ion/10",
  joined: "text-repo border-[#d3b4ff]/30 bg-[#d3b4ff]/10",
  entry: "text-gold border-gold/30 bg-gold/10",
  won: "text-ok border-ok/40 bg-ok/15",
  deadline: "text-muted-foreground border-border bg-white/[0.04]",
  expired: "text-muted-foreground border-border bg-white/[0.04]",
}

function Timeline({ events, now }: { events: TimelineEvent[]; now: number }) {
  return (
    <ol className="relative flex flex-col gap-4 pl-1">
      <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-gradient-to-b from-ion/40 via-white/10 to-transparent" />
      {events.map((e) => {
        const Icon = TIMELINE_ICON[e.kind]
        const future = Date.parse(e.at) > now
        return (
          <li key={e.id} className={cn("relative flex items-start gap-3", future && "opacity-70")}>
            <span className={cn("relative z-[1] grid size-[30px] shrink-0 place-items-center rounded-full border", TIMELINE_TONE[e.kind], future && "border-dashed")}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col pt-1">
              <p className="text-sm">
                {e.who ? (
                  <>
                    <span className="font-medium">{e.who.name}</span> {e.text}
                  </>
                ) : (
                  e.text
                )}
              </p>
              <time dateTime={e.at} className="text-xs text-muted-foreground">
                {future
                  ? `${new Date(e.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${deadlineText(e.at, now)}`
                  : new Date(e.at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Missing({ title, detail }: { title: string; detail: string }) {
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/missions" className="text-ion hover:underline">
          Back to missions
        </Link>
      </EmptyContent>
    </Empty>
  )
}
