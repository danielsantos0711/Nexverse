"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArchiveIcon, ArrowDownIcon, LockIcon, MenuIcon, ShieldIcon, TimerIcon, UsersIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Composer, type ComposerHandle } from "@/components/chat/composer"
import { continues, dayKey, dayLabel, roomHref, signInHref, typingLine } from "@/components/chat/format"
import { RoomGlyph } from "@/components/chat/glyphs"
import { MessageItem, type MessageActions } from "@/components/chat/message-item"
import { PresenceStack, type Crowd } from "@/components/chat/people"
import {
  applyReaction,
  cachedMessages,
  cacheMessages,
  deleteMessage,
  editMessage,
  lastRead,
  listMessages,
  live,
  markRead,
  roomRuleText,
  sendMessage,
  subscribeRoom,
  toggleReaction,
  type ChatMessage,
  type Emoji,
  type Presence,
  type Room,
} from "@/lib/chat"
import { useRole } from "@/lib/roles"
import type { Member } from "@/lib/store"

type Props = {
  slug: string
  room: Room | undefined
  missing: boolean
  me: Member | null
  canWrite: boolean
  ready: boolean
  crowd: Crowd
  unreadElsewhere: boolean
  onPresence: (list: Presence[]) => void
  onRead: () => void
  onOpenRooms: () => void
  onOpenPeople: () => void
}

/** Confirmed messages in time order, then the ones still sending, in the order they were written. */
function place(list: ChatMessage[], m: ChatMessage) {
  const i = list.findIndex((x) => x.id === m.id)
  const next = i >= 0 ? list.map((x, j) => (j === i ? { ...m, reactions: m.reactions.length ? m.reactions : x.reactions } : x)) : [...list, m]
  return next.sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || (a.status ? 0 : a.createdAt.localeCompare(b.createdAt)))
}

const NEAR_BOTTOM = 80

