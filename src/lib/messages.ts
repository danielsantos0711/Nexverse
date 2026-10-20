import type { RealtimeChannel } from "@supabase/supabase-js"
import { useEffect, useSyncExternalStore } from "react"
import { localMember } from "@/lib/chat"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * Direct messages: one-to-one conversations and small groups (up to 20 people) between members, with unread
 * counts, read receipts, a typing notice, reactions, replies, edits, pictures and blocking. Each member keeps
 * their own settings per conversation (pinned, muted, archived) and decides on message requests from people
 * they do not follow. The groups, reactions and settings come with …_social.sql; a database without it keeps
 * the one-to-one messages working as before. With a database connected this reads and writes Supabase (conversations are opened
 * by the start_dm() function, so only members can message and only within the rate limits), and new messages
 * and read marks arrive over Realtime. Without one there are no other members to write to; the inbox only shows
 * conversations an earlier version of this browser kept locally.
 */

export const MAX_DM = 4000
export const DM_PAGE = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_ID = /^local-[a-z0-9-]{1,60}$/
export const isUuid = (s: string) => UUID.test(s)
/** A conversation id: a uuid with a database, "local-<who>" without one. */
export const isConversationId = (s: string) => UUID.test(s) || LOCAL_ID.test(s)

export type Correspondent = { id: string; name: string; handle?: string }

export type DmAttachment = { url: string; alt: string; w?: number; h?: number }
export type DmReaction = { emoji: string; userId: string }

export type Conversation = {
  id: string
  /** "group": a named conversation of up to 20 members (dm_groups). */
  kind: "direct" | "group"
  /** The group's name, or the other member's. */
  title: string
  emoji: string | null
  memberCount: number
  /** For a group: who wrote the latest message. */
  lastAuthorName: string | null
  /** Your own settings for this conversation. */
  pinned: boolean
  muted: boolean
  archived: boolean
  /** Someone you do not follow wrote first and you have not answered or accepted yet. */
  request: boolean
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
  kind: "text" | "me" | "sticker" | "system"
  replyTo: string | null
  attachments: DmAttachment[]
  editedAt: string | null
  reactions: DmReaction[]
  /** Only on messages this browser is still sending, or failed to send. */
  status?: "sending" | "failed"
  error?: string
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (/violates row-level security/.test(error.message))
    throw new Error("You cannot write in this conversation. Check that you are signed in; if your account is paused, sending stays off until the pause ends (your notifications say why).")
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
const localMessages = (id: string) => readJSON<DirectMessage[]>(messagesKey(id), []).map(normalise)

/** Messages saved by an older version of this browser lack the newer fields. */
function normalise(m: Partial<DirectMessage> & Pick<DirectMessage, "id" | "threadId" | "authorId" | "body" | "createdAt">): DirectMessage {
  return { kind: "text", replyTo: null, attachments: [], editedAt: null, reactions: [], ...m } as DirectMessage
}

/** Without a database, the other side of a conversation is only an id and the name you gave it. */
function localCorrespondent(id: string, name?: string): Correspondent {
  return { id, name: name?.trim() || "Member" }
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
    kind: "direct",
    title: t.other.name,
    emoji: null,
    memberCount: 2,
    lastAuthorName: null,
    pinned: false,
    muted: false,
    archived: false,
    request: false,
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

type InboxV2Row = InboxRow & {
  kind: "direct" | "group"
  title: string | null
  emoji: string | null
  other_handle: string | null
  member_count: number | null
  last_author_name: string | null
  pinned: boolean
  muted: boolean
  archived: boolean
  request: boolean
}

/** Whether the database has groups, reactions and settings (…_social.sql). Learned on the first inbox load. */
let extras: boolean | null = null
export const dmExtras = () => extras === true
const missing = (e: { code?: string; message: string } | null) => Boolean(e && (["42P01", "42883", "42703", "PGRST202", "PGRST205", "PGRST204"].includes(e.code ?? "") || /does not exist|schema cache|Could not find/i.test(e.message)))

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
  let rows: InboxV2Row[]
  const v2 = extras === false ? null : await client.rpc("dm_inbox_v2")
  if (v2 && !v2.error) {
    extras = true
    rows = v2.data as InboxV2Row[]
    if (inbox && inbox.userId === userId) attachGroups(inbox)
  } else {
    if (v2?.error && !missing(v2.error)) fail(v2.error)
    extras = false
    const { data, error } = await client.rpc("dm_inbox")
    fail(error)
    rows = (data as InboxRow[]).map((r) => ({ ...r, kind: "direct", title: null, emoji: null, other_handle: null, member_count: 2, last_author_name: null, pinned: false, muted: false, archived: false, request: false }))
  }
  const list: Conversation[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind === "group" ? "group" : "direct",
    title: r.title || r.other_name || "Member",
    emoji: r.emoji,
    memberCount: Number(r.member_count) || 2,
    lastAuthorName: r.last_author_name,
    pinned: Boolean(r.pinned),
    muted: Boolean(r.muted),
    archived: Boolean(r.archived),
    request: Boolean(r.request),
    other: { id: r.other_id ?? r.id, name: r.other_name ?? r.title ?? "Member", handle: r.other_handle ?? undefined },
    lastMessageAt: r.last_message_at,
    lastBody: r.last_body ?? "",
    lastFromMe: r.last_author === userId,
    unread: Number(r.unread) || 0,
    otherReadAt: r.other_read_at,
    blocked: Boolean(r.blocked),
    local: false,
  }))
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
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

