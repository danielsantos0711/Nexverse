"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MailIcon, MessageSquarePlusIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { relative } from "@/components/chat/format"
import { ConversationView } from "@/components/messages/conversation-view"
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
            {!signedOut && (
              <Button variant="ghost" size="sm" onClick={() => setComposing(true)} disabled={live && !ready}>
                <MessageSquarePlusIcon aria-hidden /> New
              </Button>
            )}
          </div>
          <InboxList list={list} active={id} error={error} signedOut={signedOut} loading={(live && !ready) || list === null} onCompose={() => setComposing(true)} />
          {!live && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Local preview: conversations stay in this browser, and the sample people do not answer.</p>}
        </aside>

        <section aria-label="Conversation" className={cn("min-h-0 min-w-0 flex-col md:flex", id ? "flex" : "hidden")}>
          {id ? (
            <ConversationView key={id} id={id} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-ion/10 text-ion">
                <MailIcon aria-hidden className="size-5" />
              </span>
              <p className="max-w-xs text-sm text-muted-foreground">Pick a conversation, or start a new one with any member.</p>
              {!signedOut && (
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

function InboxList({
  list,
  active,
  error,
  signedOut,
  loading,
  onCompose,
}: {
  list: Conversation[] | null
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
          Conversations could not be loaded. {error}
        </p>
      )}
      {list && list.length === 0 && !error && (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
          <p>No conversations yet. Message someone from their profile, or start one here.</p>
          <Button variant="secondary" size="sm" onClick={onCompose}>
            <MessageSquarePlusIcon aria-hidden /> New message
          </Button>
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
                <ChatAvatar id={c.other.id} name={c.other.name} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.other.name}</span>
                    {c.lastMessageAt && now !== null && <span className="shrink-0 text-[11px] text-muted-foreground tabular">{relative(c.lastMessageAt, now)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
                      {c.blocked ? "Blocked" : c.lastBody ? `${c.lastFromMe ? "You: " : ""}${c.lastBody.replace(/\s+/g, " ")}` : "No messages yet"}
                    </span>
                    {c.unread > 0 && !c.blocked && (
                      <span className="min-w-5 shrink-0 rounded-full bg-ion px-1.5 text-center text-[11px] leading-5 font-semibold text-ion-foreground tabular">
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
