"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ArrowLeftIcon, BanIcon, CheckCheckIcon, CheckIcon, MoreHorizontalIcon, RotateCwIcon, SendHorizontalIcon, Trash2Icon } from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { clock, dayKey, dayLabel, fullDate } from "@/components/chat/format"
import { MessageBody } from "@/components/chat/message-body"
import { useNow } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { localMember } from "@/lib/chat"
import {
  deleteDirectMessage,
  getConversation,
  listDirectMessages,
  markConversationRead,
  MAX_DM,
  sendDirectMessage,
  setBlocked,
  subscribeConversation,
  validateMessage,
  type Conversation,
  type DirectMessage,
} from "@/lib/messages"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const NEAR_BOTTOM = 80
const noop = () => () => {}

/** One conversation: messages grouped by day, "Seen" under your latest read message, and the message box. */
export function ConversationView({ id }: { id: string }) {
  const session = useSession()
  const reduce = useReducedMotion()
  const now = useNow()
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
  const [typingUntil, setTypingUntil] = useState(0)
  const [typingVisible, setTypingVisible] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const sub = useRef<ReturnType<typeof subscribeConversation> | null>(null)

  // The conversation and its first page.
  useEffect(() => {
    if (!ready) return
    if (live && !session.user) {
      setConv(null)
      return
    }
    let stale = false
    Promise.all([getConversation(id), listDirectMessages(id)])
      .then(([c, page]) => {
        if (stale) return
        setConv(c)
        setOtherReadAt(c?.otherReadAt ?? null)
        setMessages(page.messages)
        setMore(page.more)
        setStatus("ready")
        if (c) markConversationRead(id).catch(() => {})
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
  useEffect(() => {
    if (!ready || !myId || !conv) return
    const handle = subscribeConversation(id, myId, {
      onMessage: (m) => {
        setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m].sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || a.createdAt.localeCompare(b.createdAt))))
        if (m.authorId !== myId) {
          setTypingUntil(0)
          if (document.visibilityState === "visible") markConversationRead(id).catch(() => {})
        }
      },
      onDelete: (mid) => setMessages((list) => (list.some((m) => m.id === mid) ? list.filter((m) => m.id !== mid) : list)),
      onRead: (at) => setOtherReadAt(at),
      onTyping: () => setTypingUntil(Date.now() + 4000),
    })
    sub.current = handle
    const onVisible = () => document.visibilityState === "visible" && markConversationRead(id).catch(() => {})
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      handle.unsubscribe()
      sub.current = null
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [id, myId, ready, conv])

  // "Typing…" fades four seconds after the last keystroke on the other side.
  useEffect(() => {
    if (!typingUntil) {
      setTypingVisible(false)
      return
    }
    setTypingVisible(true)
    const t = setTimeout(() => setTypingVisible(false), Math.max(0, typingUntil - Date.now()))
    return () => clearTimeout(t)
  }, [typingUntil])

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
  }, [messages, typingVisible, status])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.status)
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await listDirectMessages(id, { before: oldest.createdAt })
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

  const send = useCallback(
    async (body: string, retryOf?: string) => {
      if (!myId) return
      const temp: DirectMessage = { id: retryOf ?? `pending-${crypto.randomUUID()}`, threadId: id, authorId: myId, body, createdAt: new Date().toISOString(), status: "sending" }
      atBottom.current = true
      setMessages((list) => [...list.filter((m) => m.id !== temp.id), temp])
      setError("")
      try {
        const saved = await sendDirectMessage(id, body)
        setMessages((list) => {
          const rest = list.filter((m) => m.id !== temp.id && m.id !== saved.id)
          return [...rest.filter((m) => !m.status), saved, ...rest.filter((m) => m.status)].sort(
            (a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || a.createdAt.localeCompare(b.createdAt)
          )
        })
      } catch (e) {
        setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, status: "failed", error: (e as Error).message } : m)))
      }
    },
    [id, myId]
  )

  async function remove(m: DirectMessage) {
    const before = messages
    setMessages((list) => list.filter((x) => x.id !== m.id))
    try {
      await deleteDirectMessage(m)
      setNotice("Message deleted.")
    } catch (e) {
      setMessages(before)
      setError((e as Error).message)
    }
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

  // The latest of your messages the other member has read.
  const seenId = useMemo(() => {
    if (!otherReadAt || !myId) return null
    const mine = messages.filter((m) => m.authorId === myId && !m.status && m.createdAt <= otherReadAt)
    return mine.at(-1)?.id ?? null
  }, [messages, otherReadAt, myId])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <Link href="/messages" aria-label="Back to conversations" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground md:hidden">
          <ArrowLeftIcon aria-hidden className="size-4" />
        </Link>
        {other ? <ChatAvatar id={other.id} name={other.name} size={32} /> : <Skeleton className="size-8 rounded-full" />}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-sm font-semibold">{other?.name ?? <Skeleton className="h-4 w-32" />}</h2>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {typingVisible ? <span className="text-ion">typing…</span> : conv?.blocked ? "Blocked" : other?.handle ? `@${other.handle}` : "Direct message"}
          </p>
        </div>
        {conv && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Conversation options" />}>
              <MoreHorizontalIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {other?.handle && (
                <DropdownMenuItem render={<Link href={`/people/${other.handle}`} />}>View profile</DropdownMenuItem>
              )}
              <DropdownMenuItem variant={conv.blocked ? "default" : "destructive"} onClick={toggleBlock}>
                <BanIcon aria-hidden /> {conv.blocked ? "Unblock" : "Block"} {other?.name.split(/\s+/)[0]}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

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
          <ol className="flex flex-col gap-1" aria-label={`Messages with ${other?.name ?? "this member"}`}>
            {more && (
              <li className="mb-2 flex justify-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </Button>
              </li>
            )}
            {messages.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                {other && <ChatAvatar id={other.id} name={other.name} size={48} />}
                <p>This is the start of your conversation with {other?.name ?? "this member"}. Say hello.</p>
              </li>
            )}
            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const mine = m.authorId === myId
                const newDay = now !== null && (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt))
                const grouped = prev && prev.authorId === m.authorId && !newDay && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000
                return (
                  <motion.li
                    key={m.id}
                    layout={false}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className={cn("flex flex-col", grouped ? "mt-0.5" : "mt-3")}
                  >
                    {newDay && (
                      <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span aria-hidden className="h-px flex-1 bg-border" />
                        {dayLabel(m.createdAt, now)}
                        <span aria-hidden className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <Bubble
                      m={m}
                      mine={mine}
                      seen={m.id === seenId}
                      showStatus={mine && m.id === lastMineId}
                      onRetry={() => send(m.body, m.id)}
                      onDiscard={() => setMessages((list) => list.filter((x) => x.id !== m.id))}
                      onDelete={() => remove(m)}
                    />
                  </motion.li>
                )
              })}
            </AnimatePresence>
            {typingVisible && (
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
        <p role="alert" className="mx-3 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:mx-6">
          {error}
        </p>
      )}
      <span role="status" className="sr-only">
        {notice}
      </span>

      {conv?.blocked ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>You blocked {other?.name}. Unblock them to send messages.</span>
          <Button variant="secondary" size="sm" onClick={toggleBlock}>
            Unblock
          </Button>
        </div>
      ) : conv ? (
        // Rendered once the conversation has loaded in the browser, so the saved draft can be read straight away.
        <DmComposer key={id} id={id} disabled={status !== "ready"} onSend={(b) => send(b)} onTyping={() => sub.current?.typing()} name={other?.name ?? ""} />
      ) : (
        <div aria-hidden className="h-[4.75rem] shrink-0 border-t border-border" />
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">{children}</div>
}