const BASE_COLUMNS = "id, thread_id, author_id, body, created_at"
const EXTRA_COLUMNS = ", kind, reply_to, attachments, edited_at"
const GROUP_COLUMNS = "id, group_id, author_id, body, created_at, kind, reply_to, attachments, edited_at"
type MessageRow = {
  id: string
  thread_id?: string
  group_id?: string
  author_id: string
  body: string
  created_at: string
  kind?: DirectMessage["kind"]
  reply_to?: string | null
  attachments?: DmAttachment[]
  edited_at?: string | null
}
const fromRow = (r: MessageRow): DirectMessage => ({
  id: r.id,
  threadId: r.thread_id ?? r.group_id ?? "",
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  kind: r.kind ?? "text",
  replyTo: r.reply_to ?? null,
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
  editedAt: r.edited_at ?? null,
  reactions: [],
})

/** Which conversation a message belongs to: a one-to-one thread or a group. */
export type Where = Pick<Conversation, "id" | "kind">
const table = (c: Where) => (c.kind === "group" ? "dm_group_messages" : "dm_messages")
const key = (c: Where) => (c.kind === "group" ? "group_id" : "thread_id")
const columns = (c: Where) => (c.kind === "group" ? GROUP_COLUMNS : extras === false ? BASE_COLUMNS : BASE_COLUMNS + EXTRA_COLUMNS)
const asWhere = (c: Where | string): Where => (typeof c === "string" ? { id: c, kind: "direct" } : c)

async function withReactions(list: DirectMessage[]): Promise<DirectMessage[]> {
  const client = db()
  if (!client || !list.length || extras === false) return list
  const { data, error } = await client.from("dm_reactions").select("message_id, user_id, emoji").in("message_id", list.map((m) => m.id).slice(0, 200))
  if (error) return list
  const by = new Map<string, DmReaction[]>()
  for (const r of data as { message_id: string; user_id: string; emoji: string }[]) {
    const arr = by.get(r.message_id) ?? []
    arr.push({ emoji: r.emoji, userId: r.user_id })
    by.set(r.message_id, arr)
  }
  return list.map((m) => ({ ...m, reactions: by.get(m.id) ?? [] }))
}

/** A page of a conversation, oldest first. Pass the oldest message you have as `before` to go further back. */
export async function listDirectMessages(conv: Where | string, { before, limit = DM_PAGE }: { before?: string; limit?: number } = {}) {
  const c = asWhere(conv)
  const client = db()
  if (!client) {
    const all = localMessages(c.id)
    const older = before ? all.filter((m) => m.createdAt < before) : all
    return { messages: older.slice(-limit), more: older.length > limit }
  }
  const run = () => {
    let q = client.from(table(c)).select(columns(c)).eq(key(c), c.id).order("created_at", { ascending: false }).limit(limit + 1)
    if (before) q = q.lt("created_at", before)
    return q
  }
  let { data, error } = await run()
  if (error && missing(error) && c.kind === "direct" && extras !== false) {
    extras = false
    ;({ data, error } = await run())
  }
  fail(error)
  const rows = data as unknown as MessageRow[]
  return { messages: await withReactions(rows.slice(0, limit).reverse().map(fromRow)), more: rows.length > limit }
}

/** Searches your messages in one conversation: every word must appear. Newest first. */
export async function searchConversation(conv: Where, query: string): Promise<DirectMessage[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  if (!words.length) return []
  const client = db()
  if (!client) {
    const low = words.map((w) => w.toLowerCase())
    return localMessages(conv.id)
      .filter((m) => low.every((w) => m.body.toLowerCase().includes(w)))
      .reverse()
  }
  let q = client.from(table(conv)).select(columns(conv)).eq(key(conv), conv.id)
  for (const w of words) q = q.ilike("body", `%${w.replace(/[\\%_]/g, (x) => `\\${x}`)}%`)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(40)
  fail(error)
  return (data as unknown as MessageRow[]).map(fromRow)
}

