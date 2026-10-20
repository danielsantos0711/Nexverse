"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { BookmarkIcon } from "lucide-react"
import { toast } from "@/components/site/toaster"
import { toggleBookmark, useBookmarks } from "@/lib/social"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * Bookmark anything by its target key ("model:orbit-8b", "thread:<id>", "news:<id>", "constellation:<slug>").
 * Signed-in members save to their account; everyone else saves in this browser (moved to the account on sign-in).
 * `variant="icon"` is a round icon-only button for dense cards; it still has an accessible name.
 */
export function SaveButton({
  target,
  className,
  variant = "pill",
  label = "Save",
  onChange,
}: {
  target: string
  /** Called after the bookmark was saved (true) or removed (false). */
  onChange?: (saved: boolean) => void
  className?: string
  variant?: "pill" | "icon"
  label?: string
}) {
  const { ready, targets } = useBookmarks()
  const saved = targets.has(target)
  const reduce = useReducedMotion()
  const [pops, setPops] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")

  async function toggle(e: React.MouseEvent) {
    // Cards make their whole surface a link; the button must not follow it.
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const next = !saved
    if (next) setPops((p) => p + 1)
    setBusy(true)
    try {
      await toggleBookmark(target, next)
      setStatus(next ? "Saved" : "Removed from saved")
      toast(next ? "Saved. Find it any time in Saved." : "Removed from saved.", {
        action: { label: "Undo", run: () => void toggleBookmark(target, !next).then(() => onChange?.(!next)) },
      })
      onChange?.(next)
    } catch {
      setStatus("Could not save. Try again.")
      toast("Could not save. Try again.", { tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const icon = (
    <span className="relative inline-flex">
      <motion.span
        key={saved ? `on-${pops}` : "off"}
        className="inline-flex"
        initial={!reduce && saved && pops > 0 ? { scale: 0.5 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 14, mass: 0.7 }}
      >
        <BookmarkIcon aria-hidden className={cn("size-4 transition-[fill,color] duration-200", saved && "fill-current")} />
      </motion.span>
      <AnimatePresence>
        {!reduce && saved && pops > 0 && (
          <motion.span key={pops} aria-hidden className="pointer-events-none absolute inset-0">
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <motion.i
                key={deg}
                className="absolute top-1/2 left-1/2 size-1 rounded-full bg-ion"
                initial={{ opacity: 1, x: "-50%", y: "-50%" }}
                animate={{
                  opacity: 0,
                  x: `calc(-50% + ${Math.cos((deg * Math.PI) / 180) * 14}px)`,
                  y: `calc(-50% + ${Math.sin((deg * Math.PI) / 180) * 14}px)`,
                }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )

  const text = saved ? "Saved" : label
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={variant === "icon" ? (saved ? "Saved. Remove from saved" : label) : undefined}
        title={variant === "icon" ? (saved ? "Remove from saved" : label) : undefined}
        disabled={!ready}
        className={cn(
          "pressable relative z-10 inline-flex items-center justify-center rounded-full border text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          variant === "icon" ? "size-9" : "h-9 gap-2 px-3.5",
          saved ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/60 text-foreground hover:bg-secondary",
          className
        )}
      >
        {icon}
        {variant === "pill" && <span>{text}</span>}
      </button>
      <span role="status" className="sr-only">
        {status}
      </span>
    </>
  )
}
