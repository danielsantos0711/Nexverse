"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArchiveIcon, ExternalLinkIcon, EyeOffIcon, FolderPlusIcon, LockIcon, PencilIcon, PlusIcon, ShieldIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, SwitchRow } from "@/components/admin/controls"
import { CategoryIcon } from "@/components/forum/category-icon"
import { AccentPicker, IconPicker, MoveButtons, moved, Select, toSlug } from "@/components/pages/admin-bits"
import { CATEGORY_ICON_NAMES } from "@/components/site/icons"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { CAPS, type Cap } from "@/lib/caps"
import { categoryPath } from "@/lib/data"
import {
  accentChip,
  CATEGORY_SLUG,
  createCategory,
  deleteCategory,
  deleteGroup,
  membersByIds,
  READ_ROLES,
  reorder,
  saveGroup,
  searchMembers,
  updateCategory,
  useForumMap,
  type ForumCategory,
  type ForumGroup,
  type MemberHit,
} from "@/lib/forum-categories"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Status = { ok: boolean; text: string } | null

const POST_CAPS: Cap[] = ["thread.create", "news.write", "moderate", "forum.manage"]
const REPLY_CAPS: Cap[] = ["reply.create", "moderate", "forum.manage"]
const capLabel = (c: Cap) =>
  ({ "thread.create": "Members who can start threads", "reply.create": "Members who can reply", "news.write": "News writers", moderate: "Moderators", "forum.manage": "Forum managers" })[c as string] ?? c

/** /admin/forum: groups and categories, their order, rules and moderators. Every change lands in the moderation log. */
export function ForumAdmin() {
  // Without a database there are no accounts: the screen opens read only under the shell's notice.
  if (!live) return <ForumAdminInner />
  return (
    <Gate role="moderator" cap="forum.manage" action="manage the forum">
      <ForumAdminInner />
    </Gate>
  )
}