export type DmSendOptions = { kind?: "text" | "me" | "sticker"; replyTo?: string | null; attachments?: DmAttachment[] }

export async function sendDirectMessage(conv: Where | string, body: string, { kind = "text", replyTo = null, attachments = [] }: DmSendOptions = {}): Promise<DirectMessage> {
  const c = asWhere(conv)
  const problem = validateMessage(body)
  if (problem) throw new Error(problem)
  throttle()
  const client = db()
  if (!client) {
    const t = localThreads().find((x) => x.id === c.id)
    if (!t) throw new Error("This conversation is gone.")
    if (t.blocked) throw new Error("You blocked this member. Unblock them to send messages.")
    const m: DirectMessage = normalise({ id: crypto.randomUUID(), threadId: c.id, authorId: localMember().id, body, createdAt: new Date().toISOString(), kind, replyTo, attachments })
    writeJSON(messagesKey(c.id), [...localMessages(c.id), m].slice(-500))
    localBus()?.postMessage({ kind: "message", message: m } satisfies LocalEvent)
    return m
  }
  await requireMe()
  const row: Record<string, unknown> = { [key(c)]: c.id, body }
  // Only send the newer columns when they say something, so an older database still takes plain messages.
  if (kind !== "text") row.kind = kind
  if (replyTo) row.reply_to = replyTo
  if (attachments.length) row.attachments = attachments
  if (c.kind === "direct" && extras === false && Object.keys(row).length > 2) throw new Error("Replies, stickers and pictures in messages are not switched on in the database yet.")
  const { data, error } = await client.from(table(c)).insert(row).select(columns(c)).single()
  fail(error)
  return fromRow(data as unknown as MessageRow)
}

/** Changes the text of one of your messages; it shows as edited. */
export async function editDirectMessage(conv: Where, m: DirectMessage, body: string): Promise<DirectMessage> {
  const problem = validateMessage(body)
  if (problem) throw new Error(problem)
  const client = db()
  if (!client) {
    const next = { ...m, body: body.trim(), editedAt: new Date().toISOString() }
    writeJSON(
      messagesKey(conv.id),
      localMessages(conv.id).map((x) => (x.id === m.id ? next : x))
    )
    localBus()?.postMessage({ kind: "update", message: next } satisfies LocalEvent)
    return next
  }
  const { data, error } = await client.from(table(conv)).update({ body: body.trim() }).eq("id", m.id).select(columns(conv)).single()
  if (error && missing(error)) throw new Error("Editing messages is not switched on in the database yet.")
  fail(error)
  return { ...fromRow(data as unknown as MessageRow), reactions: m.reactions }
}

export async function deleteDirectMessage(m: DirectMessage, conv: Where = { id: m.threadId, kind: "direct" }) {
  const client = db()
  if (!client) {
    writeJSON(
      messagesKey(m.threadId),
      localMessages(m.threadId).filter((x) => x.id !== m.id)
    )
    localBus()?.postMessage({ kind: "delete", threadId: m.threadId, id: m.id } satisfies LocalEvent)
    return
  }
  const { error } = await client.from(table(conv)).delete().eq("id", m.id)
  fail(error)
}

/** Adds or takes back a reaction on a message in a conversation you are part of. */
export async function toggleDmReaction(m: DirectMessage, emoji: string, userId: string, on: boolean) {
  const client = db()
  if (!client) {
    const list = localMessages(m.threadId).map((x) =>
      x.id === m.id ? { ...x, reactions: on ? [...x.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId)), { emoji, userId }] : x.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId)) } : x
    )
    writeJSON(messagesKey(m.threadId), list)
    localBus()?.postMessage({ kind: "reaction", threadId: m.threadId, messageId: m.id, emoji, userId, on } satisfies LocalEvent)
    return
  }
  const { error } = on
    ? await client.from("dm_reactions").insert({ message_id: m.id, emoji })
    : await client.from("dm_reactions").delete().eq("message_id", m.id).eq("user_id", userId).eq("emoji", emoji)
  if (error && missing(error)) throw new Error("Reactions in messages are not switched on in the database yet.")
  if (error?.code === "23505") return
  fail(error)
}

