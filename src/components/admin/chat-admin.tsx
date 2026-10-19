"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArchiveIcon, ExternalLinkIcon, LockIcon, PencilIcon, PlusIcon, ShieldIcon, StarIcon, TimerIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, SwitchRow } from "@/components/admin/controls"
import { roomHref } from "@/components/chat/format"
import { RoomGlyph } from "@/components/chat/glyphs"
import { MoveButtons, moved, Select, toSlug } from "@/components/pages/admin-bits"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { createRoom, listRooms, reorderRooms, ROOM_SLUG, updateRoom, type Room } from "@/lib/chat"
import { live } from "@/lib/supabase"

type Status = { ok: boolean; text: string } | null

const SLOW: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
]

type Draft = { slug: string; name: string; topic: string; slowMode: number; locked: boolean; archived: boolean; staffOnly: boolean; minReputation: number }

/** /admin/chat: the public rooms, their order, topic and rules. Rooms are archived, never deleted, so history stays. */
export function ChatAdmin() {
  // Without a database there are no accounts: the screen opens read only under the shell's notice.
  if (!live) return <ChatAdminInner />
  return (
    <Gate role="moderator" cap="chat.manage" action="manage chat rooms">
      <ChatAdminInner />
    </Gate>
  )
}

function ChatAdminInner() {
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ draft: Draft; isNew: boolean } | null>(null)

  useEffect(() => {
    let on = true
    listRooms()
      .then((list) => on && setRooms(list.filter((r) => !r.slug.startsWith("crew-"))))
      .catch((e: Error) => on && setLoadError(e.message))
    return () => {
      on = false
    }
  }, [])

  const rulesReady = !rooms || rooms.some((r) => typeof r.position === "number")

  async function move(i: number, by: -1 | 1) {
    if (!rooms) return
    const next = moved(rooms, i, by)
    setBusy(true)
    setStatus(null)
    try {
      await reorderRooms(next.map((r) => r.slug))
      setRooms(next.map((r, n) => ({ ...r, position: n })))
      setStatus({ ok: true, text: "Rooms reordered." })
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function save(d: Draft, isNew: boolean) {
    setBusy(true)
    setStatus(null)
    try {
      if (isNew) await createRoom({ slug: d.slug, name: d.name, topic: d.topic })
      const rules = { name: d.name, topic: d.topic, slowMode: d.slowMode, locked: d.locked, archived: d.archived, staffOnly: d.staffOnly, minReputation: d.minReputation }
      const hasRules = d.slowMode || d.locked || d.archived || d.staffOnly || d.minReputation
      const room = !isNew || hasRules ? await updateRoom(d.slug, rules) : null
      const list = await listRooms()
      setRooms(list.filter((r) => !r.slug.startsWith("crew-")))
      setStatus({ ok: true, text: isNew ? `${d.name} is open.` : `${room?.name ?? d.name} saved.` })
      setEditing(null)
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const draftOf = (r: Room): Draft => ({
    slug: r.slug,
    name: r.name,
    topic: r.topic,
    slowMode: r.slowMode ?? 0,
    locked: r.locked ?? false,
    archived: r.archived ?? false,
    staffOnly: r.staffOnly ?? false,
    minReputation: r.minReputation ?? 0,
  })

  return (
    <section aria-labelledby="chat-admin-title" className="flex flex-col gap-5">
      <AdminHeading title="Chat rooms" lead="Open rooms, set their topic and order, and decide who talks: lock a room, slow it down, keep it for the team or archive it.">
        <Button
          disabled={!live || busy}
          onClick={() => setEditing({ draft: { slug: "", name: "", topic: "", slowMode: 0, locked: false, archived: false, staffOnly: false, minReputation: 0 }, isNew: true })}
        >
          <PlusIcon aria-hidden /> New room
        </Button>
      </AdminHeading>
      <h2 id="chat-admin-title" className="sr-only">
        Rooms
      </h2>
      {!rulesReady && (
        <Notice tone="warn" title="Room rules are not in the database yet">
          You can open rooms now. Ordering, slow mode, locking and team rooms switch on once the CMS migration (…_cms.sql) is applied.
        </Notice>
      )}
      {loadError && (
        <Notice tone="warn" title="The rooms could not be loaded">
          {loadError}
        </Notice>
      )}
      <StatusLine status={status} />

      {!rooms ? (
        !loadError && <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
          {rooms.map((r, i) => (
            <li key={r.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <RoomGlyph slug={r.slug} size={32} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">/chat/{r.slug}</span>
                </span>
                {r.topic && <span className="line-clamp-1 text-sm text-muted-foreground">{r.topic}</span>}
                <RoomBadges r={r} />
              </div>
              <MoveButtons index={i} count={rooms.length} label={r.name} disabled={!rulesReady || busy} onMove={(by) => void move(i, by)} />
              <Button variant="ghost" size="icon-sm" aria-label={`Open ${r.name}`} nativeButton={false} render={<Link href={roomHref(r.slug)} />}>
                <ExternalLinkIcon aria-hidden />
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing({ draft: draftOf(r), isNew: false })}>
                <PencilIcon aria-hidden /> Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RoomSheet key={`${editing.draft.slug}|${editing.isNew}`} initial={editing.draft} isNew={editing.isNew} rulesReady={rulesReady} taken={(rooms ?? []).map((r) => r.slug)} busy={busy} onClose={() => setEditing(null)} onSave={save} />
      )}
    </section>
  )
}

function RoomBadges({ r }: { r: Room }) {
  const list = [
    r.archived && { icon: ArchiveIcon, text: "Archived" },
    r.locked && { icon: LockIcon, text: "Locked" },
    r.staffOnly && { icon: ShieldIcon, text: "Team only" },
    r.slowMode ? { icon: TimerIcon, text: `Slow mode ${SLOW.find((s) => s.value === r.slowMode)?.label ?? `${r.slowMode} s`}` } : null,
    r.minReputation ? { icon: StarIcon, text: `${r.minReputation} rep to talk` } : null,
  ].filter((x): x is { icon: typeof LockIcon; text: string } => Boolean(x))
  if (!list.length) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map((b) => (
        <span key={b.text} className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/[0.06] px-2 py-0.5 text-[11px] text-gold">
          <b.icon aria-hidden className="size-3" /> {b.text}
        </span>
      ))}
    </span>
  )
}

function RoomSheet({
  initial,
  isNew,
  rulesReady,
  taken,
  busy,
  onClose,
  onSave,
}: {
  initial: Draft
  isNew: boolean
  rulesReady: boolean
  taken: string[]
  busy: boolean
  onClose: () => void
  onSave: (d: Draft, isNew: boolean) => Promise<void>
}) {
  const [d, setD] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (d.name.trim().length < 2 || d.name.trim().length > 40) next.name = "The name is 2 to 40 characters."
    if (d.topic.length > 200) next.topic = "The topic is up to 200 characters."
    if (isNew && !ROOM_SLUG.test(d.slug)) next.slug = "2 to 40 lowercase letters, numbers and dashes."
    if (isNew && (taken.includes(d.slug) || d.slug.startsWith("crew-"))) next.slug = "That address is taken."
    setErrors(next)
    if (!Object.keys(next).length) void onSave(d, isNew)
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <div className="sticky top-0 z-10 border-b border-border bg-popover px-5 py-4">
          <SheetTitle>{isNew ? "New room" : `Edit ${initial.name}`}</SheetTitle>
          <SheetDescription>Changes reach everyone with the chat open, straight away.</SheetDescription>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-6 px-5 py-5" noValidate>
          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="room-name">Name</FieldLabel>
              <Input id="room-name" value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value, ...(isNew && !slugTouched ? { slug: toSlug(e.target.value) } : {}) })} className="bg-background/60" />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field data-invalid={errors.slug ? true : undefined}>
              <FieldLabel htmlFor="room-slug">Address</FieldLabel>
              <div className="flex items-center gap-1">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">/chat/</span>
                <Input id="room-slug" value={d.slug} disabled={!isNew} maxLength={40} onChange={(e) => (setSlugTouched(true), set({ slug: toSlug(e.target.value) }))} className="bg-background/60 font-mono" />
              </div>
              {!isNew && <FieldDescription>Fixed, so links and history keep working.</FieldDescription>}
              {errors.slug && <FieldError>{errors.slug}</FieldError>}
            </Field>
            <Field data-invalid={errors.topic ? true : undefined}>
              <FieldLabel htmlFor="room-topic">Topic</FieldLabel>
              <Textarea id="room-topic" value={d.topic} maxLength={200} rows={2} onChange={(e) => set({ topic: e.target.value })} className="bg-background/60" />
              <FieldDescription>Shown under the room&apos;s name.</FieldDescription>
              {errors.topic && <FieldError>{errors.topic}</FieldError>}
            </Field>
          </FieldGroup>

          <FieldGroup>
            <p className="text-sm font-semibold">Who can talk</p>
            {!rulesReady && <p className="text-sm text-muted-foreground">These switch on with the CMS migration.</p>}
            <Field>
              <FieldLabel htmlFor="room-slow">Slow mode</FieldLabel>
              <Select id="room-slow" value={d.slowMode} disabled={!rulesReady} onChange={(e) => set({ slowMode: Number(e.target.value) })} className="sm:max-w-56">
                {SLOW.map((s) => (
                  <option key={s.value} value={s.value} className="bg-popover">
                    {s.label}
                  </option>
                ))}
              </Select>
              <FieldDescription>How long a member waits between two messages. The team is never slowed down.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="room-rep">Reputation needed to talk</FieldLabel>
              <Input id="room-rep" type="number" inputMode="numeric" min={0} disabled={!rulesReady} value={d.minReputation} onChange={(e) => set({ minReputation: Math.max(0, Number(e.target.value) || 0) })} className="bg-background/60 sm:max-w-40" />
            </Field>
            <SwitchRow id="room-locked" label="Locked" description="Everyone reads; only the team writes." checked={d.locked} disabled={!rulesReady} onChange={(locked) => set({ locked })} />
            <SwitchRow id="room-staff" label="Team only" description="Only moderators and admins see the room at all." checked={d.staffOnly} disabled={!rulesReady} onChange={(staffOnly) => set({ staffOnly })} />
            <SwitchRow id="room-archived" label="Archived" description="Read only, and listed under Archived rooms." checked={d.archived} disabled={!rulesReady} onChange={(archived) => set({ archived })} />
          </FieldGroup>

          <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-border bg-popover px-5 py-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isNew ? "Open room" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
