"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LockIcon, ShieldIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useRole, type SiteRole } from "@/lib/roles"
import { live } from "@/lib/supabase"

const RANK: Record<SiteRole, number> = { guest: 0, member: 1, moderator: 2, admin: 3 }

/**
 * Shows its children only to members with at least the given role. Everyone else gets a clear reason and
 * the way in. The database still checks every write; this keeps people from filling in forms they cannot send.
 */
export function Gate({
  role = "member",
  action = "do this",
  children,
}: {
  role?: Exclude<SiteRole, "guest">
  /** What the page lets you do, for the message: "post a mission", "open the admin panel". */
  action?: string
  children: React.ReactNode
}) {
  const me = useRole()
  const path = usePathname()

  // Browser-only copies have no accounts: everything a member can do stays available locally.
  if (!live && role === "member") return children
  if (!me.ready) return <Skeleton className="h-48 w-full rounded-2xl" />
  if (RANK[me.role] >= RANK[role] && !(me.suspended && role === "member")) return children

  if (me.role === "guest") {
    return (
      <Empty className="rounded-2xl border border-border bg-card/40 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>Sign in to {action}</EmptyTitle>
          <EmptyDescription>Anyone can read Nexverse. Taking part needs a free account, so every post has a real person behind it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href={`/sign-in?next=${encodeURIComponent(path)}`} />}>Sign in or join</Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (me.suspended) {
    return (
      <Empty className="rounded-2xl border border-border bg-card/40 py-14">
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

  return (
    <Empty className="rounded-2xl border border-border bg-card/40 py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon />
        </EmptyMedia>
        <EmptyTitle>Only {role === "admin" ? "admins" : "moderators"} can {action}</EmptyTitle>
        <EmptyDescription>This part of Nexverse is for the team that runs the site.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href="/" />}>
          Back to the home page
        </Button>
      </EmptyContent>
    </Empty>
  )
}
