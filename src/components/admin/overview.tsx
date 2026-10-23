"use client"

import type { Route } from "next"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRightIcon, CircleCheckIcon, DownloadCloudIcon, FlagIcon, InboxIcon, MegaphoneIcon, MenuIcon, PenLineIcon, RadioTowerIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { when } from "@/components/admin/controls"
import { LogPreview } from "@/components/admin/mod-log"
import { Skeleton } from "@/components/ui/skeleton"
import { loadDashboard, type Dashboard } from "@/lib/admin"
import { useAiStatus } from "@/lib/ai-client"
import { useCaps } from "@/lib/caps"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toLocaleString("en"))

/**
 * The admin home: four real numbers, what needs someone today, how the newsroom and AI are doing, quick
 * actions and the latest moderation. Every number comes from the database; a dash means unknown.
 */
export function AdminOverview() {
  const me = useRole()
  const caps = useCaps()
  const ai = useAiStatus()
  const newsroom = caps.ready && caps.can("news.write")
  const [data, setData] = useState<Dashboard | null>(null)

  useEffect(() => {
    if (!live || !caps.ready) return
    let on = true
    void loadDashboard({ newsroom }).then((d) => on && setData(d))
    return () => {
      on = false
    }
  }, [newsroom, caps.ready])

  const loading = live && data === null
  const isAdmin = me.isAdmin || !live

  // What needs someone, most urgent first. Only real conditions; nothing is shown to fill space.
  const todo: { href: string; icon: LucideIcon; text: string; tone: "warn" | "info" }[] = []
  if (data?.openReports) todo.push({ href: "/admin/reports", icon: FlagIcon, tone: "warn", text: `${data.openReports} open ${data.openReports === 1 ? "report" : "reports"} waiting for a moderator` })
  if (data?.news?.lastRun?.status === "failed") todo.push({ href: "/admin/newsroom/control", icon: RadioTowerIcon, tone: "warn", text: "The last newsroom run failed" })
  else if (data?.news && (!data.news.lastRun || data.news.lastRun.stale)) todo.push({ href: "/admin/newsroom/control", icon: RadioTowerIcon, tone: "warn", text: "The newsroom has not run in the last 24 hours" })
  if (data?.news?.drafts) todo.push({ href: "/admin/newsroom", icon: PenLineIcon, tone: "info", text: `${data.news.drafts} ${data.news.drafts === 1 ? "story draft" : "story drafts"} to review` })
  if (data?.news?.tips) todo.push({ href: "/admin/newsroom?tab=tips", icon: InboxIcon, tone: "info", text: `${data.news.tips} new news ${data.news.tips === 1 ? "tip" : "tips"} from members` })
  if (live && ai.ready && !ai.enabled && isAdmin) todo.push({ href: "/admin/ai", icon: SparklesIcon, tone: "warn", text: "AI is off: add a free provider key" })

  const actions = [
    { href: "/admin/newsroom?tab=write", label: "Write a story", icon: PenLineIcon, show: !live || newsroom },
    { href: "/admin/import", label: "Import content", icon: DownloadCloudIcon, show: isAdmin },
    { href: "/admin/settings/announcement", label: "Post an announcement", icon: MegaphoneIcon, show: isAdmin },
    { href: "/admin/menus", label: "Edit menus", icon: MenuIcon, show: true },
  ].filter((a) => a.show)

  const aiJobs = Object.values(ai.jobs).filter(Boolean).length

  return (
    <div className="flex flex-col gap-8">
      <ul aria-label="Totals" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label="Members" value={data?.members} sub={data?.newMembers != null ? `+${n(data.newMembers)} this week` : undefined} href="/admin/members" loading={loading} />
        <Kpi label="Open reports" value={data?.openReports} sub={data?.openReports ? "Waiting for you" : data?.openReports === 0 ? "Queue is clear" : undefined} href="/admin/reports" loading={loading} warn={Boolean(data?.openReports)} />
        <Kpi label="Posts" value={data?.posts} sub={data?.newPosts != null ? `+${n(data.newPosts)} this week` : undefined} href="/admin/content" loading={loading} />
        <Kpi label="Imported" value={data?.imported} sub="Models, datasets and repos" href={isAdmin ? "/admin/import" : "/admin/content?kind=project"} loading={loading} />
      </ul>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Panel title="Needs attention">
            {!live ? (
              <p className="text-sm text-muted-foreground">Connect the database to see what needs you.</p>
            ) : loading || !ai.ready ? (
              <Skeleton className="h-10 w-full" />
            ) : todo.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheckIcon aria-hidden className="size-4 text-ok" /> Nothing needs you right now.
              </p>
            ) : (
              <ul className="flex flex-col">
                {todo.map((t) => (
                  <li key={t.text}>
                    <Link href={t.href as Route} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <t.icon aria-hidden className={cn("size-4 shrink-0", t.tone === "warn" ? "text-gold" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1">{t.text}</span>
                      <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Latest moderation" link={{ href: "/admin/log", label: "Full log" }}>
            <LogPreview limit={5} />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Quick actions">
            <ul className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {actions.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href as Route}
                    className="pressable flex h-10 items-center gap-2.5 rounded-lg bg-raised px-3 text-sm hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <a.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Systems">
            <dl className="flex flex-col gap-3 text-sm">
              {(newsroom || !live) && (
                <Row label="Newsroom" href="/admin/newsroom/control">
                  {!live ? (
                    "Not connected"
                  ) : loading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : data?.news?.lastRun ? (
                    <span className="flex flex-col items-end">
                      <Dot ok={data.news.lastRun.status !== "failed"} label={`Ran ${when(data.news.lastRun.at)}`} />
                      <span className="text-xs text-muted-foreground">{n(data.news.published24h)} published in 24 h</span>
                    </span>
                  ) : (
                    <Dot ok={false} label="No runs yet" />
                  )}
                </Row>
              )}
              <Row label="AI" href={isAdmin ? "/admin/ai" : null}>
                {!live ? "Not connected" : !ai.ready ? <Skeleton className="h-4 w-24" /> : ai.enabled ? <Dot ok label={`On · ${aiJobs} of ${Object.keys(ai.jobs).length} jobs ready`} /> : <Dot ok={false} label="Off" />}
              </Row>
              <Row label="Hidden posts" href="/admin/content">
                {!live ? "Not connected" : loading ? <Skeleton className="h-4 w-10" /> : n(data?.hidden)}
              </Row>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, href, loading, warn }: { label: string; value: number | null | undefined; sub?: string; href: string; loading: boolean; warn?: boolean }) {
  return (
    <li>
      <Link href={href as Route} className="pressable flex h-full flex-col gap-1 rounded-xl bg-card p-4 hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="text-sm text-muted-foreground">{label}</span>
        {!live ? (
          <span className="text-sm text-muted-foreground">Not connected</span>
        ) : loading ? (
          <Skeleton className="my-1 h-7 w-16" />
        ) : (
          <span className={cn("text-3xl font-semibold tracking-[-0.03em] tabular-nums", warn && "text-gold")} title={value === null ? "Not available on this database" : undefined}>
            {n(value)}
          </span>
        )}
        {sub && !loading && live && <span className="text-xs text-muted-foreground">{sub}</span>}
      </Link>
    </li>
  )
}

function Panel({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {link && (
          <Link href={link.href as Route} className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Row({ label, href, children }: { label: string; href: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt>{href ? <Link href={href as Route} className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{label}</Link> : label}</dt>
      <dd className="text-right text-muted-foreground">{children}</dd>
    </div>
  )
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("size-2 rounded-full", ok ? "bg-ok" : "bg-gold")} />
      {label}
    </span>
  )
}
