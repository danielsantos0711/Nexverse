"use client"

import { useEffect, useState } from "react"
import { ShieldCheckIcon, ShieldIcon, SparklesIcon, StarIcon, type LucideIcon } from "lucide-react"
import { DEFAULT_ROLES, loadRoleDefs, readableColor, type RoleDef } from "@/lib/caps"
import { memberBadges } from "@/lib/roles"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = { admin: ShieldCheckIcon, moderator: ShieldIcon, editor: StarIcon, contributor: SparklesIcon }

// Role names and colours, read once per page load and shared by every badge.
let defs: RoleDef[] = DEFAULT_ROLES
let defsLoad: Promise<RoleDef[]> | null = null
function useRoleDefs() {
  const [list, setList] = useState(defs)
  useEffect(() => {
    defsLoad ??= loadRoleDefs().then((r) => (defs = r.roles))
    let on = true
    void defsLoad.then((r) => on && setList(r))
    return () => {
      on = false
    }
  }, [])
  return list
}

export type BadgeMember = {
  /** Used to look up granted and earned roles when `roles` is not given. */
  id?: string | null
  /** The base role from profiles.role, when the caller already has it. */
  role?: string | null
  /** Every role key the member holds, when the caller already has them. */
  roles?: string[]
}

/**
 * The member's most senior role as a small coloured badge: admin, moderator, editor, a custom role or
 * contributor. Plain members show nothing. `all` shows every role instead of the top one.
 */
export function RoleBadge({ member, all = false, className }: { member: BadgeMember; all?: boolean; className?: string }) {
  const list = useRoleDefs()
  const [fetched, setFetched] = useState<{ id: string; roles: string[] } | null>(null)
  const id = member.id ?? null
  const needFetch = !member.roles && Boolean(id)

  useEffect(() => {
    if (!needFetch || !id) return
    let on = true
    void memberBadges(id).then((roles) => on && setFetched({ id, roles }))
    return () => {
      on = false
    }
  }, [needFetch, id])

  const keys = new Set<string>([...(member.roles ?? (fetched?.id === id ? fetched.roles : [])), ...(member.role && member.role !== "member" ? [member.role] : [])])
  const held = list.filter((r) => r.key !== "member" && keys.has(r.key)).sort((a, b) => b.rank - a.rank)
  const shown = all ? held : held.slice(0, 1)
  if (!shown.length) return null

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((r) => {
        const Icon = ICONS[r.key] ?? ShieldIcon
        const color = readableColor(r.color)
        return (
          <span
            key={r.key}
            title={r.description || r.label}
            className="inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap"
            style={{ color, borderColor: `${color}55`, background: `${color}14` }}
          >
            <Icon aria-hidden className="size-3" />
            {r.label}
          </span>
        )
      })}
    </span>
  )
}
