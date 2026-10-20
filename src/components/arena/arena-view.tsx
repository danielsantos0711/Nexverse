"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { CheckIcon, SwordsIcon } from "lucide-react"
import { LangList, TaskBadge } from "@/components/arena/arena-bits"
import { PlayMode } from "@/components/arena/play-mode"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { isMine, listDuels, myVotes, type Choice, type Duel, type DuelTask } from "@/lib/arena"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"
import { useDuelTasks } from "@/lib/lists/hooks"

type Mode = "play" | "browse"
const MODES: { value: Mode; label: string }[] = [
  { value: "play", label: "Play" },
  { value: "browse", label: "All duels" },
]

/** The arena: Play (one blind duel after another) or the list of every duel. */
export function ArenaView() {
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<Mode>("play")
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Arena" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
        {MODES.map((m) => {
          const on = m.value === mode
          return (
            <button
              key={m.value}
              type="button"
              role="tab"
              id={`arena-tab-${m.value}`}
              aria-selected={on}
              aria-controls="arena-panel"
              onClick={() => setMode(m.value)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {on && <motion.span layoutId="arena-mode" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
              <span className="relative">{m.label}</span>
            </button>
          )
        })}
      </div>
      <div id="arena-panel" role="tabpanel" aria-labelledby={`arena-tab-${mode}`}>
        {mode === "play" ? <PlayMode /> : <DuelList />}
      </div>
    </div>
  )
}

function DuelList() {
  const DUEL_TASKS = useDuelTasks()
  const { ready, user, member } = useSession()
  const [duels, setDuels] = useState<Duel[] | null>(null)
  const [votes, setVotes] = useState<Record<string, Choice>>({})
  const [error, setError] = useState("")
  const [task, setTask] = useState<DuelTask | "all">("all")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    Promise.all([listDuels(), myVotes().catch(() => ({}))])
      .then(([d, v]) => {
        if (stale) return
        setDuels(d)
        setVotes(v)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  const shown = useMemo(() => (duels ?? []).filter((d) => task === "all" || d.task === task), [duels, task])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by task">
        {(["all", ...Object.keys(DUEL_TASKS)] as (DuelTask | "all")[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={task === t}
            onClick={() => setTask(t)}
            className={cn(
              "pressable h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              task === t ? "border-ion/50 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? <Copy k="arena.arena-view.all-tasks">All tasks</Copy> : DUEL_TASKS[t].label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The duels could not be loaded ({error}).
        </p>
      )}

      {!duels && !error ? (
        <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Loading duels">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-24 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <ol className="flex flex-col gap-2.5">
          {shown.map((d, i) => (
            <li key={d.id} className={rise} style={riseDelay(i)}>
              <DuelRow d={d} voted={Boolean(votes[d.id])} mine={isMine(d, member?.id)} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
            <SwordsIcon aria-hidden className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">{task === "all" ? "No duels yet. Post the first one." : `No ${DUEL_TASKS[task].label.toLowerCase()} duels yet. Post one.`}</p>
          <Link href="/arena/new" className={primaryButton}>
            <Copy k="arena.arena-view.post-a-duel">Post a duel</Copy>
          </Link>
        </div>
      )}
    </div>
  )
}

function DuelRow({ d, voted, mine }: { d: Duel; voted: boolean; mine: boolean }) {
  return (
    <article className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2">
        <TaskBadge task={d.task} />
        <LangList langs={d.langs} />
        {voted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">
            <CheckIcon aria-hidden className="size-3" /> <Copy k="arena.arena-view.voted">Voted</Copy>
          </span>
        )}
        {mine && <span className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion"><Copy k="arena.arena-view.your-duel">Your duel</Copy></span>}
      </div>
      <h2 className="line-clamp-2 font-sans text-[15px] leading-snug font-medium tracking-normal">
        <Link data-nav-item
          href={`/arena/${d.id}`}
          className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
        >
          {d.prompt}
        </Link>
      </h2>
      <p className="text-xs text-muted-foreground">
        {d.author.name} · <TimeAgo date={d.createdAt} /> · <span className="tabular">{d.votes === 1 ? "1 vote" : `${d.votes} votes`}</span>
        {!voted && !mine && " · Vote to see the models"}
      </p>
    </article>
  )
}
