import { useEffect, useSyncExternalStore } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { categoryPath, getCategory, getConstellation, getNews, getPerson, getResource, getThread, isQuestionId, resourcePath, threadTitle } from "@/lib/data"
import { getQuestion, useSession, type Member, type Question, type Submission } from "@/lib/store"
import { describeLiveTarget } from "@/lib/live/ids"
import { db, live } from "@/lib/supabase"

/**
 * Social layer: bookmarks (private), follows (public) and notifications (private, written by database triggers).
 *
 * Targets use the same readable keys as likes:
 *   model:<slug> dataset:<slug> tool:<slug> repo:<slug>   resources from the catalogue
 *   thread:<id>          a sample thread slug or a member's question uuid
 *   news:<id>            a sample news story
 *   constellation:<slug> a curated constellation
 *   share:<uuid>         a link a member shared (public.submissions)
 * Follows additionally use person:<handle>, member:<uuid>, category:<slug> and room:<slug>.
 */

export const TARGET = /^[a-z]{2,16}:[a-z0-9-]{1,80}$/
export const FOLLOWEE = /^(person|member|category|room):[a-z0-9-]{1,40}$/

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

function readLocal<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** Tiny observable used by the stores below so every button and page shares one copy of the state. */
function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      for (const l of listeners) l()
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

// ─── Bookmarks ──────────────────────────────────────────────────────────────────────────────────────────────

export type Bookmark = { target: string; createdAt: string }

const BOOKMARKS_KEY = "nexverse-bookmarks"
type LocalBookmark = { target: string; date: string }

const readLocalBookmarks = () => readLocal<LocalBookmark>(BOOKMARKS_KEY).filter((b) => typeof b?.target === "string" && TARGET.test(b.target))

/** Signed-in members keep bookmarks in the database; everyone else keeps them in this browser. */
async function signedInClient() {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session ? { client, userId: data.session.user.id } : null
}

export async function getBookmarks(): Promise<Bookmark[]> {
  const s = await signedInClient()
  if (!s) return readLocalBookmarks().map((b) => ({ target: b.target, createdAt: b.date }))
  const { data, error } = await s.client.from("bookmarks").select("target, created_at").order("created_at", { ascending: false }).limit(500)
  fail(error)
  return (data as { target: string; created_at: string }[]).map((b) => ({ target: b.target, createdAt: b.created_at }))
}

export async function isBookmarked(target: string): Promise<boolean> {
  const s = await signedInClient()
  if (!s) return readLocalBookmarks().some((b) => b.target === target)
  const { data, error } = await s.client.from("bookmarks").select("target").eq("target", target).maybeSingle()
  fail(error)
  return Boolean(data)
}

/** Saves or removes a bookmark and returns the new state. Pass `on` to set it explicitly. */
export async function toggleBookmark(target: string, on?: boolean): Promise<boolean> {
  if (!TARGET.test(target)) throw new Error(`Not a bookmark target: ${target}`)
  const current = bookmarks.get()
  const next = on ?? !current.targets.has(target)
  // Optimistic: the shared store changes first so every SaveButton for this target updates together.
  setBookmarkLocal(target, next)
  try {
    const s = await signedInClient()
    if (!s) {
      const rest = readLocalBookmarks().filter((b) => b.target !== target)
      writeLocal(BOOKMARKS_KEY, next ? [{ target, date: new Date().toISOString() }, ...rest] : rest)
    } else if (next) {
      const { error } = await s.client.from("bookmarks").upsert({ target }, { onConflict: "user_id,target", ignoreDuplicates: true })
      fail(error)
    } else {
      const { error } = await s.client.from("bookmarks").delete().eq("target", target).eq("user_id", s.userId)
      fail(error)
    }
  } catch (e) {
    setBookmarkLocal(target, !next)
    throw e
  }
  return next
}

type BookmarkState = { ready: boolean; owner: string | null; list: Bookmark[]; targets: Set<string> }
const EMPTY_BOOKMARKS: BookmarkState = { ready: false, owner: null, list: [], targets: new Set() }
const bookmarks = observable<BookmarkState>(EMPTY_BOOKMARKS)
let bookmarksFor: string | undefined

function setBookmarkLocal(target: string, on: boolean) {
  const s = bookmarks.get()
  const list = s.list.filter((b) => b.target !== target)
  const next = on ? [{ target, createdAt: new Date().toISOString() }, ...list] : list
  bookmarks.set({ ...s, list: next, targets: new Set(next.map((b) => b.target)) })
}

/** Moves bookmarks made while signed out into the member's account, then forgets the browser copy. */
async function adoptLocalBookmarks() {
  const local = readLocalBookmarks()
  const client = db()
  if (!local.length || !client) return
  const { error } = await client
    .from("bookmarks")
    .upsert(local.map((b) => ({ target: b.target, created_at: b.date })), { onConflict: "user_id,target", ignoreDuplicates: true })
  if (!error) writeLocal(BOOKMARKS_KEY, [])
}

