"use client"

import { Reorder, useReducedMotion } from "motion/react"
import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GripVerticalIcon, LayoutGridIcon, ListIcon, OrbitIcon, XIcon } from "lucide-react"
import { LookPicker } from "@/components/missions/mission-cover"
import { MemberPlanet } from "@/components/planet/member-planet"
import type { Pin } from "@/components/profile/member-space"
import { planetSeed } from "@/components/profile/planet-seed"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Badge, RepStats } from "@/lib/community"
import { isAccent, type Accent } from "@/lib/missions-look"
import { PLANET_WORLDS, saveMemberSpace, SPACE_LIMITS, type MemberSpace, type SpaceLayout } from "@/lib/profile"
import { cn } from "@/lib/utils"

const LAYOUTS: { id: SpaceLayout; label: string; icon: typeof ListIcon }[] = [
  { id: "grid", label: "Cards", icon: LayoutGridIcon },
  { id: "list", label: "List", icon: ListIcon },
  { id: "orbit", label: "Orbit", icon: OrbitIcon },
]

/** Your profile's look: cover, colour, planet, tagline, status, layout, what is pinned (drag to reorder) and which badges show. */
export function CustomiseSpace({
  handle,
  space,
  pins,
  badges,
  stats,
  onClose,
  onSaved,
}: {
  memberId: string
  handle: string
  space: MemberSpace
  pins: Pin[]
  badges: Badge[]
  stats: RepStats
  onClose: () => void
  onSaved: (s: MemberSpace) => void
}) {
  const reduce = useReducedMotion()
  const [s, setS] = useState<MemberSpace>(space)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const accent: Accent = isAccent(s.accent) ? s.accent : "ion"
  const pinned = s.pinned.filter((k) => pins.some((p) => p.key === k))

  function togglePin(key: string) {
    if (pinned.includes(key)) setS({ ...s, pinned: pinned.filter((k) => k !== key) })
    else if (pinned.length < SPACE_LIMITS.pinned) setS({ ...s, pinned: [...pinned, key] })
  }
  function move(i: number, d: -1 | 1) {
    const next = [...pinned]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setS({ ...s, pinned: next })
  }
  function toggleBadge(id: string) {
    if (s.badges.includes(id)) setS({ ...s, badges: s.badges.filter((b) => b !== id) })
    else if (s.badges.length < SPACE_LIMITS.badges) setS({ ...s, badges: [...s.badges, id] })
  }

  async function save() {
    setBusy(true)
    setError("")
    const next = { ...s, pinned }
    try {
      await saveMemberSpace(next)
      onSaved(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customise your space</DialogTitle>
          <DialogDescription>Everyone who opens your profile sees these. Change them whenever you like.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Cover and colour</h3>
            <LookPicker seed={handle} cover={s.cover} accent={accent} onCover={(cover) => setS({ ...s, cover })} onAccent={(a) => setS({ ...s, accent: a })} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Your planet</h3>
            <div role="radiogroup" aria-label="Planet" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              <button type="button" role="radio" aria-checked={s.planet === null} onClick={() => setS({ ...s, planet: null })} className={cn("pressable flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px]", s.planet === null ? "border-white/60" : "border-border")}>
                <MemberPlanet handle={handle} size={56} stats={{ points: stats.points }} />
                Yours
              </button>
              {PLANET_WORLDS.map((w) => (
                <button key={w.id} type="button" role="radio" aria-checked={s.planet === w.id} onClick={() => setS({ ...s, planet: w.id })} className={cn("pressable flex flex-col items-center gap-1 rounded-xl border p-1.5 text-center text-[10px] leading-tight", s.planet === w.id ? "border-white/60" : "border-border")}>
                  <MemberPlanet handle={planetSeed(handle, w.id)} size={56} stats={{ points: stats.points }} />
                  {w.label}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              Tagline
              <Input value={s.tagline} maxLength={SPACE_LIMITS.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} placeholder="Speech models for languages people forget" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Status
              <Input value={s.status} maxLength={SPACE_LIMITS.status} onChange={(e) => setS({ ...s, status: e.target.value })} placeholder="Training a 1B model this week" />
            </label>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">How your work is laid out</h3>
            <div role="radiogroup" aria-label="Layout" className="flex gap-2">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={s.layout === l.id} onClick={() => setS({ ...s, layout: l.id })} className={cn("pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors", s.layout === l.id ? "border-white/50 bg-white/[0.08]" : "border-border text-muted-foreground hover:text-foreground")}>
                  <l.icon aria-hidden className="size-4" /> {l.label}
                </button>
              ))}
            </div>
            {s.layout === "orbit" && <p className="text-xs text-muted-foreground">Pinned work rides a slow orbit you can drag. It needs at least three pins.</p>}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Pinned <span className="font-normal text-muted-foreground tabular">({pinned.length}/{SPACE_LIMITS.pinned})</span>
            </h3>
            {pinned.length > 0 && (
              <Reorder.Group axis="y" values={pinned} onReorder={(v) => setS({ ...s, pinned: v })} className="flex flex-col gap-1.5">
                {pinned.map((k, i) => {
                  const p = pins.find((x) => x.key === k)!
                  return (
                    <Reorder.Item key={k} value={k} dragListener={!reduce} className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-sm active:cursor-grabbing">
                      <GripVerticalIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="text-[11px] text-muted-foreground uppercase">{p.type}</span>
                      <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground">
                        <ArrowUpIcon className="size-3.5" />
                      </button>
                      <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground">
                        <ArrowDownIcon className="size-3.5" />
                      </button>
                      <button type="button" aria-label={`Unpin ${p.title}`} onClick={() => togglePin(k)} className="text-muted-foreground hover:text-destructive">
                        <XIcon className="size-3.5" />
                      </button>
                    </Reorder.Item>
                  )
                })}
              </Reorder.Group>
            )}
            {pins.length === 0 ? (
              <p className="text-xs text-muted-foreground">Publish a project, start a thread or make a collection, and you can pin it here.</p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
                {pins
                  .filter((p) => !pinned.includes(p.key))
                  .map((p) => (
                    <li key={p.key}>
                      <button type="button" onClick={() => togglePin(p.key)} disabled={pinned.length >= SPACE_LIMITS.pinned} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.04] disabled:opacity-50">
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        <span className="text-[11px] text-muted-foreground uppercase">{p.type}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Badges on display <span className="font-normal text-muted-foreground tabular">({s.badges.length || "auto"})</span>
            </h3>
            {badges.length === 0 ? (
              <p className="text-xs text-muted-foreground">No badges yet. They light up as your counts grow; see the leaderboard for how.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {badges.map((b) => {
                  const on = s.badges.includes(b.id)
                  return (
                    <button key={b.id} type="button" aria-pressed={on} onClick={() => toggleBadge(b.id)} className={cn("pressable inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-gold/40 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:text-foreground")}>
                      {on && <CheckIcon aria-hidden className="size-3" />} {b.name}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Pick none to show your newest ones.</p>
          </section>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
