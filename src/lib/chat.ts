import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { Member } from "@/lib/store"
import { db, live } from "@/lib/supabase"

/**
 * Chat: public rooms, their messages and reactions, who is here and who is typing.
 * With a database connected this reads and writes Supabase and listens on one Realtime channel per room;
 * without one everything stays in this browser, and open tabs talk to each other over a BroadcastChannel.
 */

export const MAX_MESSAGE = 2000
export const PAGE_SIZE = 50
/** The quick reactions under every message. Any other emoji works too (room_reactions, …_social.sql). */
export const EMOJIS = ["👍", "❤️", "🎉", "🚀", "👀", "🤔", "😂", "🔥"] as const
export type Emoji = string
/** The first eight live in message_reactions, whose check lists them; every other emoji in room_reactions. */
export const isClassicEmoji = (e: string) => (EMOJIS as readonly string[]).includes(e)
/** A reaction is an emoji, never a word: what the database accepts too. */
export const isEmoji = (e: string) => e.length > 0 && e.length <= 16 && !/[A-Za-z0-9\s<>]/.test(e)
export const ROOM_SLUG = /^[a-z0-9-]{2,40}$/

export type Room = {
  slug: string
  name: string
  topic: string
  createdBy: string | null
  createdAt: string
  /** The rules the admins set (…_cms.sql). Older databases have none of them, which reads as an open room. */
  position?: number
  /** Seconds a member waits between two messages; 0 is off. */
  slowMode?: number
  /** Only staff write; everyone else reads. */
  locked?: boolean
  /** Read only, and listed apart from the active rooms. */
  archived?: boolean
  /** Only staff see the room at all. */
  staffOnly?: boolean
  /** Reputation a member needs to write. */
  minReputation?: number
  /** "crew" rooms belong to a crew and only its members open them. */
  kind?: "public" | "crew"
  /** The room's look (…_social.sql): one of the crew colours, an emoji for its planet, and a rules banner. */
  accent?: RoomAccent | null
  emoji?: string | null
  rules?: string
}

export const ROOM_ACCENTS = ["ion", "gold", "ok", "violet", "rose", "teal", "amber", "sky"] as const
export type RoomAccent = (typeof ROOM_ACCENTS)[number]
export const ACCENT_VALUE: Record<RoomAccent, string> = {
  ion: "var(--ion)",
  gold: "var(--gold)",
  ok: "var(--ok)",
  violet: "#b49cff",
  rose: "#ff8fb1",
  teal: "#5fd3c6",
  amber: "#ffb86b",
  sky: "#7cc7ff",
}
const isAccent = (s: unknown): s is RoomAccent => typeof s === "string" && (ROOM_ACCENTS as readonly string[]).includes(s)

/** The rules columns, read when the database has them. */
const RULE_COLUMNS = "position, slow_mode_seconds, locked, archived, staff_only, min_reputation"
const STYLE_COLUMNS = "kind, accent, emoji, rules"

export type Reaction = { emoji: Emoji; userId: string }

export type QuotedMessage = { id: string; body: string; author: Member | null }

/** A picture added to a message: stored in the post-media bucket, as the database requires. */
export type Attachment = { url: string; alt: string; w?: number; h?: number }
/** "me" is an action line (/me waves), "poll" carries a poll, "sticker" one of our stickers. */
export type MessageKind = "text" | "me" | "poll" | "sticker"

export type ChatMessage = {
  id: string
  room: string
  body: string
  createdAt: string
  editedAt: string | null
  author: Member | null
  replyTo: string | null
  parent: QuotedMessage | null
  reactions: Reaction[]
  kind: MessageKind
  attachments: Attachment[]
  /** Members this message mentions (they were notified). */
  mentions: string[]
  /** Set on a reply inside a thread: the message the thread hangs from. */
  threadRoot: string | null
  replyCount: number
  lastReplyAt: string | null
  pinnedAt: string | null
  /** Hidden by moderators: only its author and staff receive it, and they see it marked. */
  hidden?: boolean
  /** Only on messages this browser is still sending, or failed to send. */
  status?: "sending" | "failed"
  error?: string
}

/** Someone with the room open. Signed-out readers count, but have no member. */
export type Presence = { key: string; member: Member | null; room: string; at: number }

export type MessagePatch = Pick<ChatMessage, "id" | "body" | "editedAt"> & Partial<Pick<ChatMessage, "pinnedAt" | "replyCount" | "lastReplyAt" | "attachments">>

export type RoomHandlers = {
  onInsert?: (m: ChatMessage) => void
  onUpdate?: (m: MessagePatch) => void
  onDelete?: (id: string) => void
  onReaction?: (r: { messageId: string; userId: string; emoji: Emoji; on: boolean }) => void
  onPresence?: (people: Presence[]) => void
  onTyping?: (member: Member) => void
  /** A poll vote cast or taken back, in a room this member can open. */
  onVote?: (v: { messageId: string; userId: string; choice: number; on: boolean }) => void
  /** A poll closed or reopened by its author. */
  onPoll?: (p: { messageId: string; closesAt: string | null }) => void
}

export type LobbyHandlers = {
  onRoom?: (room: Room) => void
  onMessage?: (m: { id: string; room: string; authorId: string; createdAt: string }) => void
  onPresence?: (people: Presence[]) => void
}

/**
 * The rooms every copy of Nexverse starts with; the database seeds the same ten. With a database the rooms
 * table is the only source (admins rename, reorder and archive rooms in /admin/chat), so this list is used
 * only by browser-only copies, to prerender the starting rooms, and as a tie-break for rows with no position.
 */
export const DEFAULT_ROOMS: Room[] = [
  ["general", "Lobby", "Say hello, share what you are building, and meet other builders."],
  ["models", "Models", "New releases, fine-tunes, quantizations and which model to use for what."],
  ["agents", "Agents", "Tool use, planning, memory and the frameworks that hold agents together."],
  ["local-ai", "Local AI", "Running models on your own hardware: GPUs, Macs, llama.cpp, Ollama and friends."],
  ["datasets", "Datasets", "Finding, cleaning, labelling and sharing data."],
  ["show-and-tell", "Show and tell", "Post what you made. Demos, repos and screenshots welcome."],
  ["help", "Help", "Stuck? Ask here. Include what you tried and the error you got."],
  ["research-papers", "Research papers", "Discuss new papers, reading groups and ideas worth trying."],
  ["portugues", "Português", "Conversa em português sobre IA, modelos e projetos."],
  ["jobs", "Jobs", "Hiring or looking for work in AI. One post per role, please."],
].map(([slug, name, topic]) => ({ slug, name, topic, createdBy: null, createdAt: "2026-10-18T19:00:00Z", kind: "public" as const }))

