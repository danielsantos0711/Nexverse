import type { RealtimeChannel } from "@supabase/supabase-js"
import { useEffect, useSyncExternalStore } from "react"
import { localMember } from "@/lib/chat"
import { getPerson } from "@/lib/data"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * Direct messages: one-to-one conversations between members, with unread counts, read receipts, a typing
 * notice and blocking. With a database connected this reads and writes Supabase (conversations are opened
 * by the start_dm() function, so only members can message and only within the rate limits), and new messages
 * and read marks arrive over Realtime. Without one, conversations with the sample people are kept in this
 * browser so the screens can be tried; nobody answers.
 */

export const MAX_DM = 4000
export const DM_PAGE = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_ID = /^local-[a-z0-9-]{1,60}$/
export const isUuid = (s: string) => UUID.test(s)
/** A conversation id: a uuid with a database, "local-<who>" without one. */
export const isConversationId = (s: string) => UUID.test(s) || LOCAL_ID.test(s)

export type Correspondent = { id: string; name: string; handle?: string }

export type Conversation = {
  id: string
  other: Correspondent
  lastMessageAt: string | null
  lastBody: string
  lastFromMe: boolean
  unread: number
  /** When the other side last read the conversation; your messages up to then show as "Seen". */
  otherReadAt: string | null
  /** You blocked them. */
  blocked: boolean
  local: boolean
}

export type DirectMessage = {
  id: string
  threadId: string
  authorId: string
  body: string
  createdAt: string
  /** Only on messages this browser is still sending, or failed to send. */
  status?: "sending" | "failed"
  error?: string
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (/violates row-level security/.test(error.message)) throw new Error("You cannot write in this conversation.")
  if (/JWT|not authenticated/i.test(error.message)) throw new Error("Your session ran out. Sign in again.")
  if (/schema cache|does not exist/.test(error.message)) throw new Error("Direct messages are still being switched on for this copy of Nexverse. Try again soon.")
  throw new Error(error.message)
}

async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await me()
  if (!id) throw new Error("Sign in to send messages. It takes an email address and nothing else.")
  return id
}

export function validateMessage(body: string): string | null {
  if (!body.trim()) return "Write a message first."
  if (body.length > MAX_DM) return `Messages are up to ${MAX_DM.toLocaleString("en")} characters.`
  return null
}

// A gentle limit in the browser too, so a stuck key doesn't hit the database's limit (10 in 10 seconds).
const sentAt: number[] = []
function throttle() {
  const now = Date.now()
  while (sentAt.length && now - sentAt[0] > 10_000) sentAt.shift()
  if (sentAt.length >= 10) throw new Error("You are sending messages too quickly. Wait a few seconds and try again.")
  sentAt.push(now)
}

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const THREADS_KEY = "nexverse-dm-threads"
const messagesKey = (id: string) => `nexverse-dm:${id}`

type LocalThread = { id: string; other: Correspondent; createdAt: string; readAt: string | null; blocked: boolean }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error("This browser would not save that. Allow site data and try again.")
  }
}

const localThreads = () => readJSON<LocalThread[]>(THREADS_KEY, [])
const localMessages = (id: string) => readJSON<DirectMessage[]>(messagesKey(id), [])

/** Without a database, who you can message: the sample people, by handle, or anyone you named. */
function localCorrespondent(idOrHandle: string, name?: string): Correspondent {
  const p = getPerson(idOrHandle)
  return p ? { id: p.handle, name: p.name, handle: p.handle } : { id: idOrHandle, name: name?.trim() || "Member" }
}

const localThreadId = (otherId: string) =>
  `local-${otherId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 60)}`

function toLocalConversation(t: LocalThread): Conversation {
  const list = localMessages(t.id)
  const last = list[list.length - 1]
  const you = localMember().id
  return {
    id: t.id,
    other: t.other,
    lastMessageAt: last?.createdAt ?? null,
    lastBody: last?.body ?? "",
    lastFromMe: last?.authorId === you,
    unread: list.filter((m) => m.authorId !== you && (!t.readAt || m.createdAt > t.readAt)).length,
    otherReadAt: null,
    blocked: t.blocked,
    local: true,
  }
}

// ─── Conversations ──────────────────────────────────────────────────────────────────────────────────────────

