"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import {
  ChevronsUpDownIcon,
  DownloadCloudIcon,
  FileTextIcon,
  FlagIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  PaletteIcon,
  RadioTowerIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { AdminFrameContext, Notice } from "@/components/admin/controls"
import { ADMIN_GROUPS, itemHref, locate, type AdminIcon, type AdminItem, type AdminTab } from "@/components/admin/sections"
import { Gate } from "@/components/moderation/gate"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const ICONS: Record<AdminIcon, LucideIcon> = {
  overview: LayoutDashboardIcon,
  content: NewspaperIcon,
  newsroom: RadioTowerIcon,
  import: DownloadCloudIcon,
  reports: FlagIcon,
  members: UsersIcon,
  spaces: MessagesSquareIcon,
  pages: FileTextIcon,
  menus: MenuIcon,
  appearance: PaletteIcon,
  access: KeyRoundIcon,
  ai: SparklesIcon,
}

/**
 * The admin panel's frame, laid out like a hosting dashboard: a sidebar of a few groups on the left (a sheet on
 * phones), and for the open page one title row, one line saying what it is for, and its tabs. Moderators and
 * admins get in; admin-only pages and tabs are hidden from moderators. A copy without a database has no
 * accounts, so it opens read only with a notice instead, which lets the forms be seen before Supabase is
 * connected.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  if (!live) {
    return (
      <Frame
        notice={
          <Notice tone="warn" title="Browser-only preview">
            This copy has no database, so nothing here can be saved. Connect Supabase to use the admin panel.
          </Notice>
        }
      >
        {children}
      </Frame>
    )
  }
  return (
    <div className="shell py-8">
      <Gate role="moderator" action="open the admin panel">
        <Frame>{children}</Frame>
      </Gate>
    </div>
  )
}

function useVisible() {
  const me = useRole()
  const isAdmin = me.isAdmin || !live
  const groups = useMemo(
    () =>
      ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, tabs: i.tabs.filter((t) => !t.admin || isAdmin) })).filter((i) => i.tabs.length > 0) })).filter(
        (g) => g.items.length > 0
      ),
    [isAdmin]
  )
  return { groups, isAdmin, role: !live ? "Preview" : me.isAdmin ? "Admin" : "Moderator" }
}

function Frame({ children, notice }: { children: React.ReactNode; notice?: React.ReactNode }) {
  const path = usePathname()
  const { groups, isAdmin, role } = useVisible()
  const here = locate(path)
  const item = here ? (groups.flatMap((g) => g.items).find((i) => i.id === here.item.id) ?? null) : null
  const [actions, setActions] = useState<HTMLElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const covers = useMemo(() => {
    const set = new Set<string>()
    if (here) {
      set.add(here.item.label.toLowerCase())
      for (const t of here.item.tabs) {
        set.add(t.label.toLowerCase())
        t.covers?.forEach((c) => set.add(c.toLowerCase()))
      }
    }
    return set
  }, [here])

  const frame = useMemo(() => ({ covers, actions }), [covers, actions])

  return (
    <div className={cn("flex flex-col gap-5 lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10", !live && "shell py-8")}>
      <aside aria-label="Admin" className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-4 lg:self-start lg:overflow-y-auto lg:pb-4">
        <Brand role={role} />
        <AdminNav groups={groups} isAdmin={isAdmin} current={item?.id ?? null} />
      </aside>

      {/* Phones and tablets: one bar that opens the same navigation in a sheet. */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          className="pressable flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-card px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MenuIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Admin</span>
          <span aria-hidden className="text-muted-foreground/60">/</span>
          <span className="truncate font-medium">{item?.label ?? "Menu"}</span>
          <ChevronsUpDownIcon aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
        <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground">{role}</span>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[min(20rem,88vw)] gap-3 overflow-y-auto p-4">
          <SheetHeader className="p-0 pr-10">
            <SheetTitle>Admin</SheetTitle>
            <SheetDescription>{role === "Admin" ? "You are an admin" : role === "Moderator" ? "You are a moderator" : "Browser-only preview"}</SheetDescription>
          </SheetHeader>
          <AdminNav groups={groups} isAdmin={isAdmin} current={item?.id ?? null} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col gap-6">
        {notice}
        {here && item && <PageHeader item={item} tab={here.tab} actionsRef={setActions} />}
        <AdminFrameContext value={frame}>
          <div className="flex min-w-0 flex-col gap-6 [&_div[id$=-title]:empty]:hidden">{children}</div>
        </AdminFrameContext>
      </div>
    </div>
  )
}