export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

// ---------------------------------------------------------------------------------------------------------
// Browser storage, for copies without a database and for what each reader has already seen.

const ROOMS_KEY = "nexverse-chat-rooms"
const READ_KEY = "nexverse-chat-read"
const ME_KEY = "nexverse-chat-me"
const LOCAL_CAP = 500
const messagesKey = (room: string) => `nexverse-chat:${room}`

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
  } catch {}
}

/** Without accounts, this browser writes as one member called "You". */
let localMe: Member | null = null

export function localMember(): Member {
  if (localMe) return localMe
  const saved = readJSON<Member | null>(ME_KEY, null)
  localMe = saved?.id ? saved : { id: crypto.randomUUID(), name: "You" }
  if (!saved?.id) writeJSON(ME_KEY, localMe)
  return localMe
}

/** A key for this tab, so two tabs of one browser show up as two readers. */
const tabKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random())

// ---------------------------------------------------------------------------------------------------------
// Rows.

const AUTHOR = "author:profiles!room_messages_author_id_fkey(id, name)"
const MESSAGE_COLUMNS = `id, room, body, created_at, edited_at, reply_to, ${AUTHOR}, parent:reply_to(id, body, ${AUTHOR}), reactions:message_reactions(emoji, user_id)`
/** Threads, pins, polls, pictures and any-emoji reactions (…_social.sql). */
const EXTRA_COLUMNS = "kind, attachments, mentions, thread_root, reply_count, last_reply_at, pinned_at, more:room_reactions(emoji, user_id)"
const ROOM_COLUMNS = "slug, name, topic, created_by, created_at"

type RoomRow = {
  slug: string
  name: string
  topic: string
  created_by: string | null
  created_at: string
  position?: number
  slow_mode_seconds?: number
  locked?: boolean
  archived?: boolean
  staff_only?: boolean
  min_reputation?: number
  kind?: "public" | "crew"
  accent?: string | null
  emoji?: string | null
  rules?: string | null
}
type MessageRow = {
  id: string
  room: string
  body: string
  created_at: string
  edited_at: string | null
  reply_to: string | null
  author?: Member | null
  parent?: { id: string; body: string; author: Member | null } | null
  reactions?: { emoji: Emoji; user_id: string }[]
  more?: { emoji: Emoji; user_id: string }[]
  hidden_at?: string | null
  kind?: MessageKind
  attachments?: Attachment[] | null
  mentions?: string[] | null
  thread_root?: string | null
  reply_count?: number
  last_reply_at?: string | null
  pinned_at?: string | null
}

const fromRoomRow = (r: RoomRow): Room => ({
  slug: r.slug,
  name: r.name,
  topic: r.topic,
  createdBy: r.created_by,
  createdAt: r.created_at,
  position: r.position,
  slowMode: r.slow_mode_seconds ?? 0,
  locked: r.locked ?? false,
  archived: r.archived ?? false,
  staffOnly: r.staff_only ?? false,
  minReputation: r.min_reputation ?? 0,
  kind: r.kind ?? "public",
  accent: isAccent(r.accent) ? r.accent : null,
  emoji: r.emoji ?? null,
  rules: r.rules ?? "",
})

function fromMessageRow(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    room: r.room,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    author: r.author ?? null,
    replyTo: r.reply_to,
    parent: r.parent ?? null,
    reactions: [...(r.reactions ?? []), ...(r.more ?? [])].map((x) => ({ emoji: x.emoji, userId: x.user_id })),
    hidden: Boolean(r.hidden_at),
    kind: r.kind ?? "text",
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    mentions: r.mentions ?? [],
    threadRoot: r.thread_root ?? null,
    replyCount: r.reply_count ?? 0,
    lastReplyAt: r.last_reply_at ?? null,
    pinnedAt: r.pinned_at ?? null,
  }
}

type DbError = { message: string; code?: string } | null
/** A column, table or relationship this database does not have yet. */
export const isMissing = (e: DbError) =>
  Boolean(e && (e.code === "42703" || e.code === "42P01" || e.code === "PGRST200" || e.code === "PGRST204" || e.code === "PGRST202" || /does not exist|could not find|schema cache/i.test(e.message)))

// What this database has: 2 = threads, pins, polls and the rest (…_social.sql) plus hidden_at; 1 = hidden_at
// (…_roles_admin.sql); 0 = the first chat tables. Reads step down once when a column is missing and remember it.
let messageLevel: 0 | 1 | 2 = 2

/** Whether threads, pins, polls, pictures and any-emoji reactions are switched on in this database. */
export const chatExtras = () => messageLevel === 2

/** Runs a message select with every column this database has, stepping down when one is missing. */
async function selectMessages<T>(run: (columns: string, extras: boolean) => PromiseLike<{ data: T; error: DbError }>) {
  for (;;) {
    const columns = messageLevel === 2 ? `${MESSAGE_COLUMNS}, hidden_at, ${EXTRA_COLUMNS}` : messageLevel === 1 ? `${MESSAGE_COLUMNS}, hidden_at` : MESSAGE_COLUMNS
    const res = await run(columns, messageLevel === 2)
    if (messageLevel > 0 && isMissing(res.error)) {
      messageLevel = (messageLevel - 1) as 0 | 1
      continue
    }
    return res
  }
}

function fail(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return
  if (error.code === "42501") throw new Error("Sign in to write in chat.")
  if (error.code === "23505") throw new Error("That already exists.")
  if (error.code === "23514") throw new Error("That doesn't fit the rules for this field.")
  throw new Error(error.message)
}

// Names of people whose messages arrive live, so each profile is fetched once.
const profiles = new Map<string, Promise<Member | null>>()

function profile(client: SupabaseClient, id: string) {
  let p = profiles.get(id)
  if (!p) {
    p = Promise.resolve(client.from("profiles").select("id, name").eq("id", id).maybeSingle()).then(
      ({ data }) => (data as Member | null) ?? null,
      () => null
    )
    profiles.set(id, p)
  }
  return p
}

function remember(m: ChatMessage) {
  if (m.author) profiles.set(m.author.id, Promise.resolve(m.author))
}

// ---------------------------------------------------------------------------------------------------------
// Rooms.

function localRooms(): Room[] {
  const extra = readJSON<Room[]>(ROOMS_KEY, [])
  return [...DEFAULT_ROOMS, ...extra.filter((r) => !DEFAULT_ROOMS.some((d) => d.slug === r.slug))]
}

