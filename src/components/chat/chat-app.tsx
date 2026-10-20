"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { ArchiveIcon, BellOffIcon, ChevronRightIcon, LockIcon, MenuIcon, PlusIcon, ShieldIcon, StarIcon, TimerIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ACCENT_VALUE } from "@/lib/chat"
import { ChatSkeleton } from "@/components/chat/chat-skeleton"
import { CreateRoomDialog } from "@/components/chat/create-room"
import { roomHref, signInHref } from "@/components/chat/format"
import { ChatAvatar, RoomGlyph } from "@/components/chat/glyphs"
import { people } from "@/components/chat/people"
import { RoomView } from "@/components/chat/room-view"
import { Copy } from "@/components/content/copy"
import { MemberWall } from "@/components/moderation/site-guard"
import { useRole } from "@/lib/roles"
import { cachedRooms, listRooms, live, loadReadMarks, localMember, subscribeLobby, unreadCounts, type Presence, type Room } from "@/lib/chat"
import { useSocialPrefs } from "@/lib/chat-features"
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
  // Messages, reactions and who is here are for members: the database refuses them to guests, so guests get
  // the room list and a way in, and nothing is fetched or subscribed for them.
  const guest = live && session.ready && !session.user
  // Public rooms are opened by the team (the database allows it to staff only); without a database anyone can.
  const role = useRole()
  const canOpenRooms = !live || (canWrite && role.isStaff)

  const [rooms, setRooms] = useState<Room[]>(cachedRooms)
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [lobby, setLobby] = useState<Presence[]>([])
  const [here, setHere] = useState<{ room: string; list: Presence[] }>({ room: slug, list: [] })
  const [roomsOpen, setRoomsOpen] = useState(false)
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
    if (!ready || !roomsLoaded || guest) return
    let stale = false
    loadReadMarks()
      .catch(() => {})
      .then(() => unreadCounts(rooms.map((r) => r.slug), me?.id ?? null))
      .then((c) => !stale && setUnread({ ...c, [slug]: 0 }))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [ready, roomsLoaded, me?.id, slug, guest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || guest) return
    return subscribeLobby(slug, me, {
      onRoom: () => setRooms(cachedRooms()),
      onMessage: (m) => {
        if (m.room === slug || (me && m.authorId === me.id)) return
        setUnread((u) => ({ ...u, [m.room]: (u[m.room] ?? 0) + 1 }))
      },
      onPresence: setLobby,
    })
  }, [slug, me, ready, guest])

  const online = useMemo(() => {
    const byRoom: Record<string, Presence[]> = {}
    for (const p of lobby) (byRoom[p.room] ??= []).push(p)
    return Object.fromEntries(Object.entries(byRoom).map(([room, list]) => [room, people(list).total]))
  }, [lobby])

  const room = rooms.find((r) => r.slug === slug)
  const prefs = useSocialPrefs()
  const router = useRouter()

  // Alt+↑ / Alt+↓ move between rooms; with Shift, to the next room with unread messages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
      const list = orderRooms(rooms.filter((r) => !r.archived), prefs.chat.starred)
      const i = list.findIndex((r) => r.slug === slug)
      if (!list.length) return
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      for (let n = 1; n <= list.length; n++) {
        const next = list[(i + step * n + list.length * n) % list.length]
        if (!e.shiftKey || (unread[next.slug] ?? 0) > 0) {
          if (next.slug !== slug) router.push(roomHref(next.slug) as Route)
          return
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rooms, slug, unread, prefs.chat.starred, router])
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
      starred={prefs.chat.starred}
      muted={prefs.chat.muted}
      onStar={(r, on) => prefs.setChat({ starred: on ? [...prefs.chat.starred.filter((x) => x !== r), r] : prefs.chat.starred.filter((x) => x !== r) })}
      onMute={(r, on) => prefs.setChat({ muted: on ? [...prefs.chat.muted.filter((x) => x !== r), r] : prefs.chat.muted.filter((x) => x !== r) })}
    />
  )

  // Nothing of a room shows until we know who is reading.
  if (live && !session.ready) return <ChatSkeleton />

  const roomsSheet = (
    <Sheet open={roomsOpen} onOpenChange={setRoomsOpen}>
      <SheetContent side="left" className="w-[85%] max-w-xs gap-0 p-0">
        <SheetTitle className="sr-only">Rooms</SheetTitle>
        {rail}
      </SheetContent>
    </Sheet>
  )

  if (guest) {
    return (
      <div className="relative flex h-[calc(100dvh-4rem)] min-h-[24rem] w-full overflow-hidden border-t border-border">
        <aside aria-label="Rooms" className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
          {rail}
        </aside>
        <section aria-labelledby="chat-room-title" className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
            <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Show rooms" onClick={() => setRoomsOpen(true)}>
              <MenuIcon aria-hidden />
            </Button>
            <RoomGlyph slug={slug} active size={26} />
            <div className="min-w-0 flex-1">
              <h1 id="chat-room-title" className="truncate text-sm leading-tight font-semibold">
                {room?.name ?? slug}
              </h1>
              {room?.topic && <p className="truncate text-xs text-muted-foreground">{room.topic}</p>}
            </div>
          </header>
          <MemberWall path={roomHref(slug)} compact />
        </section>
        {roomsSheet}
      </div>
    )
  }

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
        onRoomChange={(r) => setRooms((list) => list.map((x) => (x.slug === r.slug ? r : x)))}
        unreadElsewhere={Object.entries(unread).some(([r, n]) => r !== slug && n > 0 && !prefs.chat.muted.includes(r))}
      />

      {roomsSheet}
      <CreateRoomDialog open={creating && canOpenRooms} onOpenChange={setCreating} onCreated={() => setRooms(cachedRooms())} />
    </div>
  )
}