/** Marks a conversation read up to now. The other members see your latest message from them as "Seen". */
export async function markConversationRead(conv: Where | string) {
  const c = asWhere(conv)
  const threadId = c.id
  // The badge drops at once; the database catches up.
  if (inboxCache) {
    inboxCache = inboxCache.map((x) => (x.id === threadId ? { ...x, unread: 0 } : x))
    publishUnread(inboxCache)
  }
  const client = db()
  if (!client) {
    const all = localThreads()
    if (all.some((t) => t.id === threadId)) writeJSON(THREADS_KEY, all.map((t) => (t.id === threadId ? { ...t, readAt: new Date().toISOString() } : t)))
    return
  }
  if (!(await me())) return
  const { error } = c.kind === "group" ? await client.rpc("mark_dm_group_read", { g: threadId }) : await client.rpc("mark_dm_read", { thread: threadId })
  fail(error)
}

// ─── Groups ─────────────────────────────────────────────────────────────────────────────────────────────────

export type GroupMember = { id: string; name: string; handle?: string; role: "owner" | "member"; readAt: string | null }

/** Starts a group with 2 to 19 other members. Returns its id. */
export async function startGroup(title: string, memberIds: string[]): Promise<string> {
  const client = db()
  if (!client) throw new Error("Groups need member accounts. Connect the database first.")
  await requireMe()
  const { data, error } = await client.rpc("start_dm_group", { group_title: title.trim(), members: [...new Set(memberIds)] })
  if (error && missing(error)) throw new Error("Group messages are not switched on in the database yet (migration …_social.sql).")
  fail(error)
  return data as string
}

export async function addToGroup(groupId: string, memberId: string) {
  const client = db()
  if (!client) return
  const { error } = await client.rpc("dm_group_add", { g: groupId, member: memberId })
  fail(error)
}

/** Leaves a group (the owner stays; they remove others instead). */
export async function leaveGroup(groupId: string) {
  const client = db()
  if (!client) return
  const userId = await requireMe()
  const { error } = await client.from("dm_group_members").delete().eq("group_id", groupId).eq("user_id", userId)
  fail(error)
  if (inboxCache) {
    inboxCache = inboxCache.filter((c) => c.id !== groupId)
    publishUnread(inboxCache)
  }
}

export async function renameGroup(groupId: string, title: string, emoji: string | null) {
  const client = db()
  if (!client) return
  const { error } = await client.from("dm_groups").update({ title: title.trim().slice(0, 60), emoji: emoji || null }).eq("id", groupId)
  fail(error)
}

/** Everyone in a group, with when each last read it (for "Seen by"). */
export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const client = db()
  if (!client) return []
  const { data, error } = await client.from("dm_group_members").select("user_id, role, read_at").eq("group_id", groupId).limit(50)
  fail(error)
  const rows = data as { user_id: string; role: "owner" | "member"; read_at: string | null }[]
  const { data: people } = await client.from("profiles").select("id, name, handle").in("id", rows.map((r) => r.user_id))
  const names = new Map(((people ?? []) as { id: string; name: string | null; handle: string | null }[]).map((p) => [p.id, p]))
  return rows.map((r) => ({ id: r.user_id, name: names.get(r.user_id)?.name || "Member", handle: names.get(r.user_id)?.handle ?? undefined, role: r.role, readAt: r.read_at }))
}

// ─── Your settings per conversation, and message requests ───────────────────────────────────────────────────

export type ConversationPrefs = Pick<Conversation, "pinned" | "muted" | "archived"> & { accepted?: boolean }

/** Pins, mutes or archives a conversation for you, or accepts a message request. Nobody else sees these. */
export async function setConversationPrefs(c: Conversation, patch: Partial<ConversationPrefs>) {
  const next = { pinned: c.pinned, muted: c.muted, archived: c.archived, ...patch }
  if (inboxCache) {
    inboxCache = inboxCache
      .map((x) => (x.id === c.id ? { ...x, ...next, request: patch.accepted ? false : x.request } : x))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    publishUnread(inboxCache)
  }
  const client = db()
  if (!client) return
  if (extras === false) throw new Error("Pinning, muting and archiving are not switched on in the database yet.")
  const row: Record<string, unknown> = { conversation: c.id, ...next, updated_at: new Date().toISOString() }
  if (patch.accepted) row.accepted = true
  const { error } = await client.from("dm_prefs").upsert(row, { onConflict: "user_id,conversation" })
  if (error && missing(error)) throw new Error("Pinning, muting and archiving are not switched on in the database yet.")
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

type LocalEvent =
  | { kind: "message"; message: DirectMessage }
  | { kind: "update"; message: DirectMessage }
  | { kind: "delete"; threadId: string; id: string }
  | { kind: "reaction"; threadId: string; messageId: string; emoji: string; userId: string; on: boolean }

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
  /** A message was edited. */
  onUpdate?: (m: DirectMessage) => void
  onReaction?: (r: { messageId: string; emoji: string; userId: string; on: boolean }) => void
  /** In a group: a member read up to this time. */
  onMemberRead?: (userId: string, at: string) => void
  onDelete?: (id: string) => void
  /** The other member read the conversation up to this time. */
  onRead?: (at: string) => void
  onTyping?: (from?: string) => void
}