/** The admins' order when the database has one; otherwise the lobby first, the starting rooms, then the rest oldest first. */
function sortRooms(rooms: Room[]) {
  const order = (r: Room) => {
    if (typeof r.position === "number") return r.position
    const i = DEFAULT_ROOMS.findIndex((d) => d.slug === r.slug)
    return i === -1 ? DEFAULT_ROOMS.length : i
  }
  return [...rooms].sort((a, b) => order(a) - order(b) || a.createdAt.localeCompare(b.createdAt))
}

// Which room columns this database has: 2 = rules and look, 1 = rules (…_cms.sql), 0 = the first ones.
let roomLevel: 0 | 1 | 2 = 2

async function selectRooms<T>(run: (columns: string) => PromiseLike<{ data: T; error: DbError }>) {
  for (;;) {
    const columns = roomLevel === 2 ? `${ROOM_COLUMNS}, ${RULE_COLUMNS}, ${STYLE_COLUMNS}` : roomLevel === 1 ? `${ROOM_COLUMNS}, ${RULE_COLUMNS}` : ROOM_COLUMNS
    const res = await run(columns)
    if (roomLevel > 0 && isMissing(res.error)) {
      roomLevel = (roomLevel - 1) as 0 | 1
      continue
    }
    return res
  }
}

let roomsCache: Room[] | null = null

/**
 * The last list of rooms this page loaded, for drawing the rail before the next load finishes. With a
 * database nothing is drawn until the real list arrives, so a renamed or archived starting room never
 * flashes back with its default name.
 */
export const cachedRooms = () => roomsCache ?? (live ? [] : DEFAULT_ROOMS)

export async function listRooms(): Promise<Room[]> {
  const client = db()
  if (!client) return (roomsCache = localRooms())
  const { data, error } = await selectRooms((columns) => client.from("rooms").select(columns).order("created_at").limit(200))
  fail(error)
  return (roomsCache = sortRooms((data as unknown as RoomRow[]).map(fromRoomRow)))
}

export async function getRoom(slug: string): Promise<Room | null> {
  const cached = roomsCache?.find((r) => r.slug === slug)
  if (cached) return cached
  const client = db()
  if (!client) return localRooms().find((r) => r.slug === slug) ?? null
  const { data, error } = await selectRooms((columns) => client.from("rooms").select(columns).eq("slug", slug).maybeSingle())
  fail(error)
  return data ? fromRoomRow(data as unknown as RoomRow) : null
}

/** Changes a public room's name, topic or rules (chat managers only; the database checks). */
export async function updateRoom(slug: string, patch: Partial<Pick<Room, "name" | "topic" | "slowMode" | "locked" | "archived" | "staffOnly" | "minReputation">>) {
  const client = db()
  if (!client) throw new Error("Managing rooms needs the database. Connect Supabase first.")
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.topic !== undefined) row.topic = patch.topic.trim()
  if (patch.slowMode !== undefined) row.slow_mode_seconds = Math.max(0, Math.min(3600, Math.round(patch.slowMode)))
  if (patch.locked !== undefined) row.locked = patch.locked
  if (patch.archived !== undefined) row.archived = patch.archived
  if (patch.staffOnly !== undefined) row.staff_only = patch.staffOnly
  if (patch.minReputation !== undefined) row.min_reputation = Math.max(0, Math.round(patch.minReputation))
  const { data, error } = await client
    .from("rooms")
    .update(row)
    .eq("slug", slug)
    .select(roomLevel === 2 ? `${ROOM_COLUMNS}, ${RULE_COLUMNS}, ${STYLE_COLUMNS}` : `${ROOM_COLUMNS}, ${RULE_COLUMNS}`)
    .maybeSingle()
  if (error?.code === "42703") throw new Error("Room rules are not switched on in the database yet (migration …_cms.sql).")
  if (error?.code === "42501" || (!error && !data)) throw new Error("Your account cannot manage chat rooms.")
  fail(error)
  const room = fromRoomRow(data as unknown as RoomRow)
  roomsCache = sortRooms([...(roomsCache ?? []).filter((r) => r.slug !== slug), room])
  return room
}

/** Saves the rooms' order in one call (one line in the moderation log). */
export async function reorderRooms(slugs: string[]) {
  const client = db()
  if (!client) throw new Error("Managing rooms needs the database. Connect Supabase first.")
  const { error } = await client.rpc("cms_reorder", { what: "rooms", slugs })
  if (error && /cms_reorder|schema cache/.test(error.message)) throw new Error("Room order is not switched on in the database yet (migration …_cms.sql).")
  fail(error)
  roomsCache = sortRooms((roomsCache ?? []).map((r) => (slugs.includes(r.slug) ? { ...r, position: slugs.indexOf(r.slug) } : r)))
}

export async function createRoom(input: { slug: string; name: string; topic: string }): Promise<Room> {
  const slug = input.slug.trim()
  const name = input.name.trim()
  const topic = input.topic.trim()
  if (!ROOM_SLUG.test(slug)) throw new Error("The address uses 2 to 40 lowercase letters, numbers and dashes.")
  if (name.length < 2 || name.length > 40) throw new Error("The name is 2 to 40 characters.")
  if (topic.length > 200) throw new Error("The topic is up to 200 characters.")
  const client = db()
  let room: Room
  if (!client) {
    if (localRooms().some((r) => r.slug === slug)) throw new Error("A room with that address already exists.")
    room = { slug, name, topic, createdBy: null, createdAt: new Date().toISOString() }
    writeJSON(ROOMS_KEY, [...readJSON<Room[]>(ROOMS_KEY, []), room])
    local()?.postMessage({ kind: "room", room } satisfies LocalEvent)
  } else {
    const { data, error } = await client.from("rooms").insert({ slug, name, topic }).select(ROOM_COLUMNS).single()
    if (error?.code === "23505") throw new Error("A room with that address already exists.")
    fail(error)
    room = fromRoomRow(data as RoomRow)
  }
  roomsCache = sortRooms([...(roomsCache ?? []).filter((r) => r.slug !== room.slug), room])
  return room
}

// ---------------------------------------------------------------------------------------------------------
// Messages.

const messageCache = new Map<string, ChatMessage[]>()

/** The messages last shown for a room on this page, so returning to it draws at once. */
export const cachedMessages = (room: string) => messageCache.get(room) ?? null
export const cacheMessages = (room: string, messages: ChatMessage[]) =>
  messageCache.set(room, messages.filter((m) => !m.status).slice(-PAGE_SIZE * 2))

