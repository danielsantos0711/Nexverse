"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BanIcon,
  BellOffIcon,
  CheckCheckIcon,
  CheckIcon,
  ClipboardIcon,
  CornerUpLeftIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  RotateCwIcon,
  SearchIcon,
  SmilePlusIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Attachments } from "@/components/chat/attachments"
import { Composer, type ComposerHandle, type ComposerSend } from "@/components/chat/composer"
import { EmojiPicker } from "@/components/chat/emoji-picker"
import { clock, dayKey, dayLabel, fullDate } from "@/components/chat/format"
import { ChatAvatar } from "@/components/chat/glyphs"
import { MessageBody } from "@/components/chat/message-body"
import { Sticker, stickerOf } from "@/components/chat/stickers"
import { useNow } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCENT_VALUE, localMember } from "@/lib/chat"
import { useSocialPrefs, type DmPrefs } from "@/lib/chat-features"
import {
  deleteDirectMessage,
  dmExtras,
  editDirectMessage,
  getConversation,
  leaveGroup,
  listDirectMessages,
  listGroupMembers,
  markConversationRead,
  MAX_DM,
  searchConversation,
  sendDirectMessage,
  setBlocked,
  setConversationPrefs,
  subscribeConversation,
  toggleDmReaction,
  type Conversation,
  type DirectMessage,
  type GroupMember,
} from "@/lib/messages"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const NEAR_BOTTOM = 80
const noop = () => () => {}
const QUICK = ["👍", "❤️", "😂", "🚀"]

const sortMessages = (list: DirectMessage[]) => list.sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || a.createdAt.localeCompare(b.createdAt))

function bubbleStyle(bubble: DmPrefs["bubble"]) {
  const c = bubble === "ion" ? "var(--ion)" : ACCENT_VALUE[bubble]
  return { background: `color-mix(in oklab, ${c} 20%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 28%, transparent)` }
}

/**
 * One conversation, one-to-one or a group: messages grouped by day, reactions, replies, edits, pictures and
 * stickers, "Seen" (or "Seen by" in a group) under your latest read message, and the message box.
 */
