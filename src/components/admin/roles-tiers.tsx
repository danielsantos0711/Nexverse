"use client"

import { useState } from "react"
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { RolesData } from "@/components/admin/roles-admin"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { CAP_GROUPS, CAP_INFO, CAPS, STAFF_CAPS, type Cap, type Tier } from "@/lib/caps"
import { clearBadgeCache, saveRepTiers } from "@/lib/roles"
import { cn } from "@/lib/utils"

// Powers that make sense to unlock with reputation; news, pages and running the site stay with roles.
const EARNABLE = CAPS.filter((c) => !STAFF_CAPS.includes(c) && ["Talk", "Share", "Create", "Code"].includes(CAP_INFO[c].group))

type Row = Tier & { id: string }

const keyFrom = (label: string, n: number) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+|-+$/g, "")
    .slice(0, 24) || `tier-${n}`

/**
 * The reputation tiers: from how many points each starts, what it unlocks and which role it hands out. One
 * tier always starts at 0 so every new member is in one. Saved as a whole list.
 */
export function RolesTiers({ data }: { data: RolesData }) {
  const [rows, setRows] = useState<Row[]>(() => [...data.tiers].sort((a, b) => a.minPoints - b.minPoints).map((t) => ({ ...t, id: t.key })))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const handouts = data.roles.filter((r) => !["member", "moderator", "admin"].includes(r.key))

  const edit = (id: string, change: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)))
    setDirty(true)
  }

  function add() {
    const top = rows.reduce((m, r) => Math.max(m, r.minPoints), 0)
    const id = `new-${Date.now()}`
    setRows((list) => [...list, { id, key: "", label: "", minPoints: top ? top * 2 : 25, caps: [], grantsRole: null }])
    setDirty(true)
    requestAnimationFrame(() => document.getElementById(`tier-label-${id}`)?.focus())
  }

  async function save() {
    const list = rows.map((r, i) => ({ ...r, label: r.label.trim(), key: r.key || keyFrom(r.label, i + 1) }))
    const bad = list.find((r) => r.label.length < 2)
    if (bad) {
      setError("Give every tier a name of at least 2 characters.")
      document.getElementById(`tier-label-${bad.id}`)?.focus()
      return
    }
    if (!list.some((r) => r.minPoints === 0)) {
      setError("One tier must start at 0 points, so new members have one.")
      return
    }
    if (new Set(list.map((r) => r.minPoints)).size !== list.length || new Set(list.map((r) => r.key)).size !== list.length) {
      setError("Two tiers have the same name or the same number of points.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveRepTiers(list)
      clearBadgeCache()
      await data.reload()
      setRows([...list].sort((a, b) => a.minPoints - b.minPoints).map((r) => ({ ...r, id: r.key })))
      setDirty(false)
      data.say({ ok: true, text: "Reputation tiers saved. Members' powers follow them straight away." })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[68ch] text-sm text-muted-foreground">
        Points come from the forum: 5 for a thread, 2 for a reply, 15 when your reply solves someone&rsquo;s question, and likes and reactions from others. Tiers add powers on top of the Member role, so keep the everyday ones (threads, replies, chat) on the Member role.
      </p>
      <ol className="flex flex-col gap-3">
        {rows.map((t, i) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Name
                <Input id={`tier-label-${t.id}`} value={t.label} maxLength={40} onChange={(e) => edit(t.id, { label: e.target.value })} disabled={!data.editable} className="h-9 bg-background/60 text-sm text-foreground" />
              </label>
              <label className="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
                From points
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000000}
                  value={t.minPoints}
                  onChange={(e) => edit(t.id, { minPoints: Math.max(0, Math.min(1000000, Math.round(Number(e.target.value) || 0))) })}
                  disabled={!data.editable}
                  className="h-9 bg-background/60 text-sm text-foreground tabular"
                />
              </label>
              <label className="flex w-44 flex-col gap-1 text-xs text-muted-foreground">
                Hands out the role
                <select
                  value={t.grantsRole ?? ""}
                  onChange={(e) => edit(t.id, { grantsRole: e.target.value || null })}
                  disabled={!data.editable}
                  className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <option value="" className="bg-popover">
                    No role
                  </option>
                  {handouts.map((r) => (
                    <option key={r.key} value={r.key} className="bg-popover">
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove the ${t.label || `tier ${i + 1}`} tier`} disabled={!data.editable || rows.length <= 1} onClick={() => {
                  setRows((l) => l.filter((r) => r.id !== t.id))
                  setDirty(true)
                }}>
                <Trash2Icon aria-hidden />
              </Button>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs text-muted-foreground">Unlocks</legend>
              <div className="flex flex-wrap gap-1.5">
                {CAP_GROUPS.flatMap((g) => EARNABLE.filter((c) => CAP_INFO[c].group === g)).map((c: Cap) => {
                  const on = t.caps.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      disabled={!data.editable}
                      onClick={() => edit(t.id, { caps: on ? t.caps.filter((x) => x !== c) : [...t.caps, c] })}
                      className={cn(
                        "pressable inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                        on ? "border-ion/70 bg-ion/15 font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {on && <CheckIcon aria-hidden className="size-3 text-ion" />}
                      {CAP_INFO[c].label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={add} disabled={!data.editable || rows.length >= 12}>
          <PlusIcon aria-hidden /> Add a tier
        </Button>
        <Button onClick={() => void save()} disabled={!data.editable || busy || !dirty}>
          {busy ? "Saving…" : "Save tiers"}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  )
}