/** Messages saved by a browser-only copy, filled in with the fields older copies did not keep. */
const localList = (room: string) => readJSON<ChatMessage[]>(messagesKey(room), []).map(normalise)
function normalise(m: ChatMessage): ChatMessage {
  return {
    ...m,
    kind: m.kind ?? "text",
    attachments: m.attachments ?? [],
    mentions: m.mentions ?? [],
    threadRoot: m.threadRoot ?? null,
    replyCount: m.replyCount ?? 0,
    lastReplyAt: m.lastReplyAt ?? null,
    pinnedAt: m.pinnedAt ?? null,
  }
}

/**
 * A page of a room's messages, oldest first. Pass the oldest one you have as `before` to go further back.
 * Replies inside threads are not part of the room's stream; they show under their thread.
 */
export async function listMessages(room: string, { before, limit = PAGE_SIZE }: { before?: string; limit?: number } = {}) {
  const client = db()
  if (!client) {
    const all = localList(room).filter((m) => !m.threadRoot)
    const older = before ? all.filter((m) => m.createdAt < before) : all
    return { messages: older.slice(-limit), more: older.length > limit }
  }
  const { data, error } = await selectMessages((columns, extras) => {
    let query = client.from("room_messages").select(columns).eq("room", room).order("created_at", { ascending: false }).limit(limit + 1)
    if (extras) query = query.is("thread_root", null)
    if (before) query = query.lt("created_at", before)
    return query
  })
  fail(error)
  const rows = data as unknown as MessageRow[]
  const messages = rows.slice(0, limit).map(fromMessageRow).reverse()
  messages.forEach(remember)
  return { messages, more: rows.length > limit }
}

/**
 * The messages around a moment (a date picked to jump to, or a linked message), oldest first: a few before it
 * and a page after. `newer` says whether the room goes on past this window.
 */
export async function listAround(room: string, at: string, limit = PAGE_SIZE) {
  const client = db()
  if (!client) {
    const all = localList(room).filter((m) => !m.threadRoot)
    const i = Math.max(0, all.findIndex((m) => m.createdAt >= at))
    const start = Math.max(0, i - 5)
    return { messages: all.slice(start, start + limit), more: start > 0, newer: start + limit < all.length }
  }
  const [before, after] = await Promise.all([
    selectMessages((columns, extras) => {
      let q = client.from("room_messages").select(columns).eq("room", room).lt("created_at", at).order("created_at", { ascending: false }).limit(6)
      if (extras) q = q.is("thread_root", null)
      return q
    }),
    selectMessages((columns, extras) => {
      let q = client.from("room_messages").select(columns).eq("room", room).gte("created_at", at).order("created_at").limit(limit + 1)
      if (extras) q = q.is("thread_root", null)
      return q
    }),
  ])
  fail(before.error)
  fail(after.error)
  const older = (before.data as unknown as MessageRow[]).map(fromMessageRow)
  const newer = (after.data as unknown as MessageRow[]).map(fromMessageRow)
  const messages = [...older.slice(0, 5).reverse(), ...newer.slice(0, limit)]
  messages.forEach(remember)
  return { messages, more: older.length > 5, newer: newer.length > limit }
}

/** A thread: the message it hangs from and every reply, oldest first. */
export async function listThread(room: string, rootId: string): Promise<ChatMessage[]> {
  const client = db()
  if (!client) return localList(room).filter((m) => m.threadRoot === rootId)
  const { data, error } = await selectMessages((columns, extras) =>
    extras ? client.from("room_messages").select(columns).eq("thread_root", rootId).order("created_at").limit(200) : client.from("room_messages").select(columns).eq("id", "00000000-0000-0000-0000-000000000000")
  )
  fail(error)
  const list = (data as unknown as MessageRow[]).map(fromMessageRow)
  list.forEach(remember)
  return list
}

