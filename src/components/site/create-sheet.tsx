"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname, useRouter } from "next/navigation"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { ArrowRightIcon, LockIcon, PlusIcon, XIcon } from "lucide-react"
import { GlassKeys } from "@/components/glass/glass-keys"
import { iconFor } from "@/components/site/icons"
import { useShortcut } from "@/components/site/shortcuts"
import { isCap, useCaps } from "@/lib/caps"
import { useCopy } from "@/lib/content"
import { useMenus, type CreateLink } from "@/lib/menus"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

/*
 * The Create sheet: the one place every "make something" starts (project, model, dataset, tool, thread, event,
 * mission, crew, collection, launch, link, news tip). The list is the admins' (Admin › Menus, "create"), with
 * the defaults in lib/menus.ts. It rises from the bottom on phones and scales in at the centre on desktop: the
 * same tiles, the same keys (1 to 9 pick a tile, Esc closes). Guests see what they could make and are asked to
 * sign in; members without a power see why on the page they land on (its Gate explains how to earn it).
 *
 * Anything opens it: openCreate(), the header's Create button, the tab bar's middle button, or C anywhere.
 */

const EVENT = "nexverse:create"
export const openCreate = () => window.dispatchEvent(new Event(EVENT))

const TINT: Record<string, string> = {
  ion: "text-ion bg-ion/10 ring-ion/25",
  gold: "text-gold bg-gold/10 ring-gold/25",
  model: "text-model bg-model/10 ring-model/25",
  dataset: "text-dataset bg-dataset/10 ring-dataset/25",
  tool: "text-tool bg-tool/10 ring-tool/25",
  repo: "text-repo bg-repo/10 ring-repo/25",
}

export function CreateSheet() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const reduce = useReducedMotion()
  const { create } = useMenus()
  const { user, ready } = useSession()
  const caps = useCaps()
  const title = useCopy("create.title", "Create something")
  const lead = useCopy("create.lead", "Pick what you are making. Each one opens its own form.")
  const guest = useCopy("create.guest", "Sign in to create. Anyone can look around first.")

  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])

  // A new page closes the sheet (a tile was followed).
  const [shownFor, setShownFor] = useState(pathname)
  if (shownFor !== pathname) {
    setShownFor(pathname)
    setOpen(false)
  }

  useShortcut(
    "c",
    useCallback((e: KeyboardEvent) => {
      e.preventDefault()
      setOpen(true)
    }, [])
  )

  const signedOut = ready && !user
  const locked = (l: CreateLink) => !signedOut && caps.ready && l.cap !== undefined && isCap(l.cap) && !caps.can(l.cap)
  const hrefFor = (l: CreateLink) => (signedOut && l.href.startsWith("/") ? `/sign-in?next=${encodeURIComponent(l.href)}` : l.href)

  function onKey(e: React.KeyboardEvent) {
    const n = Number(e.key)
    if (!Number.isInteger(n) || n < 1 || n > 9 || e.metaKey || e.ctrlKey) return
    const l = create[n - 1]
    if (!l || (e.target as HTMLElement).tagName === "INPUT") return
    e.preventDefault()
    setOpen(false)
    router.push(hrefFor(l) as Route)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#020308]/60 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup
          onKeyDown={onKey}
          className="fixed inset-x-0 bottom-0 z-50 outline-none sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:w-[min(44rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
            className="liquid-glass-strong flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:rounded-3xl sm:pb-0"
          >
            {/* the phone's grab handle; the sheet itself closes on Esc, the backdrop or the button */}
            <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />
            <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-6">
              <div className="flex flex-col gap-1">
                <DialogPrimitive.Title className="font-display text-lg font-semibold">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">{signedOut ? guest : lead}</DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close aria-label="Close" className="pressable grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
                <XIcon aria-hidden className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <ul className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-4 sm:grid-cols-3 sm:px-4 sm:pb-5">
              {create.map((l, i) => {
                const Icon = iconFor(l.icon, PlusIcon)
                const lock = locked(l)
                return (
                  <li key={`${l.href}-${i}`} className="nx-enter" style={{ "--i": i } as React.CSSProperties}>
                    <Link
                      href={hrefFor(l) as Route}
                      onClick={() => setOpen(false)}
                      className="group nx-lift relative flex h-full flex-col gap-2 rounded-2xl border border-border bg-card/70 p-3.5 outline-none focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="flex items-center justify-between">
                        <span className={cn("grid size-9 place-items-center rounded-xl ring-1 transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-110 group-hover:-rotate-6", TINT[l.accent] ?? TINT.ion)}>
                          <Icon aria-hidden className="size-4.5" />
                        </span>
                        {i < 9 && <span aria-hidden className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">{i + 1}</span>}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                          {l.label}
                          {(lock || signedOut) && <LockIcon aria-label={signedOut ? "Sign in first" : "Needs more reputation"} className="size-3 text-muted-foreground" />}
                        </span>
                        <span className="text-xs leading-snug text-muted-foreground">{l.description}</span>
                      </span>
                      <ArrowRightIcon aria-hidden className="absolute right-3 bottom-3 size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] duration-(--dur-base) group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div aria-hidden className="hidden items-center gap-4 border-t border-white/[0.06] px-6 py-2.5 text-xs text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <GlassKeys keys={["1"]} live={false} /> to <GlassKeys keys={["9"]} live={false} /> pick
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GlassKeys keys={["Esc"]} live={false} /> close
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <GlassKeys keys={["C"]} /> anywhere
              </span>
            </div>
          </motion.div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