async function loadBookmarks(owner: string | null) {
  if (owner) await adoptLocalBookmarks().catch(() => {})
  const list = await getBookmarks().catch(() => [] as Bookmark[])
  if (bookmarksFor !== (owner ?? "")) return
  bookmarks.set({ ready: true, owner, list, targets: new Set(list.map((b) => b.target)) })
}

/** Everything you saved, shared by every SaveButton and the Saved page. */
export function useBookmarks() {
  const { ready, user } = useSession()
  const owner = user?.id ?? null
  useEffect(() => {
    if (live && !ready) return
    const key = owner ?? ""
    if (bookmarksFor === key) return
    bookmarksFor = key
    bookmarks.set({ ...EMPTY_BOOKMARKS, owner })
    void loadBookmarks(owner)
  }, [ready, owner])
  return useSyncExternalStore(bookmarks.subscribe, bookmarks.get, () => EMPTY_BOOKMARKS)
}

// ─── Follows ────────────────────────────────────────────────────────────────────────────────────────────────

const FOLLOWS_KEY = "nexverse-follows"

export type FollowCounts = { followers: number; following: number }

/**
 * Members following a target, and, for a member target ("member:<uuid>"), how many things that member follows.
 * Without a database the counts reflect this browser only.
 */
export async function getFollowCounts(followee: string): Promise<FollowCounts> {
  const client = db()
  if (!client) {
    const mine = readLocal<string>(FOLLOWS_KEY)
    return { followers: mine.includes(followee) ? 1 : 0, following: followee === "member:local" ? mine.length : 0 }
  }
  const memberId = followee.startsWith("member:") ? followee.slice(7) : null
  const [followers, following] = await Promise.all([
    client.from("follows").select("followee", { count: "exact", head: true }).eq("followee", followee),
    memberId ? client.from("follows").select("followee", { count: "exact", head: true }).eq("follower_id", memberId) : Promise.resolve({ count: 0, error: null }),
  ])
  fail(followers.error)
  fail(following.error)
  return { followers: followers.count ?? 0, following: following.count ?? 0 }
}

export async function isFollowing(followee: string, userId?: string | null): Promise<boolean> {
  const client = db()
  if (!client) return readLocal<string>(FOLLOWS_KEY).includes(followee)
  if (!userId) return false
  const { data, error } = await client.from("follows").select("followee").eq("followee", followee).eq("follower_id", userId).maybeSingle()
  fail(error)
  return Boolean(data)
}

/** Follows or unfollows. With a database you must be signed in: callers send signed-out visitors to sign in. */
export async function toggleFollow(followee: string, on: boolean) {
  if (!FOLLOWEE.test(followee)) throw new Error(`Not something you can follow: ${followee}`)
  const client = db()
  if (!client) {
    const rest = readLocal<string>(FOLLOWS_KEY).filter((f) => f !== followee)
    writeLocal(FOLLOWS_KEY, on ? [followee, ...rest] : rest)
    return
  }
  const { data } = await client.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error("Sign in to follow.")
  if (followee === `member:${userId}`) throw new Error("You cannot follow yourself.")
  const { error } = on
    ? await client.from("follows").upsert({ followee }, { onConflict: "follower_id,followee", ignoreDuplicates: true })
    : await client.from("follows").delete().eq("followee", followee).eq("follower_id", userId)
  fail(error)
}

export type Follow = { followee: string; createdAt: string }

/** What a member follows, newest first. */
export async function listFollowing(userId?: string | null): Promise<Follow[]> {
  const client = db()
  if (!client) return readLocal<string>(FOLLOWS_KEY).map((followee) => ({ followee, createdAt: "" }))
  if (!userId) return []
  const { data, error } = await client.from("follows").select("followee, created_at").eq("follower_id", userId).order("created_at", { ascending: false }).limit(500)
  fail(error)
  return (data as { followee: string; created_at: string }[]).map((f) => ({ followee: f.followee, createdAt: f.created_at }))
}

// ─── Notifications ──────────────────────────────────────────────────────────────────────────────────────────

export type NotificationKind = "reply" | "like" | "follow" | "mention" | "system"

export type Notification = {
  id: string
  kind: NotificationKind
  actor: Member | null
  target: string | null
  snippet: string | null
  readAt: string | null
  createdAt: string
}

const NOTIFICATION_COLUMNS = "id, kind, target, snippet, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, name)"

type NotificationRow = { id: string; kind: NotificationKind; target: string | null; snippet: string | null; read_at: string | null; created_at: string; actor: Member | null }