/** Starred rooms first (in the order you starred them), then the rest in the team's order. */
function orderRooms(rooms: Room[], starred: string[]) {
  const top = starred.map((s) => rooms.find((r) => r.slug === s)).filter((r): r is Room => Boolean(r))
  return [...top, ...rooms.filter((r) => !starred.includes(r.slug))]
}

type RailProps = {
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
  starred: string[]
  muted: string[]
  onStar: (room: string, on: boolean) => void
  onMute: (room: string, on: boolean) => void
}

function RoomRail({ rooms, active, unread, online, me, canWrite, canOpenRooms, ready, onCreate, onNavigate, starred, muted, onStar, onMute }: RailProps) {
  const open = rooms.filter((r) => !r.archived)
  const stars = open.filter((r) => starred.includes(r.slug))
  const rest = open.filter((r) => !starred.includes(r.slug))
  const list = { active, unread, online, onNavigate, starred, muted, onStar, onMute, canStar: canWrite }
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
        {stars.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <StarIcon aria-hidden className="size-3 text-gold" /> Starred
            </p>
            <RoomList rooms={orderRooms(stars, starred)} {...list} />
            <p className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">All rooms</p>
          </>
        )}
        <RoomList rooms={rest} {...list} />
        {rooms.some((r) => r.archived) && (
          <details className="group mt-3" open={rooms.some((r) => r.archived && r.slug === active) || undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
              <ArchiveIcon aria-hidden className="size-3.5" /> Archived rooms
            </summary>
            <RoomList rooms={rooms.filter((r) => r.archived)} {...list} />
          </details>
        )}
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
            <Copy k="chat.rail.guest">Rooms open once you are signed in.</Copy>{" "}
            <Link href={signInHref(active)} className="text-ion hover:underline">
              <Copy k="chat.rail.guestSignIn">Sign in or join</Copy>
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

/** One list of rooms in the rail, each with its unread count, who is online and its rules at a glance. */
function RoomList({
  rooms,
  active,
  unread,
  online,
  onNavigate,
  starred,
  muted,
  onStar,
  onMute,
  canStar,
}: Pick<RailProps, "rooms" | "active" | "unread" | "online" | "onNavigate" | "starred" | "muted" | "onStar" | "onMute"> & { canStar: boolean }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {rooms.map((r) => {
        const isActive = r.slug === active
        const quiet = muted.includes(r.slug)
        const star = starred.includes(r.slug)
        const count = isActive ? 0 : (unread[r.slug] ?? 0)
        const here = online[r.slug] ?? 0
        const accent = r.accent ? ACCENT_VALUE[r.accent] : null
        return (
          <li key={r.slug} className="group/room relative">
            <Link
              href={roomHref(r.slug)}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              aria-label={`${r.name}${r.staffOnly ? ", team only" : ""}${r.locked && !r.archived ? ", locked" : ""}${r.slowMode ? ", slow mode" : ""}${quiet ? ", muted" : ""}${count ? `, ${count} unread` : ""}${here ? `, ${here} online` : ""}`}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                isActive ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                count > 0 && !quiet && "font-medium text-foreground",
                quiet && "opacity-70"
              )}
            >
              {isActive && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full" style={{ background: accent ?? "var(--ion)" }} />}
              {r.emoji ? (
                <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-full text-sm" style={{ background: accent ? `color-mix(in oklab, ${accent} 20%, transparent)` : "rgb(255 255 255 / 0.05)" }}>
                  {r.emoji}
                </span>
              ) : (
                <RoomGlyph slug={r.slug} active={isActive} size={26} />
              )}
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              {r.staffOnly && <ShieldIcon aria-hidden className="size-3 shrink-0 text-gold" />}
              {r.locked && !r.archived && <LockIcon aria-hidden className="size-3 shrink-0 text-gold" />}
              {r.slowMode ? <TimerIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" /> : null}
              {quiet && <BellOffIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
              {here > 0 && (
                <span aria-hidden className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular group-hover/room:opacity-0">
                  <span className="size-1.5 rounded-full bg-ok" />
                  {here}
                </span>
              )}
              {count > 0 && (
                <span
                  aria-hidden
                  className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular group-hover/room:opacity-0", quiet ? "bg-white/10 text-muted-foreground" : "bg-ion text-ion-foreground")}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
            {canStar && (
              <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/room:opacity-100 group-hover/room:opacity-100 pointer-coarse:hidden">
                <button
                  type="button"
                  onClick={() => onStar(r.slug, !star)}
                  aria-label={star ? `Unstar ${r.name}` : `Star ${r.name}`}
                  title={star ? "Unstar" : "Star: keep it on top"}
                  className="grid size-6 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-gold"
                >
                  <StarIcon aria-hidden className={cn("size-3.5", star && "fill-gold text-gold")} />
                </button>
                <button
                  type="button"
                  onClick={() => onMute(r.slug, !quiet)}
                  aria-label={quiet ? `Unmute ${r.name}` : `Mute ${r.name}`}
                  title={quiet ? "Unmute" : "Mute: unread counts stay quiet"}
                  className="grid size-6 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground"
                >
                  <BellOffIcon aria-hidden className={cn("size-3.5", quiet && "text-foreground")} />
                </button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
