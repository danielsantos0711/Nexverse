"use client"

import type { Route } from "next"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ListChecksIcon } from "lucide-react"
import { AdminHeading, Notice, when } from "@/components/admin/controls"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listLog, logTargetHref, type LogEntry } from "@/lib/admin"
import { ACTION_LABELS, CONTENT_KINDS, isContentKind } from "@/lib/moderation"
import { live } from "@/lib/supabase"

const targetLabel = (kind: string) => (isContentKind(kind) ? CONTENT_KINDS[kind].label.toLowerCase() : kind === "profile" ? "member" : kind)

/** One line of the log: who did what to what, when, and why. */
function LogRow({ e }: { e: LogEntry }) {
  const href = logTargetHref(e)
  return (
    <li className="flex flex-col gap-0.5 border-b border-border px-1 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()} className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
        {when(e.createdAt)}
      </time>
      <p className="min-w-0 text-sm">
        <span className="font-medium">{e.actor?.name ?? "A former team member"}</span> {(ACTION_LABELS[e.action] ?? e.action).toLowerCase()}{" "}
        {href ? (
          <Link href={href as Route} className="rounded-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            a {targetLabel(e.targetKind)}
          </Link>
        ) : (
          <span>a {targetLabel(e.targetKind)}</span>
        )}
        {e.action === "role" && e.note && <span className="text-muted-foreground"> → {e.note}</span>}
        {e.action !== "role" && e.note && <span className="text-muted-foreground"> · “{e.note}”</span>}
      </p>
    </li>
  )
}

/** The latest entries, for the overview. */
export function LogPreview({ limit = 8 }: { limit?: number }) {
  const [state, setState] = useState<{ entries: LogEntry[]; error: string | null } | null>(null)
  useEffect(() => {
    let on = true
    void listLog({ limit }).then((r) => on && setState(r))
    return () => {
      on = false
    }
  }, [limit])
  if (!live) return <p className="text-sm text-muted-foreground">The log fills up as moderators act. It needs the database.</p>
  if (!state) return <LogSkeleton rows={4} />
  if (state.error) return <Notice tone="warn" title="The log could not load">{state.error}</Notice>
  if (!state.entries.length) return <p className="text-sm text-muted-foreground">Nothing yet. Every hide, removal, role change and suspension will show here.</p>
  return (
    <ul className="flex flex-col">
      {state.entries.map((e) => (
        <LogRow key={e.id} e={e} />
      ))}
    </ul>
  )
}

function LogSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  )
}

const PAGE = 50

/** The whole log, newest first, fifty at a time. */
export function AdminLog() {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    void listLog({ limit: PAGE }).then((r) => {
      if (!on) return
      setEntries(r.entries)
      setError(r.error)
      setMore(r.entries.length === PAGE)
    })
    return () => {
      on = false
    }
  }, [])

  async function older() {
    if (!entries?.length) return
    setBusy(true)
    const r = await listLog({ limit: PAGE, before: entries[entries.length - 1].id })
    setEntries([...entries, ...r.entries])
    setError(r.error)
    setMore(r.entries.length === PAGE)
    setBusy(false)
  }

  return (
    <section aria-labelledby="log-title" className="flex flex-col gap-4">
      <div id="log-title">
        <AdminHeading title="Moderation log" lead="Every action the team takes, written by the database itself. Nobody can edit or delete it." />
      </div>
      {!live ? (
        <Empty className="rounded-2xl border border-border bg-card/40 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>No log without a database</EmptyTitle>
            <EmptyDescription>Once Supabase is connected, every hide, removal, role change and suspension is recorded here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : entries === null ? (
        <LogSkeleton rows={8} />
      ) : error && !entries.length ? (
        <Notice tone="warn" title="The log could not load">
          {error}
        </Notice>
      ) : !entries.length ? (
        <Empty className="rounded-2xl border border-border bg-card/40 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing logged yet</EmptyTitle>
            <EmptyDescription>The first moderation action will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-2xl border border-border bg-card/40 px-4 py-1">
          <ul className="flex flex-col">
            {entries.map((e) => (
              <LogRow key={e.id} e={e} />
            ))}
          </ul>
          {more && (
            <div className="flex justify-center border-t border-border py-3">
              <Button variant="outline" size="sm" onClick={older} disabled={busy}>
                {busy ? "Loading…" : "Show older"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