function Bubble({
  m,
  mine,
  seen,
  showStatus,
  onRetry,
  onDiscard,
  onDelete,
}: {
  m: DirectMessage
  mine: boolean
  seen: boolean
  showStatus: boolean
  onRetry: () => void
  onDiscard: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn("group flex max-w-full items-end gap-1.5", mine ? "flex-row-reverse self-end" : "self-start")}>
      <div
        className={cn(
          "max-w-[min(34rem,85vw)] rounded-2xl px-3.5 py-2 md:max-w-[34rem]",
          mine ? "rounded-br-md bg-ion/20 text-foreground ring-1 ring-ion/25" : "rounded-bl-md bg-white/[0.06]",
          m.status === "sending" && "opacity-70",
          m.status === "failed" && "ring-1 ring-destructive/50"
        )}
      >
        <MessageBody text={m.body} />
        <div className={cn("mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground", mine ? "justify-end" : "justify-start")}>
          <time dateTime={m.createdAt} title={fullDate(m.createdAt)} className="tabular">
            {clock(m.createdAt)}
          </time>
          {mine && m.status === "sending" && <span>· Sending…</span>}
          {mine && !m.status && (showStatus || seen) && (
            <span className={cn("inline-flex items-center gap-0.5", seen && "text-ion")}>
              {seen ? <CheckCheckIcon aria-hidden className="size-3.5" /> : <CheckIcon aria-hidden className="size-3.5" />}
              {seen ? "Seen" : "Sent"}
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
      {mine && !m.status && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete this message"
          title="Delete"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted/50 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:none)]:opacity-60"
        >
          <Trash2Icon aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  )
}

const DRAFT = (id: string) => `nexverse-dm-draft:${id}`

/** Enter sends, Shift+Enter starts a new line. Unsent text is kept per conversation for this tab. */
function DmComposer({ id, name, disabled, onSend, onTyping }: { id: string; name: string; disabled: boolean; onSend: (body: string) => void; onTyping: () => void }) {
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(DRAFT(id)) ?? ""
    } catch {
      return ""
    }
  })
  const [problem, setProblem] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)
  const near = draft.length > MAX_DM - 300

  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(DRAFT(id), draft)
      else sessionStorage.removeItem(DRAFT(id))
    } catch {}
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft, id])

  function submit() {
    const p = validateMessage(draft)
    if (p) {
      setProblem(p)
      return
    }
    onSend(draft.trim())
    setDraft("")
    setProblem("")
    ref.current?.focus()
  }

  return (
    <form
      className="shrink-0 border-t border-border p-2 md:p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-input bg-background/60 py-1.5 pr-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          disabled={disabled}
          maxLength={MAX_DM + 200}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value) onTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label={name ? `Message ${name}` : "Message"}
          aria-invalid={Boolean(problem) || draft.length > MAX_DM}
          placeholder={name ? `Message ${name.split(/\s+/)[0]}` : "Message"}
          className="max-h-44 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button type="submit" size="icon-sm" disabled={disabled || !draft.trim() || draft.length > MAX_DM} aria-label="Send">
          <SendHorizontalIcon aria-hidden />
        </Button>
      </div>
      <div className="flex justify-between px-2 pt-1 text-[11px] text-muted-foreground">
        <span className={cn(problem && "text-destructive")}>{problem || "Enter to send, Shift+Enter for a new line"}</span>
        {near && <span className={cn("tabular", draft.length > MAX_DM && "text-destructive")}>{MAX_DM - draft.length}</span>}
      </div>
    </form>
  )
}