const fromNotificationRow = (r: NotificationRow): Notification => ({
  id: r.id,
  kind: r.kind,
  actor: r.actor,
  target: r.target,
  snippet: r.snippet,
  readAt: r.read_at,
  createdAt: r.created_at,
})

export async function listNotifications({ limit = 50, unread = false, before }: { limit?: number; unread?: boolean; before?: string } = {}): Promise<Notification[]> {
  const client = db()
  if (!client) return []
  let query = client.from("notifications").select(NOTIFICATION_COLUMNS).order("created_at", { ascending: false }).limit(limit)
  if (unread) query = query.is("read_at", null)
  if (before) query = query.lt("created_at", before)
  const { data, error } = await query
  fail(error)
  return (data as unknown as NotificationRow[]).map(fromNotificationRow)
}

async function getNotification(id: string): Promise<Notification | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.from("notifications").select(NOTIFICATION_COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromNotificationRow(data as unknown as NotificationRow) : null
}

async function countUnread(): Promise<number> {
  const client = db()
  if (!client) return 0
  const { count, error } = await client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
  fail(error)
  return count ?? 0
}

/** Marks some notifications read (or unread again with `read: false`). */
export async function markRead(ids: string[], read = true) {
  const client = db()
  if (!client || !ids.length) return
  const at = read ? new Date().toISOString() : null
  const before = inbox.get()
  const changed = before.items.filter((n) => ids.includes(n.id) && Boolean(n.readAt) !== read).length
  inbox.set({
    ...before,
    items: before.items.map((n) => (ids.includes(n.id) ? { ...n, readAt: at } : n)),
    unread: Math.max(0, before.unread + (read ? -changed : changed)),
  })
  const { error } = await client.from("notifications").update({ read_at: at }).in("id", ids)
  if (error) {
    inbox.set(before)
    throw new Error(error.message)
  }
}

export async function markAllRead() {
  const client = db()
  if (!client) return
  const before = inbox.get()
  const at = new Date().toISOString()
  inbox.set({ ...before, unread: 0, items: before.items.map((n) => (n.readAt ? n : { ...n, readAt: at })) })
  const { error } = await client.from("notifications").update({ read_at: at }).is("read_at", null)
  if (error) {
    inbox.set(before)
    throw new Error(error.message)
  }
}

export async function deleteNotification(id: string) {
  const client = db()
  if (!client) return
  const before = inbox.get()
  const gone = before.items.find((n) => n.id === id)
  inbox.set({ ...before, items: before.items.filter((n) => n.id !== id), unread: before.unread - (gone && !gone.readAt ? 1 : 0) })
  const { error } = await client.from("notifications").delete().eq("id", id)
  if (error) {
    inbox.set(before)
    throw new Error(error.message)
  }
}

let channelSeq = 0

