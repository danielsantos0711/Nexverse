"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { SmilePlusIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getReactions, REACTION_NAMES, REACTIONS, setReaction, type ReactionEmoji, type Reactions } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * Emoji reactions on one forum post: the ones people used, with counts, and a picker for the rest. Toggling is
 * optimistic and rolls back if the database says no. Signed-out visitors are sent to sign in.
 */
export function PostReactions({ target, className }: { target: string | null; className?: string }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const reduce = useReducedMotion()
  const [state, setState] = useState<Reactions | null>(null)
  const [status, setStatus] = useState("")

  useEffect(() => {
    if (!target || (live && !ready)) return
    let stale = false
    getReactions(target)
      .then((r) => !stale && setState(r))
      .catch(() => !stale && setStatus("Reactions could not be loaded."))
    return () => {
      stale = true
    }
  }, [target, ready, user?.id])

  if (!target) return null

  async function toggle(emoji: ReactionEmoji) {
    if (!target || !state) return
    if (live && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const was = state[emoji]
    const on = !was.mine
    const apply = (mine: boolean, delta: number) => setState((s) => s && { ...s, [emoji]: { count: Math.max(0, s[emoji].count + delta), mine } })
    apply(on, on ? 1 : -1)
    try {
      await setReaction(target, emoji, on)
      setStatus(on ? `Reacted with ${REACTION_NAMES[emoji]}` : `Removed ${REACTION_NAMES[emoji]} reaction`)
    } catch (e) {
      apply(!on, on ? -1 : 1)
      setStatus((e as Error).message || "Could not react. Try again.")
    }
  }

  const used = state ? REACTIONS.filter((e) => state[e].count > 0) : []

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group" aria-label="Reactions">
      <AnimatePresence initial={false} mode="popLayout">
        {used.map((e) => {
          const r = state![e]
          return (
            <motion.button
              key={e}
              layout={!reduce}
              type="button"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2, ease: EASE }}
              onClick={() => toggle(e)}
              aria-pressed={r.mine}
              aria-label={`${REACTION_NAMES[e]}: ${r.count}. ${r.mine ? "Remove your reaction" : "React"}`}
              className={cn(
                "pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm tabular transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                r.mine ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/50 text-foreground hover:bg-secondary"
              )}
            >
              <span aria-hidden>{e}</span>
              <span aria-hidden>{r.count}</span>
            </motion.button>
          )
        })}
      </AnimatePresence>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!state}
          render={
            <button
              type="button"
              aria-label="Add a reaction"
              title="Add a reaction"
              className="pressable grid size-8 place-items-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            />
          }
        >
          <SmilePlusIcon aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="grid w-auto min-w-0 grid-cols-6 gap-0.5 p-1">
          {REACTIONS.map((e) => (
            <DropdownMenuItem
              key={e}
              onClick={() => toggle(e)}
              aria-label={`${state?.[e].mine ? "Remove" : "React with"} ${REACTION_NAMES[e]}`}
              className={cn("justify-center px-2 text-lg", state?.[e].mine && "bg-ion/15")}
            >
              {e}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}
