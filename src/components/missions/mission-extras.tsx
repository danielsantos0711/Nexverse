"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { BellIcon, BellRingIcon, CheckIcon, MegaphoneIcon, MessageSquareIcon, PaletteIcon, ReplyIcon, Trash2Icon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { LookPicker } from "@/components/missions/mission-cover"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateMissionLook, type Mission, type MissionCrew, type MissionLook } from "@/lib/missions"
import { MILESTONE_MAX, MISSION_KIND_ORDER, MISSION_KINDS, type Accent } from "@/lib/missions-look"
import {
  COMMENT_MAX,
  deleteMissionComment,
  deleteMissionUpdate,
  postMissionComment,
  postMissionUpdate,
  reviewEntry,
  setMilestone,
  setMissionFollow,
  VERDICTS,
  type MissionComment,
  type MissionSocial,
  type ReviewVerdict,
} from "@/lib/missions-social"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

// ─── Countdown ──────────────────────────────────────────────────────────────────────────────────────────────

/** Days, hours, minutes and seconds to the deadline, ticking each second while the tab is visible. */
export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      setNow(Date.now())
      timer ??= setInterval(() => setNow(Date.now()), 1000)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const vis = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener("visibilitychange", vis)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", vis)
    }
  }, [])
  if (now === null) return <span className={cn("inline-block h-12 w-56 animate-pulse rounded-lg bg-white/[0.04]", className)} aria-hidden />
  const ms = Math.max(0, Date.parse(deadline) - now)
  const parts: [number, string][] = [
    [Math.floor(ms / 864e5), "days"],
    [Math.floor(ms / 36e5) % 24, "hours"],
    [Math.floor(ms / 6e4) % 60, "min"],
    [Math.floor(ms / 1e3) % 60, "sec"],
  ]
  if (ms === 0) return <span className={cn("text-sm text-muted-foreground", className)}>The deadline has passed.</span>
  return (
    <div className={cn("flex items-end gap-1.5", className)} role="timer" aria-label={`${parts[0][0]} days ${parts[1][0]} hours left`}>
      {parts.map(([v, unit]) => (
        <span key={unit} className="flex flex-col items-center">
          <span className="relative grid h-10 min-w-11 place-items-center overflow-hidden rounded-lg border border-border bg-background/60 px-1.5 text-lg font-semibold tabular">
            <Digit value={String(v).padStart(2, "0")} />
          </span>
          <span className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">{unit}</span>
        </span>
      ))}
    </div>
  )
}

