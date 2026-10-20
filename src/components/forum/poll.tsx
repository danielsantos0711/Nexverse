"use client"

import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { BarChart3Icon, CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNow } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { getPoll, POLL_MAX, POLL_MIN, votePoll, type NewPoll, type Poll } from "@/lib/community"
import { useSession, type Question } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const EASE = [0.23, 1, 0.32, 1] as const

/** The poll on a member's thread: vote (one or several options), then see the results fill in. */
export function PollCard({ question }: { question: Question }) {
  const { ready, user } = useSession()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const uid = useId()
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined)
  const [picked, setPicked] = useState<number[]>([])
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const { id: questionId, local } = question
  const now = useNow()

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getPoll({ id: questionId, local })
      .then((p) => {
        if (stale) return
        setPoll(p)
        setPicked(p?.mine ?? [])
      })
      .catch((e: Error) => !stale && (setError(e.message), setPoll(null)))
    return () => {
      stale = true
    }
  }, [questionId, local, ready, user?.id])

  if (poll === undefined) {
    return (
      <div className="glass flex flex-col gap-3 rounded-xl p-4" aria-busy="true" aria-label="Loading poll">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }
  if (!poll) return error ? <p className="text-sm text-destructive">The poll could not be loaded: {error}</p> : null

  const closed = Boolean(poll.closesAt && now !== null && Date.parse(poll.closesAt) <= now)
  const voted = poll.mine.length > 0
  const signedOut = live && ready && !user
  const showResults = (voted && !changing) || closed || signedOut
  const total = poll.counts.reduce((a, b) => a + b, 0)

  function toggle(i: number) {
    setPicked((p) => (poll!.multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!poll || busy) return
    if (!picked.length) {
      setError(poll.multi ? "Pick at least one option." : "Pick an option.")
      return
    }
    setBusy(true)
    setError("")
    // Optimistic: the bars move to include your vote straight away.
    const before = poll
    const counts = poll.counts.map((c, i) => c - (poll.mine.includes(i) ? 1 : 0) + (picked.includes(i) ? 1 : 0))
    setPoll({ ...poll, counts, mine: picked, voters: poll.voters + (voted ? 0 : 1) })
    setChanging(false)
    try {
      setPoll(await votePoll(before, picked))
    } catch (err) {
      setPoll(before)
      setChanging(true)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function retract() {
    if (!poll || busy) return
    setBusy(true)
    setError("")
    try {
      const next = await votePoll(poll, [])
      setPoll(next)
      setPicked([])
      setChanging(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${uid}-h`} className="glass flex flex-col gap-3 rounded-xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`${uid}-h`} className="flex items-start gap-2 font-sans text-[15px] font-semibold tracking-normal">
          <BarChart3Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion" />
          {poll.prompt}
        </h2>
        <p className="text-xs text-muted-foreground">
          {poll.multi ? "Choose any" : "Choose one"} · {poll.voters} {poll.voters === 1 ? "voter" : "voters"}
          {closed && " · Closed"}
          {poll.local && " · Saved in this browser"}
        </p>
      </div>

      {showResults ? (
        <ul className="flex flex-col gap-2" aria-label="Results">
          {poll.options.map((o, i) => {
            const n = poll.counts[i] ?? 0
            const pct = total ? Math.round((n / total) * 100) : 0
            const mine = poll.mine.includes(i)
            return (
              <li key={i} className="relative overflow-hidden rounded-lg border border-border bg-background/40 px-3 py-2">
                <motion.span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-full origin-left", mine ? "bg-ion/20" : "bg-white/[0.06]")}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: pct / 100 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.7, ease: EASE, delay: i * 0.05 }}
                />
                <span className="relative flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {mine && <CheckIcon aria-hidden className="size-3.5 shrink-0 text-ion" />}
                    <span className="break-words">{o}</span>
                    {mine && <span className="sr-only"><Copy k="forum.poll.your-vote">(your vote)</Copy></span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular">
                    {pct}%<span className="sr-only">, {n} {n === 1 ? "vote" : "votes"}</span>
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{poll.prompt}</legend>
            {poll.options.map((o, i) => {
              const on = picked.includes(i)
              return (
                <label
                  key={i}
                  className={cn(
                    "pressable flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border bg-background/40 hover:bg-white/[0.04]"
                  )}
                >
                  <input
                    type={poll.multi ? "checkbox" : "radio"}
                    name={`${uid}-poll`}
                    checked={on}
                    onChange={() => toggle(i)}
                    className="size-4 shrink-0 accent-[var(--color-ion)]"
                  />
                  <span className="break-words">{o}</span>
                </label>
              )
            })}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || (live && !ready)}>
              {busy ? "Voting…" : voted ? "Change vote" : "Vote"}
            </Button>
            {changing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => (setChanging(false), setPicked(poll.mine))}>
                <Copy k="forum.poll.cancel">Cancel</Copy>
              </Button>
            )}
          </div>
        </form>
      )}

      {showResults && !closed && !signedOut && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setChanging(true)} disabled={busy}>
            <Copy k="forum.poll.change-vote">Change vote</Copy>
          </Button>
          <Button variant="ghost" size="sm" onClick={retract} disabled={busy}>
            <Copy k="forum.poll.take-back-my-vote">Take back my vote</Copy>
          </Button>
        </div>
      )}
      {signedOut && (
        <p className="text-sm text-muted-foreground">
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="text-ion hover:underline">
            Sign in
          </Link>{" "}
          to vote.
        </p>
      )}
      <p role="status" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
        {error}
      </p>
    </section>
  )
}

/** Builds a poll to attach to a new thread: a question, 2 to 8 options, one or several choices. */
export function PollBuilder({ value, onChange, error }: { value: NewPoll; onChange: (p: NewPoll) => void; error?: string }) {
  const uid = useId()
  const set = (patch: Partial<NewPoll>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-q`} className="text-sm font-medium">
          Poll question
        </label>
        <input
          id={`${uid}-q`}
          value={value.prompt}
          maxLength={200}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder="Which runtime do you use on phones?"
          aria-invalid={error ? true : undefined}
          className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium"><Copy k="forum.poll.options">Options</Copy></legend>
        {value.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <label htmlFor={`${uid}-o${i}`} className="sr-only">
              Option {i + 1}
            </label>
            <input
              id={`${uid}-o${i}`}
              value={o}
              maxLength={80}
              onChange={(e) => set({ options: value.options.map((x, j) => (j === i ? e.target.value : x)) })}
              placeholder={`Option ${i + 1}`}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}
              disabled={value.options.length <= POLL_MIN}
              aria-label={`Remove option ${i + 1}`}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30"
            >
              <XIcon aria-hidden className="size-4" />
            </button>
          </div>
        ))}
        {value.options.length < POLL_MAX && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => set({ options: [...value.options, ""] })}>
            <PlusIcon aria-hidden /> <Copy k="forum.poll.add-option">Add option</Copy>
          </Button>
        )}
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={value.multi} onChange={(e) => set({ multi: e.target.checked })} className="size-4 accent-[var(--color-ion)]" />
        <Copy k="forum.poll.let-people-pick-more-than">Let people pick more than one option</Copy>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
