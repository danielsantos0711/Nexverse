"use client"

import { useEffect, useRef, useState } from "react"
import { BookmarkIcon, CalendarIcon, MessagesSquareIcon, PinIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Composer, type ComposerHandle, type ComposerSend } from "@/components/chat/composer"
import { clock, dayLabel } from "@/components/chat/format"
import { ChatAvatar } from "@/components/chat/glyphs"
import { MessageBody } from "@/components/chat/message-body"
import { MessageItem, type MessageActions, type MessageFeatures } from "@/components/chat/message-item"
import { PeoplePanel, type Crowd } from "@/components/chat/people"
import { stickerLabel, stickerOf } from "@/components/chat/stickers"
import { listPinned, searchRoom, type ChatMessage, type Room } from "@/lib/chat"
import { listSaved, type Poll } from "@/lib/chat-features"
import type { Member } from "@/lib/store"
import { cn } from "@/lib/utils"

export type PanelTab = "people" | "thread" | "pins" | "saved" | "search"

const TABS: { id: PanelTab; label: string; icon: typeof UsersIcon }[] = [
  { id: "people", label: "Crew here", icon: UsersIcon },
  { id: "thread", label: "Thread", icon: MessagesSquareIcon },
  { id: "pins", label: "Pinned", icon: PinIcon },
  { id: "saved", label: "Saved", icon: BookmarkIcon },
  { id: "search", label: "Search", icon: SearchIcon },
]

type ThreadProps = {
  root: ChatMessage | null
  replies: ChatMessage[]
  loading: boolean
  onSend: (msg: ComposerSend) => void
  onTyping: () => void
}

/**
 * The column beside the messages: who is here, the open thread, the room's pins, your saved messages and a
 * search of the room. On wide screens it sits on the right; on phones the same panel opens as a sheet.
 */
export function RoomPanel({
  tab,
  onTab,
  slug,
  room,
  crowd,
  me,
  canWrite,
  now,
  actions,
  features,
  polls,
  savedIds,
  thread,
  pinsVersion,
  searchSeed,
  onJump,
  onJumpDate,
  onClose,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  slug: string
  room: Room | undefined
  crowd: Crowd
  me: Member | null
  canWrite: boolean
  now: number
  actions: MessageActions
  features: MessageFeatures
  polls: Record<string, Poll>
  savedIds: Set<string>
  thread: ThreadProps
  /** Bumps when a pin changes, so the list reloads. */
  pinsVersion: number
  searchSeed: string
  onJump: (m: ChatMessage) => void
  onJumpDate: (day: string) => void
  onClose?: () => void
}) {
  const tabs = TABS.filter((t) => (t.id === "thread" ? Boolean(thread.root) : t.id === "pins" ? features.pins : t.id === "saved" ? features.save : true))
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Room panel" className="flex shrink-0 items-center gap-0.5 border-b border-border px-1.5 py-1.5 pr-12 xl:pr-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            title={t.label}
            className={cn(
              "pressable inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors",
              tab === t.id ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <t.icon aria-hidden className="size-3.5" />
            <span className={cn(tab === t.id ? "inline" : "sr-only")}>{t.label}</span>
          </button>
        ))}
        {onClose && (
          <Button variant="ghost" size="icon-xs" className="ml-auto hidden xl:inline-flex" aria-label="Close the panel" onClick={onClose}>
            <XIcon aria-hidden />
          </Button>
        )}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "people" && <PeoplePanel room={room} crowd={crowd} me={me} />}
        {tab === "thread" && thread.root && <ThreadPane slug={slug} me={me} canWrite={canWrite} now={now} actions={actions} features={features} polls={polls} savedIds={savedIds} {...thread} root={thread.root} />}
        {tab === "pins" && <Loaded key={`pins-${pinsVersion}`} load={() => listPinned(slug)} empty="Nothing pinned yet. Pins keep the important messages of a room in reach." now={now} onJump={onJump} />}
        {tab === "saved" && <Loaded key={`saved-${savedIds.size}`} load={() => listSaved()} empty="Save a message from its menu and it waits for you here, from any room." now={now} onJump={onJump} showRoom />}
        {tab === "search" && <SearchPane slug={slug} seed={searchSeed} now={now} onJump={onJump} onJumpDate={onJumpDate} />}
      </div>
    </div>
  )
}

