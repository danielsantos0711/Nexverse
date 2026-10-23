"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { LogOutIcon } from "lucide-react"
import { iconFor } from "@/components/site/icons"
import { useMenus } from "@/lib/menus"
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

/**
 * Sign in, or the signed-in member's initials opening their menu: the "You" links of the menus (lib/menus.ts,
 * edited with the footer's You column in Admin › Menus). Hidden when there are no accounts.
 */
export function AccountButton() {
  const { ready, member } = useSession()
  const pathname = usePathname()
  const { you } = useMenus()
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
            {you.links.map(({ href, label, icon }) => {
              const Icon = iconFor(icon)
              return (
                <DropdownMenuItem key={href} render={<Link href={href as Route} />}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuItem>
              )
            })}
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
      className="whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      Sign in
    </Link>
  )
}
