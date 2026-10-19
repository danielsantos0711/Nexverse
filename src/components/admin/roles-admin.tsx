"use client"

import { useCallback, useEffect, useState } from "react"
import { AdminHeading, Notice, StatusLine } from "@/components/admin/controls"
import { RolesMatrix } from "@/components/admin/roles-matrix"
import { RolesEditor } from "@/components/admin/roles-editor"
import { RolesMembers } from "@/components/admin/roles-members"
import { RolesTiers } from "@/components/admin/roles-tiers"
import { Gate } from "@/components/moderation/gate"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DEFAULT_ROLES, DEFAULT_TIERS, loadRoleDefs, refreshCaps, type RoleDef, type Tier } from "@/lib/caps"
import { live } from "@/lib/supabase"

export type Status = { ok: boolean; text: string } | null

/** Shared state for the four tabs: the roles and tiers as the database has them, and a way to reload them. */
export type RolesData = { roles: RoleDef[]; tiers: Tier[]; ready: boolean; editable: boolean; reload: () => Promise<void>; say: (s: Status) => void }

const TABS = [
  { id: "matrix", label: "Powers" },
  { id: "roles", label: "Roles" },
  { id: "people", label: "People" },
  { id: "tiers", label: "Reputation" },
] as const
type TabId = (typeof TABS)[number]["id"]

/** /admin/roles: who can do what. Admins only; every change is checked and logged by the database. */
export function RolesAdmin() {
  const body = <Body />
  return live ? (
    <Gate role="admin" action="manage roles and powers">
      {body}
    </Gate>
  ) : (
    body
  )
}

function Body() {
  const [state, setState] = useState<{ roles: RoleDef[]; tiers: Tier[]; ok: boolean } | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [tab, setTab] = useState<TabId>("matrix")

  const reload = useCallback(async () => {
    const r = await loadRoleDefs()
    setState(r)
    refreshCaps()
  }, [])

  useEffect(() => {
    let on = true
    void loadRoleDefs().then((r) => on && setState(r))
    return () => {
      on = false
    }
  }, [])

  const data: RolesData = {
    roles: state?.roles ?? DEFAULT_ROLES,
    tiers: state?.tiers ?? DEFAULT_TIERS,
    ready: state !== null,
    editable: live && Boolean(state?.ok),
    reload,
    say: setStatus,
  }

  return (
    <section aria-labelledby="roles-title" className="flex flex-col gap-5">
      <div id="roles-title">
        <AdminHeading
          title="Roles and powers"
          lead="Decide who can do what. Every member has the Member powers; roles add more, and reputation unlocks more as people help. Guests can only read. The database checks every post against this, so what you set here is what happens."
        />
      </div>

      {!live ? (
        <Notice tone="warn" title="Read only in a browser-only copy">
          These are the defaults Nexverse starts with. Connect Supabase to change them.
        </Notice>
      ) : state && !state.ok ? (
        <Notice tone="warn" title="Roles are not set up on this database yet">
          The capabilities migration (20261019121000_capabilities.sql) has not been applied, so these are the defaults and nothing can be saved yet.
        </Notice>
      ) : null}

      <StatusLine status={status} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {!data.ready && live ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading roles">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="matrix">
              <RolesMatrix data={data} />
            </TabsContent>
            <TabsContent value="roles">
              <RolesEditor data={data} />
            </TabsContent>
            <TabsContent value="people">
              <RolesMembers data={data} />
            </TabsContent>
            <TabsContent value="tiers">
              <RolesTiers data={data} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </section>
  )
}