/** Messages in a room whose text contains every word of the query, newest first. */
export async function searchRoom(room: string, query: string, limit = 40): Promise<ChatMessage[]> {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 0).slice(0, 5)
  if (!words.length) return []
  const client = db()
  if (!client) {
    const low = words.map((w) => w.toLowerCase())
    return localList(room)
      .filter((m) => low.every((w) => m.body.toLowerCase().includes(w)))
      .reverse()
      .slice(0, limit)
  }
  const { data, error } = await selectMessages((columns) => {
    let q = client.from("room_messages").select(columns).eq("room", room)
    for (const w of words) q = q.ilike("body", `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    return q.order("created_at", { ascending: false }).limit(limit)
  })
  fail(error)
  return (data as unknown as MessageRow[]).map(fromMessageRow)
}

/** The room's pinned messages, most recently pinned first. Empty while the database has no pins. */
export async function listPinned(room: string): Promise<ChatMessage[]> {
  const client = db()
  if (!client) return localList(room).filter((m) => m.pinnedAt).sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""))
  const { data, error } = await selectMessages((columns, extras) =>
    extras
      ? client.from("room_messages").select(columns).eq("room", room).not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(25)
      : client.from("room_messages").select(columns).eq("id", "00000000-0000-0000-0000-000000000000")
  )
  fail(error)
  return (data as unknown as MessageRow[]).map(fromMessageRow)
}

/** Pins or unpins a message (chat managers in public rooms, the captain and officers in a crew's room). */
export async function pinMessage(m: Pick<ChatMessage, "id" | "room">, pin: boolean): Promise<string | null> {
  const client = db()
  if (!client) {
    const at = pin ? new Date().toISOString() : null
    writeJSON(
      messagesKey(m.room),
      localList(m.room).map((x) => (x.id === m.id ? { ...x, pinnedAt: at } : x))
    )
    local()?.postMessage({ kind: "patch", room: m.room, patch: { id: m.id, pinnedAt: at } } satisfies LocalEvent)
    return at
  }
  const { data, error } = await client.rpc("chat_pin", { message: m.id, pin })
  if (error && isMissing(error)) throw new Error("Pins are not switched on in the database yet (migration …_social.sql).")
  fail(error)
  return (data as string | null) ?? null
}

/** Sets a room's accent colour, emoji, rules banner and topic. The database checks who may. */
export async function styleRoom(slug: string, look: { accent: RoomAccent | null; emoji: string; rules: string; topic: string }) {
  const client = db()
  if (!client) throw new Error("A room's look is saved in the database. Connect Supabase first.")
  const { error } = await client.rpc("chat_room_style", {
    room_slug: slug,
    new_accent: look.accent ?? "",
    new_emoji: look.emoji.trim(),
    new_rules: look.rules.trim().slice(0, 1500),
    new_topic: look.topic.trim().slice(0, 200),
  })
  if (error && isMissing(error)) throw new Error("Room looks are not switched on in the database yet (migration …_social.sql).")
  fail(error)
  if (roomsCache) {
    roomsCache = roomsCache.map((r) =>
      r.slug === slug ? { ...r, accent: look.accent, emoji: look.emoji.trim() || null, rules: look.rules.trim(), topic: look.topic.trim() || r.topic } : r
    )
  }
}

/** Several messages by id (for saved messages), in no particular order. Ones you cannot read are left out. */
export async function getMessages(ids: string[]): Promise<ChatMessage[]> {
  const client = db()
  if (!client || !ids.length) return []
  const { data, error } = await selectMessages((columns) => client.from("room_messages").select(columns).in("id", ids.slice(0, 100)))
  fail(error)
  return (data as unknown as MessageRow[]).map(fromMessageRow)
}

export async function getMessage(id: string): Promise<ChatMessage | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await selectMessages((columns) => client.from("room_messages").select(columns).eq("id", id).maybeSingle())
  fail(error)
  return data ? fromMessageRow(data as unknown as MessageRow) : null
}

/**
 * Sends a message. Pass the id of the optimistic copy already on screen, so the live echo of this insert
 * replaces it instead of appearing twice, and a retry after a lost response does not post it twice.
 */
export type SendOptions = {
  id?: string
  replyTo?: string | null
  parent?: QuotedMessage | null
  kind?: MessageKind
  attachments?: Attachment[]
  mentions?: string[]
  threadRoot?: string | null
}

export async function sendMessage(
  room: string,
  body: string,
  { id = crypto.randomUUID(), replyTo = null, parent = null, kind = "text", attachments = [], mentions = [], threadRoot = null }: SendOptions = {}
): Promise<ChatMessage> {
  const text = body.trim()
  if (!text) throw new Error("Write something first.")
  if (text.length > MAX_MESSAGE) throw new Error(`Messages are up to ${MAX_MESSAGE.toLocaleString("en")} characters.`)
  const client = db()
  if (!client) {
    const m: ChatMessage = {
      id,
      room,
      body: text,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: localMember(),
      replyTo,
      parent,
      reactions: [],
      kind,
      attachments,
      mentions,
      threadRoot,
      replyCount: 0,
      lastReplyAt: null,
      pinnedAt: null,
    }
    const all = localList(room)
    const next = threadRoot
      ? all.map((x) => (x.id === threadRoot ? { ...x, replyCount: x.replyCount + 1, lastReplyAt: m.createdAt } : x))
      : all
    writeJSON(messagesKey(room), [...next, m].slice(-LOCAL_CAP))
    local()?.postMessage({ kind: "insert", message: m } satisfies LocalEvent)
    if (threadRoot) {
      const root = next.find((x) => x.id === threadRoot)
      if (root) local()?.postMessage({ kind: "patch", room, patch: { id: root.id, replyCount: root.replyCount, lastReplyAt: root.lastReplyAt } } satisfies LocalEvent)
    }
    return m
  }
  const row: Record<string, unknown> = { id, room, body: text, reply_to: replyTo }
  // Only what differs from a plain message, so plain messages still send while a database lacks …_social.sql.
  if (kind !== "text") row.kind = kind
  if (attachments.length) row.attachments = attachments
  if (mentions.length) row.mentions = [...new Set(mentions)].slice(0, 20)
  if (threadRoot) row.thread_root = threadRoot
  const extras = Object.keys(row).length > 4
  const { data, error } = await client
    .from("room_messages")
    .insert(row)
    .select(extras || messageLevel === 2 ? `${MESSAGE_COLUMNS}, ${EXTRA_COLUMNS}` : MESSAGE_COLUMNS)
    .single()
  if (extras && isMissing(error)) throw new Error("Threads, polls, stickers and pictures need the latest database update (migration …_social.sql).")
  if (error?.code === "42501") throw new Error(await whyNot(room))
  if (error?.code === "23505") {
    // The first attempt reached the database; only its answer was lost.
    const existing = await getMessage(id)
    if (existing) return existing
  }
  fail(error)
  const m = fromMessageRow(data as unknown as MessageRow)
  remember(m)
  return m
}

/** What keeps you from writing in a room right now, as the database sees it, in a sentence. */
async function whyNot(room: string) {
  const client = db()
  const fallback = "Your message was not sent. Sign in, or check the room's rules."
  if (!client) return fallback
  const { data, error } = await client.rpc("chat_post_block", { room_slug: room })
  if (error || typeof data !== "string") return fallback
  return roomRuleText(data) ?? fallback
}

/** A room rule (from chat_post_block) in plain words. "slow:12" means: wait 12 seconds. */
export function roomRuleText(block: string | null, room?: Room): string | null {
  if (!block) return null
  if (block.startsWith("slow:")) return `Slow mode is on here. You can write again in ${block.slice(5)} s.`
  switch (block) {
    case "archived":
      return "This room is archived. You can read it, but it takes no new messages."
    case "locked":
      return "This room is locked. Only the team writes here; everyone can read."
    case "staff":
      return "This room is for the team."
    case "reputation":
      return `Writing here needs ${room?.minReputation ? room.minReputation.toLocaleString("en") + " " : ""}reputation. Help out in the forum to get there.`
    case "cap":
      return "Your account cannot write in chat rooms."
    default:
      return null
  }
}

export async function editMessage(id: string, room: string, body: string): Promise<{ body: string; editedAt: string | null }> {
  const text = body.trim()
  if (!text) throw new Error("A message can't be empty. Delete it instead.")
  if (text.length > MAX_MESSAGE) throw new Error(`Messages are up to ${MAX_MESSAGE.toLocaleString("en")} characters.`)
  const client = db()
  if (!client) {
    const editedAt = new Date().toISOString()
    writeJSON(
      messagesKey(room),
      readJSON<ChatMessage[]>(messagesKey(room), []).map((m) => (m.id === id ? { ...m, body: text, editedAt } : m))
    )
    local()?.postMessage({ kind: "update", room, id, body: text, editedAt } satisfies LocalEvent)
    return { body: text, editedAt }
  }
  const { data, error } = await client.from("room_messages").update({ body: text }).eq("id", id).select("body, edited_at").single()
  fail(error)
  const row = data as { body: string; edited_at: string | null }
  return { body: row.body, editedAt: row.edited_at }
}

export async function deleteMessage(id: string, room: string) {
  const client = db()
  if (!client) {
    writeJSON(
      messagesKey(room),
      readJSON<ChatMessage[]>(messagesKey(room), [])
        .filter((m) => m.id !== id)
        .map((m) => (m.replyTo === id ? { ...m, replyTo: null, parent: null } : m))
    )
    local()?.postMessage({ kind: "delete", room, id } satisfies LocalEvent)
    return
  }
  const { error } = await client.from("room_messages").delete().eq("id", id)
  fail(error)
}

/** For the browser-only copy: tells the other tabs about a poll vote (polls themselves live in lib/chat-features). */
export function announceLocalVote(room: string, v: { messageId: string; userId: string; choice: number; on: boolean }) {
  local()?.postMessage({ kind: "vote", room, ...v } satisfies LocalEvent)
}

/** Adds your reaction, or takes it back when `on` is false. */
export async function toggleReaction(message: Pick<ChatMessage, "id" | "room">, emoji: Emoji, userId: string, on: boolean) {
  const client = db()
  if (!client) {
    writeJSON(
      messagesKey(message.room),
      readJSON<ChatMessage[]>(messagesKey(message.room), []).map((m) =>
        m.id === message.id ? { ...m, reactions: applyReaction(m.reactions, { emoji, userId }, on) } : m
      )
    )
    local()?.postMessage({ kind: "reaction", room: message.room, messageId: message.id, userId, emoji, on } satisfies LocalEvent)
    return
  }
  if (!isEmoji(emoji)) throw new Error("Reactions are emoji.")
  const table = isClassicEmoji(emoji) ? "message_reactions" : "room_reactions"
  const { error } = on
    ? await client.from(table).insert({ message_id: message.id, emoji })
    : await client.from(table).delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji)
  if (on && error?.code === "23505") return
  if (table === "room_reactions" && isMissing(error)) throw new Error("Only the eight quick reactions work until the database is updated (migration …_social.sql).")
  fail(error)
}

export function applyReaction(list: Reaction[], r: Reaction, on: boolean) {
  const rest = list.filter((x) => !(x.emoji === r.emoji && x.userId === r.userId))
  return on ? [...rest, r] : rest
}

// ---------------------------------------------------------------------------------------------------------
// What each reader has seen. Kept in this browser: a room counts as read up to the last time it was open.

type ReadState = { since: string; rooms: Record<string, string> }

function readState(): ReadState {
  const s = readJSON<ReadState | null>(READ_KEY, null)
  if (s?.since) return s
  // The first visit starts the clock, so nobody arrives to hundreds of "unread" messages.
  const fresh = { since: new Date().toISOString(), rooms: {} }
  writeJSON(READ_KEY, fresh)
  return fresh
}

export function lastRead(room: string) {
  const s = readState()
  return s.rooms[room] ?? s.since
}

export function markRead(room: string, at = new Date().toISOString()) {
  const s = readState()
  if ((s.rooms[room] ?? "") >= at) return
  writeJSON(READ_KEY, { ...s, rooms: { ...s.rooms, [room]: at } })
  queueReadSync(room, at)
}

// Signed-in members' read marks are also kept in the database (chat_reads), so another device starts where this
// one stopped. Writes are gathered for two seconds; a database without the table is simply skipped.
const pendingReads = new Map<string, string>()
let readTimer: ReturnType<typeof setTimeout> | undefined
let readsTable = true

function queueReadSync(room: string, at: string) {
  if (!readsTable || !db() || !ROOM_SLUG.test(room)) return
  pendingReads.set(room, at)
  clearTimeout(readTimer)
  readTimer = setTimeout(flushReads, 2000)
}

async function flushReads() {
  const client = db()
  if (!client || !pendingReads.size) return
  const { data } = await client.auth.getSession()
  if (!data.session) return pendingReads.clear()
  const rows = [...pendingReads].map(([room, read_at]) => ({ room, read_at }))
  pendingReads.clear()
  const { error } = await client.from("chat_reads").upsert(rows, { onConflict: "user_id,room" })
  if (isMissing(error)) readsTable = false
}

/** Brings in the read marks this member left on other devices (the later of the two wins). */
export async function loadReadMarks() {
  const client = db()
  if (!client || !readsTable) return
  const { data: session } = await client.auth.getSession()
  if (!session.session) return
  const { data, error } = await client.from("chat_reads").select("room, read_at").limit(500)
  if (error) {
    if (isMissing(error)) readsTable = false
    return
  }
  const s = readState()
  const rooms = { ...s.rooms }
  for (const r of data as { room: string; read_at: string }[]) if ((rooms[r.room] ?? "") < r.read_at) rooms[r.room] = r.read_at
  writeJSON(READ_KEY, { ...s, rooms })
}

/** How many messages from other people arrived in each room since you last had it open. */
export async function unreadCounts(rooms: string[], me: string | null): Promise<Record<string, number>> {
  const s = readState()
  const since = (room: string) => s.rooms[room] ?? s.since
  const counts: Record<string, number> = {}
  const client = db()
  if (!client) {
    for (const room of rooms) {
      counts[room] = readJSON<ChatMessage[]>(messagesKey(room), []).filter(
        (m) => m.createdAt > since(room) && m.author?.id !== me
      ).length
    }
    return counts
  }
  const oldest = rooms.map(since).sort()[0] ?? s.since
  let query = client.from("room_messages").select("room, created_at, author_id").gt("created_at", oldest).in("room", rooms).limit(1000)
  if (me) query = query.neq("author_id", me)
  const { data, error } = await query
  fail(error)
  for (const row of data as { room: string; created_at: string }[]) {
    if (row.created_at > since(row.room)) counts[row.room] = (counts[row.room] ?? 0) + 1
  }
  return counts
}

// ---------------------------------------------------------------------------------------------------------
// Live: one shared channel per topic, so React remounts and two components on one room reuse a connection.

type Args<F> = F extends (...a: infer A) => void ? A : never
type Dispatch<H> = <K extends keyof H>(k: K, ...args: Args<NonNullable<H[K]>>) => void

type Shared<H> = {
  handlers: Set<H>
  me: { member: Member | null; room: string }
  refs: number
  close?: ReturnType<typeof setTimeout>
  /** The latest list of who's here, handed to components that join a channel already open. */
  presence?: Presence[]
  track: () => void
  send: (event: string, payload: unknown) => void
  teardown: () => Promise<void>
}

const shared = new Map<string, Shared<unknown>>()
const closing = new Map<string, Promise<void>>()

function presenceList(state: Record<string, { member?: Member | null; room?: string; at?: number }[]>): Presence[] {
  return Object.entries(state).map(([key, metas]) => {
    const meta = metas[metas.length - 1] ?? {}
    return { key, member: meta.member ?? null, room: meta.room ?? "", at: meta.at ?? 0 }
  })
}

function openShared<H>(
  topic: string,
  me: { member: Member | null; room: string },
  build: (entry: Shared<H>, dispatch: Dispatch<H>) => void,
  handlers: H
) {
  let entry = shared.get(topic) as Shared<H> | undefined
  if (entry) {
    if (entry.close) clearTimeout(entry.close)
    entry.close = undefined
    const known = entry.presence
    const onPresence = (handlers as { onPresence?: (p: Presence[]) => void }).onPresence
    if (known && onPresence) queueMicrotask(() => onPresence(known))
  } else {
    entry = {
      handlers: new Set<H>(),
      me,
      refs: 0,
      track: () => {},
      send: () => {},
      teardown: async () => {},
    }
    shared.set(topic, entry as Shared<unknown>)
    const e = entry
    const dispatch = <K extends keyof H>(k: K, ...args: unknown[]) => {
      if (k === "onPresence") e.presence = args[0] as Presence[]
      for (const h of e.handlers) (h[k] as ((...a: unknown[]) => void) | undefined)?.(...args)
    }
    // A channel from an earlier visit may still be closing; wait for it so the new one starts clean.
    const pending = closing.get(topic)
    if (pending) pending.then(() => shared.get(topic) === e && build(e, dispatch as never))
    else build(e, dispatch as never)
  }
  entry.handlers.add(handlers)
  entry.refs++
  const changed = entry.me.member?.id !== me.member?.id || entry.me.member?.name !== me.member?.name || entry.me.room !== me.room
  entry.me = me
  if (changed) entry.track()
  const e = entry
  return () => {
    e.handlers.delete(handlers)
    if (--e.refs > 0) return
    e.close = setTimeout(() => {
      shared.delete(topic)
      const done = e.teardown().finally(() => closing.delete(topic))
      closing.set(topic, done)
    }, 400)
  }
}

function realtimeChannel(client: SupabaseClient, topic: string) {
  return client.channel(topic, { config: { presence: { key: tabKey }, broadcast: { self: false } } })
}

/**
 * Listens to one room: new, edited and deleted messages, reactions, who has it open and who is typing.
 * Returns a function that sends "I'm typing" and one that stops listening.
 */
export function subscribeRoom(room: string, member: Member | null, handlers: RoomHandlers) {
  const topic = `chat:room:${room}`
  const stop = openShared<RoomHandlers>(
    topic,
    { member, room },
    (entry, dispatch) => {
      const client = db()
      if (!client) return buildLocal(entry, room, dispatch)
      const channel: RealtimeChannel = realtimeChannel(client, topic)
      const toMessage = async (row: MessageRow) => {
        if (row.reply_to) {
          const full = await getMessage(row.id).catch(() => null)
          if (full) return full
        }
        const author = await profile(client, (row as unknown as { author_id: string }).author_id)
        return fromMessageRow({ ...row, author })
      }
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room=eq.${room}` }, (p) =>
          toMessage(p.new as MessageRow).then((m) => dispatch("onInsert", m))
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "room_messages", filter: `room=eq.${room}` }, (p) => {
          const row = p.new as MessageRow
          const patch: MessagePatch = { id: row.id, body: row.body, editedAt: row.edited_at }
          if ("pinned_at" in row) patch.pinnedAt = row.pinned_at ?? null
          if ("reply_count" in row) patch.replyCount = row.reply_count ?? 0
          if ("last_reply_at" in row) patch.lastReplyAt = row.last_reply_at ?? null
          if (Array.isArray(row.attachments)) patch.attachments = row.attachments
          dispatch("onUpdate", patch)
        })
        // Deletes can't be filtered and arrive with the id only; rooms ignore ids they don't show.
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_messages" }, (p) => {
          const id = (p.old as { id?: string }).id
          if (id) dispatch("onDelete", id)
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions", filter: `room=eq.${room}` }, (p) => {
          const r = p.new as { message_id: string; user_id: string; emoji: Emoji }
          dispatch("onReaction", { messageId: r.message_id, userId: r.user_id, emoji: r.emoji, on: true })
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (p) => {
          const r = p.old as { message_id?: string; user_id?: string; emoji?: Emoji }
          if (r.message_id && r.user_id && r.emoji) dispatch("onReaction", { messageId: r.message_id, userId: r.user_id, emoji: r.emoji, on: false })
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_reactions", filter: `room=eq.${room}` }, (p) => {
          const r = p.new as { message_id: string; user_id: string; emoji: Emoji }
          dispatch("onReaction", { messageId: r.message_id, userId: r.user_id, emoji: r.emoji, on: true })
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_reactions" }, (p) => {
          const r = p.old as { message_id?: string; user_id?: string; emoji?: Emoji }
          if (r.message_id && r.user_id && r.emoji) dispatch("onReaction", { messageId: r.message_id, userId: r.user_id, emoji: r.emoji, on: false })
        })
        // Votes carry no room; each room ignores polls it does not show (and only sees rooms it can open).
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_poll_votes" }, (p) => {
          const v = p.new as { message_id: string; user_id: string; choice: number }
          dispatch("onVote", { messageId: v.message_id, userId: v.user_id, choice: v.choice, on: true })
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_poll_votes" }, (p) => {
          const v = p.old as { message_id?: string; user_id?: string; choice?: number }
          if (v.message_id && v.user_id && typeof v.choice === "number") dispatch("onVote", { messageId: v.message_id, userId: v.user_id, choice: v.choice, on: false })
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_polls", filter: `room=eq.${room}` }, (p) => {
          const r = p.new as { message_id: string; closes_at: string | null }
          dispatch("onPoll", { messageId: r.message_id, closesAt: r.closes_at })
        })
        .on("presence", { event: "sync" }, () => dispatch("onPresence", presenceList(channel.presenceState())))
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const m = (payload as { member?: Member }).member
          if (m?.id && m.id !== entry.me.member?.id) dispatch("onTyping", { id: m.id, name: String(m.name).slice(0, 60) })
        })
      let joined = false
      entry.track = () => {
        if (joined) channel.track({ member: entry.me.member, room, at: Date.now() })
      }
      entry.send = (event, payload) => {
        if (joined) channel.send({ type: "broadcast", event, payload })
      }
      entry.teardown = async () => {
        await client.removeChannel(channel)
      }
      channel.subscribe((status) => {
        joined = status === "SUBSCRIBED"
        if (joined) entry.track()
      })
    },
    handlers
  )
  let lastTyping = 0
  return {
    typing() {
      const entry = shared.get(topic)
      if (!entry?.me.member || Date.now() - lastTyping < 2500) return
      lastTyping = Date.now()
      entry.send("typing", { member: entry.me.member })
    },
    unsubscribe: stop,
  }
}

