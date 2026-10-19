"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, NewspaperIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, Switch, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { listContent, type ContentItem } from "@/lib/admin"
import { isContentKind, moderate, type ContentKind, type ModAction } from "@/lib/moderation"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const KINDS: { id: ContentKind; label: string }[] = [
  { id: "question", label: "Threads" },
  { id: "answer", label: "Replies" },
  { id: "submission", label: "News and links" },
  { id: "project", label: "Projects" },
  { id: "event", label: "Events" },
  { id: "room_message", label: "Chat" },
]

const DONE: Record<ModAction, string> = { hide: "Hidden.", unhide: "Visible again.", feature: "Featured.", unfeature: "No longer featured.", remove: "Removed." }

/** The latest posts of every kind, with hide, unhide, remove and (for shared links) feature. */
export function AdminContent() {
  const params = useSearchParams()
  const path = usePathname()
  // The kind lives in the address, so a moderator can share "look at these events" as a link.
  const asked = params.get("kind") ?? ""
  const kind: ContentKind = isContentKind(asked) ? asked : "question"
  const [hiddenOnly, setHiddenOnly] = useState(false)
  const [data, setData] = useState<{ key: string; items: ContentItem[]; error: string | null } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ContentItem | null>(null)

  const key = `${kind}|${hiddenOnly}`
  useEffect(() => {
    if (!live) return
    let on = true
    void listContent(kind, { hiddenOnly }).then((r) => on && setData({ key, ...r }))
    return () => {
      on = false
    }
  }, [kind, hiddenOnly, key])

  async function act(item: ContentItem, action: ModAction, note = "") {
    setBusy(item.id)
    setStatus(null)
    try {
      await moderate(item.kind, item.id, action, note)
      setData((d) => {
        if (!d) return d
        if (action === "remove" || (action === "unhide" && hiddenOnly)) return { ...d, items: d.items.filter((x) => x.id !== item.id) }
        const now = new Date().toISOString()
        const change: Partial<ContentItem> =
          action === "hide" ? { hiddenAt: now } : action === "unhide" ? { hiddenAt: null } : action === "feature" ? { featuredAt: now } : { featuredAt: null }
        return { ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, ...change } : x)) }
      })
      setStatus({ ok: true, text: DONE[action] })
      setRemoving(null)
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const loading = live && (!data || data.key !== key)

  return (
    <section aria-labelledby="con-title" className="flex flex-col gap-4">
      <div id="con-title">
        <AdminHeading title="Content" lead="The newest posts, hidden ones included. Hidden posts stay visible to their author and staff; removed ones are gone for good." />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Kind of content" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex gap-1">
            {KINDS.map((k) => (
              <li key={k.id} className="shrink-0">
                <Link
                  href={`${path}?kind=${k.id}` as Route}
                  scroll={false}
                  aria-current={kind === k.id ? "page" : undefined}
                  className={cn(
                    "pressable inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    kind === k.id ? "border-ion/60 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={hiddenOnly} onCheckedChange={setHiddenOnly} disabled={!live} aria-label="Hidden only" />
          Hidden only
        </label>
      </div>

      <StatusLine status={status} />

      {!live ? (
        <Empty className="rounded-2xl border border-border bg-card/40 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NewspaperIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing to moderate in a browser-only copy</EmptyTitle>
            <EmptyDescription>What members post here stays in their own browser. Connect Supabase and their posts appear in this list.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading content">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : data?.error ? (
        <Notice tone="warn" title="This list could not load">
          {data.error}
        </Notice>
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {hiddenOnly ? "Nothing of this kind is hidden." : "Nobody has posted this kind of content yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id} className={cn("flex flex-col gap-3 rounded-xl border bg-card/50 px-4 py-3 md:flex-row md:items-start", item.hiddenAt ? "border-dashed border-border opacity-80" : "border-border")}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  {item.href ? (
                    <Link href={item.href as Route} className="min-w-0 truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-medium">{item.title}</span>
                  )}
                  {item.hiddenAt && <Badge variant="secondary">Hidden</Badge>}
                  {item.featuredAt && <Badge>Featured</Badge>}
                </p>
                {item.excerpt && item.excerpt !== item.title && <p className="line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p>}
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {item.meta} · by {item.author?.name ?? "a former member"} · {when(item.createdAt)}
                  {item.external && (
                    <a href={item.external} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-sm text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      · {safeHost(item.external)} <ExternalLinkIcon aria-hidden className="size-3" />
                      <span className="sr-only">(opens the shared link in a new tab)</span>
                    </a>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 md:justify-end">
                {item.hiddenAt ? (
                  <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void act(item, "unhide")}>
                    <EyeIcon aria-hidden /> Unhide
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void act(item, "hide")}>
                    <EyeOffIcon aria-hidden /> Hide
                  </Button>
                )}
                {item.kind === "submission" &&
                  (item.featuredAt ? (
                    <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void act(item, "unfeature")}>
                      <StarOffIcon aria-hidden /> Unfeature
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void act(item, "feature")}>
                      <StarIcon aria-hidden /> Feature
                    </Button>
                  ))}
                <Button size="sm" variant="destructive" disabled={busy === item.id} onClick={() => setRemoving(item)} aria-label={`Remove ${item.title}`}>
                  <Trash2Icon aria-hidden /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>{removing && <RemoveForm item={removing} busy={busy === removing.id} onRemove={(note) => void act(removing, "remove", note)} />}</DialogContent>
      </Dialog>
    </section>
  )
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "link"
  }
}

function RemoveForm({ item, busy, onRemove }: { item: ContentItem; busy: boolean; onRemove: (note: string) => void }) {
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
        <DialogTitle>Remove “{item.title}”?</DialogTitle>
        <DialogDescription>It is deleted for everyone, its author included, and cannot be restored. To keep it for the author and staff, hide it instead.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="con-note">
          Note for the log <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input id="con-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Duplicate of another thread" />
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
