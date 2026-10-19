"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react"
import type { RolesData } from "@/components/admin/roles-admin"
import { when } from "@/components/admin/controls"
import { RoleBadge } from "@/components/reputation/role-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ROLE_LABELS, searchMembers, type AdminMember } from "@/lib/admin"
import { clearBadgeCache, grantRole, listRoleGrants, revokeRole, type RoleGrant } from "@/lib/roles"
import { live } from "@/lib/supabase"

const BASE = new Set(["member", "moderator", "admin"])

/** Find a member by name or handle and give them a role; see and take back every extra role given so far. */
export function RolesMembers({ data }: { data: RolesData }) {
  const extra = [...data.roles].filter((r) => !BASE.has(r.key)).sort((a, b) => b.rank - a.rank)
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<{ q: string; members: AdminMember[]; error: string | null } | null>(null)
  const [grants, setGrants] = useState<{ list: RoleGrant[]; error: string | null } | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const loadGrants = useCallback(async () => {
    const r = await listRoleGrants()
    setGrants({ list: r.grants, error: r.error })
  }, [])

  useEffect(() => {
    if (!live) return
    let on = true
    void listRoleGrants().then((r) => on && setGrants({ list: r.grants, error: r.error }))
    return () => {
      on = false
    }
  }, [])

  const q = query.trim()
  useEffect(() => {
    if (!live || q.length < 2) return
    let on = true
    const t = setTimeout(() => void searchMembers({ query: q, limit: 8 }).then((r) => on && setFound({ q, ...r })), 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])

  const held = (id: string) => (grants?.list ?? []).filter((g) => g.userId === id).map((g) => g.roleKey)
  const label = (key: string) => data.roles.find((r) => r.key === key)?.label ?? key

  async function grant(m: AdminMember) {
    const role = pick[m.id] ?? extra.find((r) => !held(m.id).includes(r.key))?.key
    if (!role) return
    setBusy(m.id)
    data.say(null)
    try {
      await grantRole(m.id, role)
      clearBadgeCache(m.id)
      await loadGrants()
      data.say({ ok: true, text: `${m.name} is now ${label(role)}. They were notified.` })
    } catch (err) {
      data.say({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function revoke(g: RoleGrant) {
    const name = g.member?.name ?? "This member"
    setBusy(`${g.userId}:${g.roleKey}`)
    data.say(null)
    try {
      await revokeRole(g.userId, g.roleKey)
      clearBadgeCache(g.userId)
      await loadGrants()
      data.say({ ok: true, text: `${name} is no longer ${label(g.roleKey)}.` })
    } catch (err) {
      data.say({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const results = found && found.q === q && q.length >= 2 ? found : null
  const byRole = extra.map((r) => ({ role: r, people: (grants?.list ?? []).filter((g) => g.roleKey === r.key) })).filter((x) => x.people.length)

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[68ch] text-sm text-muted-foreground">
        Give someone an extra role here. Moderator and admin are base roles: change those on the{" "}
        <Link href="/admin/members" className="text-ion hover:underline">
          Members page
        </Link>
        . Contributor also comes on its own when a member reaches the reputation tier that hands it out.
      </p>

      <section aria-labelledby="grant-h" className="flex flex-col gap-3">
        <h3 id="grant-h" className="text-sm font-medium">
          Give a role
        </h3>
        <div className="relative md:max-w-sm">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Find a member by name or handle"
            placeholder="Name or handle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!data.editable}
            className="h-10 bg-background/60 pl-9"
          />
        </div>
        {q.length >= 2 &&
          (!results ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : results.error ? (
            <p className="text-sm text-destructive">{results.error}</p>
          ) : !results.members.length ? (
            <p className="text-sm text-muted-foreground">Nobody matches “{q}”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.members.map((m) => {
                const has = held(m.id)
                const options = extra.filter((r) => !has.includes(r.key))
                return (
                  <li key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 px-4 py-3 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{m.name}</span>
                        {m.role !== "member" && <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>}
                        <RoleBadge member={{ roles: has }} all />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.handle ? `@${m.handle}` : "No handle yet"}</p>
                    </div>
                    {options.length ? (
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Role to give ${m.name}`}
                          value={pick[m.id] ?? options[0].key}
                          onChange={(e) => setPick((p) => ({ ...p, [m.id]: e.target.value }))}
                          className="h-8 rounded-lg border border-input bg-background/60 px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {options.map((r) => (
                            <option key={r.key} value={r.key} className="bg-popover">
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" disabled={busy === m.id || !data.editable} onClick={() => void grant(m)}>
                          <UserPlusIcon aria-hidden /> Give role
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Has every extra role</p>
                    )}
                  </li>
                )
              })}
            </ul>
          ))}
      </section>

      <section aria-labelledby="holders-h" className="flex flex-col gap-3">
        <h3 id="holders-h" className="text-sm font-medium">
          Who holds extra roles
        </h3>
        {!live ? (
          <p className="text-sm text-muted-foreground">Nobody in a browser-only copy.</p>
        ) : !grants ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : grants.error ? (
          <p className="text-sm text-destructive">{grants.error}</p>
        ) : !byRole.length ? (
          <p className="rounded-xl border border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">No one has an extra role yet. Find a member above to give the first one.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {byRole.map(({ role, people }) => (
              <div key={role.key} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-4">
                <p className="flex items-center justify-between gap-2">
                  <RoleBadge member={{ roles: [role.key] }} />
                  <span className="text-xs text-muted-foreground tabular">{people.length}</span>
                </p>
                <ul className="flex flex-col">
                  {people.map((g) => (
                    <li key={g.userId} className="flex items-center gap-2 border-t border-border/60 py-1.5 text-sm first:border-t-0">
                      <span className="min-w-0 flex-1 truncate">
                        {g.member?.name ?? "Unknown member"}
                        {g.member?.handle && <span className="text-muted-foreground"> @{g.member.handle}</span>}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{when(g.grantedAt)}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Take ${role.label} from ${g.member?.name ?? "this member"}`}
                        disabled={busy === `${g.userId}:${g.roleKey}` || !data.editable}
                        onClick={() => void revoke(g)}
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
