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
export const EMOJIS = ["👍", "❤️", "🎉", "🚀", "👀", "🤔", "😂", "🔥"] as const
export type Emoji = (typeof EMOJIS)[number]
export const ROOM_SLUG = /^[a-z0-9-]{2,40}$/

export type Room = { slug: string; name: string; topic: string; createdBy: string | null; createdAt: string }

export type Reaction = { emoji: Emoji; userId: string }

export type QuotedMessage = { id: string; body: string; author: Member | null }

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
  /** Only on messages this browser is still sending, or failed to send. */
  status?: "sending" | "failed"
  error?: string
}

/** Someone with the room open. Signed-out readers count, but have no member. */
export type Presence = { key: string; member: Member | null; room: string; at: number }

export type RoomHandlers = {
  onInsert?: (m: ChatMessage) => void
  onUpdate?: (m: { id: string; body: string; editedAt: string | null }) => void
  onDelete?: (id: string) => void
  onReaction?: (r: { messageId: string; userId: string; emoji: Emoji; on: boolean }) => void
  onPresence?: (people: Presence[]) => void
  onTyping?: (member: Member) => void
}

export type LobbyHandlers = {
  onRoom?: (room: Room) => void
  onMessage?: (m: { id: string; room: string; authorId: string; createdAt: string }) => void
  onPresence?: (people: Presence[]) => void
}

/** The rooms every copy of Nexverse starts with; the database seeds the same ten. */
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
].map(([slug, name, topic]) => ({ slug, name, topic, createdBy: null, createdAt: "2026-10-18T19:00:00Z" }))

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
const ROOM_COLUMNS = "slug, name, topic, created_by, created_at"

type RoomRow = { slug: string; name: string; topic: string; created_by: string | null; created_at: string }
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
}

const fromRoomRow = (r: RoomRow): Room => ({ slug: r.slug, name: r.name, topic: r.topic, createdBy: r.created_by, createdAt: r.created_at })

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
    reactions: (r.reactions ?? []).map((x) => ({ emoji: x.emoji, userId: x.user_id })),
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

/** The lobby first, then the starting rooms in their order, then members' rooms oldest first. */
function sortRooms(rooms: Room[]) {
  const order = (slug: string) => {
    const i = DEFAULT_ROOMS.findIndex((r) => r.slug === slug)
    return i === -1 ? DEFAULT_ROOMS.length : i
  }
  return [...rooms].sort((a, b) => order(a.slug) - order(b.slug) || a.createdAt.localeCompare(b.createdAt))
}

let roomsCache: Room[] | null = null

/** The last list of rooms this page loaded, for drawing the rail before the next load finishes. */
export const cachedRooms = () => roomsCache ?? DEFAULT_ROOMS

export async function listRooms(): Promise<Room[]> {
  const client = db()
  if (!client) return (roomsCache = localRooms())
  const { data, error } = await client.from("rooms").select(ROOM_COLUMNS).order("created_at").limit(200)
  fail(error)
  return (roomsCache = sortRooms((data as RoomRow[]).map(fromRoomRow)))
}

export async function getRoom(slug: string): Promise<Room | null> {
  const cached = roomsCache?.find((r) => r.slug === slug)
  if (cached) return cached
  const client = db()
  if (!client) return localRooms().find((r) => r.slug === slug) ?? null
  const { data, error } = await client.from("rooms").select(ROOM_COLUMNS).eq("slug", slug).maybeSingle()
  fail(error)
  return data ? fromRoomRow(data as RoomRow) : null
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

/** A page of a room's messages, oldest first. Pass the oldest one you have as `before` to go further back. */
export async function listMessages(room: string, { before, limit = PAGE_SIZE }: { before?: string; limit?: number } = {}) {
  const client = db()
  if (!client) {
    const all = readJSON<ChatMessage[]>(messagesKey(room), [])
    const older = before ? all.filter((m) => m.createdAt < before) : all
    return { messages: older.slice(-limit), more: older.length > limit }
  }
  let query = client.from("room_messages").select(MESSAGE_COLUMNS).eq("room", room).order("created_at", { ascending: false }).limit(limit + 1)
  if (before) query = query.lt("created_at", before)
  const { data, error } = await query
  fail(error)
  const rows = data as unknown as MessageRow[]
  const messages = rows.slice(0, limit).map(fromMessageRow).reverse()
  messages.forEach(remember)
  return { messages, more: rows.length > limit }
}

export async function getMessage(id: string): Promise<ChatMessage | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.from("room_messages").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromMessageRow(data as unknown as MessageRow) : null
}

/**
 * Sends a message. Pass the id of the optimistic copy already on screen, so the live echo of this insert
 * replaces it instead of appearing twice, and a retry after a lost response does not post it twice.
 */
export async function sendMessage(
  room: string,
  body: string,
  { id = crypto.randomUUID(), replyTo = null, parent = null }: { id?: string; replyTo?: string | null; parent?: QuotedMessage | null } = {}
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
    }
    writeJSON(messagesKey(room), [...readJSON<ChatMessage[]>(messagesKey(room), []), m].slice(-LOCAL_CAP))
    local()?.postMessage({ kind: "insert", message: m } satisfies LocalEvent)
    return m
  }
  const { data, error } = await client
    .from("room_messages")
    .insert({ id, room, body: text, reply_to: replyTo })
    .select(MESSAGE_COLUMNS)
    .single()
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
  const { error } = on
    ? await client.from("message_reactions").insert({ message_id: message.id, emoji })
    : await client.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji)
  if (on && error?.code === "23505") return
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
          dispatch("onUpdate", { id: row.id, body: row.body, editedAt: row.edited_at })
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
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "rooms" }, (p) => {
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
