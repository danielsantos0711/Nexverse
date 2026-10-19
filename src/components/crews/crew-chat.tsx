"use client"

import { useMemo, useState } from "react"
import { PeoplePanel, people } from "@/components/chat/people"
import { RoomView } from "@/components/chat/room-view"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { Presence } from "@/lib/chat"
import { crewRoom, type Crew } from "@/lib/crews"
import type { Member } from "@/lib/store"

/**
 * The crew's own chat room. It is the ordinary chat (same messages, reactions, replies, typing and presence),
 * pointed at the room "crew-<slug>" that the database opens for every crew and keeps to its members.
 */
export function CrewChat({ crew, me, canWrite, ready }: { crew: Crew; me: Member | null; canWrite: boolean; ready: boolean }) {
  const room = useMemo(() => crewRoom(crew), [crew])
  const [here, setHere] = useState<Presence[]>([])
  const [peopleOpen, setPeopleOpen] = useState(false)
  const crowd = people(here)

  return (
    // The chat's "show rooms" button belongs to the full chat page, so it is hidden here.
    <div className="flex h-[min(72dvh,42rem)] min-h-[26rem] overflow-hidden rounded-xl border border-border bg-card/30 [&_button[aria-label='Show_rooms']]:hidden">
      <RoomView
        key={room.slug}
        slug={room.slug}
        room={room}
        missing={false}
        me={me}
        canWrite={canWrite}
        ready={ready}
        crowd={crowd}
        unreadElsewhere={false}
        onPresence={setHere}
        onRead={() => {}}
        onOpenRooms={() => {}}
        onOpenPeople={() => setPeopleOpen(true)}
      />
      <aside aria-label="Who's in the crew chat" className="hidden w-64 shrink-0 flex-col border-l border-border bg-card/40 xl:flex">
        <PeoplePanel room={room} crowd={crowd} me={me} />
      </aside>
      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <SheetContent side="right" className="w-[85%] max-w-xs gap-0 p-0">
          <SheetTitle className="sr-only">Who&apos;s in the crew chat</SheetTitle>
          <PeoplePanel room={room} crowd={crowd} me={me} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
