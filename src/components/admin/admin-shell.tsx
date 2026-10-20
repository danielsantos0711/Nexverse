"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileTextIcon, FlagIcon, KeyRoundIcon, LayoutDashboardIcon, LogInIcon, ListChecksIcon, ListOrderedIcon, MenuIcon, MessageCircleIcon, MessagesSquareIcon, NewspaperIcon, RadioTowerIcon, Settings2Icon, ShieldCheckIcon, SparklesIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { Notice } from "@/components/admin/controls"
import { ADMIN_PAGES } from "@/components/admin/sections"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const ICONS: Record<(typeof ADMIN_PAGES)[number]["href"], LucideIcon> = {
  "/admin": LayoutDashboardIcon,
  "/admin/reports": FlagIcon,
  "/admin/members": UsersIcon,
  "/admin/content": NewspaperIcon,
  "/admin/log": ListChecksIcon,
  "/admin/newsroom": RadioTowerIcon,
  "/admin/forum": MessagesSquareIcon,
  "/admin/chat": MessageCircleIcon,
  "/admin/pages": FileTextIcon,
  "/admin/menus": MenuIcon,
  "/admin/roles": KeyRoundIcon,
  "/admin/ai": SparklesIcon,
  "/admin/logins": LogInIcon,
  "/admin/lists": ListOrderedIcon,
  "/admin/settings": Settings2Icon,
}

/**
 * The admin panel's frame: who you are, the sections, and the page. Moderators and admins get in; site
 * settings are for admins only. A copy without a database has no accounts, so it opens read only with a
 * notice instead, which lets the forms be seen before Supabase is connected.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  if (!live) {
    return (
      <Frame>
        <Notice tone="warn" title="This copy of Nexverse runs in the browser only">
          There are no accounts, reports or members to manage, and nothing here can be saved. Connect Supabase (NEXT_PUBLIC_SUPABASE_URL and the publishable key) to use the admin panel for real.
        </Notice>
        {children}
      </Frame>
    )
  }
  return (
    <div className="shell py-10">
      <Gate role="moderator" action="open the admin panel">
        <Frame>{children}</Frame>
      </Gate>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const me = useRole()
  const pages = ADMIN_PAGES.filter((p) => !p.admin || me.isAdmin || !live)
  const isOn = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"))

  return (
    <div className={cn("flex flex-col gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10", !live && "shell py-10")}>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-ion/30 bg-ion/10 text-ion">
            <ShieldCheckIcon aria-hidden className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg leading-tight font-semibold tracking-[-0.02em]">Admin</h1>
            <p className="text-xs text-muted-foreground">{!live ? "Browser-only preview" : me.isAdmin ? "You are an admin" : "You are a moderator"}</p>
          </div>
          {live && (
            <Badge variant="outline" className="ml-auto lg:hidden">
              {me.isAdmin ? "Admin" : "Moderator"}
            </Badge>
          )}
        </div>
        <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {pages.map((p) => {
              const Icon = ICONS[p.href]
              const on = isOn(p.href)
              return (
                <li key={p.href} className="shrink-0">
                  <Link
                    href={p.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "pressable flex h-9 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      on ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4", on && "text-ion")} />
                    {p.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  )
}
