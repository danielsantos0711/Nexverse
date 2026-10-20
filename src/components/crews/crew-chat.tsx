"use client"

import { useMemo, useState } from "react"
import { people } from "@/components/chat/people"
import { RoomView } from "@/components/chat/room-view"
import type { Presence, Room } from "@/lib/chat"
import { crewRoom, type Crew } from "@/lib/crews"
import type { Member } from "@/lib/store"

/**
 * The crew's own chat room. It is the ordinary chat (threads, polls, stickers, pins, reactions, typing and
 * presence), pointed at the room "crew-<slug>" that the database opens for every crew and keeps to its members.
 * The captain and officers set its look and pin messages.
 */
export function CrewChat({ crew, me, canWrite, ready, officer }: { crew: Crew; me: Member | null; canWrite: boolean; ready: boolean; officer?: boolean }) {
  const base = useMemo(() => crewRoom(crew), [crew])
  const [look, setLook] = useState<Room | null>(null)
  const room = look ?? base
  const [here, setHere] = useState<Presence[]>([])
  const crowd = people(here)

  return (
    // The chat's "show rooms" button belongs to the full chat page, so it is hidden here.
    <div className="flex h-[min(76dvh,46rem)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-card [&_button[aria-label='Show_rooms']]:hidden">
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
        onRoomChange={setLook}
        canStyle={officer}
      />
    </div>
  )
}