function Brand({ role }: { role: string }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 rounded-lg px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="text-base font-semibold tracking-[-0.02em]">Admin</span>
      <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{role}</span>
    </Link>
  )
}

type Group = { id: string; label: string | null; items: AdminItem[] }

/** The sidebar: a filter that searches every page, tab and setting, then the groups. */
function AdminNav({ groups, isAdmin, current, onNavigate }: { groups: Group[]; isAdmin: boolean; current: string | null; onNavigate?: () => void }) {
  const [q, setQ] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const needle = q.trim().toLowerCase()
  const hits = useMemo(() => {
    if (!needle) return []
    const words = needle.split(/\s+/)
    return groups.flatMap((g) =>
      g.items.flatMap((i) =>
        i.tabs
          .filter((t) => {
            const hay = `${i.label} ${t.label} ${t.blurb} ${t.keywords ?? ""} ${(t.covers ?? []).join(" ")}`.toLowerCase()
            return words.every((w) => hay.includes(w))
          })
          .map((t) => ({ item: i, tab: t }))
      )
    )
  }, [groups, needle])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("")
          }}
          placeholder="Search admin"
          aria-label="Search admin pages and settings"
          className="h-9 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("")
              input.current?.focus()
            }}
            className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <XIcon aria-hidden className="size-3.5" />
          </button>
        )}
      </div>

      {needle ? (
        <ul aria-label="Search results" className="flex flex-col gap-0.5">
          {hits.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Nothing matches “{q.trim()}”.</li>}
          {hits.map(({ item, tab }) => {
            const Icon = ICONS[item.icon]
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href as Route}
                  onClick={() => {
                    setQ("")
                    onNavigate?.()
                  }}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.tabs.length > 1 || tab.label !== item.label ? `${item.label} › ${tab.label}` : item.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{tab.blurb}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <nav aria-label="Admin sections" className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-0.5">
              {g.label && <p className="px-2.5 pb-1 text-xs text-muted-foreground">{g.label}</p>}
              <ul className="flex flex-col gap-0.5">
                {g.items.map((i) => {
                  const Icon = ICONS[i.icon]
                  const on = i.id === current
                  return (
                    <li key={i.id}>
                      <Link
                        href={itemHref(i, isAdmin) as Route}
                        onClick={onNavigate}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "pressable flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          on ? "bg-raised font-medium text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        )}
                      >
                        <Icon aria-hidden className={cn("size-4 shrink-0", on ? "text-foreground" : "text-muted-foreground")} />
                        {i.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}

/** One title row (with the page's own buttons on the right), one line about the open tab, and the tabs. */
function PageHeader({ item, tab, actionsRef }: { item: AdminItem; tab: AdminTab; actionsRef: (el: HTMLElement | null) => void }) {
  const tabs = item.tabs
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em] sm:text-[1.75rem]">{item.label}</h1>
          <p className="text-sm text-muted-foreground">{tab.blurb}.</p>
        </div>
        <div ref={actionsRef} data-admin-actions="" className="flex flex-wrap items-center gap-2 empty:hidden" />
      </div>
      {/* A page's own heading may still carry a link to a sibling tab; the tabs below already offer it. */}
      {tabs.length > 1 && <style>{tabs.map((t) => `[data-admin-actions] a[href="${t.href}"]{display:none}`).join("")}</style>}
      {tabs.length > 1 && (
        <nav aria-label={`${item.label} sections`} className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1">
            {tabs.map((t) => {
              const on = t.href === tab.href
              return (
                <li key={t.href} className="shrink-0">
                  <Link
                    href={t.href as Route}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-10 items-center px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                      on ? "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </header>
  )
}
