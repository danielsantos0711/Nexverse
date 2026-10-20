"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  ArchiveIcon,
  ArrowDownIcon,
  BellOffIcon,
  BookmarkIcon,
  CalendarIcon,
  KeyboardIcon,
  LockIcon,
  MenuIcon,
  MoreVerticalIcon,
  PaletteIcon,
  PanelRightIcon,
  PinIcon,
  RowsIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  StarsIcon,
  TimerIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAiReady } from "@/components/ai/ai-bits"
import { Composer, type ComposerHandle, type ComposerSend } from "@/components/chat/composer"
import { continues, dayKey, dayLabel, roomHref, signInHref, typingLine } from "@/components/chat/format"
import { RoomGlyph } from "@/components/chat/glyphs"
import { MessageItem, type MessageActions, type MessageFeatures, type Translation } from "@/components/chat/message-item"
import { PresenceStack, type Crowd } from "@/components/chat/people"
import { PollDialog } from "@/components/chat/poll-dialog"
import { RoomPanel, type PanelTab } from "@/components/chat/room-panel"
import { CatchUpDialog, RoomStyleDialog, ShortcutsDialog } from "@/components/chat/room-tools"
import { ai } from "@/lib/ai-client"
import { useCaps } from "@/lib/caps"
import {
  ACCENT_VALUE,
  applyReaction,
  cachedMessages,
  cacheMessages,
  chatExtras,
  deleteMessage,
  editMessage,
  getMessage,
  lastRead,
  listAround,
  listMessages,
  listThread,
  live,
  markRead,
  pinMessage,
  roomRuleText,
  sendMessage,
  subscribeRoom,
  toggleReaction,
  type ChatMessage,
  type Emoji,
  type MessagePatch,
  type Presence,
  type Room,
} from "@/lib/chat"
import type { CommandAction } from "@/lib/chat-commands"
import { parsePollArg } from "@/lib/chat-commands"
import { createPoll, getPolls, setPollClosed, setSaved, useSavedIds, useSocialPrefs, vote, type Poll, type PollInput } from "@/lib/chat-features"
import type { LanguageCode } from "@/lib/data"
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
  onRoomChange?: (r: Room) => void
  /** A crew's captain and officers style their crew's room; the database checks it. */
  canStyle?: boolean
}

/** Confirmed messages in time order, then the ones still sending, in the order they were written. */
function place(list: ChatMessage[], m: ChatMessage) {
  const i = list.findIndex((x) => x.id === m.id)
  const next = i >= 0 ? list.map((x, j) => (j === i ? { ...m, reactions: m.reactions.length ? m.reactions : x.reactions } : x)) : [...list, m]
  return next.sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || (a.status ? 0 : a.createdAt.localeCompare(b.createdAt)))
}

/** Applies a live change: only the fields it carries. */
function patch(m: ChatMessage, u: MessagePatch): ChatMessage {
  const next = { ...m }
  for (const [k, v] of Object.entries(u)) if (v !== undefined) (next as Record<string, unknown>)[k] = v
  return next
}

const NEAR_BOTTOM = 80

