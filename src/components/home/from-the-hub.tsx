"use client"

import type { Route } from "next"
import Link from "next/link"
import { NewspaperIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { Skeleton } from "@/components/ui/skeleton"
import { live } from "@/lib/supabase"
import { loadSharedNews, since, useLoad } from "./hub-data"

/** The briefing's last line: news links members shared, newest first, or an invitation to share the first. */
export function FromTheHub() {
  const items = useLoad(() => loadSharedNews(3), [])
  if (items === undefined) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-white/[0.1] px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2">
          <NewspaperIcon aria-hidden className="size-4 text-gold" />
          {live ? "No member has shared news yet. Seen something worth reading? Share it and it leads this line." : "News members share shows here once the database is connected."}
        </p>
        <Link href="/share" className="pressable inline-flex h-9 shrink-0 items-center rounded-full bg-white/[0.06] px-4 text-foreground hover:bg-white/[0.1]">
          Share a news link
        </Link>
      </div>
    )
  }
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {items.map((n) => {
        let host = ""
        try {
          host = new URL(n.url ?? "").hostname.replace(/^www\./, "")
        } catch {}
        return (
          <li key={n.id}>
            <Link href={n.href as Route} className="press group flex h-full gap-3 rounded-xl bg-white/[0.025] p-2.5 hover:bg-white/[0.05]">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-lg">
                <Cover seed={n.id} kind="news" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-xs text-gold/90">
                  {host || "Shared link"} · {since(n.at)}
                </span>
                <span className="line-clamp-2 text-sm leading-snug font-medium">
                  {n.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">Shared by {n.by}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
