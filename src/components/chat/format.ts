import type { ChatMessage } from "@/lib/chat"

const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false })
const day = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" })
const dayYear = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
const short = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })
const full = new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" })

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000)

export const clock = (iso: string) => time.format(new Date(iso))
export const fullDate = (iso: string) => full.format(new Date(iso))
export const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** "just now", "4 min ago", "14:05", "Yesterday 14:05", "Oct 12, 14:05". */
export function relative(iso: string, now: number) {
  const d = new Date(iso)
  const seconds = (now - d.getTime()) / 1000
  if (seconds < 45) return "just now"
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`
  const days = daysBetween(d, new Date(now))
  if (days <= 0) return time.format(d)
  if (days === 1) return `Yesterday ${time.format(d)}`
  return `${short.format(d)}, ${time.format(d)}`
}

export function dayLabel(iso: string, now: number) {
  const d = new Date(iso)
  const n = new Date(now)
  const days = daysBetween(d, n)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return d.getFullYear() === n.getFullYear() ? day.format(d) : dayYear.format(d)
}

/** A message continues the one before it when the same person wrote it within five minutes. */
export function continues(prev: ChatMessage | undefined, m: ChatMessage) {
  if (!prev || !prev.author || !m.author || prev.author.id !== m.author.id) return false
  if (m.replyTo || dayKey(prev.createdAt) !== dayKey(m.createdAt)) return false
  return Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60 * 1000
}

/** The first word of a name, which is what people type after @. */
export const handleOf = (name: string) => name.trim().split(/\s+/)[0] ?? ""

export function mentions(body: string, name: string | undefined) {
  const handle = name && handleOf(name).toLowerCase()
  if (!handle) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(body)
}

export function typingLine(names: string[]) {
  if (names.length === 0) return ""
  if (names.length === 1) return `${names[0]} is typing`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`
  return "Several people are typing"
}

/** The lobby lives at /chat; every other room at /chat/<slug>. */
export const roomHref = (slug: string) => (slug === "general" ? "/chat" : `/chat/${slug}`)

export const signInHref = (slug: string) => `/sign-in?next=${encodeURIComponent(roomHref(slug))}`