type InboxRow = {
  id: string
  other_id: string
  other_name: string
  last_message_at: string | null
  last_body: string | null
  last_author: string | null
  unread: number
  other_read_at: string | null
  blocked: boolean
}

let inboxCache: Conversation[] | null = null
/** Whose inbox the cache holds, so a different account signing in on this browser never sees it. */
let inboxOwner: string | null = null
/** The last inbox this page loaded, for drawing the list at once when you come back to it. */
export const cachedConversations = () => (inboxOwner !== null && inboxOwner === cacheViewer ? inboxCache : null)
/** The member the page currently belongs to, kept in step with the session. */
let cacheViewer: string | null = null

/** Called when the signed-in member changes: drops another account's cached inbox at once. */
export function setInboxViewer(userId: string | null) {
  cacheViewer = userId
  if (inboxOwner !== userId) {
    inboxCache = null
    inboxOwner = null
  }
}

/** Your conversations, most recent first. Empty when signed out. */
export async function listConversations(): Promise<Conversation[]> {
  const client = db()
  if (!client) {
    const list = localThreads()
      .map(toLocalConversation)
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    inboxCache = list
    inboxOwner = cacheViewer = "local"
    publishUnread(list)
    return list
  }
  const userId = await me()
  setInboxViewer(userId ?? null)
  if (!userId) {
    inboxCache = []
    publishUnread([])
    return []
  }
  const { data, error } = await client.rpc("dm_inbox")
  fail(error)
  const list = (data as InboxRow[]).map((r) => ({
    id: r.id,
    other: { id: r.other_id, name: r.other_name },
    lastMessageAt: r.last_message_at,
    lastBody: r.last_body ?? "",
    lastFromMe: r.last_author === userId,
    unread: Number(r.unread) || 0,
    otherReadAt: r.other_read_at,
    blocked: r.blocked,
    local: false,
  }))
  if (cacheViewer !== userId) return list
  inboxCache = list
  inboxOwner = userId
  publishUnread(list)
  return list
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const known = cachedConversations()?.find((c) => c.id === id)
  if (known) return known
  const list = await listConversations()
  return list.find((c) => c.id === id) ?? null
}

/** Opens your conversation with a member (or finds the one you already have) and returns its id. */
export async function startConversation(memberId: string, name?: string): Promise<string> {
  const client = db()
  if (!client) {
    const other = localCorrespondent(memberId, name)
    const id = localThreadId(other.id)
    const all = localThreads()
    if (!all.some((t) => t.id === id)) {
      writeJSON(THREADS_KEY, [{ id, other, createdAt: new Date().toISOString(), readAt: null, blocked: false } satisfies LocalThread, ...all].slice(0, 100))
    }
    return id
  }
  const userId = await requireMe()
  if (!isUuid(memberId)) throw new Error("That member could not be found.")
  if (memberId === userId) throw new Error("That is you. Pick someone else to message.")
  const { data, error } = await client.rpc("start_dm", { other: memberId })
  fail(error)
  return data as string
}

// ─── Messages ───────────────────────────────────────────────────────────────────────────────────────────────

const MESSAGE_COLUMNS = "id, thread_id, author_id, body, created_at"
type MessageRow = { id: string; thread_id: string; author_id: string; body: string; created_at: string }
const fromRow = (r: MessageRow): DirectMessage => ({ id: r.id, threadId: r.thread_id, authorId: r.author_id, body: r.body, createdAt: r.created_at })

/** A page of a conversation, oldest first. Pass the oldest message you have as `before` to go further back. */
export async function listDirectMessages(threadId: string, { before, limit = DM_PAGE }: { before?: string; limit?: number } = {}) {
  const client = db()
  if (!client) {
    const all = localMessages(threadId)
    const older = before ? all.filter((m) => m.createdAt < before) : all
    return { messages: older.slice(-limit), more: older.length > limit }
  }
  let q = client.from("dm_messages").select(MESSAGE_COLUMNS).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(limit + 1)
  if (before) q = q.lt("created_at", before)
  const { data, error } = await q
  fail(error)
  const rows = data as MessageRow[]
  return { messages: rows.slice(0, limit).reverse().map(fromRow), more: rows.length > limit }
}

