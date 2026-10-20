"use client"

import Link from "next/link"
import { PreviewCard } from "@base-ui/react/preview-card"
import { useState } from "react"
import { MapPinIcon } from "lucide-react"
import { PersonAvatar } from "@/components/hub/bits"
import { FollowButton } from "@/components/social/follow-button"
import { getMember, memberHref, type PublicMember } from "@/lib/people"
import { cn } from "@/lib/utils"

/*
 * A member's card on hover or keyboard focus: avatar, name, handle, the first line of their bio, where they are,
 * and Follow, without leaving the page. Loaded the first time it opens and kept for the visit. On touch screens a
 * tap follows the link as usual (the card is a desktop shortcut, the profile page is the full view on both).
 */

const cache = new Map<string, Promise<PublicMember | null>>()
const load = (ref: string) => {
  if (!cache.has(ref)) cache.set(ref, getMember(ref).catch(() => null))
  return cache.get(ref)!
}

export function MemberHoverCard({ handle, name, children, className }: { handle?: string | null; name: string; children: React.ReactNode; className?: string }) {
  const [member, setMember] = useState<PublicMember | null | undefined>(undefined)
  if (!handle) return <span className={className}>{children}</span>
  return (
    <PreviewCard.Root
      onOpenChange={(open) => {
        if (open && member === undefined) void load(handle).then(setMember)
      }}
    >
      <PreviewCard.Trigger
        href={`/people/${handle}`}
        render={<Link href={`/people/${handle}`} />}
        className={cn("rounded-sm transition-colors hover:text-ion focus-visible:outline-2 focus-visible:outline-ring", className)}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} className="z-50">
          <PreviewCard.Popup className="liquid-glass-strong w-72 origin-[var(--transform-origin)] rounded-2xl p-4 text-sm transition-[opacity,transform] duration-(--dur-base) ease-(--ease-out) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="flex items-start gap-3">
              <PersonAvatar handle={handle} name={name} src={member?.avatarUrl} size={44} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={member ? memberHref(member) : `/people/${handle}`} className="truncate font-medium hover:underline">
                  {member?.name ?? name}
                </Link>
                <span className="truncate text-xs text-muted-foreground">@{handle}</span>
              </div>
            </div>
            {member === undefined ? (
              <div className="mt-3 flex flex-col gap-1.5" aria-hidden>
                <span className="nx-skeleton h-3 w-11/12" />
                <span className="nx-skeleton h-3 w-2/3" />
              </div>
            ) : member ? (
              <div className="nx-fade mt-3 flex flex-col gap-2">
                {member.bio && <p className="line-clamp-3 text-muted-foreground">{member.bio}</p>}
                {member.location && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPinIcon aria-hidden className="size-3.5" /> {member.location}
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <FollowButton followee={`member:${member.id}`} name={member.name} />
                  <Link href={memberHref(member)} className="text-xs text-ion hover:underline">
                    Profile
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">This member&apos;s profile could not be loaded.</p>
            )}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