export function RoomView({ slug, room: roomProp, missing, me, canWrite, ready, crowd, unreadElsewhere, onPresence, onRead, onOpenRooms, onRoomChange, canStyle }: Props) {
  // Posting is for members whose account is not paused; the database refuses the rest anyway.
  const role = useRole()
  const router = useRouter()
  const caps = useCaps()
  const reduce = useReducedMotion()
  const prefs = useSocialPrefs()
  const savedIds = useSavedIds()
  const summaryAi = useAiReady("summary")
  const translateAi = useAiReady("translate")
  const [look, setLook] = useState<Room | null>(null)
  const room = look && roomProp && look.slug === roomProp.slug ? { ...roomProp, ...look } : roomProp
  const name = room?.name ?? slug
  const [messages, setMessages] = useState<ChatMessage[]>(() => cachedMessages(slug) ?? [])
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => (cachedMessages(slug) ? "ready" : "loading"))
  const [more, setMore] = useState(false)
  // After a jump into the past, newer messages wait below; "Jump to latest" reloads them.
  const [detached, setDetached] = useState(false)
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
  const [extras, setExtras] = useState(false)
  const [polls, setPolls] = useState<Record<string, Poll>>({})
  const [translations, setTranslations] = useState<Record<string, Translation>>({})
  const [thread, setThread] = useState<{ root: ChatMessage | null; replies: ChatMessage[]; loading: boolean }>({ root: null, replies: [], loading: false })
  const [tab, setTab] = useState<PanelTab>("people")
  const [panelWide, setPanelWide] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchSeed, setSearchSeed] = useState("")
  const [pinsVersion, setPinsVersion] = useState(0)
  const [pollOpen, setPollOpen] = useState<{ question: string; options: string[] } | null>(null)
  const [catchUp, setCatchUp] = useState(false)
  const [styling, setStyling] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
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
  const isCrewRoom = room?.kind === "crew"
  const canManage = canWrite && (isCrewRoom ? Boolean(canStyle) : !live || role.isStaff || caps.can("chat.manage"))
  const features: MessageFeatures = {
    threads: extras || !live,
    pins: extras || !live,
    canPin: canManage,
    save: canWrite,
    translate: translateAi.usable,
  }
  const compact = prefs.chat.density === "compact"
  const accent = room?.accent ? ACCENT_VALUE[room.accent] : null

  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<ComposerHandle>(null)
  const sub = useRef<ReturnType<typeof subscribeRoom> | null>(null)
  const liveIds = useRef(new Set<string>())
  const atBottomRef = useRef(true)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const messagesRef = useRef(messages)
  const meRef = useRef(me)
  const moreRef = useRef(more)
  const threadRef = useRef(thread)
  const pollsRef = useRef(polls)
  const loadingOlderRef = useRef(false)
  const jumpedToHash = useRef(false)

  useEffect(() => {
    messagesRef.current = messages
    meRef.current = me
    moreRef.current = more
    threadRef.current = thread
    pollsRef.current = polls
  })

  // Where this reader left off, for the "New" line. Read once per visit to the room.
  useEffect(() => {
    let stale = false
    void Promise.resolve().then(() => !stale && setReadMark(lastRead(slug)))
    return () => {
      stale = true
    }
  }, [slug])

  // First page (or the page around a linked message), then every change as it happens.
  useEffect(() => {
    let stale = false
    const hash = typeof location !== "undefined" && location.hash.startsWith("#m-") ? location.hash.slice(3) : null
    const first = async () => {
      if (hash && live) {
        const target = await getMessage(hash).catch(() => null)
        if (target && target.room === slug && !target.threadRoot) {
          const around = await listAround(slug, target.createdAt)
          return { messages: around.messages, more: around.more, newer: around.newer }
        }
      }
      const page = await listMessages(slug)
      return { ...page, newer: false }
    }
    first()
      .then(({ messages: page, more: hasMore, newer }) => {
        if (stale) return
        setExtras(chatExtras())
        setMessages((current) => {
          if (newer) return page
          const pending = current.filter((m) => m.status)
          const fresh = current.filter((m) => !m.status && !page.some((p) => p.id === m.id) && m.createdAt > (page.at(-1)?.createdAt ?? ""))
          return [...page, ...fresh, ...pending]
        })
        setMore(hasMore)
        setDetached(newer)
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

  // Polls in view: load the ones not loaded yet.
  const pollIds = messages.filter((m) => m.kind === "poll" && !m.status).map((m) => m.id)
  const pollKey = pollIds.filter((id) => !polls[id]).join(",")
  useEffect(() => {
    if (!pollKey) return
    let stale = false
    getPolls(pollKey.split(","))
      .then((found) => !stale && setPolls((p) => ({ ...found, ...p })))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [pollKey])

  useEffect(() => {
    if (!ready) return
    const handle = subscribeRoom(slug, me, {
      onInsert: (m) => {
        if (m.threadRoot) {
          const t = threadRef.current
          if (t.root?.id === m.threadRoot) setThread((x) => ({ ...x, replies: place(x.replies, m) }))
          return
        }
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
      onUpdate: (u) => {
        setMessages((list) => list.map((m) => (m.id === u.id ? patch(m, u) : m)))
        setThread((t) => (t.root?.id === u.id ? { ...t, root: patch(t.root, u) } : t.replies.some((r) => r.id === u.id) ? { ...t, replies: t.replies.map((r) => (r.id === u.id ? patch(r, u) : r)) } : t))
        if (u.pinnedAt !== undefined) setPinsVersion((v) => v + 1)
      },
      onDelete: (id) => {
        setMessages((list) =>
          list.some((m) => m.id === id || m.replyTo === id) ? list.filter((m) => m.id !== id).map((m) => (m.replyTo === id ? { ...m, parent: null } : m)) : list
        )
        setThread((t) => (t.root?.id === id ? { root: null, replies: [], loading: false } : { ...t, replies: t.replies.filter((r) => r.id !== id) }))
      },
      onReaction: (r) => {
        const apply = (m: ChatMessage) => (m.id === r.messageId ? { ...m, reactions: applyReaction(m.reactions, { emoji: r.emoji, userId: r.userId }, r.on) } : m)
        setMessages((list) => (list.some((m) => m.id === r.messageId) ? list.map(apply) : list))
        setThread((t) => (t.root?.id === r.messageId || t.replies.some((x) => x.id === r.messageId) ? { ...t, root: t.root && apply(t.root), replies: t.replies.map(apply) } : t))
      },
      onVote: (v) =>
        setPolls((all) => {
          const p = all[v.messageId]
          if (!p) return all
          const rest = p.votes.filter((x) => !(x.userId === v.userId && x.choice === v.choice))
          return { ...all, [v.messageId]: { ...p, votes: v.on ? [...rest, { userId: v.userId, choice: v.choice }] : rest } }
        }),
      onPoll: (p) => setPolls((all) => (all[p.messageId] ? { ...all, [p.messageId]: { ...all[p.messageId], closesAt: p.closesAt } } : all)),
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
    if (status === "ready" && !detached) cacheMessages(slug, messages)
  }, [slug, messages, status, detached])

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
        // The scroll this causes updates "at the bottom" through onScroll.
        atBottomRef.current = false
        target.scrollIntoView({ block: "center" })
        const id = location.hash.slice(3)
        requestAnimationFrame(() => setHighlight(id))
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
      if (document.visibilityState !== "visible" || !atBottomRef.current || detached) return
      markRead(slug, latest ?? new Date().toISOString())
      onRead()
    }
    read()
    document.addEventListener("visibilitychange", read)
    return () => document.removeEventListener("visibilitychange", read)
  }, [slug, latest, atBottom, detached]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function toLatest() {
    const el = scroller.current
    if (!el) return
    if (detached) {
      try {
        const page = await listMessages(slug)
        setMessages(page.messages)
        setMore(page.more)
        setDetached(false)
      } catch (e) {
        return setError((e as Error).message)
      }
    }
    atBottomRef.current = true
    setAtBottom(true)
    setNewCount(0)
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: reduce || detached ? "auto" : "smooth" }))
  }

  /** Shows the room as it was at a moment: a day picked to jump to, or a message from search or pins. */
  async function showAt(at: string, focus?: string) {
    try {
      const around = await listAround(slug, at)
      if (!around.messages.length) return setNotice("Nothing was said on or after that day")
      setMessages(around.messages)
      setMore(around.more)
      setDetached(around.newer)
      atBottomRef.current = false
      setAtBottom(false)
      setSheetOpen(false)
      const id = focus ?? around.messages.find((m) => m.createdAt >= at)?.id ?? around.messages[0].id
      requestAnimationFrame(() => {
        document.getElementById(`m-${id}`)?.scrollIntoView({ block: "center" })
        setHighlight(id)
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function jumpTo(m: ChatMessage) {
    if (m.room !== slug) {
      router.push(`${roomHref(m.room)}#m-${m.threadRoot ?? m.id}` as Route)
      return
    }
    if (m.threadRoot) {
      openThreadById(m.threadRoot)
      return
    }
    const target = document.getElementById(`m-${m.id}`)
    if (target) {
      setSheetOpen(false)
      target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
      setHighlight(m.id)
      return
    }
    void showAt(m.createdAt, m.id)
  }

  function jumpToDate(arg: string) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(arg.trim()) ? new Date(`${arg.trim()}T00:00:00`) : new Date(arg)
    if (Number.isNaN(d.getTime())) return setNotice("Write the date like 2026-10-01")
    void showAt(d.toISOString())
  }

  // ---- Threads and the panel ------------------------------------------------------------------------------

  function openPanel(t: PanelTab) {
    setTab(t)
    setPanelWide(true)
    if (!matchMedia("(min-width: 80rem)").matches) setSheetOpen(true)
  }

  function openThread(root: ChatMessage) {
    setThread({ root, replies: [], loading: true })
    openPanel("thread")
    listThread(slug, root.id)
      .then((replies) => setThread((t) => (t.root?.id === root.id ? { ...t, replies, loading: false } : t)))
      .catch((e: Error) => {
        setError(e.message)
        setThread((t) => ({ ...t, loading: false }))
      })
  }

  function openThreadById(id: string) {
    const root = messagesRef.current.find((m) => m.id === id)
    if (root) return openThread(root)
    getMessage(id)
      .then((m) => m && openThread(m))
      .catch(() => {})
  }

  // ---- Writing -------------------------------------------------------------------------------------------

  async function deliver(draft: ChatMessage) {
    const inThread = Boolean(draft.threadRoot)
    const put = (m: ChatMessage) => (inThread ? setThread((t) => ({ ...t, replies: place(t.replies, m) })) : setMessages((list) => place(list, m)))
    try {
      const sent = await sendMessage(slug, draft.body, {
        id: draft.id,
        replyTo: draft.replyTo,
        parent: draft.parent,
        kind: draft.kind,
        attachments: draft.attachments,
        mentions: draft.mentions,
        threadRoot: draft.threadRoot,
      })
      put(sent)
    } catch (e) {
      put({ ...draft, status: "failed", error: (e as Error).message })
    }
  }

  function startSlow() {
    if (room?.slowMode && !exempt) {
      const n = Date.now()
      setTick(n)
      setSlowUntil(n + room.slowMode * 1000)
    }
  }

  function draftOf(msg: ComposerSend, threadRoot: string | null): ChatMessage {
    const quote = threadRoot ? null : replyTo
    return {
      id: crypto.randomUUID(),
      room: slug,
      body: msg.body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: me,
      replyTo: quote?.id ?? null,
      parent: quote ? { id: quote.id, body: quote.body, author: quote.author } : null,
      reactions: [],
      kind: msg.kind,
      attachments: msg.attachments,
      mentions: msg.mentions,
      threadRoot,
      replyCount: 0,
      lastReplyAt: null,
      pinnedAt: null,
      status: "sending",
    }
  }

  function send(msg: ComposerSend) {
    if (!me || waiting) return
    startSlow()
    const draft = draftOf(msg, null)
    liveIds.current.add(draft.id)
    atBottomRef.current = true
    setAtBottom(true)
    setReplyTo(null)
    setReadMark(null)
    setError("")
    if (detached) void toLatest()
    setMessages((list) => place(list, draft))
    deliver(draft)
  }

  function sendInThread(msg: ComposerSend) {
    const root = thread.root
    if (!me || !root || waiting) return
    startSlow()
    const draft = draftOf(msg, root.id)
    setThread((t) => ({ ...t, replies: place(t.replies, draft) }))
    const bump = (m: ChatMessage) => (m.id === root.id ? { ...m, replyCount: m.replyCount + 1, lastReplyAt: draft.createdAt } : m)
    setMessages((list) => list.map(bump))
    setThread((t) => (t.root ? { ...t, root: bump(t.root) } : t))
    deliver(draft)
  }

  async function postPoll(input: PollInput) {
    const { message, poll } = await createPoll(slug, input)
    startSlow()
    liveIds.current.add(message.id)
    setPolls((p) => ({ ...p, [message.id]: poll }))
    setMessages((list) => place(list, message))
    atBottomRef.current = true
    setAtBottom(true)
  }

  function onCommand(action: CommandAction, arg: string) {
    if (action === "poll") return setPollOpen(parsePollArg(arg))
    if (action === "catchup") return summaryAi.usable ? setCatchUp(true) : setNotice("AI is not switched on for this site yet")
    if (action === "search") {
      setSearchSeed(arg)
      return openPanel("search")
    }
    if (action === "jump") return arg ? jumpToDate(arg) : openPanel("search")
    if (action === "pins") return openPanel("pins")
    if (action === "saved") return openPanel("saved")
    if (action === "help") return setShortcuts(true)
  }

  // Message actions go through a ref so the memoised rows don't redraw when this component does.
  const impl = {
    onReply: (m: ChatMessage) => {
      if (m.threadRoot) return openThreadById(m.threadRoot)
      setReplyTo(m)
      setEditingId(null)
      composer.current?.focus()
    },
    onReact: (m: ChatMessage, emoji: Emoji) => {
      const who = meRef.current
      if (!who || !canWrite) return
      const on = !m.reactions.some((r) => r.emoji === emoji && r.userId === who.id)
      const apply = (state: boolean) => (x: ChatMessage) => (x.id === m.id ? { ...x, reactions: applyReaction(x.reactions, { emoji, userId: who.id }, state) } : x)
      const flip = (state: boolean) => {
        setMessages((list) => list.map(apply(state)))
        setThread((t) => ({ ...t, root: t.root && apply(state)(t.root), replies: t.replies.map(apply(state)) }))
      }
      flip(on)
      toggleReaction(m, emoji, who.id, on).catch((e: Error) => {
        flip(!on)
        setError(e.message)
      })
    },
    onCopyLink: (m: ChatMessage) => {
      const url = `${location.origin}${roomHref(slug)}#m-${m.threadRoot ?? m.id}`
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
      if (m.threadRoot) setThread((t) => ({ ...t, replies: place(t.replies, draft) }))
      else setMessages((list) => place(list, draft))
      deliver(draft)
    },
    onDiscard: (m: ChatMessage) => {
      setMessages((list) => list.filter((x) => x.id !== m.id))
      setThread((t) => ({ ...t, replies: t.replies.filter((x) => x.id !== m.id) }))
    },
    onJump: (id: string) => {
      const target = document.getElementById(`m-${id}`)
      if (!target) {
        getMessage(id)
          .then((m) => (m ? jumpTo(m) : setNotice("That message is gone")))
          .catch(() => setNotice("That message is further back in the room"))
        return
      }
      target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
      setHighlight(id)
    },
    onThread: (m: ChatMessage) => openThread(m),
    onPin: (m: ChatMessage, pin: boolean) => {
      const at = pin ? new Date().toISOString() : null
      const set = (value: string | null) => setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pinnedAt: value } : x)))
      set(at)
      pinMessage(m, pin)
        .then((v) => {
          set(v)
          setPinsVersion((n) => n + 1)
          setNotice(pin ? "Pinned for everyone" : "Unpinned")
        })
        .catch((e: Error) => {
          set(m.pinnedAt)
          setError(e.message)
        })
    },
    onSave: (m: ChatMessage, saved: boolean) =>
      setSaved(m, saved).then(
        () => setNotice(saved ? "Saved. Find it under Saved" : "Removed from saved"),
        (e: Error) => setError(e.message)
      ),
    onTranslate: (m: ChatMessage) => {
      if (translations[m.id]?.text) return setTranslations((t) => ({ ...t, [m.id]: { ...t[m.id], text: undefined } }))
      setTranslations((t) => ({ ...t, [m.id]: { loading: true } }))
      ai.translate({ text: m.body.slice(0, 2000), to: prefs.chat.translateTo as LanguageCode })
        .then((r) => setTranslations((t) => ({ ...t, [m.id]: { text: r.data.text, from: r.data.from } })))
        .catch((e: Error) => setTranslations((t) => ({ ...t, [m.id]: { error: e.message } })))
    },
    onVote: (m: ChatMessage, choice: number, on: boolean) => {
      const poll = pollsRef.current[m.id]
      const who = meRef.current
      if (!poll || !who) return
      const before = poll.votes
      const optimistic = on && !poll.multi ? [...before.filter((v) => v.userId !== who.id), { userId: who.id, choice }] : on ? [...before, { userId: who.id, choice }] : before.filter((v) => !(v.userId === who.id && v.choice === choice))
      setPolls((p) => ({ ...p, [m.id]: { ...poll, votes: optimistic } }))
      vote(poll, slug, choice, on)
        .then((votes) => setPolls((p) => ({ ...p, [m.id]: { ...p[m.id], votes } })))
        .catch((e: Error) => {
          setPolls((p) => ({ ...p, [m.id]: { ...p[m.id], votes: before } }))
          setError(e.message)
        })
    },
    onClosePoll: (m: ChatMessage, close: boolean) => {
      const poll = pollsRef.current[m.id]
      if (!poll) return
      setPollClosed(poll, close)
        .then((closesAt) => setPolls((p) => ({ ...p, [m.id]: { ...p[m.id], closesAt } })))
        .catch((e: Error) => setError(e.message))
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
      onThread: (m) => implRef.current.onThread(m),
      onPin: (m, p) => implRef.current.onPin(m, p),
      onSave: (m, s) => implRef.current.onSave(m, s),
      onTranslate: (m) => implRef.current.onTranslate(m),
      onVote: (m, c, on) => implRef.current.onVote(m, c, on),
      onClosePoll: (m, c) => implRef.current.onClosePoll(m, c),
    }),
    []
  )

  async function confirmDelete() {
    const m = deleting
    if (!m) return
    setDeleting(null)
    const before = messagesRef.current
    const threadBefore = threadRef.current
    setMessages((list) => list.filter((x) => x.id !== m.id).map((x) => (x.replyTo === m.id ? { ...x, parent: null } : x)))
    setThread((t) => (t.root?.id === m.id ? { root: null, replies: [], loading: false } : { ...t, replies: t.replies.filter((x) => x.id !== m.id) }))
    try {
      await deleteMessage(m.id, slug)
    } catch (e) {
      setMessages(before)
      setThread(threadBefore)
      setError((e as Error).message)
    }
  }

  function editLast() {
    if (!me) return
    const mine = messagesRef.current.findLast((m) => !m.status && m.author?.id === me.id && m.kind !== "poll" && m.kind !== "sticker")
    if (mine) setEditingId(mine.id)
  }

  // Keyboard: room-wide shortcuts that don't fight the message box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typingHere = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const k = e.key.toLowerCase()
        if (k === "f" || e.code === "KeyF") {
          e.preventDefault()
          return openPanel("search")
        }
        if (k === "p" || e.code === "KeyP") {
          e.preventDefault()
          return openPanel("pins")
        }
        if (k === "s" || e.code === "KeyS") {
          e.preventDefault()
          return openPanel("saved")
        }
      }
      if (typingHere) return
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShortcuts(true)
      } else if (e.key === "Escape" && e.shiftKey) {
        e.preventDefault()
        void toLatest()
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        composer.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // ---- Drawing -------------------------------------------------------------------------------------------

  const firstNew = useMemo(() => {
    if (!readMark) return null
    return messages.find((m) => !m.status && m.createdAt > readMark && m.author?.id !== me?.id)?.id ?? null
  }, [messages, readMark, me?.id])

  const typingNames = Object.values(typing).map((t) => t.name)
  const rulesOpen = Boolean(room?.rules && !prefs.chat.readRules.includes(slug))

  const rows: React.ReactNode[] = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
    const isFirstNew = m.id === firstNew
    if (newDay) {
      rows.push(
        <li key={`day-${dayKey(m.createdAt)}`} className="sticky top-0 z-10 my-2 flex items-center gap-3 px-4">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <button
            type="button"
            onClick={() => openPanel("search")}
            title="Jump to another day"
            className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {dayLabel(m.createdAt, now)}
          </button>
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
        grouped={!newDay && !isFirstNew && continues(prev, m) && m.kind !== "poll"}
        me={me}
        canWrite={canWrite}
        animateIn={liveIds.current.has(m.id)}
        editing={editingId === m.id}
        highlighted={highlight === m.id}
        now={now}
        actions={actions}
        features={features}
        poll={polls[m.id]}
        saved={savedIds.has(m.id)}
        translation={translations[m.id]}
        compact={compact}
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

  const panel = (
    <RoomPanel
      tab={tab === "thread" && !thread.root ? "people" : tab}
      onTab={setTab}
      slug={slug}
      room={room}
      crowd={crowd}
      me={me}
      canWrite={canWrite}
      now={now}
      actions={actions}
      features={features}
      polls={polls}
      savedIds={savedIds}
      thread={{ ...thread, onSend: sendInThread, onTyping: () => sub.current?.typing() }}
      pinsVersion={pinsVersion}
      searchSeed={searchSeed}
      onJump={jumpTo}
      onJumpDate={jumpToDate}
      onClose={() => setPanelWide(false)}
    />
  )

  const style = accent ? ({ "--room-accent": accent } as CSSProperties) : undefined

  return (
    <>
      <section aria-labelledby="chat-room-title" className="relative flex min-w-0 flex-1 flex-col" style={style}>
        {accent && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-[var(--room-accent)] opacity-70" />}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
          <Button variant="ghost" size="icon-sm" className="relative md:hidden" aria-label="Show rooms" onClick={onOpenRooms}>
            <MenuIcon aria-hidden />
            {unreadElsewhere && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-ion" />}
          </Button>
          {room?.emoji ? (
            <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-full text-base" style={{ background: accent ? `color-mix(in oklab, ${accent} 22%, transparent)` : "rgb(255 255 255 / 0.06)" }}>
              {room.emoji}
            </span>
          ) : (
            <RoomGlyph slug={slug} active size={26} />
          )}
          <div className="min-w-0 flex-1">
            <h1 id="chat-room-title" className="truncate text-sm leading-tight font-semibold">
              {name}
            </h1>
            {room?.topic && <p className="truncate text-xs text-muted-foreground">{room.topic}</p>}
          </div>
          <RoomRules room={room} />
          {summaryAi.usable && canWrite && (
            <Button variant="ghost" size="sm" className="hidden gap-1.5 text-ion sm:inline-flex" onClick={() => setCatchUp(true)}>
              <SparklesIcon aria-hidden /> Catch me up
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Search this room" title="Search this room" className="hidden sm:inline-flex" onClick={() => openPanel("search")}>
            <SearchIcon aria-hidden />
          </Button>
          <button
            type="button"
            onClick={() => openPanel("people")}
            className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            aria-label={`${crowd.total} here now. Show who's here`}
          >
            <PresenceStack crowd={crowd} />
            {crowd.total === 0 ? <UsersIcon aria-hidden className="size-4" /> : <span className="tabular">{crowd.total} here</span>}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Room options">
                  <MoreVerticalIcon aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              {summaryAi.usable && canWrite && (
                <DropdownMenuItem onClick={() => setCatchUp(true)}>
                  <SparklesIcon aria-hidden /> Catch me up
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openPanel("search")}>
                <SearchIcon aria-hidden /> Search and jump to a date
              </DropdownMenuItem>
              {features.pins && (
                <DropdownMenuItem onClick={() => openPanel("pins")}>
                  <PinIcon aria-hidden /> Pinned messages
                </DropdownMenuItem>
              )}
              {features.save && (
                <DropdownMenuItem onClick={() => openPanel("saved")}>
                  <BookmarkIcon aria-hidden /> Saved messages
                </DropdownMenuItem>
              )}
              {room?.rules && (
                <DropdownMenuItem onClick={() => prefs.setChat({ readRules: prefs.chat.readRules.filter((r) => r !== slug) })}>
                  <ScrollTextIcon aria-hidden /> Show the room rules
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="hidden xl:flex" onClick={() => setPanelWide((w) => !w)}>
                <PanelRightIcon aria-hidden /> {panelWide ? "Hide the side panel" : "Show the side panel"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canWrite && !isCrewRoom && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      const on = !prefs.chat.starred.includes(slug)
                      prefs.setChat({ starred: on ? [...prefs.chat.starred, slug] : prefs.chat.starred.filter((r) => r !== slug) })
                    }}
                  >
                    <StarIcon aria-hidden /> {prefs.chat.starred.includes(slug) ? "Unstar this room" : "Star this room"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const on = !prefs.chat.muted.includes(slug)
                      prefs.setChat({ muted: on ? [...prefs.chat.muted, slug] : prefs.chat.muted.filter((r) => r !== slug) })
                    }}
                  >
                    <BellOffIcon aria-hidden /> {prefs.chat.muted.includes(slug) ? "Unmute this room" : "Mute this room"}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => prefs.setChat({ density: compact ? "cozy" : "compact" })}>
                <RowsIcon aria-hidden /> {compact ? "Cozy messages" : "Compact messages"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => prefs.setChat({ stars: !prefs.chat.stars })}>
                <StarsIcon aria-hidden /> {prefs.chat.stars ? "Hide the starfield" : "Show the starfield"}
              </DropdownMenuItem>
              {canManage && room && live && (
                <DropdownMenuItem onClick={() => setStyling(true)}>
                  <PaletteIcon aria-hidden /> Room look and rules
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShortcuts(true)}>
                <KeyboardIcon aria-hidden /> Keyboard shortcuts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <AnimatePresence initial={false}>
          {rulesOpen && room?.rules && (
            <motion.div
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="shrink-0 overflow-hidden border-b border-border"
            >
              <div className="flex items-start gap-3 px-4 py-2.5 text-sm" style={{ background: accent ? `color-mix(in oklab, ${accent} 8%, transparent)` : "rgb(143 180 255 / 0.05)" }}>
                <ScrollTextIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--room-accent,var(--ion))]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">House rules</p>
                  <p className="line-clamp-4 whitespace-pre-line text-foreground/90">{room.rules}</p>
                </div>
                <Button size="xs" variant="secondary" onClick={() => prefs.setChat({ readRules: [...prefs.chat.readRules, slug] })}>
                  Got it
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative min-h-0 flex-1">
          {prefs.chat.stars && (
            <div aria-hidden className="starfield opacity-30 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]">
              <i />
              <i />
              <i />
            </div>
          )}
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
                {detached && (
                  <div className="flex justify-center py-3">
                    <Button size="xs" variant="secondary" onClick={toLatest}>
                      <CalendarIcon aria-hidden data-icon="inline-start" /> Newer messages · back to now
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <AnimatePresence>
            {(!atBottom || detached) && status === "ready" && messages.length > 0 && (
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
          <div className="flex h-6 items-center gap-2 px-1 text-xs text-muted-foreground" aria-hidden={typingNames.length === 0 && !notice}>
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
                onAction={onCommand}
                hold={waiting > 0}
                features={{ pictures: extras || !live, stickers: extras || !live, polls: extras || !live, mentions: live, ai: summaryAi.usable }}
              />
            </>
          ) : (
            <div className="glass flex flex-col items-start gap-2 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Sign in with your email to join the conversation.</p>
              <Link href={signInHref(slug)} className="pressable inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
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
            {deleting && <p className="line-clamp-3 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground">{deleting.body}</p>}
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
        <PollDialog open={pollOpen !== null} onOpenChange={(o) => !o && setPollOpen(null)} initial={pollOpen ?? undefined} onCreate={postPoll} />
        {summaryAi.usable && <CatchUpDialog open={catchUp} onOpenChange={setCatchUp} room={name} messages={messages} since={lastRead(slug)} />}
        {room && canManage && (
          <RoomStyleDialog
            open={styling}
            onOpenChange={setStyling}
            room={room}
            onSaved={(r) => {
              setLook(r)
              onRoomChange?.(r)
              setNotice("Room look saved")
            }}
          />
        )}
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      </section>

      {panelWide && (
        <aside aria-label="Room details" className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/40 xl:flex">
          {panel}
        </aside>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[92%] max-w-sm gap-0 p-0">
          <SheetTitle className="sr-only">Room details</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
    </>
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
        {canWrite ? "It's quiet here. Say hello, start a poll with /poll, or send a sticker." : live ? "It's quiet here. Sign in to start the conversation." : "It's quiet here."}
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
