"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MemberAvatar } from "@/components/app/member"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/** Sign in, or the signed-in member's initials linking to their page. Hidden when there are no accounts. */
export function AccountButton() {
  const { ready, member } = useSession()
  const pathname = usePathname()
  if (!live) return null
  if (!ready) return <span aria-hidden className="size-9" />
  if (member) {
    return (
      <Link href="/you" aria-label={`You: ${member.name}`} className="pressable rounded-full">
        <MemberAvatar name={member.name} />
      </Link>
    )
  }
  return (
    <Link
      href={pathname.startsWith("/sign-in") || pathname.startsWith("/auth") ? "/sign-in" : `/sign-in?next=${encodeURIComponent(pathname)}`}
      className="rounded-full px-3 py-2 text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      Sign in
    </Link>
  )
}