/**
 * Listens to every room at once: rooms being opened, messages arriving (for unread counts) and how many
 * people are in each room. `room` is the room this tab is showing.
 */
export function subscribeLobby(room: string, member: Member | null, handlers: LobbyHandlers) {
  const topic = "chat:lobby"
  return openShared<LobbyHandlers>(
    topic,
    { member, room },
    (entry, dispatch) => {
      const client = db()
      if (!client) return buildLocalLobby(entry, dispatch)
      const channel = realtimeChannel(client, topic)
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, (p) => {
          if (p.eventType === "DELETE") return
          const r = fromRoomRow(p.new as RoomRow)
          roomsCache = sortRooms([...(roomsCache ?? []).filter((x) => x.slug !== r.slug), r])
          dispatch("onRoom", r)
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages" }, (p) => {
          const r = p.new as { id: string; room: string; author_id: string; created_at: string }
          dispatch("onMessage", { id: r.id, room: r.room, authorId: r.author_id, createdAt: r.created_at })
        })
        .on("presence", { event: "sync" }, () => dispatch("onPresence", presenceList(channel.presenceState())))
      let joined = false
      entry.track = () => {
        if (joined) channel.track({ member: entry.me.member, room: entry.me.room, at: Date.now() })
      }
      entry.teardown = async () => {
        await client.removeChannel(channel)
      }
      channel.subscribe((status) => {
        joined = status === "SUBSCRIBED"
        if (joined) entry.track()
      })
    },
    handlers
  )
}

