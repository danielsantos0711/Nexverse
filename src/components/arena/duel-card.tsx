"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CrownIcon, EqualIcon, ThumbsDownIcon } from "lucide-react"
import { LangList, OutputText, SampleChip, SIDE_COLOR, TaskBadge, typingTarget, useArenaSalt } from "@/components/arena/arena-bits"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { flipped, getReveal, isMine, storedChoice, vote, type Choice, type Duel, type DuelModel, type Reveal } from "@/lib/arena"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Shown = "left" | "right" | "tie" | "bad"

const BUTTONS: { shown: Shown; label: string; key: string }[] = [
  { shown: "left", label: "A is better", key: "1" },
  { shown: "right", label: "B is better", key: "2" },
  { shown: "tie", label: "Tie", key: "3" },
  { shown: "bad", label: "Both are bad", key: "4" },
]

/**
 * One duel, voted blind. The two outputs show as A and B in an order that is random per browser session;
 * the model names stay hidden until you vote, then flip in. Keys 1 to 4 vote when `hotkeys` is on.
 */
export function DuelCard({
  duel,
  hotkeys = false,
  blind = false,
  onVoted,
  footer,
  className,
}: {
  duel: Duel
  hotkeys?: boolean
  /** Known not voted yet (play mode), so the card does not ask the database first. */
  blind?: boolean
  onVoted?: (reveal: Reveal, choice: Choice) => void
  /** Shown under the result once the names are revealed (play mode's "Next duel"). */
  footer?: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const salt = useArenaSalt()
  const { ready, user, member } = useSession()
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [checking, setChecking] = useState(!blind)
  const [busy, setBusy] = useState<Shown | null>(null)
  const [error, setError] = useState("")
  const [justVoted, setJustVoted] = useState(false)
  const flip = salt ? flipped(duel.id, salt) : false
  const mine = isMine(duel, member?.id)
  const needsSignIn = live && !duel.sample && ready && !user
  const sessionPending = live && !duel.sample && !ready

  useEffect(() => {
    if (blind || (live && !ready)) return
    let stale = false
    getReveal(duel)
      .then((r) => !stale && setReveal(r))
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setChecking(false))
    return () => {
      stale = true
    }
  }, [duel, blind, ready, user?.id])

  const cast = useCallback(
    async (shown: Shown) => {
      if (busy || reveal || mine || needsSignIn || sessionPending || !salt) return
      setBusy(shown)
      setError("")
      const choice = storedChoice(shown, flip)
      try {
        const r = await vote(duel, choice)
        setJustVoted(true)
        setReveal(r)
        onVoted?.(r, choice)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [busy, reveal, mine, needsSignIn, sessionPending, salt, flip, duel, onVoted]
  )

  // Keys 1–4 vote; the hook re-binds when the card's state changes so a stale vote can never fire.
  const castRef = useRef(cast)
  useEffect(() => {
    castRef.current = cast
  }, [cast])
  useEffect(() => {
    if (!hotkeys) return
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e)) return
      const b = BUTTONS.find((x) => x.key === e.key)
      if (!b) return
      e.preventDefault()
      castRef.current(b.shown)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hotkeys])

  const left = flip ? "b" : "a"
  const right = flip ? "a" : "b"
  const outputs = { a: duel.outputA, b: duel.outputB }
  const shownMine: Shown | null = reveal?.mine ? (reveal.mine === "tie" || reveal.mine === "bad" ? reveal.mine : reveal.mine === left ? "left" : "right") : null
  const revealed = Boolean(reveal) && (Boolean(reveal?.mine) || mine)
  // The side most voters preferred, unless more of them said both answers were bad.
  const lead = reveal && reveal.total > 0 ? (reveal.tally.a > reveal.tally.b ? "a" : reveal.tally.b > reveal.tally.a ? "b" : null) : null
  const winner = lead && reveal && reveal.tally[lead] >= reveal.tally.bad ? lead : null

  return (
    <article className={cn("glass flex flex-col gap-4 rounded-2xl p-4 md:p-5", className)} aria-label="Duel">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TaskBadge task={duel.task} />
          <LangList langs={duel.langs} />
          {duel.sample && <SampleChip />}
          {duel.local && <span className="text-xs text-muted-foreground">Saved in this browser</span>}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <PosterAvatar poster={duel.author} size={18} />
            {duel.author.name} · <TimeAgo date={duel.createdAt} />
          </span>
        </div>
        <div className="rounded-xl border border-border bg-black/20 px-3.5 py-3">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Prompt</p>
          <OutputText text={duel.prompt} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {(["left", "right"] as const).map((side, i) => {
          const key = side === "left" ? left : right
          const model = reveal ? reveal[key] : null
          const picked = shownMine === side
          const won = revealed && winner === key
          return (
            <section
              key={side}
              aria-label={`Output ${i ? "B" : "A"}`}
              className={cn(
                "relative flex min-w-0 flex-col rounded-xl border bg-card/60 transition-[border-color,box-shadow,opacity] duration-500",
                won ? "border-ion/50 shadow-[0_0_0_1px_rgb(143_180_255/0.25),0_0_32px_-8px_rgb(143_180_255/0.45)]" : "border-border",
                revealed && winner && !won && "opacity-85"
              )}
            >
              <div className="flex min-h-11 items-center gap-2 border-b border-border px-3.5 py-2">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-black"
                  style={{ background: SIDE_COLOR[i ? "b" : "a"] }}
                >
                  {i ? "B" : "A"}
                </span>
                <ModelName model={revealed ? model : null} delay={justVoted ? 0.12 + i * 0.18 : 0} reduce={Boolean(reduce)} />
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {picked && <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs text-foreground/85">Your pick</span>}
                  {won && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ion/12 px-2 py-0.5 text-xs font-medium text-ion">
                      <CrownIcon aria-hidden className="size-3" /> Preferred
                    </span>
                  )}
                </span>
              </div>
              <div className="max-h-[22rem] overflow-y-auto px-3.5 py-3 md:max-h-[26rem]" tabIndex={0} aria-label={`Output ${i ? "B" : "A"} text`}>
                {salt ? <OutputText text={outputs[key]} /> : <Skeleton className="h-24 w-full" />}
              </div>
            </section>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {revealed && reveal ? (
          <motion.div
            key="result"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.23, 1, 0.32, 1], delay: justVoted && !reduce ? 0.3 : 0 }}
            className="flex flex-col gap-3"
          >
            <TallyBar reveal={reveal} left={left} right={right} />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {mine && !reveal.mine ? "You posted this duel, so it is not yours to vote on." : resultLine(reveal, shownMine)}
              {duel.sample && reveal.mine && " Votes on sample duels stay in this browser."}
            </p>
            {footer}
          </motion.div>
        ) : checking || sessionPending ? (
          <motion.div key="checking" exit={{ opacity: 0 }}>
            <Skeleton className="h-11 w-full rounded-full" />
          </motion.div>
        ) : needsSignIn ? (
          <motion.div key="signin" exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Sign in to vote. The model names are revealed after you vote.</span>
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/arena/${duel.id}`)}`}
              className="pressable ml-auto inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Sign in
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="vote"
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            // On a phone the outputs are long, so the vote buttons stay pinned to the bottom of the screen.
            className="sticky bottom-2 z-10 -mx-2 flex flex-col gap-2 rounded-2xl p-2 max-md:border max-md:border-border max-md:bg-background/95 max-md:backdrop-blur-sm max-md:shadow-[0_-8px_24px_rgb(0_0_0/0.5)] md:static md:mx-0 md:p-0"
          >
            <div role="group" aria-label="Your vote" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUTTONS.map((b) => (
                <button
                  key={b.shown}
                  type="button"
                  disabled={Boolean(busy) || !salt}
                  onClick={() => cast(b.shown)}
                  aria-keyshortcuts={hotkeys ? b.key : undefined}
                  className={cn(
                    "pressable group relative flex h-11 items-center justify-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                    b.shown === "left" || b.shown === "right"
                      ? "border-white/15 bg-white/[0.06] hover:bg-white/[0.11]"
                      : "border-border bg-transparent text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                    busy === b.shown && "animate-pulse"
                  )}
                >
                  {b.shown === "left" || b.shown === "right" ? (
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: SIDE_COLOR[b.shown === "left" ? "a" : "b"] }} />
                  ) : b.shown === "tie" ? (
                    <EqualIcon aria-hidden className="size-4" />
                  ) : (
                    <ThumbsDownIcon aria-hidden className="size-4" />
                  )}
                  {b.label}
                  {hotkeys && <Kbd className="hidden bg-white/[0.06] md:inline-flex">{b.key}</Kbd>}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground max-md:hidden">
              Judge the answers, not the style you expect from a model. Names appear after you vote{duel.sample ? "; votes on sample duels stay in this browser" : ""}.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  )
}

function ModelName({ model, delay, reduce }: { model: DuelModel | null; delay: number; reduce: boolean }) {
  return (
    <span className="relative min-w-0 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {model ? (
          <motion.span
            key="name"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0.15 : 0.45, delay: reduce ? 0 : delay, ease: [0.23, 1, 0.32, 1] }}
            className="block truncate text-sm font-semibold"
          >
            {model.slug ? (
              <Link href={`/models/${model.slug}`} className="rounded-sm hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {model.name}
              </Link>
            ) : (
              model.name
            )}
          </motion.span>
        ) : (
          <motion.span key="hidden" exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="block truncate text-sm text-muted-foreground">
            Model hidden
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

function resultLine(r: Reveal, shown: Shown | null) {
  if (!r.mine || !shown) return `${r.total} ${r.total === 1 ? "vote" : "votes"} so far.`
  const agree = r.tally[r.mine]
  const pct = r.total ? Math.round((agree / r.total) * 100) : 0
  const what = shown === "left" ? "A" : shown === "right" ? "B" : shown === "tie" ? "a tie" : "both bad"
  return `You picked ${what}. ${pct}% of ${r.total} ${r.total === 1 ? "voter" : "voters"} agree.`
}

/** The split of every vote, in the order the outputs were shown: A, B, tie, both bad. */
function TallyBar({ reveal, left, right }: { reveal: Reveal; left: "a" | "b"; right: "a" | "b" }) {
  const reduce = useReducedMotion()
  const segs = [
    { key: left, label: `A · ${reveal[left].name}`, color: SIDE_COLOR.a, n: reveal.tally[left] },
    { key: right, label: `B · ${reveal[right].name}`, color: SIDE_COLOR.b, n: reveal.tally[right] },
    { key: "tie", label: "Tie", color: SIDE_COLOR.tie, n: reveal.tally.tie },
    { key: "bad", label: "Both bad", color: SIDE_COLOR.bad, n: reveal.tally.bad },
  ] as const
  const t = Math.max(reveal.total, 1)
  if (!reveal.total) return null
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">How everyone voted</figcaption>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {segs
          .filter((s) => s.n > 0)
          .map((s, i) => (
            <motion.span
              key={s.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ background: s.color, width: `${(s.n / t) * 100}%`, transformOrigin: "left" }}
              initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
              animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
              transition={{ duration: reduce ? 0.15 : 0.6, delay: reduce ? 0 : 0.35 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segs.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular text-foreground">{Math.round((s.n / t) * 100)}%</span>
            <span className="text-muted-foreground tabular">({s.n})</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
