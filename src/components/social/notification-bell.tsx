"use client"

import { Popover } from "@base-ui/react/popover"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useState, useSyncExternalStore } from "react"
import { BellIcon, CheckCheckIcon } from "lucide-react"
import { NotificationItem } from "@/components/social/notification-item"
import { Skeleton } from "@/components/ui/skeleton"
import { markAllRead, markRead, useNotifications, type Notification } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const noop = () => () => {}

/** The header bell: unread count, the latest eight notifications and a way to clear them. Members only. */
export function NotificationBell({ className }: { className?: string }) {
  const { ready, user } = useSession()
  const { ready: loaded, items, unread, error } = useNotifications()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  // The first browser render must match the server's, so the bell appears only after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false)

  if (!live) return null
  if (!mounted || !ready) return <span aria-hidden className="size-9" />
  if (!user) return null

  const latest = items.slice(0, 8)
  const badge = unread > 99 ? "99+" : String(unread)

  function opened(n: Notification) {
    if (!n.readAt) void markRead([n.id]).catch(() => {})
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "pressable relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-white/[0.06] data-[popup-open]:text-foreground",
          className
        )}
      >
        <motion.span
          key={unread}
          className="inline-flex"
          initial={reduce || unread === 0 ? false : { rotate: -14 }}
          animate={{ rotate: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 8 }}
        >
          <BellIcon aria-hidden className="size-[18px]" />
        </motion.span>
        <AnimatePresence initial={false}>
          {unread > 0 && (
            <motion.span
              aria-hidden
              initial={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ion px-1 text-[11px] leading-none font-semibold text-ion-foreground tabular shadow-[0_0_12px_rgb(143_180_255/0.6)]"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={badge}
                  initial={reduce ? false : { y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: -8, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  {badge}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          )}
        </AnimatePresence>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} className="isolate z-50 outline-none">
          <Popover.Popup className="glass w-[min(24rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-hidden rounded-2xl text-popover-foreground shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <Popover.Title className="font-sans text-sm font-semibold tracking-normal">Notifications</Popover.Title>
              <button
                type="button"
                onClick={() => void markAllRead().catch(() => {})}
                disabled={unread === 0}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ion transition-colors hover:bg-ion/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:text-muted-foreground"
              >
                <CheckCheckIcon aria-hidden className="size-3.5" /> Mark all read
              </button>
            </div>
            <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
              {!loaded ? (
                <div className="flex flex-col gap-2 p-2" aria-busy="true" aria-label="Loading notifications">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="size-8 rounded-full" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {error}
                </p>
              ) : latest.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-secondary">
                    <BellIcon aria-hidden className="size-5 text-muted-foreground" />
                  </span>
                  <p className="text-sm font-medium">All quiet in your orbit</p>
                  <p className="text-sm text-muted-foreground">Replies, upvotes and new followers will show up here.</p>
                </div>
              ) : (
                <ul className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {latest.map((n) => (
                      <motion.li
                        key={n.id}
                        layout={reduce ? false : "position"}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                      >
                        <NotificationItem n={n} dense onOpen={opened} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
            <div className="border-t border-border p-1.5">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="flex h-9 items-center justify-center rounded-xl text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                See all notifications
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