// ---------------------------------------------------------------------------------------------------------
// The same events between tabs of one browser, for copies without a database.

type LocalEvent =
  | { kind: "insert"; message: ChatMessage }
  | { kind: "patch"; room: string; patch: Partial<ChatMessage> & { id: string } }
  | { kind: "vote"; room: string; messageId: string; userId: string; choice: number; on: boolean }
  | { kind: "update"; room: string; id: string; body: string; editedAt: string | null }
  | { kind: "delete"; room: string; id: string }
  | { kind: "reaction"; room: string; messageId: string; userId: string; emoji: Emoji; on: boolean }
  | { kind: "room"; room: Room }
  | { kind: "typing"; room: string; key: string; member: Member }
  | { kind: "here"; key: string; member: Member | null; room: string; at: number; reply?: boolean }
  | { kind: "gone"; key: string }

let bus: BroadcastChannel | null | undefined

function local() {
  if (bus !== undefined) return bus
  bus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("nexverse-chat")
  return bus
}

// Who has which room open in this browser, refreshed by a heartbeat and forgotten after 25 seconds.
const tabs = new Map<string, Presence>()
const presenceListeners = new Set<() => void>()
let heartbeat: ReturnType<typeof setInterval> | undefined
let current: { member: Member | null; room: string } | null = null

