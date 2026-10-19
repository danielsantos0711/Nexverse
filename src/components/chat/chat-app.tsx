"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { CreateRoomDialog } from "@/components/chat/create-room"
import { roomHref, signInHref } from "@/components/chat/format"
import { ChatAvatar, RoomGlyph } from "@/components/chat/glyphs"
import { PeoplePanel, people } from "@/components/chat/people"
import { RoomView } from "@/components/chat/room-view"
import { useRole } from "@/lib/roles"
import { cachedRooms, listRooms, live, localMember, subscribeLobby, unreadCounts, type Presence, type Room } from "@/lib/chat"
import { useSession, type Member } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * The chat: rooms on the left, the conversation in the middle, who's here on the right. On phones the
 * rooms and the people each slide in as a sheet, and the message box stays at the bottom of the screen.
 */
const noop = () => () => {}

export function ChatApp({ slug }: { slug: string }) {
  const session = useSession()
  const localMe = useSyncExternalStore(
    noop,
    () => (live ? null : localMember()),
    () => null
  )
  const memberId = live ? session.member?.id : localMe?.id
  const memberName = live ? session.member?.name : localMe?.name
  const me = useMemo<Member | null>(() => (memberId ? { id: memberId, name: memberName ?? "Member" } : null), [memberId, memberName])
  const ready = live ? session.ready : localMe !== null
  const canWrite = Boolean(me && (!live || session.user))
  // Public rooms are opened by the team (the database allows it to staff only); without a database anyone can.
  const role = useRole()
  const canOpenRooms = !live || (canWrite && role.isStaff)

  const [rooms, setRooms] = useState<Room[]>(cachedRooms)
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [lobby, setLobby] = useState<Presence[]>([])
  const [here, setHere] = useState<{ room: string; list: Presence[] }>({ room: slug, list: [] })
  const [roomsOpen, setRoomsOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let stale = false
    listRooms()
      .then((r) => {
        if (stale) return
        setRooms(r)
        setRoomsLoaded(true)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    if (!ready || !roomsLoaded) return
    let stale = false
    unreadCounts(
      rooms.map((r) => r.slug),
      me?.id ?? null
    )
      .then((c) => !stale && setUnread({ ...c, [slug]: 0 }))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [ready, roomsLoaded, me?.id, slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return
    return subscribeLobby(slug, me, {
      onRoom: () => setRooms(cachedRooms()),
      onMessage: (m) => {
        if (m.room === slug || (me && m.authorId === me.id)) return
        setUnread((u) => ({ ...u, [m.room]: (u[m.room] ?? 0) + 1 }))
      },
      onPresence: setLobby,
    })
  }, [slug, me, ready])

  const online = useMemo(() => {
    const byRoom: Record<string, Presence[]> = {}
    for (const p of lobby) (byRoom[p.room] ??= []).push(p)
    return Object.fromEntries(Object.entries(byRoom).map(([room, list]) => [room, people(list).total]))
  }, [lobby])

  const room = rooms.find((r) => r.slug === slug)
  const presence = here.room === slug ? here.list : []
  const crowd = people(presence)

  const rail = (
    <RoomRail
      rooms={rooms}
      active={slug}
      unread={unread}
      online={online}
      me={me}
      canWrite={canWrite}
      canOpenRooms={canOpenRooms}
      ready={ready}
      onCreate={() => setCreating(true)}
      onNavigate={() => setRoomsOpen(false)}
    />
  )

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] min-h-[24rem] w-full overflow-hidden border-t border-border">
      <aside aria-label="Rooms" className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
        {rail}
      </aside>

      <RoomView
        key={slug}
        slug={slug}
        room={room}
        missing={roomsLoaded && !room}
        me={me}
        canWrite={canWrite}
        ready={ready}
        crowd={crowd}
        onPresence={(list) => setHere({ room: slug, list })}
        onRead={() => setUnread((u) => (u[slug] ? { ...u, [slug]: 0 } : u))}
        onOpenRooms={() => setRoomsOpen(true)}
        onOpenPeople={() => setPeopleOpen(true)}
        unreadElsewhere={Object.entries(unread).some(([r, n]) => r !== slug && n > 0)}
      />

      <aside aria-label="Room details" className="hidden w-72 shrink-0 flex-col border-l border-border bg-card/40 xl:flex">
        <PeoplePanel room={room} crowd={crowd} me={me} />
      </aside>

      <Sheet open={roomsOpen} onOpenChange={setRoomsOpen}>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0 p-0">
          <SheetTitle className="sr-only">Rooms</SheetTitle>
          {rail}
        </SheetContent>
      </Sheet>
      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <SheetContent side="right" className="w-[85%] max-w-xs gap-0 p-0">
          <SheetTitle className="sr-only">Room details</SheetTitle>
          <PeoplePanel room={room} crowd={crowd} me={me} />
        </SheetContent>
      </Sheet>
      <CreateRoomDialog open={creating && canOpenRooms} onOpenChange={setCreating} onCreated={() => setRooms(cachedRooms())} />
    </div>
  )
}

function RoomRail({
  rooms,
  active,
  unread,
  online,
  me,
  canWrite,
  canOpenRooms,
  ready,
  onCreate,
  onNavigate,
}: {
  rooms: Room[]
  active: string
  unread: Record<string, number>
  online: Record<string, number>
  me: Member | null
  canWrite: boolean
  canOpenRooms: boolean
  ready: boolean
  onCreate: () => void
  onNavigate: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 py-3 pr-12 pl-4 md:pr-3">
        <h2 className="text-sm font-semibold">Rooms</h2>
        {canOpenRooms && (
          <Button variant="ghost" size="icon-sm" aria-label="Open a new room" title="Open a new room" onClick={onCreate}>
            <PlusIcon aria-hidden />
          </Button>
        )}
      </div>
      <nav aria-label="Chat rooms" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-0.5">
          {rooms.map((r) => {
            const isActive = r.slug === active
            const count = isActive ? 0 : (unread[r.slug] ?? 0)
            const here = online[r.slug] ?? 0
            return (
              <li key={r.slug}>
                <Link
                  href={roomHref(r.slug)}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`${r.name}${count ? `, ${count} unread` : ""}${here ? `, ${here} online` : ""}`}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    isActive ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    count > 0 && "font-medium text-foreground"
                  )}
                >
                  {isActive && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-ion" />}
                  <RoomGlyph slug={r.slug} active={isActive} size={26} />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {here > 0 && (
                    <span aria-hidden className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular">
                      <span className="size-1.5 rounded-full bg-ok" />
                      {here}
                    </span>
                  )}
                  {count > 0 && (
                    <span aria-hidden className="min-w-5 rounded-full bg-ion px-1.5 text-center text-[11px] leading-5 font-semibold text-ion-foreground tabular">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        {!live ? (
          <p>Local preview: messages stay in this browser and sync between its open tabs.</p>
        ) : !ready ? (
          <p>Connecting…</p>
        ) : me && canWrite ? (
          <div className="flex items-center gap-2">
            <ChatAvatar id={me.id} name={me.name} size={24} />
            <span className="min-w-0 truncate">
              Signed in as <span className="text-foreground">{me.name}</span>
            </span>
          </div>
        ) : (
          <p>
            You’re reading as a guest.{" "}
            <Link href={signInHref(active)} className="text-ion hover:underline">
              Sign in
            </Link>{" "}
            to write.
          </p>
        )}
      </div>
    </div>
  )
}
