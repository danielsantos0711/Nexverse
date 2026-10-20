"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArchiveIcon, BellOffIcon, InboxIcon, MailIcon, MailQuestionIcon, MessageSquarePlusIcon, PaletteIcon, PinIcon, SearchIcon, XIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { relative } from "@/components/chat/format"
import { ConversationView, GroupGlyph } from "@/components/messages/conversation-view"
import { stickerOf } from "@/components/chat/stickers"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ACCENT_VALUE } from "@/lib/chat"
import { useSocialPrefs, type DmPrefs } from "@/lib/chat-features"
import { NewMessageDialog } from "@/components/messages/new-message"
import { useNow } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cachedConversations, listConversations, onInboxChange, useInboxChannel, type Conversation } from "@/lib/messages"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * Direct messages: your conversations on the left, the open one on the right. On phones the list and the
 * conversation are separate screens (/messages and /messages/<id>), with a back button between them.
 */
export function MessagesApp({ id }: { id?: string }) {
  const { ready, user } = useSession()
  const [list, setList] = useState<Conversation[] | null>(() => cachedConversations())
  const [error, setError] = useState("")
  const [composing, setComposing] = useState(false)
  const [tab, setTab] = useState<"inbox" | "requests" | "archived">("inbox")
  const [query, setQuery] = useState("")
  const prefs = useSocialPrefs()
  useInboxChannel()

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    const load = () =>
      listConversations()
        .then((l) => {
          if (stale) return
          setList(l)
          setError("")
        })
        .catch((e: Error) => !stale && setError(e.message))
    load()
    const off = onInboxChange(() => {
      const next = cachedConversations()
      if (!stale && next) setList(next)
    })
    return () => {
      stale = true
      off()
    }
  }, [ready, user?.id])

  const signedOut = live && ready && !user

  return (
    <div className="shell max-w-6xl pt-4 pb-6 md:pt-6">
      <div className="glass grid h-[calc(100dvh-6.5rem)] min-h-[26rem] grid-cols-1 overflow-hidden rounded-2xl md:h-[calc(100dvh-8rem)] md:grid-cols-[20rem_1fr]">
        <aside aria-label="Conversations" className={cn("min-h-0 flex-col border-border md:flex md:border-r", id ? "hidden" : "flex")}>
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <MailIcon aria-hidden className="size-4 text-ion" /> Messages
            </h1>
            <div className="flex items-center gap-0.5">
              {!signedOut && <LookMenu bubble={prefs.dm.bubble} compact={prefs.dm.compact} onBubble={(b) => prefs.setDm({ bubble: b })} onCompact={(c) => prefs.setDm({ compact: c })} />}
              {live && !signedOut && (
                <Button variant="ghost" size="sm" onClick={() => setComposing(true)} disabled={!ready}>
                  <MessageSquarePlusIcon aria-hidden /> New
                </Button>
              )}
            </div>
          </div>
          {!signedOut && (
            <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2">
              <label className="relative block">
                <span className="sr-only">Search conversations</span>
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people and groups" className="h-8 pl-8" />
                {query && (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <XIcon aria-hidden className="size-3.5" />
                  </button>
                )}
              </label>
              <InboxTabs tab={tab} onTab={setTab} list={list ?? []} />
            </div>
          )}
          <InboxList list={filterInbox(list, tab, query)} tab={tab} active={id} error={error} signedOut={signedOut} loading={(live && !ready) || list === null} onCompose={() => setComposing(true)} />
        </aside>

        <section aria-label="Conversation" className={cn("min-h-0 min-w-0 flex-col md:flex", id ? "flex" : "hidden")}>
          {id ? (
            <ConversationView key={id} id={id} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-ion/10 text-ion">
                <MailIcon aria-hidden className="size-5" />
              </span>
              <p className="max-w-xs text-sm text-muted-foreground">
                {signedOut ? "Direct messages are private conversations between members. Sign in to read and send them." : live ? "Pick a conversation, or start a new one with any member." : "Direct messages need member accounts. This copy of Nexverse is not connected to its database, so there is nobody to write to yet."}
              </p>
              {live && !signedOut && (
                <Button variant="secondary" onClick={() => setComposing(true)}>
                  <MessageSquarePlusIcon aria-hidden /> New message
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
      <NewMessageDialog open={composing} onOpenChange={setComposing} />
    </div>
  )
}

function filterInbox(list: Conversation[] | null, tab: "inbox" | "requests" | "archived", query: string) {
  if (!list) return null
  const q = query.trim().toLowerCase()
  return list
    .filter((c) => (tab === "archived" ? c.archived : tab === "requests" ? c.request && !c.archived : !c.archived && !c.request))
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.other.name.toLowerCase().includes(q) || (c.other.handle ?? "").toLowerCase().includes(q))
}

function InboxTabs({ tab, onTab, list }: { tab: "inbox" | "requests" | "archived"; onTab: (t: "inbox" | "requests" | "archived") => void; list: Conversation[] }) {
  const requests = list.filter((c) => c.request && !c.archived).length
  const tabs = [
    { id: "inbox" as const, label: "Inbox", icon: InboxIcon, n: 0 },
    { id: "requests" as const, label: "Requests", icon: MailQuestionIcon, n: requests },
    { id: "archived" as const, label: "Archived", icon: ArchiveIcon, n: 0 },
  ]
  return (
    <div role="tablist" aria-label="Conversations" className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.03] p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTab(t.id)}
          className={cn("pressable inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs transition-colors", tab === t.id ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <t.icon aria-hidden className="size-3.5" />
          {t.label}
          {t.n > 0 && <span className="rounded-full bg-gold/20 px-1.5 text-[10px] text-gold tabular">{t.n}</span>}
        </button>
      ))}
    </div>
  )
}