export async function sendDirectMessage(threadId: string, body: string): Promise<DirectMessage> {
  const problem = validateMessage(body)
  if (problem) throw new Error(problem)
  throttle()
  const client = db()
  if (!client) {
    const t = localThreads().find((x) => x.id === threadId)
    if (!t) throw new Error("This conversation is gone.")
    if (t.blocked) throw new Error("You blocked this member. Unblock them to send messages.")
    const m: DirectMessage = { id: crypto.randomUUID(), threadId, authorId: localMember().id, body, createdAt: new Date().toISOString() }
    writeJSON(messagesKey(threadId), [...localMessages(threadId), m].slice(-500))
    localBus()?.postMessage({ kind: "message", message: m } satisfies LocalEvent)
    return m
  }
  await requireMe()
  const { data, error } = await client.from("dm_messages").insert({ thread_id: threadId, body }).select(MESSAGE_COLUMNS).single()
  fail(error)
  return fromRow(data as MessageRow)
}

export async function deleteDirectMessage(m: DirectMessage) {
  const client = db()
  if (!client) {
    writeJSON(
      messagesKey(m.threadId),
      localMessages(m.threadId).filter((x) => x.id !== m.id)
    )
    localBus()?.postMessage({ kind: "delete", threadId: m.threadId, id: m.id } satisfies LocalEvent)
    return
  }
  const { error } = await client.from("dm_messages").delete().eq("id", m.id)
  fail(error)
}

/** Marks a conversation read up to now. The other member sees your latest message from them as "Seen". */
export async function markConversationRead(threadId: string) {
  // The badge drops at once; the database catches up.
  if (inboxCache) {
    inboxCache = inboxCache.map((c) => (c.id === threadId ? { ...c, unread: 0 } : c))
    publishUnread(inboxCache)
  }
  const client = db()
  if (!client) {
    const all = localThreads()
    if (all.some((t) => t.id === threadId)) writeJSON(THREADS_KEY, all.map((t) => (t.id === threadId ? { ...t, readAt: new Date().toISOString() } : t)))
    return
  }
  if (!(await me())) return
  const { error } = await client.rpc("mark_dm_read", { thread: threadId })
  fail(error)
}

// ─── Blocking ───────────────────────────────────────────────────────────────────────────────────────────────

export async function setBlocked(c: Conversation, blocked: boolean) {
  const client = db()
  if (!client) {
    writeJSON(
      THREADS_KEY,
      localThreads().map((t) => (t.id === c.id ? { ...t, blocked } : t))
    )
  } else {
    const userId = await requireMe()
    const { error } = blocked
      ? await client.from("member_blocks").upsert({ blocked_id: c.other.id }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true })
      : await client.from("member_blocks").delete().eq("blocker_id", userId).eq("blocked_id", c.other.id)
    fail(error)
  }
  if (inboxCache) inboxCache = inboxCache.map((x) => (x.id === c.id ? { ...x, blocked } : x))
}

// ─── Live updates ───────────────────────────────────────────────────────────────────────────────────────────

type LocalEvent = { kind: "message"; message: DirectMessage } | { kind: "delete"; threadId: string; id: string }

let bus: BroadcastChannel | null | undefined
const localHandlers = new Set<(e: LocalEvent) => void>()
function localBus() {
  if (bus !== undefined) return bus
  bus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("nexverse-dm")
  bus?.addEventListener("message", (e) => {
    for (const h of localHandlers) h(e.data as LocalEvent)
  })
  return bus
}

export type ConversationHandlers = {
  onMessage?: (m: DirectMessage) => void
  onDelete?: (id: string) => void
  /** The other member read the conversation up to this time. */
  onRead?: (at: string) => void
  onTyping?: () => void
}

/** The conversation open on screen, so arriving messages there are read at once instead of counted as unread. */
let openThread: string | null = null

/**
 * Listens to one conversation: new and deleted messages, the other member's read mark and their typing.
 * Returns a function that sends "I'm typing" and one that stops listening.
 */
