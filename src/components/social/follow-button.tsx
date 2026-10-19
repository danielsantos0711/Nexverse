"use client"

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { compact } from "@/lib/data"
import { getFollowCounts, isFollowing, toggleFollow } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * Follow a member ("member:<uuid>"), a forum category ("category:<slug>") or a chat room ("room:<slug>"). The count
 * is real follows; `base` is an optional offset nobody passes. Signed-out visitors are sent
 * to sign in. Hidden on your own member profile.
 */
export function FollowButton({
  followee,
  base = 0,
  showCount = true,
  name,
  className,
}: {
  followee: string
  base?: number
  showCount?: boolean
  /** Who or what is being followed, for the accessible name ("Follow Inês"). */
  name?: string
  className?: string
}) {
  const { ready, user } = useSession()
  const router = useRouter()
  const reduce = useReducedMotion()
  const [state, setState] = useState({ followers: 0, mine: false, loaded: false })
  const [hover, setHover] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    Promise.all([getFollowCounts(followee), isFollowing(followee, user?.id)])
      .then(([c, mine]) => !stale && setState({ followers: c.followers, mine, loaded: true }))
      .catch(() => !stale && setState((s) => ({ ...s, loaded: true })))
    return () => {
      stale = true
    }
  }, [followee, ready, user?.id])

  if (user && followee === `member:${user.id}`) return null

  async function toggle() {
    if (live && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const on = !state.mine
    setError("")
    setHover(false)
    setState((s) => ({ ...s, followers: s.followers + (on ? 1 : -1), mine: on }))
    try {
      await toggleFollow(followee, on)
    } catch (e) {
      setState((s) => ({ ...s, followers: s.followers + (on ? -1 : 1), mine: !on }))
      setError((e as Error).message)
    }
  }

  const following = state.mine
  const unfollow = following && hover
  const word = unfollow ? "Unfollow" : following ? "Following" : "Follow"
  const Icon = unfollow ? XIcon : following ? CheckIcon : PlusIcon
  const layout = reduce ? false : true

  return (
    <LayoutGroup>
      <motion.button
        layout={layout}
        type="button"
        onClick={toggle}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHover(true)}
        onBlur={() => setHover(false)}
        aria-pressed={following}
        aria-label={name ? `${following ? "Following" : "Follow"} ${name}` : undefined}
        disabled={live && !ready}
        transition={{ layout: { duration: 0.25, ease: EASE } }}
        style={{ borderRadius: 999 }}
        className={cn(
          "pressable inline-flex h-9 items-center gap-2 overflow-hidden border px-3.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          unfollow
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : following
              ? "border-ion/40 bg-ion/10 text-ion"
              : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
          className
        )}
      >
        <motion.span layout={layout ? "position" : false} className="inline-flex">
          <Icon aria-hidden className="size-4" />
        </motion.span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={word}
            layout={layout ? "position" : false}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(2px)" }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {word}
          </motion.span>
        </AnimatePresence>
        {showCount && (
          <motion.span layout={layout ? "position" : false} className={cn("tabular", following || unfollow ? "opacity-80" : "opacity-70")}>
            {compact(base + state.followers)}
            <span className="sr-only"> followers</span>
          </motion.span>
        )}
      </motion.button>
      {error && (
        <span role="alert" className="block text-xs text-destructive">
          {error}
        </span>
      )}
    </LayoutGroup>
  )
}
