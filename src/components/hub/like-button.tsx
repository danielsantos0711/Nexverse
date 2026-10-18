"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { HeartIcon } from "lucide-react"
import { compact } from "@/lib/data"
import { getLikes, setLike, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** Like anything. The sample count is the baseline; members' likes from the database are added to it. */
export function LikeButton({ target, base = 0, className, label = "Like" }: { target: string; base?: number; className?: string; label?: string }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const [state, setState] = useState({ count: 0, mine: false })
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getLikes(target, user?.id)
      .then((s) => !stale && setState(s))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [target, ready, user?.id])

  async function toggle() {
    if (live && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const on = !state.mine
    setState((s) => ({ count: s.count + (on ? 1 : -1), mine: on }))
    if (on) setBurst((b) => b + 1)
    try {
      await setLike(target, on)
    } catch {
      setState((s) => ({ count: s.count + (on ? -1 : 1), mine: !on }))
    }
  }

  const total = base + state.count
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.mine}
      className={cn(
        "pressable relative inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
        state.mine ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/60 text-foreground hover:bg-secondary",
        className
      )}
    >
      <span className="relative">
        <HeartIcon aria-hidden className={cn("size-4 transition-transform duration-200", state.mine && "scale-110 fill-current")} />
        <AnimatePresence>
          {burst > 0 && state.mine && (
            <motion.span
              key={burst}
              aria-hidden
              initial={{ opacity: 0.8, scale: 0.6 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 rounded-full border border-ion"
            />
          )}
        </AnimatePresence>
      </span>
      {label}
      <span className="text-muted-foreground tabular">{compact(total)}</span>
    </button>
  )
}