export function subscribeConversation(threadId: string, myId: string | null, handlers: ConversationHandlers) {
  openThread = threadId
  const client = db()
  if (!client) {
    localBus()
    const h = (e: LocalEvent) => {
      if (e.kind === "message" && e.message.threadId === threadId) handlers.onMessage?.(e.message)
      if (e.kind === "delete" && e.threadId === threadId) handlers.onDelete?.(e.id)
    }
    localHandlers.add(h)
    return {
      typing() {},
      unsubscribe() {
        localHandlers.delete(h)
        if (openThread === threadId) openThread = null
      },
    }
  }
  let joined = false
  const channel: RealtimeChannel = client
    .channel(`dm:${threadId}`, { config: { broadcast: { self: false } } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, (p) =>
      handlers.onMessage?.(fromRow(p.new as MessageRow))
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_messages" }, (p) => {
      const id = (p.old as { id?: string }).id
      if (id) handlers.onDelete?.(id)
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_threads", filter: `id=eq.${threadId}` }, (p) => {
      const t = p.new as { user_a: string; a_read_at: string | null; b_read_at: string | null }
      const at = t.user_a === myId ? t.b_read_at : t.a_read_at
      if (at) handlers.onRead?.(at)
    })
    // Only "someone is typing" travels on this channel: no text, no names.
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if ((payload as { from?: string }).from !== myId) handlers.onTyping?.()
    })
    .subscribe((status) => {
      joined = status === "SUBSCRIBED"
    })
  let last = 0
  return {
    typing() {
      if (!joined || !myId || Date.now() - last < 2500) return
      last = Date.now()
      channel.send({ type: "broadcast", event: "typing", payload: { from: myId } })
    },
    unsubscribe() {
      client.removeChannel(channel)
      if (openThread === threadId) openThread = null
    },
  }
}

// ─── Unread count, shared by the header badge and the inbox ─────────────────────────────────────────────────

let unread = 0
const unreadListeners = new Set<() => void>()
const inboxListeners = new Set<() => void>()

function publishUnread(list: Conversation[]) {
  const next = list.reduce((n, c) => n + (c.blocked ? 0 : c.unread), 0)
  for (const l of inboxListeners) l()
  if (next === unread) return
  unread = next
  for (const l of unreadListeners) l()
}

/** Called when the inbox changes in a way the open list should show (a new message, a read mark). */
export function onInboxChange(listener: () => void) {
  inboxListeners.add(listener)
  return () => {
    inboxListeners.delete(listener)
  }
}

let inbox: { userId: string; channel: RealtimeChannel; refs: number } | null = null
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function refreshSoon() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => listConversations().catch(() => {}), 300)
}

/** One Realtime channel per page for "a message arrived in one of your conversations". */
function openInbox(userId: string) {
  const client = db()
  if (!client) return () => {}
  if (inbox && inbox.userId !== userId) {
    client.removeChannel(inbox.channel)
    inbox = null
  }
  if (!inbox) {
    const channel = client
      .channel(`dm-inbox:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (p) => {
        const row = p.new as MessageRow
        if (row.author_id !== userId && row.thread_id === openThread && document.visibilityState === "visible") return
        refreshSoon()
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_threads" }, () => refreshSoon())
      .subscribe()
    inbox = { userId, channel, refs: 0 }
  }
  const entry = inbox
  entry.refs++
  return () => {
    if (--entry.refs > 0) return
    setTimeout(() => {
      if (entry.refs === 0 && inbox === entry) {
        client.removeChannel(entry.channel)
        inbox = null
      }
    }, 400)
  }
}

let loadedFor: string | null | undefined

/**
 * How many messages you have not read, across every conversation. Starts at 0, loads once a member is signed
 * in, and stays current over Realtime. For the header badge.
 */
export function useUnreadMessages(): number {
  const { ready, user } = useSession()
  const userId = live ? (user?.id ?? null) : "local"
  useEffect(() => {
    if (live && !ready) return
    setInboxViewer(userId)
    if (!userId) {
      if (unread !== 0) {
        unread = 0
        for (const l of unreadListeners) l()
      }
      return
    }
    if (loadedFor !== userId) {
      loadedFor = userId
      listConversations().catch(() => {})
    }
    return live ? openInbox(userId) : undefined
  }, [ready, userId])
  return useSyncExternalStore(
    (l) => {
      unreadListeners.add(l)
      return () => {
        unreadListeners.delete(l)
      }
    },
    () => unread,
    () => 0
  )
}

/** Keeps the inbox channel open while a messages page is on screen. */
export function useInboxChannel() {
  const { ready, user } = useSession()
  useEffect(() => {
    if (!live || !ready || !user) return
    return openInbox(user.id)
  }, [ready, user])
}