function announce(reply = false) {
  if (!current) return
  const here: Presence = { key: tabKey, member: current.member, room: current.room, at: Date.now() }
  tabs.set(tabKey, here)
  local()?.postMessage({ kind: "here", ...here, reply } satisfies LocalEvent)
}

function prune() {
  const now = Date.now()
  for (const [k, p] of tabs) if (k !== tabKey && now - p.at > 25000) tabs.delete(k)
}

function localPresence(update: { member: Member | null; room: string } | null) {
  const bc = local()
  if (update) current = update
  if (!heartbeat && bc) {
    bc.addEventListener("message", (ev: MessageEvent<LocalEvent>) => {
      const e = ev.data
      if (e.kind === "here") {
        tabs.set(e.key, { key: e.key, member: e.member, room: e.room, at: Date.now() })
        if (!e.reply) announce(true)
      } else if (e.kind === "gone") tabs.delete(e.key)
      else return
      presenceListeners.forEach((l) => l())
    })
    heartbeat = setInterval(() => {
      prune()
      announce()
      presenceListeners.forEach((l) => l())
    }, 10000)
    addEventListener("pagehide", () => bc.postMessage({ kind: "gone", key: tabKey } satisfies LocalEvent))
  }
  announce()
  presenceListeners.forEach((l) => l())
}

/** When the chat closes in this tab, other tabs stop counting it. */
function leaveIfIdle() {
  if (shared.size > 0 || !current) return
  current = null
  tabs.delete(tabKey)
  local()?.postMessage({ kind: "gone", key: tabKey } satisfies LocalEvent)
}

function buildLocal(
  entry: Shared<RoomHandlers>,
  room: string,
  dispatch: Dispatch<RoomHandlers>
) {
  const bc = local()
  const onEvent = (ev: MessageEvent<LocalEvent>) => {
    const e = ev.data
    if (e.kind === "insert" && e.message.room === room) dispatch("onInsert", e.message)
    else if (e.kind === "update" && e.room === room) dispatch("onUpdate", { id: e.id, body: e.body, editedAt: e.editedAt })
    else if (e.kind === "patch" && e.room === room) dispatch("onUpdate", e.patch as MessagePatch)
    else if (e.kind === "vote" && e.room === room) dispatch("onVote", e)
    else if (e.kind === "delete" && e.room === room) dispatch("onDelete", e.id)
    else if (e.kind === "reaction" && e.room === room) dispatch("onReaction", e)
    else if (e.kind === "typing" && e.room === room && e.key !== tabKey) dispatch("onTyping", e.member)
  }
  const onPresence = () => dispatch("onPresence", [...tabs.values()].filter((p) => p.room === room))
  bc?.addEventListener("message", onEvent)
  presenceListeners.add(onPresence)
  entry.track = () => localPresence(entry.me)
  entry.send = (event, payload) => {
    if (event === "typing") bc?.postMessage({ kind: "typing", room, key: tabKey, member: (payload as { member: Member }).member } satisfies LocalEvent)
  }
  entry.teardown = async () => {
    bc?.removeEventListener("message", onEvent)
    presenceListeners.delete(onPresence)
    leaveIfIdle()
  }
  entry.track()
}

function buildLocalLobby(
  entry: Shared<LobbyHandlers>,
  dispatch: Dispatch<LobbyHandlers>
) {
  const bc = local()
  const onEvent = (ev: MessageEvent<LocalEvent>) => {
    const e = ev.data
    if (e.kind === "room") {
      roomsCache = sortRooms([...(roomsCache ?? localRooms()).filter((x) => x.slug !== e.room.slug), e.room])
      dispatch("onRoom", e.room)
    } else if (e.kind === "insert") {
      const m = e.message
      dispatch("onMessage", { id: m.id, room: m.room, authorId: m.author?.id ?? "", createdAt: m.createdAt })
    }
  }
  const onPresence = () => dispatch("onPresence", [...tabs.values()])
  bc?.addEventListener("message", onEvent)
  presenceListeners.add(onPresence)
  entry.track = () => localPresence(entry.me)
  entry.teardown = async () => {
    bc?.removeEventListener("message", onEvent)
    presenceListeners.delete(onPresence)
    leaveIfIdle()
  }
  entry.track()
}

export { live }