function ThreadPane({
  slug,
  root,
  replies,
  loading,
  me,
  canWrite,
  now,
  actions,
  features,
  polls,
  savedIds,
  onSend,
  onTyping,
}: ThreadProps & {
  slug: string
  root: ChatMessage
  me: Member | null
  canWrite: boolean
  now: number
  actions: MessageActions
  features: MessageFeatures
  polls: Record<string, Poll>
  savedIds: Set<string>
}) {
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<ComposerHandle>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [replies.length])
  const threadFeatures = { ...features, threads: false }
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ol className="flex flex-col">
          <MessageItem
            message={root}
            grouped={false}
            me={me}
            canWrite={canWrite}
            animateIn={false}
            editing={false}
            highlighted={false}
            now={now}
            actions={actions}
            features={threadFeatures}
            poll={polls[root.id]}
            saved={savedIds.has(root.id)}
            inThread
            compact
          />
        </ol>
        <div className="my-2 flex items-center gap-2 px-4 text-[11px] font-medium text-muted-foreground">
          <span>{replies.length === 1 ? "1 reply" : `${replies.length} replies`}</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
        {loading ? (
          <p className="px-4 text-sm text-muted-foreground">Loading the thread…</p>
        ) : (
          <ol className="flex flex-col">
            {replies.map((m, i) => (
              <MessageItem
                key={m.id}
                message={m}
                grouped={i > 0 && replies[i - 1].author?.id === m.author?.id}
                me={me}
                canWrite={canWrite}
                animateIn={Boolean(m.status)}
                editing={false}
                highlighted={false}
                now={now}
                actions={actions}
                features={threadFeatures}
                saved={savedIds.has(m.id)}
                inThread
                compact
              />
            ))}
          </ol>
        )}
        <div ref={end} />
      </div>
      {canWrite && (
        <div className="shrink-0 border-t border-border p-2">
          <Composer
            ref={box}
            room={`${slug}:thread:${root.id}`}
            roomName="the thread"
            placeholder="Reply in the thread…"
            replyTo={null}
            onCancelReply={() => {}}
            onSend={onSend}
            onTyping={onTyping}
            onEditLast={() => {}}
            features={{ pictures: true, stickers: true, polls: false, mentions: true, ai: false }}
            where="dm"
          />
        </div>
      )}
    </>
  )
}

/** One found, pinned or saved message: who, when, and the start of it. Tap to jump to it in the room. */
function ResultRow({ m, now, onJump, showRoom }: { m: ChatMessage; now: number; onJump: (m: ChatMessage) => void; showRoom?: boolean }) {
  const sticker = stickerOf(m.body)
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump(m)}
        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none"
      >
        <ChatAvatar id={m.author?.id ?? m.id} name={m.author?.name} size={26} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 text-xs">
            <span className="truncate font-medium text-foreground">{m.author?.name ?? "A member"}</span>
            {showRoom && <span className="truncate text-muted-foreground">in #{m.room}</span>}
            <span className="ml-auto shrink-0 text-muted-foreground tabular">
              {now ? dayLabel(m.createdAt, now) : ""} {clock(m.createdAt)}
            </span>
          </span>
          <span className="line-clamp-3 text-sm text-foreground/90">
            {sticker ? `Sticker: ${stickerLabel(sticker)}` : m.kind === "poll" ? `Poll: ${m.body}` : <MessageBody text={m.body.slice(0, 400)} compact previews={false} />}
          </span>
        </span>
      </button>
    </li>
  )
}

function Loaded({ load, empty, now, onJump, showRoom }: { load: () => Promise<ChatMessage[]>; empty: string; now: number; onJump: (m: ChatMessage) => void; showRoom?: boolean }) {
  const [list, setList] = useState<ChatMessage[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let stale = false
    load().then(
      (l) => !stale && setList(l),
      (e: Error) => !stale && setError(e.message)
    )
    return () => {
      stale = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>
  if (!list) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  if (!list.length) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {list.map((m) => (
        <ResultRow key={m.id} m={m} now={now} onJump={onJump} showRoom={showRoom} />
      ))}
    </ul>
  )
}

function SearchPane({ slug, seed, now, onJump, onJumpDate }: { slug: string; seed: string; now: number; onJump: (m: ChatMessage) => void; onJumpDate: (day: string) => void }) {
  const [query, setQuery] = useState(seed)
  const [results, setResults] = useState<ChatMessage[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState("")
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let stale = false
    const t = setTimeout(() => {
      setBusy(true)
      searchRoom(slug, q)
        .then((r) => !stale && setResults(r))
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setBusy(false))
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query, slug])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <label className="relative block">
          <span className="sr-only">Search this room</span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this room" className="pl-8" />
        </label>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (day) onJumpDate(day)
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="shrink-0">Jump to</span>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2 text-xs text-foreground [color-scheme:dark] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button type="submit" size="xs" variant="secondary" disabled={!day}>
            Go
          </Button>
        </form>
      </div>
      {results === null || query.trim().length < 2 ? (
        <p className="p-4 text-sm text-muted-foreground">{busy ? "Searching…" : "Type two letters or more. Every word must appear in the message."}</p>
      ) : results.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No messages here match “{query.trim()}”.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label={`${results.length} results`}>
          {results.map((m) => (
            <ResultRow key={m.id} m={m} now={now} onJump={onJump} />
          ))}
        </ul>
      )}
    </div>
  )
}
