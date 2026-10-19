"use client"

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { ChatAvatar, RoomGlyph } from "@/components/chat/glyphs"
import { live, type Presence, type Room } from "@/lib/chat"
import type { Member } from "@/lib/store"
import { cn } from "@/lib/utils"

export type Crowd = { members: Member[]; guests: number; total: number }

/** Everyone with a room open: members once each however many tabs they have, guests counted by tab. */
export function people(list: Presence[]): Crowd {
  const members = new Map<string, Member>()
  let guests = 0
  for (const p of list) {
    if (p.member?.id) members.set(p.member.id, p.member)
    else guests++
  }
  const sorted = [...members.values()].sort((a, b) => a.name.localeCompare(b.name))
  return { members: sorted, guests, total: sorted.length + guests }
}

const created = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" })

/** Up to four faces of who's here, overlapping, sliding aside as people come and go. */
export function PresenceStack({ crowd, max = 4 }: { crowd: Crowd; max?: number }) {
  const reduce = useReducedMotion()
  const shown = crowd.members.slice(0, max)
  const rest = crowd.total - shown.length
  return (
    <LayoutGroup>
      <span className="flex items-center -space-x-2">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((m) => (
            <motion.span
              key={m.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
              className="rounded-full ring-2 ring-background"
            >
              <ChatAvatar id={m.id} name={m.name} size={24} />
            </motion.span>
          ))}
        </AnimatePresence>
        {rest > 0 && (
          <motion.span
            layout={!reduce}
            className="relative inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground ring-2 ring-background tabular"
          >
            +{rest}
          </motion.span>
        )}
      </span>
    </LayoutGroup>
  )
}

export function PeoplePanel({ room, crowd, me }: { room: Room | undefined; crowd: Crowd; me: Member | null }) {
  const reduce = useReducedMotion()
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <section className="relative isolate overflow-hidden border-b border-border p-4">
        <div aria-hidden className="starfield -z-10 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]">
          <i />
          <i />
        </div>
        {room ? (
          <>
            <div className="flex items-center gap-3">
              <RoomGlyph slug={room.slug} active size={40} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{room.name}</h2>
                <p className="font-mono text-[11px] text-muted-foreground">/chat/{room.slug}</p>
              </div>
            </div>
            {room.topic && <p className="mt-3 text-sm text-muted-foreground">{room.topic}</p>}
            <p className="mt-3 text-xs text-muted-foreground">
              {room.createdBy ? `Opened on ${created.format(new Date(room.createdAt))}` : "One of the rooms Nexverse started with"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Room details</p>
        )}
      </section>

      <section aria-labelledby="chat-here" className="border-b border-border p-4">
        <h2 id="chat-here" className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className="pulse-dot" aria-hidden />
          Here now · <span className="tabular">{crowd.total}</span>
        </h2>
        {crowd.total === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody else is here right now.</p>
        ) : (
          <LayoutGroup>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {crowd.members.map((m) => (
                  <motion.li
                    key={m.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, transform: "translateX(-6px)" }}
                    animate={{ opacity: 1, transform: "translateX(0px)" }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm"
                  >
                    <span className="relative">
                      <ChatAvatar id={m.id} name={m.name} size={28} />
                      <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ok ring-2 ring-card" />
                    </span>
                    <span className="min-w-0 truncate">{m.name}</span>
                    {me?.id === m.id && <span className="text-xs text-muted-foreground">you</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {crowd.guests > 0 && (
              <p className={cn("text-xs text-muted-foreground", crowd.members.length > 0 && "mt-2")}>
                {crowd.guests === 1 ? "1 guest reading" : `${crowd.guests} guests reading`}
              </p>
            )}
          </LayoutGroup>
        )}
      </section>

      <section aria-labelledby="chat-notes" className="p-4">
        <h2 id="chat-notes" className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Good to know
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground marker:text-white/20">
          <li>{live ? "Rooms are public. Anyone can read them, so leave out secrets and keys." : "This copy has no database: messages stay in this browser."}</li>
          <li>Write in whichever language you think in.</li>
          <li>
            Wrap code in <code className="font-mono text-foreground">```</code> and mention people with{" "}
            <code className="font-mono text-foreground">@name</code>.
          </li>
          <li>Ten messages in ten seconds is the limit. Longer questions fit better in the forum.</li>
        </ul>
      </section>
    </div>
  )
}
