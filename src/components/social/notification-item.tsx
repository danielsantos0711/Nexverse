"use client"

import Link from "next/link"
import { ArrowUpIcon, AtSignIcon, MessageSquareIcon, SparklesIcon, UserPlusIcon, type LucideIcon } from "lucide-react"
import { MemberAvatar } from "@/components/forum/discussion"
import { describeTarget, type Notification, type NotificationKind } from "@/lib/social"
import { cn } from "@/lib/utils"

const KIND: Record<NotificationKind, { icon: LucideIcon; tint: string; verb: string }> = {
  reply: { icon: MessageSquareIcon, tint: "text-ion", verb: "replied to your thread" },
  like: { icon: ArrowUpIcon, tint: "text-gold", verb: "upvoted your thread" },
  follow: { icon: UserPlusIcon, tint: "text-ok", verb: "started following you" },
  mention: { icon: AtSignIcon, tint: "text-ion", verb: "mentioned you" },
  system: { icon: SparklesIcon, tint: "text-gold", verb: "" },
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. Uses the real clock: notifications are live. */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  if (d === 1) return "yesterday"
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function notificationText(n: Notification) {
  const k = KIND[n.kind]
  if (n.kind === "system") return n.snippet ?? "Nexverse update"
  return `${n.actor?.name ?? "Someone"} ${k.verb}`
}

export function notificationHref(n: Notification) {
  return n.target ? describeTarget(n.target).href : null
}

/** One notification: who, what, an excerpt and when. The whole row is a link when there is somewhere to go. */
export function NotificationItem({
  n,
  dense = false,
  onOpen,
  actions,
  className,
}: {
  n: Notification
  dense?: boolean
  onOpen?: (n: Notification) => void
  actions?: React.ReactNode
  className?: string
}) {
  const k = KIND[n.kind]
  const Icon = k.icon
  const href = notificationHref(n)
  const unread = !n.readAt
  const excerpt = n.kind !== "system" && n.snippet ? n.snippet : null
  const title = notificationText(n)

  return (
    <div className={cn("group relative flex gap-3 rounded-xl transition-colors hover:bg-white/[0.04]", dense ? "p-2.5" : "p-4", className)}>
      <span className="relative shrink-0">
        {n.actor ? (
          <MemberAvatar name={n.actor.name} size={dense ? 32 : 40} />
        ) : (
          <span className={cn("grid place-items-center rounded-full bg-secondary", dense ? "size-8" : "size-10")}>
            <SparklesIcon aria-hidden className="size-4 text-gold" />
          </span>
        )}
        <span className={cn("absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-background ring-1 ring-border", k.tint)}>
          <Icon aria-hidden className="size-2.5" />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cn("text-sm leading-snug", unread ? "text-foreground" : "text-muted-foreground")}>
          {href ? (
            <Link href={href} onClick={() => onOpen?.(n)} className="font-medium after:absolute after:inset-0 focus-visible:outline-none">
              {title}
            </Link>
          ) : (
            <span className="font-medium">{title}</span>
          )}
          {unread && <span className="sr-only"> (unread)</span>}
        </p>
        {excerpt && <p className={cn("text-sm text-muted-foreground", dense ? "line-clamp-1" : "line-clamp-2")}>{excerpt}</p>}
        <time dateTime={n.createdAt} className="text-xs text-muted-foreground" suppressHydrationWarning>
          {timeAgo(n.createdAt)}
        </time>
      </div>
      {actions && <div className="relative z-10 flex shrink-0 items-start gap-1">{actions}</div>}
      {unread && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-ion shadow-[0_0_10px_rgb(143_180_255/0.8)]" />}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl ring-ion/50 group-has-[a:focus-visible]:ring-2" />
    </div>
  )
}