export function ConversationView({ id }: { id: string }) {
  const session = useSession()
  const role = useRole()
  const router = useRouter()
  const reduce = useReducedMotion()
  const now = useNow()
  const prefs = useSocialPrefs()
  const localId = useSyncExternalStore(
    noop,
    () => (live ? null : localMember().id),
    () => null
  )
  const myId = live ? (session.user?.id ?? null) : localId
  const ready = live ? session.ready : localId !== null

  const [conv, setConv] = useState<Conversation | null | undefined>(undefined)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [more, setMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [typing, setTyping] = useState<{ until: number; from?: string }>({ until: 0 })
  const [typingVisible, setTypingVisible] = useState(false)
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const sub = useRef<ReturnType<typeof subscribeConversation> | null>(null)
  const box = useRef<ComposerHandle>(null)
  const group = conv?.kind === "group"
  const where = conv ? { id: conv.id, kind: conv.kind } : null

  // The conversation and its first page.
  useEffect(() => {
    if (!ready) return
    let stale = false
    if (live && !session.user) {
      void Promise.resolve().then(() => !stale && setConv(null))
      return () => {
        stale = true
      }
    }
    getConversation(id)
      .then(async (c) => {
        const page = c ? await listDirectMessages({ id, kind: c.kind }) : { messages: [], more: false }
        if (stale) return
        setConv(c)
        setOtherReadAt(c?.otherReadAt ?? null)
        setMessages(page.messages)
        setMore(page.more)
        setStatus("ready")
        if (c) {
          markConversationRead({ id, kind: c.kind }).catch(() => {})
          if (c.kind === "group") listGroupMembers(id).then((m) => !stale && setMembers(m), () => {})
        }
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setStatus("error")
      })
    return () => {
      stale = true
    }
  }, [id, ready, session.user])

  // Everything that happens next, live.
  const kind = conv?.kind
  useEffect(() => {
    if (!ready || !myId || !kind) return
    const at = { id, kind }
    const handle = subscribeConversation(at, myId, {
      onMessage: (m) => {
        setMessages((list) => (list.some((x) => x.id === m.id) ? list : sortMessages([...list, m])))
        if (m.authorId !== myId) {
          setTyping({ until: 0 })
          if (document.visibilityState === "visible") markConversationRead(at).catch(() => {})
        }
      },
      onUpdate: (m) => setMessages((list) => list.map((x) => (x.id === m.id ? { ...m, reactions: x.reactions } : x))),
      onDelete: (mid) => setMessages((list) => (list.some((m) => m.id === mid) ? list.filter((m) => m.id !== mid) : list)),
      onReaction: (r) =>
        setMessages((list) =>
          list.map((m) =>
            m.id === r.messageId
              ? { ...m, reactions: r.on ? [...m.reactions.filter((x) => !(x.emoji === r.emoji && x.userId === r.userId)), { emoji: r.emoji, userId: r.userId }] : m.reactions.filter((x) => !(x.emoji === r.emoji && x.userId === r.userId)) }
              : m
          )
        ),
      onRead: (when) => setOtherReadAt(when),
      onMemberRead: (uid, when) => setMembers((list) => list.map((m) => (m.id === uid ? { ...m, readAt: when } : m))),
      onTyping: (from) => setTyping({ until: Date.now() + 4000, from }),
    })
    sub.current = handle
    const onVisible = () => document.visibilityState === "visible" && markConversationRead(at).catch(() => {})
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      handle.unsubscribe()
      sub.current = null
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [id, myId, ready, kind])

  // "Typing…" fades four seconds after the last keystroke on the other side.
  useEffect(() => {
    if (!typing.until) return
    const show = setTimeout(() => setTypingVisible(true), 0)
    const t = setTimeout(() => setTypingVisible(false), Math.max(0, typing.until - Date.now()))
    return () => {
      clearTimeout(show)
      clearTimeout(t)
    }
  }, [typing])
  const showTyping = typingVisible && typing.until > 0

  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), 2000)
    return () => clearTimeout(t)
  }, [highlight])

  // Keep to the bottom while the reader is there; hold still while older messages load above.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (anchor.current) {
      el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height)
      anchor.current = null
      return
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, showTyping, status])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.status)
    if (!oldest || loadingOlder || !where) return
    setLoadingOlder(true)
    try {
      const page = await listDirectMessages(where, { before: oldest.createdAt })
      const el = scroller.current
      if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop }
      setMessages((list) => [...page.messages.filter((m) => !list.some((x) => x.id === m.id)), ...list])
      setMore(page.more)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingOlder(false)
    }
  }

  async function send(msg: ComposerSend, retryOf?: DirectMessage) {
    if (!myId || !where) return
    const quote = retryOf ? retryOf.replyTo : (replyTo?.id ?? null)
    const temp: DirectMessage = {
      id: retryOf?.id ?? `pending-${crypto.randomUUID()}`,
      threadId: id,
      authorId: myId,
      body: msg.body,
      createdAt: new Date().toISOString(),
      kind: msg.kind,
      replyTo: quote,
      attachments: msg.attachments,
      editedAt: null,
      reactions: [],
      status: "sending",
    }
    atBottom.current = true
    setMessages((list) => [...list.filter((m) => m.id !== temp.id), temp])
    setReplyTo(null)
    setError("")
    // Answering a message request accepts it.
    if (conv?.request) {
      setConv({ ...conv, request: false })
      setConversationPrefs(conv, { accepted: true }).catch(() => {})
    }
    try {
      const saved = await sendDirectMessage(where, msg.body, { kind: msg.kind, replyTo: quote, attachments: msg.attachments })
      setMessages((list) => sortMessages([...list.filter((m) => m.id !== temp.id && m.id !== saved.id), saved]))
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, status: "failed", error: (e as Error).message } : m)))
    }
  }

  async function remove(m: DirectMessage) {
    if (!where) return
    const before = messages
    setMessages((list) => list.filter((x) => x.id !== m.id))
    try {
      await deleteDirectMessage(m, where)
      setNotice("Message deleted.")
    } catch (e) {
      setMessages(before)
      setError((e as Error).message)
    }
  }

  async function edit(m: DirectMessage, body: string) {
    if (!where) return
    try {
      const saved = await editDirectMessage(where, m, body)
      setMessages((list) => list.map((x) => (x.id === m.id ? saved : x)))
      setEditingId(null)
      box.current?.focus()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function react(m: DirectMessage, emoji: string) {
    if (!myId || m.status) return
    const on = !m.reactions.some((r) => r.emoji === emoji && r.userId === myId)
    const flip = (state: boolean) =>
      setMessages((list) =>
        list.map((x) =>
          x.id === m.id ? { ...x, reactions: state ? [...x.reactions.filter((r) => !(r.emoji === emoji && r.userId === myId)), { emoji, userId: myId }] : x.reactions.filter((r) => !(r.emoji === emoji && r.userId === myId)) } : x
        )
      )
    flip(on)
    toggleDmReaction(m, emoji, myId, on).catch((e: Error) => {
      flip(!on)
      setError(e.message)
    })
  }

  function jump(mid: string) {
    const el = document.getElementById(`dm-${mid}`)
    if (!el) return setNotice("That message is further back. Load earlier messages to see it.")
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    setHighlight(mid)
  }

  async function toggleBlock() {
    if (!conv) return
    const next = !conv.blocked
    if (next && !confirm(`Block ${conv.other.name}? Neither of you will be able to send messages in this conversation until you unblock them.`)) return
    try {
      await setBlocked(conv, next)
      setConv({ ...conv, blocked: next })
      setNotice(next ? `${conv.other.name} is blocked.` : `${conv.other.name} is unblocked.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function setPref(patch: Partial<Pick<Conversation, "pinned" | "muted" | "archived">> & { accepted?: boolean }) {
    if (!conv) return
    const before = conv
    setConv({ ...conv, ...patch, request: patch.accepted ? false : conv.request })
    try {
      await setConversationPrefs(conv, patch)
      if (patch.archived) setNotice("Archived. Find it under Archived in your messages.")
    } catch (e) {
      setConv(before)
      setError((e as Error).message)
    }
  }

  async function leave() {
    if (!conv || !confirm(`Leave ${conv.title}? You will stop receiving its messages.`)) return
    try {
      await leaveGroup(conv.id)
      router.push("/messages")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // The latest of your messages the other member (or, in a group, each member) has read.
  const seen = useMemo(() => {
    if (!myId) return new Map<string, string[]>()
    const mine = messages.filter((m) => m.authorId === myId && !m.status)
    const out = new Map<string, string[]>()
    if (group) {
      for (const p of members) {
        if (p.id === myId || !p.readAt) continue
        const last = mine.filter((m) => m.createdAt <= p.readAt!).at(-1)
        if (last) out.set(last.id, [...(out.get(last.id) ?? []), p.name.split(/\s+/)[0]])
      }
    } else if (otherReadAt) {
      const last = mine.filter((m) => m.createdAt <= otherReadAt).at(-1)
      if (last) out.set(last.id, [])
    }
    return out
  }, [messages, otherReadAt, myId, members, group])

  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  if (live && ready && !session.user) {
    return (
      <Centered>
        <p>Sign in to read your messages.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(`/messages/${id}`)}`} className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </Centered>
    )
  }

  if (conv === null && status === "ready") {
    return (
      <Centered>
        <p>This conversation is not here. It may belong to another account, or the link is incomplete.</p>
        <Link href="/messages" className="text-sm text-ion hover:underline">
          Back to messages
        </Link>
      </Centered>
    )
  }

  const other = conv?.other
  const lastMineId = myId ? messages.filter((m) => m.authorId === myId && !m.status).at(-1)?.id : undefined
  const extras = dmExtras() || !live
  const typistName = typing.from ? names.get(typing.from)?.split(/\s+/)[0] : undefined
  const title = conv ? (group ? conv.title : conv.other.name) : ""
  const bubble = bubbleStyle(prefs.dm.bubble)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <Link href="/messages" aria-label="Back to conversations" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground md:hidden">
          <ArrowLeftIcon aria-hidden className="size-4" />
        </Link>
        {!conv ? (
          <Skeleton className="size-8 rounded-full" />
        ) : group ? (
          <GroupGlyph emoji={conv.emoji} size={32} />
        ) : (
          <ChatAvatar id={conv.other.id} name={conv.other.name} size={32} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {conv ? title : <Skeleton className="h-4 w-32" />}
            {conv?.pinned && <PinIcon aria-label="Pinned" className="size-3 shrink-0 text-gold" />}
            {conv?.muted && <BellOffIcon aria-label="Muted" className="size-3 shrink-0 text-muted-foreground" />}
          </h2>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {showTyping ? (
              <span className="text-ion">{typistName ? `${typistName} is typing…` : "typing…"}</span>
            ) : conv?.blocked ? (
              "Blocked"
            ) : group ? (
              <button type="button" onClick={() => setMembersOpen(true)} className="hover:text-foreground">
                {conv?.memberCount ?? members.length} members
              </button>
            ) : other?.handle ? (
              `@${other.handle}`
            ) : (
              "Direct message"
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Search this conversation" title="Search" onClick={() => setSearching((s) => !s)}>
          <SearchIcon aria-hidden />
        </Button>
        {conv && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Conversation options" />}>
              <MoreHorizontalIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!group && other?.handle && (
                <DropdownMenuItem render={<Link href={`/people/${other.handle}`} />}>
                  <UserIcon aria-hidden /> View profile
                </DropdownMenuItem>
              )}
              {group && (
                <DropdownMenuItem onClick={() => setMembersOpen(true)}>
                  <UsersIcon aria-hidden /> Members
                </DropdownMenuItem>
              )}
              {extras && (
                <>
                  <DropdownMenuItem onClick={() => setPref({ pinned: !conv.pinned })}>
                    <PinIcon aria-hidden /> {conv.pinned ? "Unpin" : "Pin to the top"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPref({ muted: !conv.muted })}>
                    <BellOffIcon aria-hidden /> {conv.muted ? "Unmute" : "Mute notifications"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPref({ archived: !conv.archived })}>
                    <ArchiveIcon aria-hidden /> {conv.archived ? "Move back to the inbox" : "Archive"}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {group ? (
                <DropdownMenuItem variant="destructive" onClick={leave}>
                  <LogOutIcon aria-hidden /> Leave the group
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant={conv.blocked ? "default" : "destructive"} onClick={toggleBlock}>
                  <BanIcon aria-hidden /> {conv.blocked ? "Unblock" : "Block"} {other?.name.split(/\s+/)[0]}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {searching && where && <SearchBar where={where} onClose={() => setSearching(false)} onJump={jump} />}

      {conv?.request && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-gold/[0.06] px-4 py-2.5 text-sm">
          <p className="min-w-0 flex-1 text-foreground/90">
            <span className="font-medium">{conv.other.name}</span> wants to message you. You don’t follow them yet; reply or accept to move this to your inbox.
          </p>
          <Button size="xs" onClick={() => setPref({ accepted: true })}>
            Accept
          </Button>
          <Button size="xs" variant="ghost" onClick={toggleBlock}>
            Block
          </Button>
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6" aria-busy={status === "loading"}>
        {status === "loading" ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-16 w-3/5 rounded-2xl" />
          </div>
        ) : status === "error" ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This conversation could not be loaded. {error}
          </p>
        ) : (
          <ol className={cn("flex flex-col", prefs.dm.compact ? "gap-0.5" : "gap-1")} aria-label={`Messages with ${title || "this member"}`}>
            {more && (
              <li className="mb-2 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </Button>
              </li>
            )}
            {messages.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                {conv && (group ? <GroupGlyph emoji={conv.emoji} size={48} /> : <ChatAvatar id={conv.other.id} name={conv.other.name} size={48} />)}
                <p>{group ? `This is the start of ${title}. Say hello to the crew.` : `This is the start of your conversation with ${title || "this member"}. Say hello.`}</p>
              </li>
            )}
            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const mine = m.authorId === myId
                const newDay = now !== null && (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt))
                const grouped = Boolean(prev && prev.authorId === m.authorId && !newDay && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000)
                const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : undefined
                return (
                  <motion.li
                    key={m.id}
                    id={`dm-${m.id}`}
                    layout={false}
                    initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: "scale(0.96)" }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className={cn("flex flex-col rounded-xl transition-colors duration-500", grouped ? "mt-0.5" : "mt-3", highlight === m.id && "bg-ion/[0.1]")}
                  >
                    {newDay && (
                      <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span aria-hidden className="h-px flex-1 bg-border" />
                        {dayLabel(m.createdAt, now)}
                        <span aria-hidden className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    {group && !mine && !grouped && <span className="mb-0.5 ml-10 text-xs font-medium text-muted-foreground">{names.get(m.authorId) ?? "Member"}</span>}
                    <Bubble
                      m={m}
                      mine={mine}
                      myId={myId}
                      showAvatar={group && !mine}
                      grouped={grouped}
                      bubble={bubble}
                      quoted={quoted}
                      quotedName={quoted ? (quoted.authorId === myId ? "You" : group ? (names.get(quoted.authorId) ?? "Member") : (other?.name ?? "Member")) : undefined}
                      seenBy={seen.get(m.id)}
                      group={group}
                      showStatus={mine && m.id === lastMineId}
                      editing={editingId === m.id}
                      canReact={extras && !conv?.blocked}
                      onReact={(e) => react(m, e)}
                      onReply={() => {
                        setReplyTo(m)
                        box.current?.focus()
                      }}
                      onEdit={() => setEditingId(m.id)}
                      onSaveEdit={(body) => edit(m, body)}
                      onCancelEdit={() => setEditingId(null)}
                      onJump={jump}
                      onRetry={() => send({ body: m.body, kind: m.kind === "system" ? "text" : m.kind, attachments: m.attachments, mentions: [] }, m)}
                      onDiscard={() => setMessages((list) => list.filter((x) => x.id !== m.id))}
                      onDelete={() => remove(m)}
                      onCopy={() => navigator.clipboard?.writeText(m.body).then(() => setNotice("Copied."), () => {})}
                    />
                  </motion.li>
                )
              })}
            </AnimatePresence>
            {showTyping && (
              <li className="mt-3 flex" aria-hidden>
                <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-2.5">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" style={{ animationDelay: `${d * 160}ms` }} />
                  ))}
                </span>
              </li>
            )}
          </ol>
        )}
      </div>

      {error && status === "ready" && (
        <p role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:mx-6">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError("")}>
            <XIcon aria-hidden className="size-4" />
          </button>
        </p>
      )}
      <span role="status" className="sr-only">
        {notice}
      </span>

      {role.suspended ? (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          Your account is paused, so you can read but not send messages until {role.suspendedUntil ? new Date(role.suspendedUntil).toLocaleDateString() : "the pause ends"}. Your notifications say why.
        </p>
      ) : conv?.blocked ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>You blocked {other?.name}. Unblock them to send messages.</span>
          <Button variant="secondary" size="sm" onClick={toggleBlock}>
            Unblock
          </Button>
        </div>
      ) : conv ? (
        // Rendered once the conversation has loaded in the browser, so the saved draft can be read straight away.
        <div className="shrink-0 border-t border-border p-2 md:p-3">
          <Composer
            key={id}
            ref={box}
            room={`dm:${id}`}
            roomName={group ? title : title.split(/\s+/)[0]}
            placeholder={group ? `Message ${title}` : `Message ${title.split(/\s+/)[0]}`}
            where="dm"
            maxLength={MAX_DM}
            disabled={status !== "ready"}
            replyTo={replyTo ? { author: { name: replyTo.authorId === myId ? "yourself" : group ? (names.get(replyTo.authorId) ?? "Member") : (other?.name ?? "Member") }, body: replyTo.body } : null}
            onCancelReply={() => setReplyTo(null)}
            onSend={(msg) => send(msg)}
            onTyping={() => sub.current?.typing()}
            onEditLast={() => {
              const last = messages.filter((m) => m.authorId === myId && !m.status && m.kind === "text").at(-1)
              if (last && extras) setEditingId(last.id)
            }}
            onAction={(action) => {
              if (action === "search") setSearching(true)
            }}
            features={{ pictures: extras, stickers: extras, polls: false, mentions: false, ai: false }}
          />
        </div>
      ) : (
        <div aria-hidden className="h-[4.75rem] shrink-0 border-t border-border" />
      )}

      {group && (
        <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{members.length} members. Only members read this group.</DialogDescription>
            </DialogHeader>
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {members.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <ChatAvatar id={p.id} name={p.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.handle ? (
                      <Link href={`/people/${p.handle}`} className="hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                    {p.id === myId && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {p.role === "owner" && <span className="text-[11px] text-gold">Started it</span>}
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export function GroupGlyph({ emoji, size = 36 }: { emoji: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,rgb(143_180_255/0.35),rgb(143_180_255/0.08))] ring-1 ring-ion/25"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {emoji || <UsersIcon className="size-[45%] text-ion" />}
    </span>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">{children}</div>
}

function SearchBar({ where, onClose, onJump }: { where: { id: string; kind: "direct" | "group" }; onClose: () => void; onJump: (id: string) => void }) {
  const [q, setQ] = useState("")
  const [found, setFound] = useState<{ q: string; list: DirectMessage[] }>({ q: "", list: [] })
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) return
    let stale = false
    const t = setTimeout(() => {
      searchConversation(where, query).then(
        (list) => !stale && setFound({ q: query, list }),
        () => !stale && setFound({ q: query, list: [] })
      )
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, where])
  const query = q.trim()
  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search this conversation</span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} placeholder="Search this conversation" className="h-8 pl-8" />
        </label>
        <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>
      {query.length >= 2 && found.q === query && (
        <ul className="mt-1.5 max-h-48 overflow-y-auto" aria-label={`${found.list.length} results`}>
          {found.list.length === 0 && <li className="px-1 py-2 text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
          {found.list.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onJump(m.id)} className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-white/[0.04]">
                <span className="shrink-0 text-xs text-muted-foreground tabular">{fullDate(m.createdAt)}</span>
                <span className="truncate">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Bubble({
  m,
  mine,
  myId,
  showAvatar,
  grouped,
  bubble,
  quoted,
  quotedName,
  seenBy,
  group,
  showStatus,
  editing,
  canReact,
  onReact,
  onReply,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onJump,
  onRetry,
  onDiscard,
  onDelete,
  onCopy,
}: {
  m: DirectMessage
  mine: boolean
  myId: string | null
  showAvatar: boolean
  grouped: boolean
  bubble: React.CSSProperties
  quoted?: DirectMessage
  quotedName?: string
  seenBy?: string[]
  group: boolean
  showStatus: boolean
  editing: boolean
  canReact: boolean
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onSaveEdit: (body: string) => void
  onCancelEdit: () => void
  onJump: (id: string) => void
  onRetry: () => void
  onDiscard: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  const sticker = m.kind === "sticker" ? stickerOf(m.body) : null
  const seen = seenBy !== undefined
  const counts = new Map<string, { n: number; me: boolean }>()
  for (const r of m.reactions) {
    const c = counts.get(r.emoji) ?? { n: 0, me: false }
    counts.set(r.emoji, { n: c.n + 1, me: c.me || r.userId === myId })
  }
  return (
    <div className={cn("group/bubble flex max-w-full items-end gap-1.5", mine ? "flex-row-reverse self-end" : "self-start")}>
      {showAvatar && <span className="w-8 shrink-0">{!grouped && <ChatAvatar id={m.authorId} size={28} />}</span>}
      <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
        {m.replyTo && (
          <button
            type="button"
            onClick={() => m.replyTo && onJump(m.replyTo)}
            className="mb-0.5 flex max-w-[min(30rem,75vw)] items-center gap-1.5 truncate rounded-lg border-l-2 border-ion/50 bg-white/[0.03] px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <CornerUpLeftIcon aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{quoted ? `${quotedName}: ${quoted.body.replace(/\s+/g, " ")}` : "A message further back"}</span>
          </button>
        )}
        {sticker && !editing ? (
          <div className={cn(m.status === "sending" && "opacity-70")}>
            <Sticker id={sticker} size={104} />
          </div>
        ) : (
          <div
            style={mine && !m.status ? bubble : mine ? { ...bubble, opacity: m.status === "sending" ? 0.7 : 1 } : undefined}
            className={cn(
              "max-w-[min(34rem,80vw)] rounded-2xl px-3.5 py-2 md:max-w-[34rem]",
              mine ? "rounded-br-md text-foreground" : "rounded-bl-md bg-white/[0.06]",
              m.status === "failed" && "ring-1 ring-destructive/50"
            )}
          >
            {editing ? (
              <EditBox initial={m.body} onSave={onSaveEdit} onCancel={onCancelEdit} />
            ) : m.kind === "me" ? (
              <p className="text-[15px] text-foreground/85 italic">
                <MessageBody text={m.body} />
              </p>
            ) : (
              <MessageBody text={m.body} />
            )}
            <Attachments list={m.attachments} />
            <div className={cn("mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground", mine ? "justify-end" : "justify-start")}>
              {m.editedAt && <span title={`Edited ${fullDate(m.editedAt)}`}>edited ·</span>}
              <time dateTime={m.createdAt} title={fullDate(m.createdAt)} className="tabular">
                {clock(m.createdAt)}
              </time>
              {mine && m.status === "sending" && <span>· Sending…</span>}
              {mine && !m.status && (showStatus || seen) && (
                <span className={cn("inline-flex items-center gap-0.5", seen && "text-ion")}>
                  {seen ? <CheckCheckIcon aria-hidden className="size-3.5" /> : <CheckIcon aria-hidden className="size-3.5" />}
                  {seen ? (group && seenBy?.length ? `Seen by ${seenBy.slice(0, 3).join(", ")}${seenBy.length > 3 ? ` +${seenBy.length - 3}` : ""}` : "Seen") : "Sent"}
                </span>
              )}
            </div>
            {m.status === "failed" && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive">
                <span>{m.error ?? "Not sent."}</span>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline">
                  <RotateCwIcon aria-hidden className="size-3" /> Retry
                </button>
                <button type="button" onClick={onDiscard} className="underline">
                  Discard
                </button>
              </div>
            )}
          </div>
        )}
        {counts.size > 0 && (
          <ul className={cn("-mt-1 flex flex-wrap gap-1", mine ? "justify-end pr-1" : "pl-1")} aria-label="Reactions">
            {[...counts].map(([e, c]) => (
              <li key={e}>
                <button
                  type="button"
                  disabled={!canReact}
                  onClick={() => onReact(e)}
                  aria-pressed={c.me}
                  className={cn("pressable inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tabular", c.me ? "border-ion/50 bg-ion/15" : "border-border bg-background")}
                >
                  <span>{e}</span>
                  {c.n > 1 && <span>{c.n}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!m.status && !editing && (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-70">
          {canReact && (
            <EmojiPicker
              onPick={onReact}
              side="top"
              align={mine ? "end" : "start"}
              label="React"
              trigger={
                <button type="button" aria-label="React" title="React" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                  <SmilePlusIcon aria-hidden className="size-3.5" />
                </button>
              }
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label="Message options" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                  <MoreHorizontalIcon aria-hidden className="size-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align={mine ? "end" : "start"} className="w-48">
              {canReact && (
                <div className="flex justify-between gap-0.5 px-1 py-1">
                  {QUICK.map((e) => (
                    <DropdownMenuItem key={e} className="grid size-8 place-items-center p-0 text-base" onClick={() => onReact(e)} aria-label={`React ${e}`}>
                      {e}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
              <DropdownMenuItem onClick={onReply}>
                <CornerUpLeftIcon aria-hidden /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}>
                <ClipboardIcon aria-hidden /> Copy text
              </DropdownMenuItem>
              {mine && canReact && m.kind === "text" && (
                <DropdownMenuItem onClick={onEdit}>
                  <PencilIcon aria-hidden /> Edit
                </DropdownMenuItem>
              )}
              {mine && (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2Icon aria-hidden /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="flex min-w-[min(18rem,70vw)] flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() && text.trim() !== initial) onSave(text)
        else onCancel()
      }}
    >
      <textarea
        autoFocus
        value={text}
        rows={Math.min(6, text.split("\n").length + 1)}
        maxLength={MAX_DM}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel()
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
        aria-label="Edit message"
        className="w-full resize-none rounded-lg border border-input bg-background/60 px-2 py-1.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs">
          Save
        </Button>
      </div>
    </form>
  )
}
