"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { ArrowRightIcon, FlameIcon, PartyPopperIcon, SkipForwardIcon, SwordsIcon, TrophyIcon } from "lucide-react"
import { typingTarget } from "@/components/arena/arena-bits"
import { DuelCard } from "@/components/arena/duel-card"
import { primaryButton } from "@/components/forum/forum-ui"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { isMine, listDuels, myVotes, type Duel } from "@/lib/arena"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const STREAK_KEY = "nexverse-arena-streak"
const BEST_KEY = "nexverse-arena-best"

function readNumber(storage: "session" | "local", key: string) {
  try {
    return Number((storage === "session" ? sessionStorage : localStorage).getItem(key)) || 0
  } catch {
    return 0
  }
}

function writeNumber(storage: "session" | "local", key: string, n: number) {
  try {
    ;(storage === "session" ? sessionStorage : localStorage).setItem(key, String(n))
  } catch {}
}

/**
 * Play: an endless run of duels you have not voted on. 1–4 vote, N or Enter goes to the next duel, S skips.
 * The streak counts votes in a row this session; skipping a duel resets it.
 */
export function PlayMode() {
  const reduce = useReducedMotion()
  const { ready, user, member } = useSession()
  const [queue, setQueue] = useState<Duel[] | null>(null)
  const [error, setError] = useState("")
  const [index, setIndex] = useState(0)
  const [voted, setVoted] = useState(false)
  // Read lazily: nothing below renders before the queue has loaded in the browser, so hydration is unaffected.
  const [streak, setStreak] = useState(() => readNumber("session", STREAK_KEY))
  const [best, setBest] = useState(() => readNumber("local", BEST_KEY))
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    Promise.all([listDuels(), myVotes()])
      .then(([duels, votes]) => {
        if (stale) return
        // Newest first. Guests see the duels too; the card asks them to sign in before they vote.
        const open = duels.filter((d) => !votes[d.id] && !isMine(d, member?.id))
        setQueue(open)
        setIndex(0)
        setVoted(false)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [ready, user, member?.id])

  const current = queue?.[index] ?? null

  const onVoted = useCallback(() => {
    const n = streak + 1
    setVoted(true)
    setStreak(n)
    writeNumber("session", STREAK_KEY, n)
    if (n > best) {
      setBest(n)
      writeNumber("local", BEST_KEY, n)
    }
    setBump((b) => b + 1)
  }, [streak, best])

  const next = useCallback(() => {
    setVoted(false)
    setIndex((i) => i + 1)
    window.scrollTo({ top: Math.max(0, (document.getElementById("play")?.offsetTop ?? 0) - 90), behavior: reduce ? "auto" : "smooth" })
  }, [reduce])

  const skip = useCallback(() => {
    setStreak(0)
    writeNumber("session", STREAK_KEY, 0)
    next()
  }, [next])

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e)) return
      const k = e.key.toLowerCase()
      if (voted && (k === "n" || k === "enter" || k === "arrowright")) {
        e.preventDefault()
        next()
      } else if (!voted && k === "s") {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, voted, next, skip])

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        The duels could not be loaded ({error}). Try again in a moment.
      </p>
    )
  }

  if (!queue) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading duels">
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
      </div>
    )
  }

  const left = Math.max(0, queue.length - index)

  return (
    <div id="play" className="flex flex-col gap-4">
      {queue.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5" aria-live="polite">
          <motion.span
            key={bump}
            initial={reduce || !bump ? false : { scale: 1.5, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.5 }}
            className={cn("grid size-7 place-items-center rounded-full", streak ? "bg-gold/15 text-gold" : "bg-white/[0.05] text-muted-foreground")}
          >
            <FlameIcon aria-hidden className="size-4" />
          </motion.span>
          <span>
            Streak <strong className="tabular">{streak}</strong>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <TrophyIcon aria-hidden className="size-4" /> Best <span className="tabular text-foreground">{best}</span>
        </span>
        <span className="text-muted-foreground tabular">{left === 1 ? "1 duel left" : `${left} duels left`}</span>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> vote · <Kbd>N</Kbd> next · <Kbd>S</Kbd> skip
        </span>
      </div>
      )}

      {live && ready && !user && (
        <p className="rounded-lg border border-border bg-card/40 px-3 py-2 text-sm text-muted-foreground">
          Anyone can read the duels.{" "}
          <Link href={`/sign-in?next=${encodeURIComponent("/arena")}`} className="text-ion underline-offset-4 hover:underline">
            Sign in
          </Link>{" "}
          to vote and move the ratings.
        </p>
      )}

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          {current ? (
            <motion.div
              key={current.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -64, scale: 0.97 }}
              transition={{ duration: reduce ? 0.15 : 0.38, ease: [0.23, 1, 0.32, 1] }}
            >
              <DuelCard
                duel={current}
                hotkeys
                blind
                onVoted={onVoted}
                footer={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button type="button" onClick={next} className={primaryButton} autoFocus>
                      Next duel <ArrowRightIcon aria-hidden className="size-4" />
                    </button>
                    <Link href={`/arena/${current.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      Open this duel
                    </Link>
                  </div>
                }
              />
              {!voted && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={skip}
                    className="pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <SkipForwardIcon aria-hidden className="size-4" /> <Copy k="arena.play-mode.skip">Skip</Copy>
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="done"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 px-6 py-14 text-center"
            >
              <span className="grid size-11 place-items-center rounded-full bg-gold/10 text-gold">
                {queue.length ? <PartyPopperIcon aria-hidden className="size-5" /> : <SwordsIcon aria-hidden className="size-5" />}
              </span>
              <p className="max-w-md text-sm text-muted-foreground">
                {queue.length
                  ? "You have voted on every duel there is. Post one of your own, or see how the models rank now."
                  : "No duels yet. Give two models the same prompt, paste both answers, and let the community vote blind."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/arena/new" className={primaryButton}>
                  <Copy k="arena.play-mode.post-a-duel">Post a duel</Copy>
                </Link>
                <Link
                  href="/arena/ratings"
                  className="pressable inline-flex h-9 items-center rounded-full border border-border px-4 text-sm hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Copy k="arena.play-mode.see-ratings">See ratings</Copy>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
