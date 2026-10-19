"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { CalendarClockIcon, CheckIcon, ExternalLinkIcon, PencilIcon, RadarIcon, SparklesIcon, StarIcon, StarOffIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, when } from "@/components/admin/controls"
import { NewsroomEditor } from "@/components/admin/newsroom-editor"
import { NewsroomSettingsPanel } from "@/components/admin/newsroom-settings"
import { NewsroomSources } from "@/components/admin/newsroom-sources"
import { NewsroomTips } from "@/components/admin/newsroom-tips"
import { Gate } from "@/components/moderation/gate"
import { CategoryTag, UnconfirmedBadge } from "@/components/news/bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useCaps } from "@/lib/caps"
import { collectNow, deleteStory, listStories, refreshPublicNews, setFeatured, setStoryStatus, storyHref, type QueueFilter, type RunSummary, type Story } from "@/lib/newsroom"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "queue", label: "Queue" },
  { id: "write", label: "Write" },
  { id: "tips", label: "Tips" },
  { id: "sources", label: "Sources" },
  { id: "settings", label: "Settings and runs" },
] as const
type Tab = (typeof TABS)[number]["id"]

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "draft", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "rejected", label: "Rejected" },
]

/**
 * The editors' desk: the queue of AI and hand-written drafts, the editor, members' tips, the sources the
 * newsroom reads, and the settings with the run log. "Collect now" runs the daily pipeline at once with the
 * editor's own session.
 */
export function AdminNewsroom() {
  return (
    <Gate cap="news.write" action="work in the newsroom">
      <Desk />
    </Gate>
  )
}

function Desk() {
  const params = useSearchParams()
  const path = usePathname()
  const asked = params.get("tab")
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : "queue"
  const editing = params.get("story")

  return (
    <section aria-labelledby="nr-title" className="flex flex-col gap-5">
      <div id="nr-title">
        <AdminHeading title="Newsroom" lead="Stories the free AI drafted from official sources, and the ones editors write. Nothing reaches /news until an editor publishes it, unless auto-publish is on for its category.">
          <CollectNow />
        </AdminHeading>
      </div>

      <nav aria-label="Newsroom sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.id} className="shrink-0">
              <Link
                href={`${path}?tab=${t.id}` as Route}
                scroll={false}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "pressable inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  tab === t.id ? "border-ion/60 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!live ? (
        <Notice tone="warn" title="The newsroom needs the database">
          Stories, sources and tips live in Supabase. Connect it to use the newsroom.
        </Notice>
      ) : tab === "write" ? (
        <NewsroomEditor key={editing ?? "new"} storyId={editing} />
      ) : tab === "tips" ? (
        <NewsroomTips />
      ) : tab === "sources" ? (
        <NewsroomSources />
      ) : tab === "settings" ? (
        <NewsroomSettingsPanel />
      ) : (
        <Queue />
      )}
    </section>
  )
}

function CollectNow() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RunSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await collectNow()
      setResult(r)
      if (r.published) refreshPublicNews()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const line = result
    ? `Checked ${result.sourcesChecked} sources, ${result.signalsNew} new signals, ${result.drafts} draft${result.drafts === 1 ? "" : "s"}${result.published ? `, ${result.published} published` : ""}${result.rejected ? `, ${result.rejected} not saved` : ""}.${result.note ? ` ${result.note}` : ""}`
    : null
  return (
    <div className="flex max-w-md flex-col items-end gap-1.5">
      <Button onClick={run} disabled={busy || !live}>
        <RadarIcon aria-hidden className={cn(busy && "motion-safe:animate-spin")} />
        {busy ? "Collecting… (up to a few minutes)" : "Collect now"}
      </Button>
      <StatusLine status={error ? { ok: false, text: error } : line ? { ok: true, text: line } : null} className="text-right" />
    </div>
  )
}