function Digit({ value }: { value: string }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={value}
        initial={reduce ? false : { transform: "translateY(60%)", opacity: 0 }}
        animate={{ transform: "translateY(0%)", opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { transform: "translateY(-60%)", opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        aria-hidden
      >
        {value}
      </motion.span>
    </AnimatePresence>
  )
}

/** How much of the mission's time has gone, as a thin bar. */
export function TimeBar({ m, now, className }: { m: Pick<Mission, "createdAt" | "deadline">; now: number | null; className?: string }) {
  if (now === null) return null
  const start = Date.parse(m.createdAt)
  const end = Date.parse(m.deadline)
  const t = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)))
  return (
    <span aria-hidden className={cn("block h-1 overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <span className={cn("block h-full origin-left rounded-full transition-transform duration-700 ease-out", t > 0.85 ? "bg-gold" : "bg-[rgb(var(--accent-rgb))]")} style={{ transform: `scaleX(${t})` }} />
    </span>
  )
}

// ─── Follow ─────────────────────────────────────────────────────────────────────────────────────────────────

export function FollowMission({ m, social, onChange }: { m: Mission; social: MissionSocial; onChange: (s: Partial<MissionSocial>) => void }) {
  const { user } = useSession()
  const [error, setError] = useState("")
  if (!social.available) return null
  const on = social.following
  async function toggle() {
    setError("")
    onChange({ following: !on, followers: social.followers + (on ? -1 : 1) })
    try {
      await setMissionFollow(m.id, !on)
    } catch (e) {
      onChange({ following: on, followers: social.followers })
      setError((e as Error).message)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant={on ? "secondary" : "outline"} size="sm" onClick={toggle} disabled={!user} title={user ? undefined : "Sign in to follow missions"} aria-pressed={on}>
        {on ? <BellRingIcon aria-hidden /> : <BellIcon aria-hidden />}
        {on ? "Following" : "Follow"}
        <span className="tabular opacity-70">{social.followers}</span>
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}

// ─── Milestones ─────────────────────────────────────────────────────────────────────────────────────────────

/** The mission's milestones: tick yours off if you are on the crew; see how far every pilot got. */
export function Milestones({ m, crew, social, reload }: { m: Mission; crew: MissionCrew | null; social: MissionSocial; reload: () => void }) {
  const { user } = useSession()
  const reduce = useReducedMotion()
  const [error, setError] = useState("")
  const [mine, setMine] = useState<number[] | null>(null)
  if (!m.milestones.length) return null
  const done = mine ?? (user ? social.progress[user.id] ?? [] : [])
  const onCrew = Boolean(crew?.joined)
  const pilots = (crew?.crew ?? []).map((c) => ({ c, steps: c.who.memberId ? social.progress[c.who.memberId] ?? [] : [] }))

  async function toggle(step: number) {
    if (!onCrew || !social.available) return
    const on = !done.includes(step)
    const next = on ? [...done, step] : done.filter((s) => s !== step)
    setMine(next)
    setError("")
    try {
      await setMilestone(m.id, step, on)
      reload()
    } catch (e) {
      setMine(done)
      setError((e as Error).message)
    }
  }

  return (
    <section aria-labelledby="milestones-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="milestones-h" className="font-sans text-base font-semibold tracking-normal">
          <Copy k="mission.milestones">Milestones</Copy>
        </h2>
        <span className="text-xs text-muted-foreground">{onCrew ? "Tick off each step as you get there. The crew sees your progress." : "Join the crew to track your progress."}</span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {m.milestones.map((s, i) => {
          const ticked = done.includes(i)
          const count = pilots.filter((p) => p.steps.includes(i)).length
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={!onCrew || !social.available}
                aria-pressed={onCrew ? ticked : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  ticked ? "border-[rgb(var(--accent-rgb)/0.4)] bg-[rgb(var(--accent-rgb)/0.08)]" : "border-border bg-card/40",
                  onCrew && "pressable hover:border-white/20",
                )}
              >
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[11px] tabular transition-colors", ticked ? "border-transparent bg-[rgb(var(--accent-rgb))] text-black" : "border-white/20 text-muted-foreground")}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {ticked ? (
                      <motion.span key="c" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}>
                        <CheckIcon aria-hidden className="size-3" />
                      </motion.span>
                    ) : (
                      <motion.span key="n" initial={false} exit={{ opacity: 0 }}>
                        {i + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="min-w-0 flex-1">{s}</span>
                {pilots.length > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular">{count}/{pilots.length}</span>}
              </button>
            </li>
          )
        })}
      </ol>
      {pilots.some((p) => p.steps.length) && (
        <ul className="flex flex-col gap-1.5" aria-label="Crew progress">
          {pilots
            .filter((p) => p.steps.length)
            .map(({ c, steps }) => (
              <li key={c.who.memberId ?? c.who.name} className="flex items-center gap-2 text-xs">
                <PosterAvatar poster={c.who} size={18} />
                <span className="w-24 truncate">{c.who.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full origin-left rounded-full bg-[rgb(var(--accent-rgb))] transition-transform duration-500 ease-out" style={{ transform: `scaleX(${steps.length / m.milestones.length})` }} />
                </span>
                <span className="w-8 text-right text-muted-foreground tabular">{Math.round((steps.length / m.milestones.length) * 100)}%</span>
              </li>
            ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

// ─── Updates ────────────────────────────────────────────────────────────────────────────────────────────────

export function Updates({ m, isPoster, social, reload }: { m: Mission; isPoster: boolean; social: MissionSocial; reload: () => void }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (!social.available || (!isPoster && !social.updates.length)) return null

  async function post() {
    setBusy(true)
    setError("")
    try {
      await postMissionUpdate(m.id, body)
      setBody("")
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="updates-h" className="flex flex-col gap-3">
      <h2 id="updates-h" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
        <MegaphoneIcon aria-hidden className="size-4 text-[rgb(var(--accent-rgb))]" /> <Copy k="mission.updates">Updates from the poster</Copy>
      </h2>
      {isPoster && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="A hint, a changed detail, a shout-out. Followers and the crew are told." maxLength={4000} rows={2} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-destructive">{error}</span>
            <Button size="sm" onClick={post} disabled={busy || !body.trim()}>
              {busy ? "Posting…" : "Post update"}
            </Button>
          </div>
        </div>
      )}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {social.updates.map((u) => (
            <motion.li key={u.id} initial={{ opacity: 0, transform: "translateY(6px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="relative rounded-xl border-l-2 border-[rgb(var(--accent-rgb)/0.6)] bg-card/40 py-2.5 pr-3 pl-4">
              <p className="text-sm whitespace-pre-line">{u.body}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <TimeAgo date={u.createdAt} />
                {u.mine && (
                  <button type="button" className="hover:text-destructive" onClick={() => deleteMissionUpdate(u.id).then(reload)} aria-label="Remove this update">
                    <Trash2Icon aria-hidden className="size-3.5" />
                  </button>
                )}
              </p>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  )
}

// ─── Discussion ─────────────────────────────────────────────────────────────────────────────────────────────

export function Discussion({ m, social, reload }: { m: Mission; social: MissionSocial; reload: () => void }) {
  const [replyTo, setReplyTo] = useState<MissionComment | null>(null)
  if (!social.available) return null
  const top = social.comments.filter((c) => !c.replyTo)
  const replies = (id: string) => social.comments.filter((c) => c.replyTo === id)
  return (
    <section aria-labelledby="discussion-h" className="flex flex-col gap-3">
      <h2 id="discussion-h" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
        <MessageSquareIcon aria-hidden className="size-4" /> Discussion <span className="text-sm font-normal text-muted-foreground tabular">({social.comments.length})</span>
      </h2>
      <Gate cap="reply.create" action="join the discussion">
        <Composer missionId={m.id} replyTo={null} onDone={reload} placeholder={`Ask ${m.poster.name} a question, share an idea or find teammates.`} />
      </Gate>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Questions about the criteria are welcome here.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {top.map((c) => (
              <motion.li key={c.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-2">
                <CommentRow c={c} poster={m.poster.memberId} onReply={() => setReplyTo(replyTo?.id === c.id ? null : c)} reload={reload} />
                <div className="ml-8 flex flex-col gap-2 border-l border-border pl-3">
                  {replies(c.id).map((r) => (
                    <CommentRow key={r.id} c={r} poster={m.poster.memberId} reload={reload} />
                  ))}
                  {replyTo?.id === c.id && (
                    <Gate cap="reply.create" action="reply">
                      <Composer missionId={m.id} replyTo={c.id} onDone={() => {
                        setReplyTo(null)
                        reload()
                      }} placeholder={`Reply to ${c.author.name}`} autoFocus />
                    </Gate>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  )
}

function CommentRow({ c, poster, onReply, reload }: { c: MissionComment; poster?: string; onReply?: () => void; reload: () => void }) {
  return (
    <div className="flex gap-2.5">
      <PosterAvatar poster={c.author} size={24} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{c.author.name}</span>
          {c.author.memberId && c.author.memberId === poster && <span className="rounded-full bg-[rgb(var(--accent-rgb)/0.15)] px-1.5 text-[10px] text-[rgb(var(--accent-rgb))]">Poster</span>}
          <TimeAgo date={c.createdAt} />
          {c.editedAt && <span>edited</span>}
        </p>
        <p className="mt-0.5 text-sm break-words whitespace-pre-line">{c.body}</p>
        <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
          {onReply && (
            <button type="button" onClick={onReply} className="inline-flex items-center gap-1 hover:text-foreground">
              <ReplyIcon aria-hidden className="size-3" /> Reply
            </button>
          )}
          {c.mine && (
            <button type="button" onClick={() => deleteMissionComment(c.id).then(reload)} className="inline-flex items-center gap-1 hover:text-destructive">
              <Trash2Icon aria-hidden className="size-3" /> Delete
            </button>
          )}
        </p>
      </div>
    </div>
  )
}

function Composer({ missionId, replyTo, onDone, placeholder, autoFocus }: { missionId: string; replyTo: string | null; onDone: () => void; placeholder: string; autoFocus?: boolean }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function send() {
    setBusy(true)
    setError("")
    try {
      await postMissionComment(missionId, body, replyTo)
      setBody("")
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send()
        }}
        placeholder={placeholder}
        maxLength={COMMENT_MAX}
        rows={2}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{error ? <span className="text-destructive">{error}</span> : "Ctrl or ⌘ + Enter to send"}</span>
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : replyTo ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  )
}

// ─── Reviews ────────────────────────────────────────────────────────────────────────────────────────────────

/** The poster's verdict buttons and note under an entry; the pilot sees the verdict and note. */
export function EntryReview({ missionId, entryId, social, isPoster, canReview, reload }: { missionId: string; entryId: string; social: MissionSocial; isPoster: boolean; canReview: boolean; reload: () => void }) {
  const review = social.reviews[entryId]
  const [note, setNote] = useState(review?.note ?? "")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  if (!social.available) return null
  if (!isPoster) {
    if (!review) return null
    return (
      <p className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", VERDICTS[review.verdict].tone)}>
        <span className="font-medium">{VERDICTS[review.verdict].label}</span>
        {review.note && <span className="text-foreground/80">{review.note}</span>}
      </p>
    )
  }
  if (!canReview) return review ? <span className={cn("w-fit rounded-full border px-2 py-0.5 text-xs", VERDICTS[review.verdict].tone)}>{VERDICTS[review.verdict].label}</span> : null
  async function save(verdict: ReviewVerdict) {
    setError("")
    try {
      await reviewEntry(missionId, entryId, verdict, note)
      setOpen(false)
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Review:</span>
        {(Object.keys(VERDICTS) as ReviewVerdict[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => (open ? void save(v) : setOpen(true))}
            aria-pressed={review?.verdict === v}
            className={cn("pressable rounded-full border px-2 py-0.5 text-xs transition-colors", review?.verdict === v ? VERDICTS[v].tone : "border-border text-muted-foreground hover:text-foreground")}
          >
            {VERDICTS[v].label}
          </button>
        ))}
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, transform: "translateY(-4px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.18, ease: EASE }} className="flex flex-col gap-1.5">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the pilot (optional), then pick a verdict" maxLength={1000} />
          <span className="text-xs text-muted-foreground">Only you and the pilot see the note.</span>
        </motion.div>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

// ─── Customise ──────────────────────────────────────────────────────────────────────────────────────────────

/** The poster changes the mission's type, cover, colour, milestones, prize and team setting. */
export function CustomiseMission({ m, open, onOpenChange, onSaved }: { m: Mission; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [look, setLook] = useState<MissionLook>(m)
  const [steps, setSteps] = useState(m.milestones.join("\n"))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function save() {
    setBusy(true)
    setError("")
    try {
      await updateMissionLook(m.id, { kind: look.kind, cover: look.cover, accent: look.accent, prize: look.prize, team: look.team, milestones: steps.split("\n").map((s) => s.trim()).filter(Boolean) })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaletteIcon aria-hidden className="size-4" /> Customise this mission
          </DialogTitle>
          <DialogDescription>How it looks on the board and its page. Pilots are not told about these changes.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-2">
            {MISSION_KIND_ORDER.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={look.kind === k} onClick={() => setLook({ ...look, kind: k })} className={cn("pressable rounded-lg border p-2 text-left text-sm transition-colors", look.kind === k ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.1)]" : "border-border")}>
                <span className="font-medium">{MISSION_KINDS[k].label}</span>
              </button>
            ))}
          </div>
          <LookPicker seed={m.id} cover={look.cover} accent={look.accent} onCover={(cover) => setLook({ ...look, cover })} onAccent={(accent: Accent) => setLook({ ...look, accent })} />
          <label className="flex flex-col gap-1.5 text-sm">
            Milestones, one per line (up to {MILESTONE_MAX})
            <Textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} placeholder={"Collect the data\nTrain a baseline\nPublish the weights"} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Prize beyond the points (optional)
            <Input value={look.prize} onChange={(e) => setLook({ ...look, prize: e.target.value })} maxLength={200} placeholder="A shout-out in the newsroom" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={look.team} onChange={(e) => setLook({ ...look, team: e.target.checked })} className="size-4 accent-[rgb(var(--accent-rgb))]" />
            Team mission: entries can name up to five teammates from the crew, who share the win.
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