function ForumAdminInner() {
  const map = useForumMap()
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ category: ForumCategory; isNew: boolean } | null>(null)
  const [group, setGroup] = useState<{ group: ForumGroup; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<{ kind: "category" | "group"; slug: string; name: string } | null>(null)
  const editable = live && map.source === "database"

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true)
    setStatus(null)
    try {
      await work()
      setStatus({ ok: true, text: done })
      return true
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const moveGroup = (i: number, by: -1 | 1) => run(() => reorder("forum_groups", moved(map.groups, i, by).map((g) => g.slug)), "Groups reordered.")
  const moveCategory = (g: string, i: number, by: -1 | 1) => {
    const list = map.categories.filter((c) => c.group === g)
    return run(() => reorder("forum_categories", moved(list, i, by).map((c) => c.slug)), "Categories reordered.")
  }

  const blank = (groupSlug: string): ForumCategory => ({
    slug: "",
    name: "",
    blurb: "",
    icon: "messages-square",
    accent: "ion",
    group: groupSlug,
    position: map.categories.filter((c) => c.group === groupSlug).length,
    archived: false,
    hidden: false,
    readMinRole: "guest",
    postCap: "thread.create",
    replyCap: "reply.create",
    minReputation: 0,
    staffOnlyPosting: false,
    moderators: [],
  })

  return (
    <section aria-labelledby="forum-admin-title" className="flex flex-col gap-5">
      <AdminHeading title="Forum" lead="Groups and categories: their order, look and rules, and who moderates each one. Threads keep their category when you rename it.">
        <Button variant="secondary" disabled={!editable || busy} onClick={() => setGroup({ group: { slug: "", name: "", blurb: "", position: map.groups.length, hidden: false }, isNew: true })}>
          <FolderPlusIcon aria-hidden /> New group
        </Button>
        <Button disabled={!editable || busy || !map.groups.length} onClick={() => setEditing({ category: blank(map.groups[0]?.slug ?? ""), isNew: true })}>
          <PlusIcon aria-hidden /> New category
        </Button>
      </AdminHeading>
      <h2 id="forum-admin-title" className="sr-only">
        Forum categories
      </h2>

      {live && map.ready && map.source === "presets" && (
        <Notice tone="warn" title="Categories are not in the database yet">
          The forum shows its built-in categories. Once the CMS migration (…_cms.sql) is applied they move into the database with the same addresses, and everything here becomes editable.
        </Notice>
      )}
      <StatusLine status={status} />

      <div className="flex flex-col gap-6">
        {map.groups.map((g, gi) => {
          const cats = map.categories.filter((c) => c.group === g.slug)
          return (
            <section key={g.slug} aria-labelledby={`g-${g.slug}`} className="overflow-hidden rounded-2xl border border-border bg-card/40">
              <header className="flex flex-wrap items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 id={`g-${g.slug}`} className="flex items-center gap-2 text-[15px] font-semibold">
                    {g.name}
                    {g.hidden && (
                      <Badge variant="outline" className="gap-1">
                        <EyeOffIcon aria-hidden className="size-3" /> Hidden
                      </Badge>
                    )}
                  </h3>
                  {g.blurb && <p className="truncate text-xs text-muted-foreground">{g.blurb}</p>}
                </div>
                <MoveButtons index={gi} count={map.groups.length} label={`group ${g.name}`} disabled={!editable || busy} onMove={(by) => void moveGroup(gi, by)} />
                <Button variant="ghost" size="sm" disabled={!editable || busy} onClick={() => setGroup({ group: g, isNew: false })}>
                  <PencilIcon aria-hidden /> Edit
                </Button>
                <Button variant="ghost" size="sm" disabled={!editable || busy} onClick={() => setEditing({ category: blank(g.slug), isNew: true })}>
                  <PlusIcon aria-hidden /> Category
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove group ${g.name}`} disabled={!editable || busy || cats.length > 0} title={cats.length ? "Move or remove its categories first" : undefined} onClick={() => setRemoving({ kind: "group", slug: g.slug, name: g.name })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </header>
              {cats.length ? (
                <ul className="divide-y divide-border">
                  {cats.map((c, i) => (
                    <li key={c.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", accentChip(c.accent))}>
                        <CategoryIcon name={c.icon} className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">/{c.slug}</span>
                        </span>
                        <RuleBadges c={c} />
                      </div>
                      <MoveButtons index={i} count={cats.length} label={c.name} disabled={!editable || busy} onMove={(by) => void moveCategory(g.slug, i, by)} />
                      <Button variant="ghost" size="icon-sm" aria-label={`Open ${c.name}`} nativeButton={false} render={<Link href={categoryPath(c.slug)} />}>
                        <ExternalLinkIcon aria-hidden />
                      </Button>
                      <Button variant="secondary" size="sm" disabled={!editable || busy} onClick={() => setEditing({ category: c, isNew: false })}>
                        <PencilIcon aria-hidden /> Edit
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-sm text-muted-foreground">No categories in this group yet. Empty groups do not show on the forum.</p>
              )}
            </section>
          )
        })}
      </div>

      <CategorySheet
        key={editing ? `${editing.category.slug}|${editing.isNew}` : "closed"}
        open={editing !== null}
        initial={editing?.category ?? null}
        isNew={editing?.isNew ?? false}
        groups={map.groups}
        taken={map.categories.map((c) => c.slug)}
        onClose={() => setEditing(null)}
        onDelete={(c) => setRemoving({ kind: "category", slug: c.slug, name: c.name })}
        onSave={async (c, isNew) => {
          const ok = await run(() => (isNew ? createCategory(c) : updateCategory(c)), isNew ? `${c.name} created.` : `${c.name} saved.`)
          if (ok) setEditing(null)
          return ok
        }}
      />

      <GroupDialog
        key={group ? `${group.group.slug}|${group.isNew}` : "none"}
        state={group}
        taken={map.groups.map((g) => g.slug)}
        onClose={() => setGroup(null)}
        onSave={async (g, isNew) => {
          const ok = await run(() => saveGroup(g, isNew), isNew ? `Group ${g.name} created.` : `Group ${g.name} saved.`)
          if (ok) setGroup(null)
        }}
      />

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              {removing?.kind === "category"
                ? "Only a category with no threads can be removed. If it has threads, archive or hide it instead so they stay readable."
                : "The group is empty, so nothing else changes."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!removing) return
                const r = removing
                const ok = await run(() => (r.kind === "category" ? deleteCategory(r.slug) : deleteGroup(r.slug)), `${r.name} removed.`)
                setRemoving(null)
                if (ok && r.kind === "category") setEditing(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function RuleBadges({ c }: { c: ForumCategory }) {
  const rules = [
    c.archived && { icon: ArchiveIcon, text: "Archived" },
    c.hidden && { icon: EyeOffIcon, text: "Hidden" },
    c.staffOnlyPosting && { icon: ShieldIcon, text: "Team starts threads" },
    c.readMinRole !== "guest" && { icon: LockIcon, text: `Read: ${c.readMinRole}s` },
    c.minReputation > 0 && { icon: StarIcon, text: `${c.minReputation} rep to post` },
    c.moderators.length > 0 && { icon: ShieldIcon, text: `${c.moderators.length} ${c.moderators.length === 1 ? "moderator" : "moderators"}` },
  ].filter((r): r is { icon: typeof LockIcon; text: string } => Boolean(r))
  if (!rules.length) return <span className="text-xs text-muted-foreground">Open to everyone</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {rules.map((r) => (
        <span key={r.text} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          <r.icon aria-hidden className="size-3" /> {r.text}
        </span>
      ))}
    </span>
  )
}

function CategorySheet({
  open,
  initial,
  isNew,
  groups,
  taken,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  initial: ForumCategory | null
  isNew: boolean
  groups: ForumGroup[]
  taken: string[]
  onClose: () => void
  onSave: (c: ForumCategory, isNew: boolean) => Promise<boolean>
  onDelete: (c: ForumCategory) => void
}) {
  const [c, setC] = useState<ForumCategory | null>(initial)
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  if (!c) return null
  const set = (patch: Partial<ForumCategory>) => setC({ ...c, ...patch })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!c) return
    const next: Record<string, string> = {}
    if (c.name.trim().length < 2 || c.name.trim().length > 60) next.name = "The name is 2 to 60 characters."
    if (c.blurb.length > 300) next.blurb = "Up to 300 characters."
    if (isNew && !CATEGORY_SLUG.test(c.slug)) next.slug = "2 to 40 lowercase letters, numbers and dashes, starting with a letter or number."
    if (isNew && taken.includes(c.slug)) next.slug = "Another category already uses this address."
    if (!groups.some((g) => g.slug === c.group)) next.group = "Pick a group."
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    await onSave(c, isNew)
    setSaving(false)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <div className="sticky top-0 z-10 border-b border-border bg-popover px-5 py-4">
          <SheetTitle>{isNew ? "New category" : `Edit ${initial?.name}`}</SheetTitle>
          <SheetDescription>{isNew ? "It shows on the forum as soon as you create it." : "Changes show on the forum at once, in every open tab."}</SheetDescription>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-6 px-5 py-5" noValidate>
          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="cat-name">Name</FieldLabel>
              <Input
                id="cat-name"
                value={c.name}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value, ...(isNew && !slugTouched ? { slug: toSlug(e.target.value) } : {}) })}
                className="bg-background/60"
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field data-invalid={errors.slug ? true : undefined}>
              <FieldLabel htmlFor="cat-slug">Address</FieldLabel>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="shrink-0 font-mono text-xs">/forum/c/</span>
                <Input
                  id="cat-slug"
                  value={c.slug}
                  disabled={!isNew}
                  maxLength={40}
                  onChange={(e) => (setSlugTouched(true), set({ slug: toSlug(e.target.value) }))}
                  className="bg-background/60 font-mono"
                />
              </div>
              <FieldDescription>{isNew ? "Threads are filed under this, so it cannot change later." : "Fixed: threads are filed under it."}</FieldDescription>
              {errors.slug && <FieldError>{errors.slug}</FieldError>}
            </Field>
            <Field data-invalid={errors.blurb ? true : undefined}>
              <FieldLabel htmlFor="cat-blurb">Description</FieldLabel>
              <Textarea id="cat-blurb" value={c.blurb} maxLength={300} rows={2} onChange={(e) => set({ blurb: e.target.value })} className="bg-background/60" />
              {errors.blurb && <FieldError>{errors.blurb}</FieldError>}
            </Field>
            <Field data-invalid={errors.group ? true : undefined}>
              <FieldLabel htmlFor="cat-group">Group</FieldLabel>
              <Select id="cat-group" value={c.group} onChange={(e) => set({ group: e.target.value })}>
                {groups.map((g) => (
                  <option key={g.slug} value={g.slug} className="bg-popover">
                    {g.name}
                  </option>
                ))}
              </Select>
              {errors.group && <FieldError>{errors.group}</FieldError>}
            </Field>
            <IconPicker value={c.icon} onChange={(icon) => set({ icon })} names={CATEGORY_ICON_NAMES} />
            <AccentPicker value={c.accent} onChange={(accent) => set({ accent })} />
          </FieldGroup>

          <FieldGroup>
            <p className="text-sm font-semibold">Who can do what</p>
            <Field>
              <FieldLabel htmlFor="cat-read">Who can read</FieldLabel>
              <Select id="cat-read" value={c.readMinRole} onChange={(e) => set({ readMinRole: e.target.value as ForumCategory["readMinRole"] })}>
                {READ_ROLES.map((r) => (
                  <option key={r.id} value={r.id} className="bg-popover">
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-post">Who can start threads</FieldLabel>
              <Select id="cat-post" value={c.postCap} onChange={(e) => set({ postCap: e.target.value as Cap })}>
                {[...new Set([...POST_CAPS, c.postCap])].filter((x) => (CAPS as readonly string[]).includes(x)).map((cap) => (
                  <option key={cap} value={cap} className="bg-popover">
                    {capLabel(cap)}
                  </option>
                ))}
              </Select>
              <FieldDescription>A capability from Roles. Staff and this category&apos;s moderators can always post.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-reply">Who can reply</FieldLabel>
              <Select id="cat-reply" value={c.replyCap} onChange={(e) => set({ replyCap: e.target.value as Cap })}>
                {[...new Set([...REPLY_CAPS, c.replyCap])].filter((x) => (CAPS as readonly string[]).includes(x)).map((cap) => (
                  <option key={cap} value={cap} className="bg-popover">
                    {capLabel(cap)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-rep">Reputation needed to start a thread</FieldLabel>
              <Input id="cat-rep" type="number" inputMode="numeric" min={0} max={1000000} value={c.minReputation} onChange={(e) => set({ minReputation: Math.max(0, Number(e.target.value) || 0) })} className="bg-background/60 sm:max-w-40" />
              <FieldDescription>0 means anyone who may post. Replies are not limited by reputation.</FieldDescription>
            </Field>
            <SwitchRow id="cat-staff" label="Only the team starts threads" description="Members can still reply (like Announcements)." checked={c.staffOnlyPosting} onChange={(on) => set({ staffOnlyPosting: on })} />
            <SwitchRow id="cat-archived" label="Archived" description="Read only: no new threads or replies." checked={c.archived} onChange={(on) => set({ archived: on })} />
            <SwitchRow id="cat-hidden" label="Hidden" description="Left out of the forum and closed to members; staff and its moderators still see it." checked={c.hidden} onChange={(on) => set({ hidden: on })} />
          </FieldGroup>

          <ModeratorPicker value={c.moderators} onChange={(moderators) => set({ moderators })} />

          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-border bg-popover px-5 py-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create category" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {!isNew && initial && (
              <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => onDelete(initial)}>
                <Trash2Icon aria-hidden /> Remove
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Category moderators: search members by name or handle, add up to 20. */
function ModeratorPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [known, setKnown] = useState<Record<string, MemberHit>>({})
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<MemberHit[]>([])

  useEffect(() => {
    const missing = value.filter((id) => !known[id])
    if (!missing.length) return
    let on = true
    void membersByIds(missing).then((list) => on && setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((m) => [m.id, m])) })))
    return () => {
      on = false
    }
  }, [value, known])

  useEffect(() => {
    if (q.trim().length < 2) return
    let on = true
    const t = setTimeout(() => void searchMembers(q).then((h) => on && setHits(h)), 200)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])

  const shown = q.trim().length >= 2 ? hits.filter((h) => !value.includes(h.id)) : []

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Category moderators</legend>
      <p className="text-sm text-muted-foreground">They can pin, lock and hide threads and hide replies here, and post even when the category is closed to members.</p>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 py-0.5 pr-1 pl-2.5 text-sm">
              {known[id]?.name ?? "Member"}
              {known[id]?.handle && <span className="text-xs text-muted-foreground">@{known[id]?.handle}</span>}
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${known[id]?.name ?? "this member"}`} onClick={() => onChange(value.filter((x) => x !== id))}>
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {value.length < 20 && (
        <div className="relative">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a member: type a name or handle" aria-label="Find a member to add" className="bg-background/60" />
          {shown.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {shown.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setKnown((k) => ({ ...k, [h.id]: h }))
                      onChange([...value, h.id])
                      setQ("")
                      setHits([])
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none"
                  >
                    {h.name}
                    {h.handle && <span className="text-xs text-muted-foreground">@{h.handle}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

function GroupDialog({
  state,
  taken,
  onClose,
  onSave,
}: {
  state: { group: ForumGroup; isNew: boolean } | null
  taken: string[]
  onClose: () => void
  onSave: (g: ForumGroup, isNew: boolean) => Promise<void>
}) {
  const [g, setG] = useState<ForumGroup | null>(state?.group ?? null)
  const [error, setError] = useState("")
  if (!state || !g) return null
  const isNew = state.isNew
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const slug = isNew ? toSlug(g.name) : g.slug
            if (g.name.trim().length < 2) return setError("The name is 2 to 60 characters.")
            if (isNew && (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) || taken.includes(slug))) return setError("Pick a name that makes a new, unused address.")
            setError("")
            void onSave({ ...g, slug }, isNew)
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{isNew ? "New group" : `Edit ${state.group.name}`}</DialogTitle>
            <DialogDescription>Groups are the headings on the forum page, such as Community or Build.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="grp-name">Name</FieldLabel>
            <Input id="grp-name" value={g.name} maxLength={60} onChange={(e) => setG({ ...g, name: e.target.value })} className="bg-background/60" />
          </Field>
          <Field>
            <FieldLabel htmlFor="grp-blurb">One line about it</FieldLabel>
            <Input id="grp-blurb" value={g.blurb} maxLength={200} onChange={(e) => setG({ ...g, blurb: e.target.value })} className="bg-background/60" />
          </Field>
          <SwitchRow id="grp-hidden" label="Hidden" description="The group and its categories leave the forum page." checked={g.hidden} onChange={(hidden) => setG({ ...g, hidden })} />
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{isNew ? "Create group" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