export function RoomView({ slug, room, missing, me, canWrite, ready, crowd, unreadElsewhere, onPresence, onRead, onOpenRooms, onOpenPeople }: Props) {
  // Posting is for members whose account is not paused; the database refuses the rest anyway.
  const role = useRole()
  const reduce = useReducedMotion()
  const name = room?.name ?? slug
  const [messages, setMessages] = useState<ChatMessage[]>(() => cachedMessages(slug) ?? [])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => (cachedMessages(slug) ? "ready" : "loading"))
  const [more, setMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({})
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChatMessage | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [highlight, setHighlight] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  // Read the clock only in the browser (in the effect below), so the page can be prerendered.
  const [now, setNow] = useState(0)
  const [readMark, setReadMark] = useState<string | null>(null)
  // Slow mode: when you may write again, and a clock that ticks only while you wait.
  const [slowUntil, setSlowUntil] = useState(0)
  const [tick, setTick] = useState(0)
  const waiting = slowUntil > tick ? Math.ceil((slowUntil - tick) / 1000) : 0
  useEffect(() => {
    if (!slowUntil) return
    const t = setInterval(() => {
      const n = Date.now()
      setTick(n)
      if (n >= slowUntil) {
        setSlowUntil(0)
        clearInterval(t)
      }
    }, 500)
    return () => clearInterval(t)
  }, [slowUntil])
  // Staff write everywhere; everyone else follows the room's rules (the database checks them too).
  const exempt = role.isStaff || !live
  const closed = room && !exempt ? (room.archived ? "archived" : room.locked ? "locked" : null) : null

  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<ComposerHandle>(null)
  const sub = useRef<ReturnType<typeof subscribeRoom> | null>(null)
  const liveIds = useRef(new Set<string>())
  const atBottomRef = useRef(true)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const messagesRef = useRef(messages)
  const meRef = useRef(me)
  const moreRef = useRef(more)
  const loadingOlderRef = useRef(false)
  const jumpedToHash = useRef(false)

  useEffect(() => {
    messagesRef.current = messages
    meRef.current = me
    moreRef.current = more
  })

  // Where this reader left off, for the "New" line. Read once per visit to the room.
  useEffect(() => {
    setReadMark(lastRead(slug))
  }, [slug])

  // First page, then every change as it happens.
  useEffect(() => {
    let stale = false
    listMessages(slug)
      .then(({ messages: page, more: hasMore }) => {
        if (stale) return
        setMessages((current) => {
          const pending = current.filter((m) => m.status)
          const fresh = current.filter((m) => !m.status && !page.some((p) => p.id === m.id) && m.createdAt > (page.at(-1)?.createdAt ?? ""))
          return [...page, ...fresh, ...pending]
        })
        setMore(hasMore)
        setStatus("ready")
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setStatus((s) => (s === "ready" ? s : "error"))
      })
    return () => {
      stale = true
    }
  }, [slug])

  useEffect(() => {
    if (!ready) return
    const handle = subscribeRoom(slug, me, {
      onInsert: (m) => {
        const isNew = !messagesRef.current.some((x) => x.id === m.id)
        if (isNew) liveIds.current.add(m.id)
        setMessages((list) => place(list, m))
        if (m.author) {
          const id = m.author.id
          setTyping((t) => {
            if (!t[id]) return t
            const next = { ...t }
            delete next[id]
            return next
          })
        }
        if (isNew && !atBottomRef.current && m.author?.id !== meRef.current?.id) setNewCount((n) => n + 1)
      },
      onUpdate: (u) => setMessages((list) => list.map((m) => (m.id === u.id ? { ...m, body: u.body, editedAt: u.editedAt } : m))),
      onDelete: (id) =>
        setMessages((list) =>
          list.some((m) => m.id === id || m.replyTo === id)
            ? list.filter((m) => m.id !== id).map((m) => (m.replyTo === id ? { ...m, parent: null } : m))
            : list
        ),
      onReaction: (r) =>
        setMessages((list) =>
          list.some((m) => m.id === r.messageId)
            ? list.map((m) => (m.id === r.messageId ? { ...m, reactions: applyReaction(m.reactions, { emoji: r.emoji, userId: r.userId }, r.on) } : m))
            : list
        ),
      onPresence,
      onTyping: (who) => setTyping((t) => ({ ...t, [who.id]: { name: who.name, until: Date.now() + 4000 } })),
    })
    sub.current = handle
    return () => {
      handle.unsubscribe()
      sub.current = null
    }
  }, [slug, me, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Typing notices fade four seconds after the last keystroke; times ago refresh every half minute.
  const typingCount = Object.keys(typing).length
  useEffect(() => {
    if (!typingCount) return
    const t = setInterval(() => {
      setTyping((all) => {
        const at = Date.now()
        const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => v.until > at))
        return Object.keys(kept).length === Object.keys(all).length ? all : kept
      })
    }, 1000)
    return () => clearInterval(t)
  }, [typingCount])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 30000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (status === "ready") cacheMessages(slug, messages)
  }, [slug, messages, status])

  // Scrolling: keep to the bottom while the reader is there, hold still while older messages load above.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (anchor.current) {
      el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height)
      anchor.current = null
      return
    }
    if (status === "ready" && !jumpedToHash.current) {
      jumpedToHash.current = true
      const target = typeof location !== "undefined" && location.hash.startsWith("#m-") ? document.getElementById(location.hash.slice(1)) : null
      if (target) {
        target.scrollIntoView({ block: "center" })
        setHighlight(location.hash.slice(3))
        return
      }
    }
    if (atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, status, typingCount])

  // When the box grows, the keyboard opens or the window resizes, stay pinned to the latest message.
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), 2000)
    return () => clearTimeout(t)
  }, [highlight])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(""), 2500)
    return () => clearTimeout(t)
  }, [notice])

  // Reading: a room is read up to its latest message while you're at the bottom with the tab in view.
  const latest = messages.findLast((m) => !m.status)?.createdAt
  useEffect(() => {
    function read() {
      if (document.visibilityState !== "visible" || !atBottomRef.current) return
      markRead(slug, latest ?? new Date().toISOString())
      onRead()
    }
    read()
    document.addEventListener("visibilitychange", read)
    return () => document.removeEventListener("visibilitychange", read)
  }, [slug, latest, atBottom]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    const el = scroller.current
    const oldest = messagesRef.current.find((m) => !m.status)
    if (!el || !oldest || !moreRef.current || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const { messages: older, more: hasMore } = await listMessages(slug, { before: oldest.createdAt })
      anchor.current = { height: el.scrollHeight, top: el.scrollTop }
      setMessages((list) => [...older.filter((o) => !list.some((m) => m.id === o.id)), ...list])
      setMore(hasMore)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [slug])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom
      setAtBottom(bottom)
    }
    if (bottom) setNewCount(0)
    if (el.scrollTop < 240) loadOlder()
  }

  function toLatest() {
    const el = scroller.current
    if (!el) return
    atBottomRef.current = true
    setAtBottom(true)
    setNewCount(0)
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }

  // ---- Writing -------------------------------------------------------------------------------------------

  async function deliver(draft: ChatMessage) {
    try {
      const sent = await sendMessage(slug, draft.body, { id: draft.id, replyTo: draft.replyTo, parent: draft.parent })
      setMessages((list) => place(list, sent))
    } catch (e) {
      setMessages((list) => place(list, { ...draft, status: "failed", error: (e as Error).message }))
    }
  }

  function send(body: string) {
    if (!me || waiting) return
    if (room?.slowMode && !exempt) {
      const n = Date.now()
      setTick(n)
      setSlowUntil(n + room.slowMode * 1000)
    }
    const draft: ChatMessage = {
      id: crypto.randomUUID(),
      room: slug,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: me,
      replyTo: replyTo?.id ?? null,
      parent: replyTo ? { id: replyTo.id, body: replyTo.body, author: replyTo.author } : null,
      reactions: [],
      status: "sending",
    }
    liveIds.current.add(draft.id)
    atBottomRef.current = true
    setAtBottom(true)
    setReplyTo(null)
    setReadMark(null)
    setError("")
    setMessages((list) => place(list, draft))
    deliver(draft)
  }

  // Message actions go through a ref so the memoised rows don't redraw when this component does.
  const impl = {
    onReply: (m: ChatMessage) => {
      setReplyTo(m)
      setEditingId(null)
      composer.current?.focus()
    },
    onReact: (m: ChatMessage, emoji: Emoji) => {
      const who = meRef.current
      if (!who || !canWrite) return
      const on = !m.reactions.some((r) => r.emoji === emoji && r.userId === who.id)
      const flip = (state: boolean) =>
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, reactions: applyReaction(x.reactions, { emoji, userId: who.id }, state) } : x)))
      flip(on)
      toggleReaction(m, emoji, who.id, on).catch((e: Error) => {
        flip(!on)
        setError(e.message)
      })
    },
    onCopyLink: (m: ChatMessage) => {
      const url = `${location.origin}${roomHref(slug)}#m-${m.id}`
      navigator.clipboard?.writeText(url).then(
        () => setNotice("Link copied"),
        () => setNotice("Couldn't copy the link")
      )
    },
    onDelete: (m: ChatMessage) => setDeleting(m),
    onStartEdit: (m: ChatMessage) => {
      setEditingId(m.id)
      setReplyTo(null)
    },
    onEdit: async (m: ChatMessage, body: string) => {
      try {
        const saved = await editMessage(m.id, slug, body)
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, ...saved } : x)))
        setEditingId(null)
        composer.current?.focus()
      } catch (e) {
        setError((e as Error).message)
      }
    },
    onEditDone: () => {
      setEditingId(null)
      composer.current?.focus()
    },
    onRetry: (m: ChatMessage) => {
      const draft = { ...m, status: "sending" as const, error: undefined }
      setMessages((list) => place(list, draft))
      deliver(draft)
    },
    onDiscard: (m: ChatMessage) => setMessages((list) => list.filter((x) => x.id !== m.id)),
    onJump: (id: string) => {
      const target = document.getElementById(`m-${id}`)
      if (!target) return setNotice("That message is further back in the room")
      target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
      setHighlight(id)
    },
  }
  const implRef = useRef(impl)
  useEffect(() => {
    implRef.current = impl
  })
  const actions = useMemo<MessageActions>(
    () => ({
      onReply: (m) => implRef.current.onReply(m),
      onReact: (m, e) => implRef.current.onReact(m, e),
      onCopyLink: (m) => implRef.current.onCopyLink(m),
      onDelete: (m) => implRef.current.onDelete(m),
      onStartEdit: (m) => implRef.current.onStartEdit(m),
      onEdit: (m, b) => implRef.current.onEdit(m, b),
      onEditDone: () => implRef.current.onEditDone(),
      onRetry: (m) => implRef.current.onRetry(m),
      onDiscard: (m) => implRef.current.onDiscard(m),
      onJump: (id) => implRef.current.onJump(id),
    }),
    []
  )

  async function confirmDelete() {
    const m = deleting
    if (!m) return
    setDeleting(null)
    const before = messagesRef.current
    setMessages((list) => list.filter((x) => x.id !== m.id).map((x) => (x.replyTo === m.id ? { ...x, parent: null } : x)))
    try {
      await deleteMessage(m.id, slug)
    } catch (e) {
      setMessages(before)
      setError((e as Error).message)
    }
  }

  function editLast() {
    if (!me) return
    const mine = messagesRef.current.findLast((m) => !m.status && m.author?.id === me.id)
    if (mine) setEditingId(mine.id)
  }

  // ---- Drawing -------------------------------------------------------------------------------------------

  const firstNew = useMemo(() => {
    if (!readMark) return null
    return messages.find((m) => !m.status && m.createdAt > readMark && m.author?.id !== me?.id)?.id ?? null
  }, [messages, readMark, me?.id])

  const typingNames = Object.values(typing).map((t) => t.name)

  const rows: React.ReactNode[] = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
    const isFirstNew = m.id === firstNew
    if (newDay) {
      rows.push(
        <li key={`day-${dayKey(m.createdAt)}`} className="sticky top-0 z-10 my-2 flex items-center gap-3 px-4">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {dayLabel(m.createdAt, now)}
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </li>
      )
    }
    if (isFirstNew) {
      rows.push(
        <li key="new-line" className="my-1 flex items-center gap-2 px-4">
          <span aria-hidden className="h-px flex-1 bg-gold/50" />
          <span className="text-[11px] font-semibold tracking-wide text-gold uppercase">New messages</span>
        </li>
      )
    }
    rows.push(
      <MessageItem
        key={m.id}
        message={m}
        grouped={!newDay && !isFirstNew && continues(prev, m)}
        me={me}
        canWrite={canWrite}
        animateIn={liveIds.current.has(m.id)}
        editing={editingId === m.id}
        highlighted={highlight === m.id}
        now={now}
        actions={actions}
      />
    )
  })

  if (missing) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <RoomGlyph slug={slug} size={48} />
        <h1 className="text-lg font-semibold">There’s no room called “{slug}”</h1>
        <p className="max-w-sm text-sm text-muted-foreground">It may have been renamed, or the link has a typo. The lobby is always open.</p>
        <Link href="/chat" className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          Go to the lobby
        </Link>
      </section>
    )
  }

  return (
    <section aria-labelledby="chat-room-title" className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <Button variant="ghost" size="icon-sm" className="relative md:hidden" aria-label="Show rooms" onClick={onOpenRooms}>
          <MenuIcon aria-hidden />
          {unreadElsewhere && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-ion" />}
        </Button>
        <RoomGlyph slug={slug} active size={26} />
        <div className="min-w-0 flex-1">
          <h1 id="chat-room-title" className="truncate text-sm leading-tight font-semibold">
            {name}
          </h1>
          {room?.topic && <p className="truncate text-xs text-muted-foreground">{room.topic}</p>}
        </div>
        <RoomRules room={room} />
        <button
          type="button"
          onClick={() => {
            // On wide screens the people are already in the right-hand column.
            if (!matchMedia("(min-width: 80rem)").matches) onOpenPeople()
          }}
          className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground xl:cursor-default xl:hover:bg-transparent"
          aria-label={`${crowd.total} here now. Show who's here`}
        >
          <PresenceStack crowd={crowd} />
          {crowd.total === 0 ? <UsersIcon aria-hidden className="size-4" /> : <span className="tabular">{crowd.total} here</span>}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="starfield opacity-30 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]">
          <i />
          <i />
          <i />
        </div>
        <div
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={`Messages in ${name}`}
          aria-busy={status === "loading"}
          tabIndex={0}
          className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
        >
          {status === "loading" ? (
            <StreamSkeleton />
          ) : status === "error" && messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>Couldn’t load this room. {error}</p>
              <Button size="sm" variant="secondary" onClick={() => location.reload()}>
                Try again
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <EmptyRoom slug={slug} room={room} canWrite={canWrite} />
          ) : (
            <>
              {more ? (
                <div className="flex justify-center py-3">
                  <Button size="xs" variant="ghost" onClick={loadOlder} disabled={loadingOlder}>
                    {loadingOlder ? "Loading older messages…" : "Load older messages"}
                  </Button>
                </div>
              ) : (
                <RoomStart slug={slug} room={room} />
              )}
              <ol className="flex flex-col pb-2">
                <AnimatePresence initial={false}>{rows}</AnimatePresence>
              </ol>
            </>
          )}
        </div>

        <AnimatePresence>
          {!atBottom && status === "ready" && messages.length > 0 && (
            <motion.div
              initial={reduce ? false : { opacity: 0, transform: "translate(-50%, 8px)" }}
              animate={{ opacity: 1, transform: "translate(-50%, 0px)" }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: "translate(-50%, 8px)" }}
              transition={{ type: "spring", duration: 0.25, bounce: 0 }}
              className="absolute bottom-3 left-1/2 z-20"
            >
              <Button size="sm" onClick={toLatest} className="shadow-lg shadow-black/40">
                <ArrowDownIcon aria-hidden data-icon="inline-start" />
                {newCount > 0 ? `${newCount} new ${newCount === 1 ? "message" : "messages"}` : "Jump to latest"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4 md:pb-3">
        <div className="flex h-6 items-center gap-2 px-1 text-xs text-muted-foreground" aria-hidden={typingNames.length === 0}>
          {typingNames.length > 0 && (
            <>
              <TypingDots />
              <span className="truncate">{typingLine(typingNames)}…</span>
            </>
          )}
          <span role="status" className="ml-auto shrink-0 text-ion">
            {notice}
          </span>
        </div>
        {error && (
          <div role="alert" className="mb-1.5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
            <span className="flex-1">{error}</span>
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setError("")}>
              <XIcon aria-hidden />
            </Button>
          </div>
        )}
        {!ready || (live && canWrite && !role.ready) ? (
          <Skeleton className="h-12 w-full rounded-xl" />
        ) : canWrite && role.suspended ? (
          <div role="status" className="glass flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground">
            <ShieldIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
            <p>
              Your account is paused{role.suspendedUntil ? ` until ${new Date(role.suspendedUntil).toLocaleDateString()}` : ""}. You can still read every room. Check your notifications for the
              reason.
            </p>
          </div>
        ) : canWrite && closed ? (
          <div role="status" className="glass flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground">
            {closed === "archived" ? <ArchiveIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" /> : <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />}
            <p>{roomRuleText(closed, room)}</p>
          </div>
        ) : canWrite ? (
          <>
          {waiting > 0 && (
            <p role="status" className="mb-1.5 flex items-center gap-1.5 px-1 text-xs text-gold">
              <TimerIcon aria-hidden className="size-3.5" /> Slow mode: you can write again in {waiting} s.
            </p>
          )}
          <Composer
            ref={composer}
            room={slug}
            roomName={name}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={send}
            onTyping={() => sub.current?.typing()}
            onEditLast={editLast}
            hold={waiting > 0}
          />
          </>
        ) : (
          <div className="glass flex flex-col items-start gap-2 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Anyone can read. Sign in with your email to join the conversation.</p>
            <Link
              href={signInHref(slug)}
              className="pressable inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Sign in to chat
            </Link>
          </div>
        )}
      </div>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>It disappears for everyone, and replies to it lose their quote. This can’t be undone.</DialogDescription>
          </DialogHeader>
          {deleting && (
            <p className="line-clamp-3 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground">{deleting.body}</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** The room's rules, said honestly next to its name: locked, slow mode, team only, archived. */
function RoomRules({ room }: { room: Room | undefined }) {
  if (!room) return null
  const rules = [
    room.archived && { icon: ArchiveIcon, label: "Archived", hint: "Read only" },
    room.locked && !room.archived && { icon: LockIcon, label: "Locked", hint: "Only the team writes here" },
    room.staffOnly && { icon: ShieldIcon, label: "Team", hint: "Only the team can see this room" },
    room.slowMode ? { icon: TimerIcon, label: `${room.slowMode} s`, hint: `Slow mode: one message every ${room.slowMode} seconds` } : null,
  ].filter((r): r is { icon: typeof LockIcon; label: string; hint: string } => Boolean(r))
  if (!rules.length) return null
  return (
    <ul aria-label="Room rules" className="flex shrink-0 items-center gap-1">
      {rules.map((r) => (
        <li key={r.label} title={r.hint} className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/[0.07] px-2 py-0.5 text-[11px] text-gold">
          <r.icon aria-hidden className="size-3" />
          <span className="hidden sm:inline">{r.label}</span>
          <span className="sr-only">: {r.hint}</span>
        </li>
      ))}
    </ul>
  )
}

function TypingDots() {
  const reduce = useReducedMotion()
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-ion"
          animate={reduce ? { opacity: 0.8 } : { opacity: [0.3, 1, 0.3], transform: ["translateY(0px)", "translateY(-2px)", "translateY(0px)"] }}
          transition={reduce ? undefined : { duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

function RoomStart({ slug, room }: { slug: string; room: Room | undefined }) {
  return (
    <div className="flex items-start gap-3 px-4 pt-4 pb-2 md:px-5">
      <RoomGlyph slug={slug} active size={40} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">This is the start of {room?.name ?? slug}</p>
        {room?.topic && <p className="text-sm text-muted-foreground">{room.topic}</p>}
      </div>
    </div>
  )
}

function EmptyRoom({ slug, room, canWrite }: { slug: string; room: Room | undefined; canWrite: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <RoomGlyph slug={slug} active size={56} />
      <h2 className="text-lg font-semibold">Welcome to {room?.name ?? slug}</h2>
      {room?.topic && <p className="max-w-md text-sm text-muted-foreground">{room.topic}</p>}
      <p className="text-sm text-muted-foreground">
        {canWrite ? "It's quiet here. Say hello and start the conversation." : live ? "It's quiet here. Sign in to start the conversation." : "It's quiet here."}
      </p>
    </div>
  )
}

function StreamSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-4" aria-hidden>
      {[60, 85, 40, 70, 55].map((w, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

