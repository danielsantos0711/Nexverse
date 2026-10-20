"use client"

import { motion, useReducedMotion } from "motion/react"
import { CheckIcon, LockIcon, TimerIcon, VoteIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { pollClosed, type Poll } from "@/lib/chat-features"
import { cn } from "@/lib/utils"

const hours = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** A poll in a message: tap an option to vote, tap it again to take it back. Bars grow as votes arrive live. */
export function PollCard({
  poll,
  meId,
  canVote,
  now,
  onVote,
  onClose,
}: {
  poll: Poll | undefined
  meId: string | null
  canVote: boolean
  now: number
  onVote: (choice: number, on: boolean) => void
  onClose: (closed: boolean) => void
}) {
  const reduce = useReducedMotion()
  if (!poll) {
    return (
      <div className="mt-1 flex max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground">
        <VoteIcon aria-hidden className="size-4" /> Loading the poll…
      </div>
    )
  }
  const closed = now ? pollClosed(poll, now) : false
  const voters = new Set(poll.votes.map((v) => v.userId)).size
  const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.choice === i).length)
  const top = Math.max(1, ...counts)
  const mine = new Set(poll.votes.filter((v) => v.userId === meId).map((v) => v.choice))
  const leftMs = poll.closesAt && now ? Date.parse(poll.closesAt) - now : 0
  return (
    <div className="mt-1 flex max-w-md flex-col gap-2 rounded-xl border border-border bg-card p-3" role="group" aria-label={`Poll: ${poll.question}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-ion/15 text-ion">
          <VoteIcon aria-hidden className="size-3.5" />
        </span>
        <p className="text-sm leading-snug font-semibold">{poll.question}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {poll.options.map((o, i) => {
          const on = mine.has(i)
          const share = voters ? Math.round((counts[i] / voters) * 100) : 0
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!canVote || closed}
                onClick={() => onVote(i, !on)}
                aria-pressed={on}
                className={cn(
                  "pressable relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                  on ? "border-ion/50 text-foreground" : "border-border text-foreground/90 hover:border-white/20"
                )}
              >
                <motion.span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-full origin-left", on ? "bg-ion/20" : "bg-white/[0.05]")}
                  initial={false}
                  animate={{ transform: `scaleX(${counts[i] / top || 0})` }}
                  transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.15 }}
                />
                <span className={cn("relative grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-ion bg-ion text-ion-foreground" : "border-white/25", !poll.multi && "rounded-full", poll.multi && "rounded-[4px]")}>
                  {on && <CheckIcon aria-hidden className="size-3" />}
                </span>
                <span className="relative min-w-0 flex-1 truncate">{o}</span>
                <span className="relative shrink-0 text-xs text-muted-foreground tabular">
                  {counts[i]} · {share}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {voters} {voters === 1 ? "voter" : "voters"}
          {poll.multi ? " · pick any" : " · pick one"}
          {closed ? (
            <span className="inline-flex items-center gap-1 text-gold">
              · <LockIcon aria-hidden className="size-3" /> Closed
            </span>
          ) : poll.closesAt && now ? (
            <span className="inline-flex items-center gap-1">
              · <TimerIcon aria-hidden className="size-3" /> closes {hours.format(Math.max(1, Math.round(leftMs / 3600_000)), "hour")}
            </span>
          ) : null}
        </span>
        {meId && meId === poll.createdBy && (
          <Button size="xs" variant="ghost" onClick={() => onClose(!closed)}>
            {closed ? "Reopen" : "Close poll"}
          </Button>
        )}
      </div>
    </div>
  )
}
