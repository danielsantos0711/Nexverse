"use client"

import Link from "next/link"
import { useState } from "react"
import { CrownIcon, MoreHorizontalIcon, ShieldIcon, UserMinusIcon } from "lucide-react"
import { WhoAvatar } from "@/components/crews/emblem"
import { MessageButton } from "@/components/messages/message-button"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { removeMember, ROLE_LABEL, setMemberRole, type Crew, type CrewMember, type CrewRole } from "@/lib/crews"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const joined = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/** Everyone in the crew with their role. The owner hands out the admin role; admins remove members. */
export function CrewMembers({ crew, members, role, meId, onChanged }: { crew: Crew; members: CrewMember[] | null; role: CrewRole | null; meId: string | null; onChanged: () => void }) {
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  async function act(fn: () => Promise<void>, done: string) {
    setError("")
    try {
      await fn()
      setStatus(done)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!members) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading members">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40">
        {members.map((m) => {
          const you = Boolean(meId && m.memberId === meId)
          const canPromote = live && role === "owner" && m.role !== "owner" && m.memberId
          const canRemove = live && m.memberId && !you && m.role !== "owner" && (role === "owner" || (role === "admin" && m.role === "member"))
          return (
            <li key={m.key} className="flex items-center gap-3 px-3 py-2.5">
              <WhoAvatar who={m} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  {m.handle ? (
                    <Link href={`/people/${m.handle}`} className="truncate text-sm font-medium hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{m.name}</span>
                  )}
                  {you && <span className="text-xs text-muted-foreground">(you)</span>}
                </span>
                <span className="text-xs text-muted-foreground">Joined {joined.format(new Date(m.joinedAt))}</span>
              </div>
              <RoleBadge role={m.role} />
              {!you && m.memberId && !m.handle && <MessageButton memberId={m.memberId} name={m.name} variant="ghost" size="sm" className="hidden sm:inline-flex" />}
              {(canPromote || canRemove) && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${m.name}`} />}>
                    <MoreHorizontalIcon aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canPromote &&
                      (m.role === "admin" ? (
                        <DropdownMenuItem onClick={() => act(() => setMemberRole(crew, m.memberId!, "member"), `${m.name} is now a member.`)}>
                          <ShieldIcon aria-hidden /> Make a member
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => act(() => setMemberRole(crew, m.memberId!, "admin"), `${m.name} is now an admin.`)}>
                          <ShieldIcon aria-hidden /> Make an admin
                        </DropdownMenuItem>
                      ))}
                    {canRemove && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => confirm(`Remove ${m.name} from ${crew.name}?`) && act(() => removeMember(crew, m.memberId!), `${m.name} was removed.`)}
                      >
                        <UserMinusIcon aria-hidden /> Remove from crew
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function RoleBadge({ role, className }: { role: CrewRole; className?: string }) {
  if (role === "member") return null
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        role === "owner" ? "bg-gold/10 text-gold" : "bg-ion/10 text-ion",
        className
      )}
    >
      {role === "owner" ? <CrownIcon aria-hidden className="size-3" /> : <ShieldIcon aria-hidden className="size-3" />}
      {ROLE_LABEL[role]}
    </span>
  )
}
