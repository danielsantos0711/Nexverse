"use client"

import Link from "next/link"
import { SquarePenIcon } from "lucide-react"
import { primaryButton } from "@/components/forum/forum-ui"
import { useRole } from "@/lib/roles"

/** "New thread" for a category page. Announcements are written by the team, so members do not get the button there. */
export function NewThreadLink({ category }: { category: string }) {
  const { isStaff, ready } = useRole()
  if (category === "announcements" && !(ready && isStaff)) {
    return <span className="text-xs text-muted-foreground">Posted by the Nexverse team. Members can reply.</span>
  }
  return (
    <Link href={`/forum/new?c=${category}`} className={primaryButton}>
      <SquarePenIcon aria-hidden className="size-4" /> New thread
    </Link>
  )
}