function Queue() {
  const caps = useCaps()
  const canPublish = caps.can("news.publish")
  const [filter, setFilter] = useState<QueueFilter>("draft")
  const [data, setData] = useState<{ filter: QueueFilter; stories: Story[]; error: string | null } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<Story | null>(null)
  const [rejecting, setRejecting] = useState<Story | null>(null)
  const [removing, setRemoving] = useState<Story | null>(null)

  useEffect(() => {
    let on = true
    void listStories(filter).then((r) => on && setData({ filter, ...r }))
    return () => {
      on = false
    }
  }, [filter])

  async function act(s: Story, fn: () => Promise<unknown>, done: string, { drop = true } = {}) {
    setBusy(s.id)
    setStatus(null)
    try {
      await fn()
      setData((d) => (d && drop ? { ...d, stories: d.stories.filter((x) => x.id !== s.id) } : d))
      setStatus({ ok: true, text: done })
      refreshPublicNews()
      return true
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }

  const loading = !data || data.filter !== filter

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Story status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "pressable inline-flex h-8 items-center rounded-full px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-white/[0.04] text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {!canPublish && (
        <Notice title="You can write and edit drafts">An editor with publishing rights (news.publish) publishes, schedules and features stories.</Notice>
      )}
      <StatusLine status={status} />

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading stories">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : data.error ? (
        <Notice tone="warn" title="The queue could not load">
          {data.error}
        </Notice>
      ) : !data.stories.length ? (
        <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {filter === "draft"
            ? "No drafts waiting. Collect now to check the sources, draft one from a tip, or write a story yourself."
            : filter === "scheduled"
              ? "Nothing is scheduled."
              : filter === "published"
                ? "Nothing is published yet."
                : "No rejected stories."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.stories.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CategoryTag category={s.category} />
                {s.unconfirmed && <UnconfirmedBadge />}
                {s.aiGenerated ? (
                  <Badge variant="outline" className="gap-1">
                    <SparklesIcon aria-hidden className="size-3" /> AI draft{s.model ? ` · ${s.model}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline">By {s.writer?.name ?? "an editor"}</Badge>
                )}
                {s.featured && <Badge className="bg-gold/15 text-gold">Exclusive</Badge>}
                <span>
                  {filter === "scheduled" && s.publishedAt
                    ? `Goes out ${new Date(s.publishedAt).toLocaleString()}`
                    : filter === "published" && s.publishedAt
                      ? `Published ${when(s.publishedAt)}`
                      : `Created ${when(s.createdAt)}`}
                </span>
                {s.editor && <span>· edited by {s.editor.name}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{s.title}</h3>
                {s.dek && <p className="text-sm text-muted-foreground">{s.dek}</p>}
                {s.rejectNote && <p className="text-sm text-destructive">Rejected: {s.rejectNote}</p>}
              </div>
              {s.sources.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {s.sources.map((src) => (
                    <li key={src.url} className="min-w-0">
                      <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-[22rem] items-center gap-1 text-ion hover:underline">
                        <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">{src.publisher ? `${src.publisher}: ` : ""}{src.title || src.url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {(filter !== "published" && filter !== "scheduled") || canPublish ? (
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/admin/newsroom?tab=write&story=${s.id}` as Route} />}>
                    <PencilIcon aria-hidden /> Edit
                  </Button>
                ) : null}
                {canPublish && filter !== "published" && (
                  <Button size="sm" disabled={busy === s.id} onClick={() => act(s, () => setStoryStatus(s.id, "published"), "Published. It is on /news now.")}>
                    <CheckIcon aria-hidden /> Publish
                  </Button>
                )}
                {canPublish && filter !== "published" && (
                  <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => setScheduling(s)}>
                    <CalendarClockIcon aria-hidden /> Schedule
                  </Button>
                )}
                {canPublish && (filter === "published" || filter === "scheduled") && (
                  <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => act(s, () => setStoryStatus(s.id, "draft"), "Back in the drafts.")}>
                    <Undo2Icon aria-hidden /> Unpublish
                  </Button>
                )}
                {canPublish && filter === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === s.id}
                    onClick={() =>
                      act(
                        s,
                        async () => {
                          await setFeatured(s.id, !s.featured)
                          setData((d) => (d ? { ...d, stories: d.stories.map((x) => (x.id === s.id ? { ...x, featured: !s.featured } : x)) } : d))
                        },
                        s.featured ? "No longer the Nexverse Exclusive." : "Now leads /news as the Nexverse Exclusive.",
                        { drop: false }
                      )
                    }
                  >
                    {s.featured ? <StarOffIcon aria-hidden /> : <StarIcon aria-hidden />}
                    {s.featured ? "Unfeature" : "Make it the Exclusive"}
                  </Button>
                )}
                {filter === "published" && (
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={storyHref(s)} />}>
                    View
                  </Button>
                )}
                {filter === "draft" && (
                  <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => setRejecting(s)}>
                    <XIcon aria-hidden /> Reject
                  </Button>
                )}
                {filter === "rejected" && (
                  <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => act(s, () => setStoryStatus(s.id, "draft"), "Back in the drafts.")}>
                    <Undo2Icon aria-hidden /> Back to drafts
                  </Button>
                )}
                {canPublish && (
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy === s.id} onClick={() => setRemoving(s)}>
                    <Trash2Icon aria-hidden /> Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ScheduleDialog story={scheduling} onClose={() => setScheduling(null)} onConfirm={(s, at) => act(s, () => setStoryStatus(s.id, "scheduled", { at }), `Scheduled for ${new Date(at).toLocaleString()}.`).then((ok) => ok && setScheduling(null))} />
      <RejectDialog story={rejecting} onClose={() => setRejecting(null)} onConfirm={(s, note) => act(s, () => setStoryStatus(s.id, "rejected", { note }), "Rejected.").then((ok) => ok && setRejecting(null))} />
      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this story?</DialogTitle>
            <DialogDescription>“{removing?.title}” is removed for good, from the queue and from /news. Rejecting keeps a record instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
            <Button variant="destructive" onClick={() => removing && act(removing, () => deleteStory(removing.id, removing.title), "Deleted.").then((ok) => ok && setRemoving(null))}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ScheduleDialog({ story, onClose, onConfirm }: { story: Story | null; onClose: () => void; onConfirm: (s: Story, at: string) => void }) {
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 3 * 3600_000)))
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={Boolean(story)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const t = Date.parse(at)
            if (!Number.isFinite(t) || t < Date.now() + 60_000) return setError("Pick a time at least a minute from now.")
            setError(null)
            if (story) onConfirm(story, new Date(t).toISOString())
          }}
        >
          <DialogHeader>
            <DialogTitle>Schedule the story</DialogTitle>
            <DialogDescription>It appears on /news at this time (your time zone), within a minute or so.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="nr-at">Publish at</FieldLabel>
            <Input id="nr-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-10" />
            {error && (
              <FieldDescription role="alert" className="text-destructive">
                {error}
              </FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit">Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ story, onClose, onConfirm }: { story: Story | null; onClose: () => void; onConfirm: (s: Story, note: string) => void }) {
  const [note, setNote] = useState("")
  return (
    <Dialog open={Boolean(story)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (story) onConfirm(story, note)
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject this draft?</DialogTitle>
            <DialogDescription>It leaves the queue and is kept under Rejected, with your note.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="nr-reject">Why (optional)</FieldLabel>
            <Textarea id="nr-reject" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not news, wrong facts, a duplicate…" />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit">Reject</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
