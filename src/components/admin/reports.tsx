"use client"

import type { Route } from "next"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { CheckIcon, ExternalLinkIcon, EyeOffIcon, FlagIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react"
import { ModerationHint } from "@/components/ai/moderation-hint"
import { AdminHeading, Notice, StatusLine, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { listReports, loadTargets, type ContentItem, type Report } from "@/lib/admin"
import { closeReport, CONTENT_KINDS, isContentKind, moderate, reasonLabel, reopenReport } from "@/lib/moderation"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/** Open reports about the same thing, handled together. */
type Group = { key: string; kind: string; id: string; url: string | null; reports: Report[] }

function group(reports: Report[]): Group[] {
  const map = new Map<string, Group>()
  for (const r of reports) {
    const key = `${r.targetKind}:${r.targetId}`
    const g = map.get(key) ?? { key, kind: r.targetKind, id: r.targetId, url: r.targetUrl, reports: [] }
    g.reports.push(r)
    g.url ??= r.targetUrl
    map.set(key, g)
  }
  return [...map.values()]
}

const kindLabel = (k: string) => (isContentKind(k) ? CONTENT_KINDS[k].label : k.replace(/_/g, " "))

/** The reports queue: what members flagged, the content itself, and the actions that close it. */
export function AdminReports() {
  const { user } = useSession()
  const [tab, setTab] = useState<"open" | "closed">("open")
  const [data, setData] = useState<{ tab: string; reports: Report[]; targets: Record<string, ContentItem>; error: string | null } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Group | null>(null)

  const load = useCallback(async (which: "open" | "closed") => {
    const r = await listReports(which)
    const targets = await loadTargets(r.reports.map((x) => ({ kind: x.targetKind, id: x.targetId })))
    return { tab: which, ...r, targets }
  }, [])

  useEffect(() => {
    if (!live) return
    let on = true
    void load(tab).then((d) => on && setData(d))
    return () => {
      on = false
    }
  }, [tab, load])

  /** Runs a content action (when there is one), then closes every open report in the group. */
  async function act(g: Group, action: "hide" | "remove" | "resolve" | "dismiss", note = "") {
    if (!user) return
    setBusy(g.key)
    setStatus(null)
    try {
      if ((action === "hide" || action === "remove") && isContentKind(g.kind)) await moderate(g.kind, g.id, action, note || `Report: ${g.reports.map((r) => reasonLabel(r.reason)).join(", ")}`)
      const closing = action === "dismiss" ? "dismissed" : "resolved"
      for (const r of g.reports) await closeReport(r.id, closing, user.id, action === "resolve" || action === "dismiss" ? note : `Content ${action === "hide" ? "hidden" : "removed"}`)
      setData((d) => d && { ...d, reports: d.reports.filter((r) => !g.reports.some((x) => x.id === r.id)) })
      setStatus({ ok: true, text: { hide: "Hidden and resolved.", remove: "Removed and resolved.", resolve: "Marked as resolved.", dismiss: "Dismissed. Nothing was changed." }[action] })
      setRemoving(null)
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function reopen(r: Report) {
    setBusy(r.id)
    setStatus(null)
    try {
      await reopenReport(r.id)
      setData((d) => d && { ...d, reports: d.reports.filter((x) => x.id !== r.id) })
      setStatus({ ok: true, text: "Back in the open queue." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const loading = live && (!data || data.tab !== tab)
  const groups = data && tab === "open" ? group(data.reports) : []

  return (
    <section aria-labelledby="rep-title" className="flex flex-col gap-4">
      <div id="rep-title">
        <AdminHeading title="Reports" lead="Oldest first, so nobody waits too long. Reports about the same thing are grouped and closed together." />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "closed")}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <StatusLine status={status} />

      {!live ? (
        <Empty className="rounded-2xl border border-border bg-card/40 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FlagIcon />
            </EmptyMedia>
            <EmptyTitle>No reports in a browser-only copy</EmptyTitle>
            <EmptyDescription>Members report posts from the flag on each one. With a database connected, the reports land here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading reports">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : data?.error ? (
        <Notice tone="warn" title="Reports could not load">
          {data.error}
        </Notice>
      ) : tab === "open" ? (
        groups.length === 0 ? (
          <Empty className="rounded-2xl border border-border bg-card/40 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckIcon />
              </EmptyMedia>
              <EmptyTitle>The queue is clear</EmptyTitle>
              <EmptyDescription>No open reports. New ones show up here as members send them.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const target = data!.targets[g.key]
              const href = g.url ?? target?.href ?? null
              const content = isContentKind(g.kind)
              return (
                <li key={g.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-card/50 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{kindLabel(g.kind)}</Badge>
                    {[...new Set(g.reports.map((r) => r.reason))].map((r) => (
                      <Badge key={r} variant="destructive">
                        {reasonLabel(r)}
                      </Badge>
                    ))}
                    <span>
                      {g.reports.length} {g.reports.length === 1 ? "report" : "reports"} · first {when(g.reports[0].createdAt)}
                    </span>
                    {target?.hiddenAt && <Badge variant="secondary">Hidden</Badge>}
                  </div>

                  <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
                    {target ? (
                      <>
                        <p className="text-sm font-medium">{target.title}</p>
                        {target.excerpt && <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{target.excerpt}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {target.meta} · by {target.author?.name ?? "a former member"} · {when(target.createdAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{content ? "This content is gone: it was removed or deleted by its author." : "Open the page to see what was reported."}</p>
                    )}
                    {href && (
                      <Link href={href as Route} className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        Open where it was posted <ExternalLinkIcon aria-hidden className="size-3.5" />
                      </Link>
                    )}
                  </div>

                  {target && (
                    <ModerationHint
                      text={[target.title, target.excerpt].filter(Boolean).join("\n\n")}
                      context={`${target.meta}. Reported as ${g.reports.map((r) => reasonLabel(r.reason) + (r.details ? `: ${r.details}` : "")).join("; ")}`}
                    />
                  )}

                  <ul className="flex flex-col gap-1.5">
                    {g.reports.map((r) => (
                      <li key={r.id} className="text-sm">
                        <span className="font-medium">{r.reporter?.name ?? "A former member"}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {reasonLabel(r.reason)} · {when(r.createdAt)}
                        </span>
                        {r.details && <p className="mt-0.5 border-l-2 border-border pl-2 text-muted-foreground">{r.details}</p>}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {content && target && !target.hiddenAt && (
                      <Button size="sm" variant="secondary" disabled={busy === g.key} onClick={() => void act(g, "hide")}>
                        <EyeOffIcon aria-hidden /> Hide content
                      </Button>
                    )}
                    {content && target && (
                      <Button size="sm" variant="destructive" disabled={busy === g.key} onClick={() => setRemoving(g)}>
                        <Trash2Icon aria-hidden /> Remove content…
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy === g.key} onClick={() => void act(g, "resolve")}>
                      <CheckIcon aria-hidden /> Resolve
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === g.key} onClick={() => void act(g, "dismiss")}>
                      <XIcon aria-hidden /> Dismiss
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      ) : !data?.reports.length ? (
        <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">No closed reports yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card/40 px-4">
          {data.reports.map((r) => {
            const target = data.targets[`${r.targetKind}:${r.targetId}`]
            const href = r.targetUrl ?? target?.href ?? null
            return (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={r.status === "resolved" ? "secondary" : "outline"}>{r.status === "resolved" ? "Resolved" : "Dismissed"}</Badge>
                    <span className="font-medium">{kindLabel(r.targetKind)}</span>
                    <span className="text-muted-foreground">· {reasonLabel(r.reason)}</span>
                    {href && (
                      <Link href={href as Route} className="rounded-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        open
                      </Link>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reported by {r.reporter?.name ?? "a former member"} {when(r.createdAt)}
                    {r.resolvedAt && ` · closed by ${r.resolver?.name ?? "a former team member"} ${when(r.resolvedAt)}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void reopen(r)} className="self-start sm:self-center">
                  <RotateCcwIcon aria-hidden /> Reopen
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>{removing && <RemoveForm busy={busy === removing.key} onRemove={(note) => void act(removing, "remove", note)} />}</DialogContent>
      </Dialog>
    </section>
  )
}

function RemoveForm({ busy, onRemove }: { busy: boolean; onRemove: (note: string) => void }) {
  const [note, setNote] = useState("")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onRemove(note)
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Remove the reported content?</DialogTitle>
        <DialogDescription>It is deleted for everyone, its author included, and cannot be restored. The reports are marked as resolved.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="rep-note">
          Note for the log <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input id="rep-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Spam link, third report" />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy ? "Removing…" : "Remove"}
        </Button>
      </DialogFooter>
    </form>
  )
}
