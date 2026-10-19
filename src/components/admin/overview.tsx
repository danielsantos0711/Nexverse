"use client"

import type { Route } from "next"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRightIcon, CalendarDaysIcon, FlagIcon, FolderGit2Icon, LinkIcon, MessageSquareIcon, MessagesSquareIcon, UserPlusIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { AdminHeading } from "@/components/admin/controls"
import { LogPreview } from "@/components/admin/mod-log"
import { AiSetupNotice } from "@/components/ai/moderation-hint"
import { Skeleton } from "@/components/ui/skeleton"
import { loadOverview, type OverviewCounts } from "@/lib/admin"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const TILES: { key: keyof OverviewCounts; label: string; icon: LucideIcon; href: string; tint: string }[] = [
  { key: "members", label: "Members", icon: UsersIcon, href: "/admin/members", tint: "text-ion" },
  { key: "newMembers", label: "New this week", icon: UserPlusIcon, href: "/admin/members", tint: "text-ok" },
  { key: "openReports", label: "Open reports", icon: FlagIcon, href: "/admin/reports", tint: "text-gold" },
  { key: "threads", label: "Forum threads", icon: MessageSquareIcon, href: "/admin/content", tint: "text-model" },
  { key: "submissions", label: "Shared links", icon: LinkIcon, href: "/admin/content?kind=submission", tint: "text-dataset" },
  { key: "projects", label: "Published projects", icon: FolderGit2Icon, href: "/admin/content?kind=project", tint: "text-repo" },
  { key: "events", label: "Events", icon: CalendarDaysIcon, href: "/admin/content?kind=event", tint: "text-tool" },
  { key: "rooms", label: "Chat rooms", icon: MessagesSquareIcon, href: "/chat", tint: "text-ion" },
]

/** The admin home: real totals from the database and what the team did last. */
export function AdminOverview() {
  const me = useRole()
  const [counts, setCounts] = useState<OverviewCounts | null>(null)

  useEffect(() => {
    if (!live) return
    let on = true
    void loadOverview().then((c) => on && setCounts(c))
    return () => {
      on = false
    }
  }, [])

  const open = counts?.openReports ?? 0

  return (
    <>
      <section aria-labelledby="ov-title" className="flex flex-col gap-4">
        <div id="ov-title">
          <AdminHeading title="Overview" lead={live ? "Live totals from the database. Counts include hidden content, which only staff can see." : "Totals appear here once a database is connected."} />
        </div>
        {live && open > 0 && (
          <Link
            href="/admin/reports"
            className="press group flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-sm hover:bg-gold/[0.1] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <FlagIcon aria-hidden className="size-4 text-gold" />
            <span>
              <span className="font-medium">
                {open} open {open === 1 ? "report" : "reports"}
              </span>{" "}
              waiting for a moderator
            </span>
            <ArrowRightIcon aria-hidden className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {TILES.map((t) => {
            const value = counts?.[t.key]
            const Icon = t.icon
            return (
              <li key={t.key}>
                <Link
                  href={t.href as Route}
                  className="press flex h-full flex-col gap-2 rounded-xl border border-border bg-card/50 p-3.5 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon aria-hidden className={cn("size-3.5", t.tint)} />
                    {t.label}
                  </span>
                  {!live ? (
                    <span className="text-sm text-muted-foreground">Not connected</span>
                  ) : counts === null ? (
                    <Skeleton className="h-7 w-14" />
                  ) : (
                    <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">{value === null || value === undefined ? <span className="text-base font-normal text-muted-foreground" title="This table is not available on the database yet">n/a</span> : value.toLocaleString("en")}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="ov-log" className="flex flex-col gap-3 rounded-2xl border border-border bg-card/40 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ov-log" className="text-base font-semibold">
            Latest moderation
          </h2>
          <Link href="/admin/log" className="rounded-sm text-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Full log
          </Link>
        </div>
        <LogPreview />
      </section>

      {live && <AiSetupNotice compact />}

      {(me.isAdmin || !live) && (
        <section aria-labelledby="ov-site" className="flex flex-col gap-3">
          <h2 id="ov-site" className="text-base font-semibold">
            Shape the site
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[
              { href: "/admin/settings/announcement", label: "Post an announcement", blurb: "A line above every page" },
              { href: "/admin/settings/theme", label: "Change the theme", blurb: "Accent colour and motion" },
              { href: "/admin/settings/features", label: "Switch features", blurb: "Turn parts of the site on or off" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href as Route}
                className="press group flex flex-col gap-0.5 rounded-xl border border-border bg-card/50 p-3.5 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {l.label}
                  <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-xs text-muted-foreground">{l.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
