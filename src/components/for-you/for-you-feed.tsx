"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, RotateCcwIcon, SlidersHorizontalIcon, Undo2Icon, XIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { Button } from "@/components/ui/button"
import { INTERESTS, EMPTY_TUNING, getFeedTuning, saveFeedTuning, updateProfile, useProfile, type FeedTuning } from "@/lib/profile"
import { listFollowing } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { FeedCard, FeedSkeleton } from "./feed-cards"
import { buildFeed, FEED_KINDS, type FeedItem, type FeedKind } from "./feed-data"

const EASE = [0.23, 1, 0.32, 1] as const
const PAGE = 12

/** Cards that get a double-width spot: projects with a cover and the first mission. */
const isBig = (i: FeedItem, index: number) => (i.kind === "project" && (Boolean(i.p.coverUrl) || index === 0)) || (i.kind === "people")

/**
 * The visual "For you" feed: a mixed grid of projects, threads, news, events, missions and people, each saying
 * why it is here, loading more as you scroll (skeletons while it does). "Tune" picks interests and hides kinds;
 * every card can be hidden or muted, with an undo.
 */
export function ForYouFeed() {
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const { profile } = useProfile()
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [follows, setFollows] = useState(0)
  const [tuning, setTuning] = useState<FeedTuning>(EMPTY_TUNING)
  const [filter, setFilter] = useState<FeedKind | "all">("all")
  const [shown, setShown] = useState(PAGE)
  const [tuneOpen, setTuneOpen] = useState(false)
  const [undo, setUndo] = useState<{ label: string; prev: FeedTuning } | null>(null)
  const [nonce, setNonce] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)
  const userId = user?.id ?? null
  const interests = (profile?.interests ?? []).join(",")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    ;(async () => {
      const [list, t] = await Promise.all([listFollowing(userId).catch(() => []), getFeedTuning().catch(() => EMPTY_TUNING)])
      const items = await buildFeed({ follows: list.map((x) => x.followee), interests: interests ? interests.split(",") : [], me: userId, tuning: t })
      if (stale) return
      setFollows(list.length)
      setTuning(t)
      setFeed(items)
    })().catch(() => !stale && setFeed([]))
    return () => {
      stale = true
    }
  }, [ready, userId, interests, nonce])

  const visible = useMemo(() => {
    if (!feed) return []
    return feed.filter((i) => !tuning.hidden.includes(i.key) && !tuning.hiddenKinds.includes(i.kind) && !(i.source && tuning.muted.includes(i.source)) && (filter === "all" || i.kind === filter))
  }, [feed, tuning, filter])

  // Infinite scroll: reveal the next page when the sentinel nears the screen.
  const more = visible.length > shown
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: "600px" })
    io.observe(el)
    return () => io.disconnect()
  }, [more, shown])

  const tune = useCallback(
    (next: FeedTuning, label?: string) => {
      if (label) setUndo({ label, prev: tuning })
      setTuning(next)
      void saveFeedTuning(next).catch(() => {})
    },
    [tuning],
  )

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of feed ?? []) if (!tuning.hidden.includes(i.key)) c[i.kind] = (c[i.kind] ?? 0) + 1
    return c
  }, [feed, tuning.hidden])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Show" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
          {[{ id: "all" as const, label: "Everything" }, ...FEED_KINDS.filter((k) => !tuning.hiddenKinds.includes(k.id))].map((f) => {
            const on = f.id === filter
            const n = f.id === "all" ? (feed?.length ?? 0) : counts[f.id] ?? 0
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setFilter(f.id)
                  setShown(PAGE)
                }}
                className={cn("pressable relative shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors", on ? "border-transparent text-background" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {on && <motion.span layoutId="fy-filter" className="absolute inset-0 rounded-full bg-foreground" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }} />}
                <span className="relative">
                  {f.label} {feed && <span className="tabular opacity-60">{n}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <Button variant="outline" size="sm" className="ml-auto rounded-full" onClick={() => setTuneOpen((o) => !o)} aria-expanded={tuneOpen}>
          <SlidersHorizontalIcon aria-hidden /> Tune
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {tuneOpen && (
          <motion.div initial={{ opacity: 0, transform: "translateY(-6px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} exit={{ opacity: 0, transform: "translateY(-6px)" }} transition={{ duration: 0.2, ease: EASE }}>
            <TunePanel
              tuning={tuning}
              onTune={tune}
              onClose={() => setTuneOpen(false)}
              signedIn={!live || Boolean(user)}
              interests={profile?.interests ?? []}
              onInterests={async (next) => {
                await updateProfile({ interests: next })
                setNonce((n) => n + 1)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {feed && (
        <p className="text-sm text-muted-foreground">
          {follows > 0 ? `Built from ${follows} ${follows === 1 ? "follow" : "follows"}, your interests and what is new.` : "You follow nobody yet, so this is what is new across Nexverse. Follow people and categories to make it yours."}{" "}
          <Link href="/you" className="text-ion hover:underline">
            <Copy k="for-you.for-you-view.manage">Manage</Copy>
          </Link>
        </p>
      )}

      {!feed ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your feed">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cn(i === 0 && "sm:col-span-2")}>
              <FeedSkeleton big={i === 0} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty filtered={filter !== "all" || tuning.hidden.length > 0 || tuning.hiddenKinds.length > 0} onReset={() => {
            tune(EMPTY_TUNING)
            setFilter("all")
          }} />
      ) : (
        <ol className="grid grid-flow-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.slice(0, shown).map((item, i) => {
              const big = isBig(item, i)
              return (
                <motion.li
                  key={item.key}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, transform: "translateY(14px) scale(0.98)" }}
                  animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                  exit={{ opacity: 0, transform: "scale(0.96)", transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : (i % PAGE) * 0.035 }}
                  className={cn(big && "sm:col-span-2")}
                >
                  <FeedCard
                    item={item}
                    big={big}
                    onHide={() => tune({ ...tuning, hidden: [...tuning.hidden, item.key] }, "Hidden from your feed.")}
                    onMute={item.source ? () => tune({ ...tuning, muted: [...tuning.muted, item.source!] }, item.source!.startsWith("category:") ? "You will see less of this category." : "You will see less from this member.") : undefined}
                  />
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      )}
      {more && (
        <div ref={sentinel} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <FeedSkeleton key={i} />
          ))}
        </div>
      )}
      {feed && !more && visible.length > PAGE && <p className="py-6 text-center text-sm text-muted-foreground">You are all caught up. Follow more people or tune your interests for more.</p>}

      <AnimatePresence>
        {undo && (
          <motion.div
            role="status"
            initial={{ opacity: 0, transform: "translate(-50%, 12px)" }}
            animate={{ opacity: 1, transform: "translate(-50%, 0px)" }}
            exit={{ opacity: 0, transform: "translate(-50%, 12px)" }}
            transition={{ duration: 0.2, ease: EASE }}
            className="liquid-glass fixed bottom-5 left-1/2 z-50 flex items-center gap-3 rounded-full border border-border px-4 py-2 text-sm shadow-xl"
          >
            {undo.label}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-ion"
              onClick={() => {
                tune(undo.prev)
                setUndo(null)
              }}
            >
              <Undo2Icon aria-hidden className="size-3.5" /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Empty({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered ? "Nothing left with these settings." : "Nexverse is new and quiet. Start something people can follow, and this feed fills up for everyone."}
      </p>
      {filtered ? (
        <Button size="sm" variant="secondary" onClick={onReset}>
          <RotateCcwIcon aria-hidden /> Reset your feed settings
        </Button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Button nativeButton={false} size="sm" render={<Link href="/forum/new" />}>
            Start a thread
          </Button>
          <Button nativeButton={false} size="sm" variant="secondary" render={<Link href="/new/project" />}>
            Publish a project
          </Button>
        </div>
      )}
    </div>
  )
}

/** Pick interests (saved on your profile) and which kinds of card to show; undo what you hid. */
function TunePanel({ tuning, onTune, onClose, signedIn, interests, onInterests }: { tuning: FeedTuning; onTune: (t: FeedTuning) => void; onClose: () => void; signedIn: boolean; interests: string[]; onInterests: (next: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState(interests)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const dirty = picked.join(",") !== interests.join(",")
  async function saveInterests() {
    setBusy(true)
    setError("")
    try {
      await onInterests(picked)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Tune your feed" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-base font-semibold tracking-normal">Tune your feed</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">Show these kinds of card</h3>
        <div className="flex flex-wrap gap-1.5">
          {FEED_KINDS.map((k) => {
            const on = !tuning.hiddenKinds.includes(k.id)
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={on}
                onClick={() => onTune({ ...tuning, hiddenKinds: on ? [...tuning.hiddenKinds, k.id] : tuning.hiddenKinds.filter((x) => x !== k.id) })}
                className={cn("pressable inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-ion/40 bg-ion/10 text-ion" : "border-border text-muted-foreground line-through")}
              >
                {on && <CheckIcon aria-hidden className="size-3" />} {k.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">Your interests</h3>
        {signedIn ? (
          <>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {INTERESTS.map((i) => {
                const on = picked.includes(i.id)
                return (
                  <button key={i.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== i.id) : [...picked, i.id])} className={cn("pressable rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-gold/40 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:text-foreground")}>
                    {i.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveInterests} disabled={!dirty || busy}>
                {busy ? "Saving…" : "Save interests"}
              </Button>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/sign-in?next=/for-you" className="text-ion hover:underline">
              Sign in
            </Link>{" "}
            to pick interests. Your choices about cards stay in this browser.
          </p>
        )}
      </div>
      {(tuning.hidden.length > 0 || tuning.muted.length > 0) && (
        <button type="button" onClick={() => onTune({ ...tuning, hidden: [], muted: [] })} className="inline-flex w-fit items-center gap-1.5 text-sm text-ion hover:underline">
          <RotateCcwIcon aria-hidden className="size-3.5" /> Bring back {tuning.hidden.length} hidden {tuning.hidden.length === 1 ? "card" : "cards"} and {tuning.muted.length} muted
        </button>
      )}
    </section>
  )
}