const BUBBLES: DmPrefs["bubble"][] = ["ion", "violet", "teal", "rose", "amber", "gold"]

/** Your own look for messages: the colour of your bubbles, and a tighter list. Saved to your account. */
function LookMenu({ bubble, compact, onBubble, onCompact }: { bubble: DmPrefs["bubble"]; compact: boolean; onBubble: (b: DmPrefs["bubble"]) => void; onCompact: (c: boolean) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Messages look" title="Messages look" />}>
        <PaletteIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">Your bubble colour</p>
        <div className="flex gap-1.5 px-2 pb-2">
          {BUBBLES.map((b) => (
            <button
              key={b}
              type="button"
              aria-label={b}
              aria-pressed={bubble === b}
              onClick={() => onBubble(b)}
              className={cn("size-6 rounded-full ring-offset-2 ring-offset-popover", bubble === b && "ring-2 ring-foreground")}
              style={{ background: b === "ion" ? "var(--ion)" : ACCENT_VALUE[b] }}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCompact(!compact)}>{compact ? "Roomier conversations" : "Tighter conversations"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function preview(c: Conversation) {
  if (c.blocked) return "Blocked"
  if (!c.lastBody) return "No messages yet"
  const body = stickerOf(c.lastBody) ? "Sent a sticker" : c.lastBody.replace(/\s+/g, " ")
  const who = c.lastFromMe ? "You: " : c.kind === "group" && c.lastAuthorName ? `${c.lastAuthorName.split(/\s+/)[0]}: ` : ""
  return who + body
}

function InboxList({
  list,
  tab,
  active,
  error,
  signedOut,
  loading,
  onCompose,
}: {
  list: Conversation[] | null
  tab: "inbox" | "requests" | "archived"
  active?: string
  error: string
  signedOut: boolean
  loading: boolean
  onCompose: () => void
}) {
  const now = useNow()
  if (signedOut) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-4 text-sm text-muted-foreground">
        <p>Sign in to send and read direct messages. It takes an email address and nothing else.</p>
        <Link href="/sign-in?next=%2Fmessages" className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </div>
    )
  }
  if (loading) {
    return (
      <ul className="flex flex-col gap-1 p-2" aria-busy="true" aria-label="Loading conversations">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {error && (
        <p role="alert" className="m-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Conversations could not be loaded ({error}). Reload the page to try again.
        </p>
      )}
      {list && list.length === 0 && !error && tab !== "inbox" && (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">
          {tab === "requests" ? "No message requests. When someone you don’t follow writes first, it waits here until you accept." : "Nothing archived. Archive a conversation from its menu to tidy your inbox."}
        </p>
      )}
      {list && list.length === 0 && !error && tab === "inbox" && (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
          <p>{live ? "No conversations yet. Message someone from their profile, or start one here." : "No conversations. Direct messages work once this site is connected to its database."}</p>
          {live && (
            <Button variant="secondary" size="sm" onClick={onCompose}>
              <MessageSquarePlusIcon aria-hidden /> New message
            </Button>
          )}
        </div>
      )}
      <ul className="flex flex-col p-1.5">
        {(list ?? []).map((c) => {
          const on = c.id === active
          return (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                )}
              >
                {on && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-ion" />}
                {c.kind === "group" ? <GroupGlyph emoji={c.emoji} size={36} /> : <ChatAvatar id={c.other.id} name={c.other.name} size={36} />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("flex min-w-0 items-center gap-1 truncate text-sm", c.unread && !c.muted ? "font-semibold" : "font-medium")}>
                      <span className="truncate">{c.title}</span>
                      {c.kind === "group" && <span className="shrink-0 text-[11px] font-normal text-muted-foreground tabular">· {c.memberCount}</span>}
                      {c.pinned && <PinIcon aria-label="Pinned" className="size-3 shrink-0 text-gold" />}
                      {c.muted && <BellOffIcon aria-label="Muted" className="size-3 shrink-0 text-muted-foreground" />}
                    </span>
                    {c.lastMessageAt && now !== null && <span className="shrink-0 text-[11px] text-muted-foreground tabular">{relative(c.lastMessageAt, now)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs", c.unread && !c.muted ? "text-foreground" : "text-muted-foreground")}>{preview(c)}</span>
                    {c.unread > 0 && !c.blocked && (
                      <span className={cn("min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular", c.muted ? "bg-white/10 text-muted-foreground" : "bg-ion text-ion-foreground")}>
                        {c.unread > 99 ? "99+" : c.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