/** Calls `onInsert` for every new notification addressed to `userId`. Returns the unsubscribe function. */
export function subscribeNotifications(userId: string, onInsert: (n: Notification) => void) {
  const client = db()
  if (!client) return () => {}
  const channel: RealtimeChannel = client
    .channel(`notifications:${userId}:${++channelSeq}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
      const id = (payload.new as { id?: string }).id
      if (!id) return
      // The payload has no actor name, so the row is read again with its join.
      getNotification(id)
        .then((n) => n && onInsert(n))
        .catch(() => {})
    })
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

type Inbox = { ready: boolean; owner: string | null; items: Notification[]; unread: number; error: string }
const EMPTY_INBOX: Inbox = { ready: false, owner: null, items: [], unread: 0, error: "" }
const inbox = observable<Inbox>(EMPTY_INBOX)
let inboxFor: string | null = null
let stopInbox: (() => void) | null = null
let inboxUsers = 0

function openInbox(owner: string) {
  if (inboxFor === owner) return
  stopInbox?.()
  inboxFor = owner
  inbox.set({ ...EMPTY_INBOX, owner })
  Promise.all([listNotifications({ limit: 60 }), countUnread()])
    .then(([items, unread]) => {
      if (inboxFor === owner) inbox.set({ ready: true, owner, items, unread, error: "" })
    })
    .catch((e: Error) => inboxFor === owner && inbox.set({ ...inbox.get(), ready: true, error: e.message }))
  stopInbox = subscribeNotifications(owner, (n) => {
    const s = inbox.get()
    if (s.owner !== owner || s.items.some((x) => x.id === n.id)) return
    inbox.set({ ...s, items: [n, ...s.items], unread: s.unread + (n.readAt ? 0 : 1) })
  })
}

function closeInbox() {
  stopInbox?.()
  stopInbox = null
  inboxFor = null
  inbox.set(EMPTY_INBOX)
}

/** Your notifications, kept live while any component uses them. Empty when signed out or without a database. */
export function useNotifications() {
  const { ready, user } = useSession()
  const owner = user?.id ?? null
  useEffect(() => {
    if (!live || !ready) return
    if (!owner) {
      closeInbox()
      return
    }
    inboxUsers++
    openInbox(owner)
    return () => {
      inboxUsers--
      // Defer, so moving between pages that both use the inbox keeps the channel open.
      setTimeout(() => inboxUsers === 0 && closeInbox(), 1000)
    }
  }, [ready, owner])
  return useSyncExternalStore(inbox.subscribe, inbox.get, () => EMPTY_INBOX)
}

/** How many notifications you have not read yet. */
export function useUnreadCount() {
  return useNotifications().unread
}

/** Loads older notifications into the shared inbox (for the full page). Returns how many arrived. */
export async function loadMoreNotifications(limit = 40) {
  const s = inbox.get()
  const last = s.items[s.items.length - 1]
  if (!last) return 0
  const more = await listNotifications({ limit, before: last.createdAt })
  const cur = inbox.get()
  if (cur.owner !== s.owner) return 0
  const seen = new Set(cur.items.map((n) => n.id))
  inbox.set({ ...cur, items: [...cur.items, ...more.filter((n) => !seen.has(n.id))] })
  return more.length
}

// ─── Describing targets ─────────────────────────────────────────────────────────────────────────────────────

export type TargetInfo = { type: string; id: string; label: string; href: string | null }

/** A human label and a link for a target key, from the sample catalogue. Member content is labelled generically. */
export function describeTarget(target: string): TargetInfo {
  const i = target.indexOf(":")
  const type = target.slice(0, i)
  const id = target.slice(i + 1)
  switch (type) {
    case "model":
    case "dataset":
    case "tool":
    case "repo": {
      const r = getResource(id)
      return { type, id, label: r?.name ?? id, href: resourcePath({ kind: type, slug: id }) }
    }
    case "thread": {
      const t = getThread(id)
      return { type, id, label: t ? threadTitle(t) : isQuestionId(id) ? "your thread" : id, href: `/forum/${id}` }
    }
    case "news":
      return { type, id, label: getNews(id)?.title ?? id, href: `/news/${id}` }
    case "constellation":
      return { type, id, label: getConstellation(id)?.name ?? id, href: `/constellations/${id}` }
    case "person":
      return { type, id, label: getPerson(id)?.name ?? `@${id}`, href: `/people/${id}` }
    case "category":
      return { type, id, label: getCategory(id)?.name ?? id, href: categoryPath(id) }
    case "room":
      return { type, id, label: `#${id}`, href: `/chat/${id}` }
    case "member":
      return { type, id, label: "a member", href: null }
    case "share":
      return { type, id, label: "a shared link", href: null }
    case "project":
      return { type, id, label: "a project", href: `/p/${id}` }
    case "collection":
      return { type, id, label: "a collection", href: `/collections/${id}` }
    default: {
      const item = describeLiveTarget(target)
      if (item) return { type: item.type, id: item.id, label: item.label, href: item.href }
      return { type, id, label: id, href: null }
    }
  }
}

// ─── Resolving member content for the Saved page ────────────────────────────────────────────────────────────

const SUBMISSION_COLUMNS = "id, kind, title, url, summary, tags, created_at, author:profiles(id, name)"

/** Member-shared links by id (targets "share:<uuid>"). Missing or deleted ones are simply absent. */
export async function getSharedLinks(ids: string[]): Promise<Submission[]> {
  if (!ids.length) return []
  const client = db()
  if (!client) {
    type LocalSubmission = Omit<Submission, "createdAt" | "author" | "local"> & { date: string }
    return readLocal<LocalSubmission>("nexverse-submissions")
      .filter((s) => ids.includes(s.id))
      .map((s) => ({ ...s, tags: s.tags ?? [], createdAt: s.date, author: null, local: true }))
  }
  const { data, error } = await client.from("submissions").select(SUBMISSION_COLUMNS).in("id", ids.slice(0, 200))
  fail(error)
  return (data as unknown as (Omit<Submission, "createdAt" | "local"> & { created_at: string })[]).map((r) => ({
    ...r,
    tags: r.tags ?? [],
    createdAt: r.created_at,
    local: false,
  }))
}

/** Members' questions by id (targets "thread:<uuid>"). */
export async function getMemberThreads(ids: string[]): Promise<Question[]> {
  const found = await Promise.all(ids.slice(0, 100).map((id) => getQuestion(id).catch(() => null)))
  return found.filter((q): q is Question => Boolean(q))
}

/** Display names of members by id, for "member:<uuid>" follows. */
export async function getMemberNames(ids: string[]): Promise<Record<string, string>> {
  const client = db()
  if (!client || !ids.length) return {}
  const { data, error } = await client.from("profiles").select("id, name").in("id", ids.slice(0, 200))
  fail(error)
  return Object.fromEntries((data as Member[]).map((m) => [m.id, m.name]))
}
