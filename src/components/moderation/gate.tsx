"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LockIcon, ShieldIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { CAP_INFO, REPUTATION_HELP, rolesSentence, useCaps, type Cap } from "@/lib/caps"
import { useRole, type SiteRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const RANK: Record<SiteRole, number> = { guest: 0, member: 1, moderator: 2, admin: 3 }

/**
 * Shows its children only to members with at least the given role. Everyone else gets a clear reason and
 * the way in. The database still checks every write; this keeps people from filling in forms they cannot send.
 */
export function Gate({
  role = "member",
  cap,
  action,
  blockedClassName,
  children,
}: {
  role?: Exclude<SiteRole, "guest">
  /** A finer check than the role: the capability the page needs, from roles and reputation. */
  cap?: Cap
  /** What the page lets you do, for the message: "post a mission", "open the admin panel". Defaults to the cap's verb. */
  action?: string
  /** Classes for the message box when the member cannot get in (for example a page width). */
  blockedClassName?: string
  children: React.ReactNode
}) {
  const me = useRole()
  const caps = useCaps()
  const path = usePathname()
  const doing = action ?? (cap ? CAP_INFO[cap].verb : "do this")
  const box = cn("rounded-2xl border border-border bg-card/40 py-14", blockedClassName)

  // Browser-only copies have no accounts: everything a member can do stays available locally.
  if (!live && role === "member") return children
  if (!me.ready || (cap && !caps.ready)) return <Skeleton className={cn("h-48 w-full rounded-2xl", blockedClassName)} />
  if (RANK[me.role] >= RANK[role] && !(me.suspended && role === "member") && (!cap || caps.can(cap))) return children

  if (me.role === "guest") {
    return (
      <Empty className={box}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>Sign in to {doing}</EmptyTitle>
          <EmptyDescription>Anyone can read Nexverse. Taking part needs a free account, so every post has a real person behind it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href={`/sign-in?next=${encodeURIComponent(path)}`} />}>Sign in or join</Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (me.suspended) {
    return (
      <Empty className={box}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldIcon />
          </EmptyMedia>
          <EmptyTitle>Your account is paused</EmptyTitle>
          <EmptyDescription>
            You can still read everything, but posting is paused until {new Date(me.suspendedUntil!).toLocaleDateString()}. Check your notifications for the reason.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // The role is high enough but the capability is missing: say whether reputation or a role unlocks it.
  const why = cap && RANK[me.role] >= RANK[role] ? caps.why(cap) : null
  if (why && !why.ok && why.reason === "reputation") {
    return (
      <Empty className={box}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>
            Reach {why.need.toLocaleString("en")} reputation to {doing}
          </EmptyTitle>
          <EmptyDescription>
            You have {why.have.toLocaleString("en")}. Members earn points by starting threads, replying and giving answers that solve someone&rsquo;s problem. At {why.tier} this opens up for you.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/forum" />}>
              Go to the forum
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href={REPUTATION_HELP} />}>
              How reputation works
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    )
  }
  const who = why && !why.ok && why.reason === "role" ? rolesSentence(why.roles) : role === "admin" ? "admins" : "moderators"

  return (
    <Empty className={box}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon />
        </EmptyMedia>
        <EmptyTitle>
          Only {who} can {doing}
        </EmptyTitle>
        <EmptyDescription>{why ? "If you think you need this, ask an admin. Everything here stays open to read." : "This part of Nexverse is for the team that runs the site."}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to the home page
        </Button>
      </EmptyContent>
    </Empty>
  )
}
