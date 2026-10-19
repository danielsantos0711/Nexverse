"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookmarkIcon, LayoutDashboardIcon, LogOutIcon, PlusIcon, SettingsIcon, SparklesIcon, UserIcon } from "lucide-react"
import { MemberAvatar } from "@/components/forum/discussion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

const LINKS = [
  { href: "/you", label: "Your page", icon: UserIcon },
  { href: "/studio", label: "Studio", icon: LayoutDashboardIcon },
  { href: "/new/project", label: "New project", icon: PlusIcon },
  { href: "/for-you", label: "For you", icon: SparklesIcon },
  { href: "/saved", label: "Saved", icon: BookmarkIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const

/** Sign in, or the signed-in member's initials opening their menu. Hidden when there are no accounts. */
export function AccountButton() {
  const { ready, member } = useSession()
  const pathname = usePathname()
  if (!live) return null
  if (!ready) return <span aria-hidden className="size-7" />
  if (member) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Account: ${member.name}`} className="pressable rounded-full">
          <MemberAvatar name={member.name} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{member.name}</DropdownMenuLabel>
            {LINKS.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} render={<Link href={href} />}>
                <Icon aria-hidden />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOutIcon aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  return (
    <Link
      href={/^\/(sign-in|join|reset-password|auth|welcome)(\/|$)/.test(pathname) ? "/sign-in" : `/sign-in?next=${encodeURIComponent(pathname)}`}
      className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      Sign in
    </Link>
  )
}
