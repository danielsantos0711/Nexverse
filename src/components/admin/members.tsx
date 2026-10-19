"use client"

import { useEffect, useState } from "react"
import { PauseCircleIcon, PlayCircleIcon, SearchIcon, UsersIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { isSuspended, ROLE_LABELS, searchMembers, setMemberRole, suspendMember, type AdminMember, type SiteRoleName } from "@/lib/admin"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Filter = SiteRoleName | "all" | "suspended"
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "admin", label: "Admins" },
  { id: "moderator", label: "Moderators" },
  { id: "member", label: "Members" },
  { id: "suspended", label: "Suspended" },
]

const DURATIONS = [1, 3, 7, 30, 90]

/** Find members, change their role (admins), and pause or restore their posting (staff). */
export function AdminMembers() {
  const me = useRole()
  const { user } = useSession()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [result, setResult] = useState<{ members: AdminMember[]; error: string | null; key: string } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [suspending, setSuspending] = useState<AdminMember | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const key = `${filter}|${query.trim()}`
  useEffect(() => {
    if (!live) return
    let on = true
    // A short pause while typing, so each keystroke does not hit the database.
    const t = setTimeout(() => void searchMembers({ query, role: filter }).then((r) => on && setResult({ ...r, key })), query ? 250 : 0)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [query, filter, key])

  function patch(id: string, change: Partial<AdminMember>) {
    setResult((r) => r && { ...r, members: r.members.map((m) => (m.id === id ? { ...m, ...change } : m)) })
  }

  async function changeRole(m: AdminMember, role: SiteRoleName) {
    if (role === m.role) return
    setBusy(m.id)
    setStatus(null)
    try {
      await setMemberRole(m.id, role)
      patch(m.id, { role })
      setStatus({ ok: true, text: `${m.name} is now ${ROLE_LABELS[role].toLowerCase() === "admin" ? "an admin" : `a ${ROLE_LABELS[role].toLowerCase()}`}.` })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function lift(m: AdminMember) {
    setBusy(m.id)
    setStatus(null)
    try {
      await suspendMember(m.id, 0, "")
      patch(m.id, { suspendedUntil: null, suspendedReason: null })
      setStatus({ ok: true, text: `${m.name} can post again.` })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const loading = live && (!result || result.key !== key)

  return (
    <section aria-labelledby="mem-title" className="flex flex-col gap-4">
      <div id="mem-title">
        <AdminHeading
          title="Members"
          lead={me.isAdmin || !live ? "Search by name or handle. Admins change roles; moderators and admins can pause a member's posting." : "Search by name or handle. Moderators can pause a member's posting; only admins change roles."}
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:max-w-sm md:flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search members" placeholder="Name or handle" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!live} className="h-10 bg-background/60 pl-9" />
        </div>
        <div role="radiogroup" aria-label="Show" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {FILTERS.map((f) => (
            <label
              key={f.id}
              className={cn(
                "pressable shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                filter === f.id ? "border-ion/60 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <input type="radio" name="member-filter" className="sr-only" checked={filter === f.id} onChange={() => setFilter(f.id)} disabled={!live} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <StatusLine status={status} />

      {!live ? (
        <Empty className="rounded-2xl border border-border bg-card/40 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No members in a browser-only copy</EmptyTitle>
            <EmptyDescription>Accounts live in the database. Once Supabase is connected, everyone who signs up appears here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading members">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : result?.error ? (
        <Notice tone="warn" title="Members could not load">
          {result.error}
        </Notice>
      ) : !result?.members.length ? (
        <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">{query ? `Nobody matches “${query}”.` : "Nobody here yet."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.members.map((m) => {
            const self = m.id === user?.id
            const paused = isSuspended(m)
            // Moderators can pause members only; admins can pause anyone but themselves.
            const canPause = !self && (me.isAdmin || m.role === "member")
            return (
              <li key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 px-4 py-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-sm font-medium uppercase">
                    {m.name.slice(0, 1)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{m.name}</span>
                      {self && <span className="text-xs text-muted-foreground">(you)</span>}
                      {m.role !== "member" && <Badge variant={m.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>}
                      {paused && (
                        <Badge variant="destructive" title={m.suspendedReason ?? undefined}>
                          Paused until {new Date(m.suspendedUntil!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.handle ? `@${m.handle} · ` : ""}joined {when(m.createdAt)}
                      {paused && m.suspendedReason ? ` · “${m.suspendedReason}”` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {me.isAdmin && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="sr-only md:not-sr-only">Role</span>
                      <select
                        value={m.role}
                        disabled={busy === m.id || self}
                        title={self ? "You cannot change your own role" : undefined}
                        aria-label={`Role of ${m.name}`}
                        onChange={(e) => void changeRole(m, e.target.value as SiteRoleName)}
                        className="h-8 rounded-lg border border-input bg-background/60 px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        {(Object.keys(ROLE_LABELS) as SiteRoleName[]).map((r) => (
                          <option key={r} value={r} className="bg-popover">
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {canPause &&
                    (paused ? (
                      <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => void lift(m)}>
                        <PlayCircleIcon aria-hidden /> Lift pause
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => setSuspending(m)}>
                        <PauseCircleIcon aria-hidden /> Pause posting
                      </Button>
                    ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={suspending !== null} onOpenChange={(o) => !o && setSuspending(null)}>
        <DialogContent className="sm:max-w-md">
          {suspending && (
            <SuspendForm
              member={suspending}
              onDone={(days, reason) => {
                const until = new Date(Date.now() + days * 864e5).toISOString()
                patch(suspending.id, { suspendedUntil: until, suspendedReason: reason })
                setStatus({ ok: true, text: `${suspending.name} cannot post for ${days} ${days === 1 ? "day" : "days"}. They were notified.` })
                setSuspending(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function SuspendForm({ member, onDone }: { member: AdminMember; onDone: (days: number, reason: string) => void }) {
  const [days, setDays] = useState("7")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      setError("Pick a number of days between 1 and 3650.")
      document.getElementById("sus-days")?.focus()
      return
    }
    if (reason.trim().length < 3) {
      setError("Give a short reason. The member sees it in their notifications.")
      document.getElementById("sus-reason")?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await suspendMember(member.id, n, reason)
      onDone(n, reason.trim())
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Pause {member.name}’s posting</DialogTitle>
        <DialogDescription>They can still read and sign in, but cannot post, reply, chat or send messages until the pause ends.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="sus-days">For how many days</FieldLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {DURATIONS.map((d) => (
            <Button key={d} type="button" size="sm" variant={days === String(d) ? "secondary" : "ghost"} aria-pressed={days === String(d)} onClick={() => setDays(String(d))}>
              {d} {d === 1 ? "day" : "days"}
            </Button>
          ))}
          <Input id="sus-days" type="number" inputMode="numeric" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-24 bg-background/60" />
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="sus-reason">Reason</FieldLabel>
        <Textarea id="sus-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Repeated spam in the forum after a warning" className="bg-background/60" />
        <FieldDescription>Shown to the member and written to the moderation log. {300 - reason.length} characters left.</FieldDescription>
      </Field>
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy ? "Pausing…" : "Pause posting"}
        </Button>
      </DialogFooter>
    </form>
  )
}
