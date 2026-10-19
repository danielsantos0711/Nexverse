"use client"

import { Fragment, useState } from "react"
import { CheckIcon, LockIcon } from "lucide-react"
import type { RolesData } from "@/components/admin/roles-admin"
import { Switch } from "@/components/admin/controls"
import { CAP_GROUPS, CAP_INFO, CAPS, readableColor, STAFF_CAPS, type Cap, type RoleDef } from "@/lib/caps"
import { saveRoleDef } from "@/lib/roles"
import { cn } from "@/lib/utils"

/** Why a cell cannot be switched, or null when it can. */
export function lockedReason(role: RoleDef, cap: Cap): string | null {
  if (role.key === "admin") return "Admins always have every power."
  if (role.key === "moderator" && cap === "moderate") return "Moderators always moderate."
  if (STAFF_CAPS.includes(cap)) return cap === "moderate" ? "Only moderators and admins moderate. Make someone a moderator on the Members page." : "Only admins hold this power."
  return null
}

/**
 * Roles across the top, powers down the side, a switch in each cell. A switch saves that role straight away.
 * The last column shows the reputation tier that also unlocks the power, if any.
 */
export function RolesMatrix({ data }: { data: RolesData }) {
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const roles = [...data.roles].sort((a, b) => a.rank - b.rank)
  const capsOf = (r: RoleDef) => pending[r.key] ?? r.caps
  const member = roles.find((r) => r.key === "member")
  // Every role includes the Member powers, so those cells show a check instead of a second switch.
  const fromMember = (r: RoleDef, cap: Cap) => r.key !== "member" && r.key !== "admin" && Boolean(member && capsOf(member).includes(cap)) && !capsOf(r).includes(cap)

  async function toggle(role: RoleDef, cap: Cap, on: boolean) {
    const before = capsOf(role)
    const next = on ? [...new Set([...before, cap])] : before.filter((c) => c !== cap)
    setPending((p) => ({ ...p, [role.key]: next }))
    setBusy(`${role.key}:${cap}`)
    data.say(null)
    try {
      await saveRoleDef({ ...role, caps: next })
      await data.reload()
      setPending((p) => {
        const rest = { ...p }
        delete rest[role.key]
        return rest
      })
      data.say({ ok: true, text: `${role.label}: ${on ? "can now" : "can no longer"} ${CAP_INFO[cap].label.toLowerCase()}.` })
    } catch (err) {
      setPending((p) => ({ ...p, [role.key]: before }))
      data.say({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const tierFor = (cap: Cap) =>
    [...data.tiers].sort((a, b) => a.minPoints - b.minPoints).find((t) => t.caps.includes(cap) || (t.grantsRole && data.roles.find((r) => r.key === t.grantsRole)?.caps.includes(cap)))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A member has a power when the Member column, one of their roles, or their reputation tier gives it. Paused members have none until the pause ends.
      </p>
      {/* relative: keeps the screen-reader-only labels inside the scroller, so the page never scrolls sideways. */}
      <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Which roles have which powers</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 border-b border-border bg-background/95 py-2.5 pr-3 text-left font-medium text-muted-foreground">
                Power
              </th>
              {roles.map((r) => (
                <th key={r.key} scope="col" className="border-b border-border px-2 py-2.5 text-center font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: readableColor(r.color) }} />
                    {r.label}
                  </span>
                </th>
              ))}
              <th scope="col" className="border-b border-border px-2 py-2.5 text-left font-medium whitespace-nowrap text-muted-foreground">
                Or reputation
              </th>
            </tr>
          </thead>
          <tbody>
            {CAP_GROUPS.map((g) => (
              <Fragment key={g}>
                <tr>
                  <th colSpan={roles.length + 2} scope="colgroup" className="sticky left-0 pt-5 pb-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {g}
                  </th>
                </tr>
                {CAPS.filter((c) => CAP_INFO[c].group === g).map((cap) => {
                  const tier = tierFor(cap)
                  return (
                    <tr key={cap} className="group/row">
                      <th scope="row" className="sticky left-0 z-10 border-b border-border/60 bg-background/95 py-2 pr-3 text-left font-normal group-hover/row:bg-card">
                        <span className="block">{CAP_INFO[cap].label}</span>
                        <code className="text-[11px] text-muted-foreground">{cap}</code>
                      </th>
                      {roles.map((r) => {
                        const lock = lockedReason(r, cap)
                        const on = r.key === "admin" || capsOf(r).includes(cap)
                        return (
                          <td key={r.key} className="border-b border-border/60 px-2 py-2 text-center group-hover/row:bg-card/60">
                            <span className="inline-flex items-center justify-center" title={lock ?? undefined}>
                              {fromMember(r, cap) ? (
                                <span title="Every member has this">
                                  <CheckIcon aria-hidden className="size-4 text-muted-foreground" />
                                  <span className="sr-only">{`${r.label}: ${CAP_INFO[cap].label}. Included, every member has this.`}</span>
                                </span>
                              ) : lock && !on ? (
                                <LockIcon aria-label={`${r.label}: ${CAP_INFO[cap].label}. ${lock}`} className="size-3.5 text-muted-foreground/60" />
                              ) : (
                                <Switch
                                  checked={on}
                                  disabled={!data.editable || Boolean(lock) || busy !== null}
                                  onCheckedChange={(v) => void toggle(r, cap, v)}
                                  aria-label={`${r.label}: ${CAP_INFO[cap].label}${lock ? `. ${lock}` : ""}`}
                                  className={cn(lock && "opacity-70")}
                                />
                              )}
                            </span>
                          </td>
                        )
                      })}
                      <td className="border-b border-border/60 px-2 py-2 text-xs whitespace-nowrap text-muted-foreground group-hover/row:bg-card/60">
                        {tier ? `${tier.label}, ${tier.minPoints.toLocaleString("en")}+` : "Roles only"}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
