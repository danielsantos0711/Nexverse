"use client"

import { useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { RolesData } from "@/components/admin/roles-admin"
import { lockedReason } from "@/components/admin/roles-matrix"
import { RoleBadge } from "@/components/reputation/role-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CAP_GROUPS, CAP_INFO, CAPS, readableColor, type Cap, type RoleDef } from "@/lib/caps"
import { clearBadgeCache, deleteRoleDef, saveRoleDef } from "@/lib/roles"
import { cn } from "@/lib/utils"

const SWATCHES = ["#8fb4ff", "#7fe0b0", "#d8c59e", "#ffb4e6", "#d3b4ff", "#ffd59e", "#9fe3cf", "#ff9f8f"]

const keyFrom = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 24)

/** Every role as a card: what it is, how many powers it has; built-in roles can be renamed, custom ones removed. */
export function RolesEditor({ data }: { data: RolesData }) {
  const [editing, setEditing] = useState<RoleDef | "new" | null>(null)
  const [removing, setRemoving] = useState<RoleDef | null>(null)
  const [busy, setBusy] = useState(false)
  const roles = [...data.roles].sort((a, b) => b.rank - a.rank)

  async function remove(r: RoleDef) {
    setBusy(true)
    try {
      await deleteRoleDef(r.key)
      clearBadgeCache()
      await data.reload()
      data.say({ ok: true, text: `The ${r.label} role was removed, and everyone who held it lost it.` })
      setRemoving(null)
    } catch (err) {
      data.say({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-muted-foreground">Built-in roles cover most needs. Make a custom role for a group with its own powers, such as event hosts or a language team.</p>
        <Button onClick={() => setEditing("new")} disabled={!data.editable}>
          <PlusIcon aria-hidden /> New role
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <li key={r.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  {r.key === "member" ? <span className="font-medium">Member</span> : <RoleBadge member={{ roles: [r.key] }} className="text-sm" />}
                  <Badge variant="outline" className="text-[11px]">
                    {r.builtin ? "Built in" : "Custom"}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">{r.description || "No description yet."}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {r.key !== "admin" && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.label}`} disabled={!data.editable} onClick={() => setEditing(r)}>
                    <PencilIcon aria-hidden />
                  </Button>
                )}
                {!r.builtin && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.label}`} disabled={!data.editable} onClick={() => setRemoving(r)}>
                    <Trash2Icon aria-hidden />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.key === "admin" ? "Every power" : `${r.caps.filter((c) => (CAPS as readonly string[]).includes(c)).length} powers`}
              {r.key === "member" && " · everyone signed in"}
              {r.key === "moderator" && " · set on the Members page"}
            </p>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {editing && (
            <RoleForm
              role={editing === "new" ? null : editing}
              taken={data.roles.map((r) => r.key)}
              onSaved={async (label, isNew) => {
                await data.reload()
                clearBadgeCache()
                data.say({ ok: true, text: isNew ? `${label} was created. Grant it to people in the People tab.` : `${label} was saved.` })
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing?.label}?</DialogTitle>
            <DialogDescription>Everyone who holds this role loses it and the powers it gave them. Their posts stay. This is written to the moderation log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => removing && void remove(removing)}>
              {busy ? "Removing…" : "Remove role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoleForm({ role, taken, onSaved }: { role: RoleDef | null; taken: string[]; onSaved: (label: string, isNew: boolean) => Promise<void> }) {
  const [label, setLabel] = useState(role?.label ?? "")
  const [description, setDescription] = useState(role?.description ?? "")
  const [color, setColor] = useState(role?.color ?? SWATCHES[4])
  const [caps, setCaps] = useState<string[]>(role?.caps ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = role?.key ?? keyFrom(label)
  const probe: RoleDef = role ?? { key: key || "custom", label, description, color, caps, builtin: false, rank: 30 }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (label.trim().length < 2) {
      setError("Give the role a name of at least 2 characters.")
      document.getElementById("role-label")?.focus()
      return
    }
    if (!role && (!/^[a-z][a-z0-9-]{1,23}$/.test(key) || taken.includes(key))) {
      setError(taken.includes(key) ? "A role with that name already exists. Pick another name." : "Start the name with a letter.")
      document.getElementById("role-label")?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveRoleDef({ key, label, description, color, caps })
      await onSaved(label.trim(), !role)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{role ? `Edit ${role.label}` : "New role"}</DialogTitle>
        <DialogDescription>{role?.builtin ? "Built-in roles keep their key; you can rename them and change their powers." : "Members with this role get its powers on top of their own."}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="role-label">Name</FieldLabel>
        <Input id="role-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="Event host" className="bg-background/60" />
        {!role && key && <FieldDescription>Key: {key}</FieldDescription>}
      </Field>
      <Field>
        <FieldLabel htmlFor="role-desc">What it is for</FieldLabel>
        <Textarea id="role-desc" rows={2} maxLength={240} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Members who run paper clubs and meetups" className="bg-background/60" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => (
            <label key={s} className="pressable cursor-pointer rounded-full has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <input type="radio" name="role-color" className="sr-only" checked={color === s} onChange={() => setColor(s)} aria-label={`Colour ${s}`} />
              <span aria-hidden className={cn("block size-7 rounded-full ring-1 ring-white/15 transition-shadow", color === s && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: s }} />
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Other
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-input bg-transparent" />
          </label>
          <span className="ml-auto text-xs" style={{ color: readableColor(color) }}>
            {label || "Preview"}
          </span>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Powers</legend>
        {CAP_GROUPS.map((g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {CAPS.filter((c) => CAP_INFO[c].group === g).map((c: Cap) => {
                const lock = lockedReason(probe, c)
                const on = caps.includes(c) || (probe.key === "moderator" && c === "moderate")
                return (
                  <label key={c} title={lock ?? undefined} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]", lock && "cursor-not-allowed opacity-60")}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={Boolean(lock)}
                      onChange={(e) => setCaps((list) => (e.target.checked ? [...new Set([...list, c])] : list.filter((x) => x !== c)))}
                      className="size-4 accent-[var(--ion)]"
                    />
                    {CAP_INFO[c].label}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </fieldset>
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : role ? "Save role" : "Create role"}
        </Button>
      </DialogFooter>
    </form>
  )
}