/** The conversation open on screen, so arriving messages there are read at once instead of counted as unread. */
let openThread: string | null = null

/**
 * Listens to one conversation: new and deleted messages, the other member's read mark and their typing.
 * Returns a function that sends "I'm typing" and one that stops listening.
 */
export function subscribeConversation(conv: Where | string, myId: string | null, handlers: ConversationHandlers) {
  const c = asWhere(conv)
  const threadId = c.id
  openThread = threadId
  const client = db()
  if (!client) {
    localBus()
    const h = (e: LocalEvent) => {
      if (e.kind === "message" && e.message.threadId === threadId) handlers.onMessage?.(e.message)
      if (e.kind === "update" && e.message.threadId === threadId) handlers.onUpdate?.(e.message)
      if (e.kind === "delete" && e.threadId === threadId) handlers.onDelete?.(e.id)
      if (e.kind === "reaction" && e.threadId === threadId) handlers.onReaction?.(e)
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
  const tbl = table(c)
  let channel: RealtimeChannel = client
    .channel(`dm:${threadId}`, { config: { broadcast: { self: false } } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: tbl, filter: `${key(c)}=eq.${threadId}` }, (p) => handlers.onMessage?.(fromRow(p.new as MessageRow)))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: tbl, filter: `${key(c)}=eq.${threadId}` }, (p) => handlers.onUpdate?.(fromRow(p.new as MessageRow)))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: tbl }, (p) => {
      const id = (p.old as { id?: string }).id
      if (id) handlers.onDelete?.(id)
    })
  if (extras === true) {
    channel = channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_reactions", filter: `conversation_id=eq.${threadId}` }, (p) => {
        const r = p.new as { message_id: string; emoji: string; user_id: string }
        handlers.onReaction?.({ messageId: r.message_id, emoji: r.emoji, userId: r.user_id, on: true })
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_reactions" }, (p) => {
        const r = p.old as { message_id?: string; emoji?: string; user_id?: string }
        if (r.message_id && r.emoji && r.user_id) handlers.onReaction?.({ messageId: r.message_id, emoji: r.emoji, userId: r.user_id, on: false })
      })
  }
  if (c.kind === "group") {
    channel = channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_group_members", filter: `group_id=eq.${threadId}` }, (p) => {
      const m = p.new as { user_id: string; read_at: string | null }
      if (m.read_at && m.user_id !== myId) handlers.onMemberRead?.(m.user_id, m.read_at)
    })
  } else {
    channel = channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_threads", filter: `id=eq.${threadId}` }, (p) => {
      const t = p.new as { user_a: string; a_read_at: string | null; b_read_at: string | null }
      const at = t.user_a === myId ? t.b_read_at : t.a_read_at
      if (at) handlers.onRead?.(at)
    })
  }
  channel = channel
    // Only "someone is typing" travels on this channel: no text; in a group, the typist's id.
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const from = (payload as { from?: string }).from
      if (from !== myId) handlers.onTyping?.(from)
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
  const next = list.reduce((n, c) => n + (c.blocked || c.muted || c.archived ? 0 : c.unread), 0)
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

let inbox: { userId: string; channel: RealtimeChannel; refs: number; groups?: RealtimeChannel } | null = null

/** Group messages get their own channel, opened only once the database is known to have groups. */
function attachGroups(entry: NonNullable<typeof inbox>) {
  const client = db()
  if (!client || entry.groups) return
  const userId = entry.userId
  entry.groups = client
    .channel(`dm-groups:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_group_messages" }, (p) => {
      const row = p.new as MessageRow
      if (row.author_id !== userId && row.group_id === openThread && document.visibilityState === "visible") return
      refreshSoon()
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_group_members", filter: `user_id=eq.${userId}` }, () => refreshSoon())
    .subscribe()
}
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
    if (extras) attachGroups(inbox)
  }
  const entry = inbox
  entry.refs++
  return () => {
    if (--entry.refs > 0) return
    setTimeout(() => {
      if (entry.refs === 0 && inbox === entry) {
        client.removeChannel(entry.channel)
        if (entry.groups) client.removeChannel(entry.groups)
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
