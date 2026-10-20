"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useState } from "react"
import { BellIcon, CheckCheckIcon, CircleIcon, CircleDotIcon, Trash2Icon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { NotificationItem } from "@/components/social/notification-item"
import { Button } from "@/components/ui/button"
import { deleteNotification, loadMoreNotifications, markAllRead, markRead, useNotifications, type Notification } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const EASE = [0.23, 1, 0.32, 1] as const

function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86400000)
  if (diff <= 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "long" })
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })
}

function byDay(items: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = []
  for (const n of items) {
    const label = dayLabel(n.createdAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(n)
    else groups.push({ label, items: [n] })
  }
  return groups
}

export function NotificationsView() {
  const { ready, user } = useSession()
  if (!live) {
    return <Quiet title={<Copy k="notifications.notifications-view.no-accounts-in-this-copy">No accounts in this copy</Copy>} body={<Copy k="notifications.notifications-view.this-copy-of-nexverse-has" multiline>This copy of Nexverse has no database, so there is nobody to notify you. Everything you write stays in this browser.</Copy>} />
  }
  if (!ready) return <PageSkeleton />
  if (!user) {
    return (
      <Quiet title={<Copy k="notifications.notifications-view.sign-in-to-see-your">Sign in to see your notifications</Copy>} body={<Copy k="notifications.notifications-view.replies-to-your-threads-upvotes">Replies to your threads, upvotes and new followers arrive here the moment they happen.</Copy>}>
        <Link href="/sign-in?next=/notifications" className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          <Copy k="notifications.notifications-view.sign-in">Sign in</Copy>
        </Link>
      </Quiet>
    )
  }
  return <Inbox />
}

function Inbox() {
  const { ready, items, unread, error } = useNotifications()
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [more, setMore] = useState<"idle" | "loading" | "done">("idle")
  const [actionError, setActionError] = useState("")

  const visible = filter === "unread" ? items.filter((n) => !n.readAt) : items
  const groups = byDay(visible)

  function run(p: Promise<unknown>) {
    setActionError("")
    p.catch((e: Error) => setActionError(e.message))
  }

  async function loadMore() {
    setMore("loading")
    try {
      const n = await loadMoreNotifications(40)
      setMore(n < 40 ? "done" : "idle")
    } catch (e) {
      setActionError((e as Error).message)
      setMore("idle")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="toolbar" aria-label="Show" className="glass flex rounded-full p-1">
          {(
            [
              ["all", "All", items.length],
              ["unread", "Unread", unread],
            ] as const
          ).map(([id, label, count]) => {
            const on = filter === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(id)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "text-ion-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId="notifications-filter-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-ion"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">
                  {label} <span className="tabular opacity-70">{count}</span>
                </span>
              </button>
            )
          })}
        </div>
        <Button variant="secondary" onClick={() => run(markAllRead())} disabled={unread === 0}>
          <CheckCheckIcon aria-hidden /> <Copy k="notifications.notifications-view.mark-all-read">Mark all read</Copy>
        </Button>
      </div>

      {(error || actionError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || actionError}
        </p>
      )}

      {!ready ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading notifications">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary/60 motion-reduce:animate-none" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        filter === "unread" && items.length > 0 ? (
          <Quiet title={<Copy k="notifications.notifications-view.you-are-all-caught-up">You are all caught up</Copy>} body={<Copy k="notifications.notifications-view.no-unread-notifications-nice">No unread notifications. Nice.</Copy>} />
        ) : (
          <Quiet title={<Copy k="notifications.notifications-view.all-quiet-in-your-orbit">All quiet in your orbit</Copy>} body={<Copy k="notifications.notifications-view.start-a-thread-or-share">Start a thread or share something. Replies, upvotes and new followers will show up here.</Copy>}>
            <Link href="/forum/new" className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
              <Copy k="notifications.notifications-view.start-a-thread">Start a thread</Copy>
            </Link>
          </Quiet>
        )
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
              <h2 className="sticky top-16 z-10 -mx-1 self-start rounded-full px-1 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
                {g.label}
              </h2>
              <ul className="glass flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl">
                <AnimatePresence initial={false} mode="popLayout">
                  {g.items.map((n) => (
                    <motion.li
                      key={n.id}
                      layout={reduce ? false : "position"}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.18 } }}
                      transition={{ duration: 0.25, ease: EASE }}
                    >
                      <NotificationItem
                        n={n}
                        className="rounded-none"
                        onOpen={(x) => !x.readAt && run(markRead([x.id]))}
                        actions={
                          <>
                            <IconAction
                              label={n.readAt ? "Mark as unread" : "Mark as read"}
                              onClick={() => run(markRead([n.id], !n.readAt))}
                              icon={n.readAt ? CircleDotIcon : CircleIcon}
                            />
                            <IconAction label="Delete notification" onClick={() => run(deleteNotification(n.id))} icon={Trash2Icon} />
                          </>
                        }
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
          {filter === "all" && items.length >= 60 && more !== "done" && (
            <Button variant="ghost" className="self-center" onClick={loadMore} disabled={more === "loading"}>
              {more === "loading" ? "Loading…" : <Copy k="notifications.notifications-view.show-older">Show older</Copy>}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function IconAction({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof BellIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-muted-foreground opacity-100 transition-[opacity,color,background-color] hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
}

function Quiet({ title, body, children }: { title: React.ReactNode; body: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-ion/10 text-ion shadow-[0_0_40px_-6px_rgb(143_180_255/0.6)]">
        <BellIcon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  )
}
