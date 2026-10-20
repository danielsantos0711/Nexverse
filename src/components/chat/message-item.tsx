"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { memo, useEffect, useRef, useState } from "react"
import {
  BookmarkIcon,
  ClipboardIcon,
  CornerUpLeftIcon,
  EyeOffIcon,
  LanguagesIcon,
  LinkIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RotateCwIcon,
  SmilePlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { ModMenu } from "@/components/moderation/mod-menu"
import { ReportButton } from "@/components/moderation/report-button"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Attachments } from "@/components/chat/attachments"
import { EmojiPicker } from "@/components/chat/emoji-picker"
import { ChatAvatar } from "@/components/chat/glyphs"
import { clock, fullDate, mentions, relative } from "@/components/chat/format"
import { MessageBody } from "@/components/chat/message-body"
import { PollCard } from "@/components/chat/poll-card"
import { Sticker, stickerOf } from "@/components/chat/stickers"
import { AiLabel } from "@/components/ai/ai-bits"
import { MAX_MESSAGE, type ChatMessage, type Emoji } from "@/lib/chat"
import type { Poll } from "@/lib/chat-features"
import type { Member } from "@/lib/store"
import { cn } from "@/lib/utils"

export type MessageActions = {
  onReply: (m: ChatMessage) => void
  onReact: (m: ChatMessage, emoji: Emoji) => void
  onCopyLink: (m: ChatMessage) => void
  onDelete: (m: ChatMessage) => void
  onStartEdit: (m: ChatMessage) => void
  onEdit: (m: ChatMessage, body: string) => Promise<void>
  onRetry: (m: ChatMessage) => void
  onDiscard: (m: ChatMessage) => void
  onJump: (id: string) => void
  onEditDone: () => void
  onThread: (m: ChatMessage) => void
  onPin: (m: ChatMessage, pin: boolean) => void
  onSave: (m: ChatMessage, saved: boolean) => void
  onTranslate: (m: ChatMessage) => void
  onVote: (m: ChatMessage, choice: number, on: boolean) => void
  onClosePoll: (m: ChatMessage, closed: boolean) => void
}

/** What a message can do here beyond the basics, decided once per room. */
export type MessageFeatures = { threads: boolean; pins: boolean; canPin: boolean; save: boolean; translate: boolean }

export type Translation = { text?: string; error?: string; loading?: boolean; from?: string }

const QUICK = ["👍", "❤️", "🚀"]

type Props = {
  message: ChatMessage
  grouped: boolean
  me: Member | null
  canWrite: boolean
  animateIn: boolean
  editing: boolean
  highlighted: boolean
  now: number
  actions: MessageActions
  features?: MessageFeatures
  poll?: Poll
  saved?: boolean
  translation?: Translation
  /** Inside the thread panel: no "replies" chip, no "open thread". */
  inThread?: boolean
  compact?: boolean
}

const SPRING = { type: "spring", duration: 0.22, bounce: 0 } as const

const NONE: MessageFeatures = { threads: false, pins: false, canPin: false, save: false, translate: false }

export const MessageItem = memo(function MessageItem({
  message: m,
  grouped,
  me,
  canWrite,
  animateIn,
  editing,
  highlighted,
  now,
  actions,
  features = NONE,
  poll,
  saved,
  translation,
  inThread,
  compact,
}: Props) {
  const reduce = useReducedMotion()
  const mine = Boolean(me && m.author?.id === me.id)
  const pending = Boolean(m.status)
  const name = m.author?.name ?? "A member"
  const pingsMe = !mine && (mentions(m.body, me?.name) || Boolean(me && m.mentions.includes(me.id)))
  const sticker = m.kind === "sticker" ? stickerOf(m.body) : null
  const avatar = compact ? 24 : 36

  return (
    <motion.li
      id={`m-${m.id}`}
      initial={animateIn && !reduce ? { opacity: 0, transform: "translateY(8px)" } : false}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.15 } }}
      transition={SPRING}
      aria-busy={m.status === "sending" || undefined}
      className={cn(
        "group/msg relative flex gap-3 rounded-lg px-3 transition-colors duration-500 hover:bg-white/[0.025] focus-within:bg-white/[0.025] md:px-4",
        grouped ? "py-0.5" : compact ? "mt-1 pt-1 pb-0.5" : "mt-2 pt-1.5 pb-0.5",
        pingsMe && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)] hover:bg-gold/[0.08]",
        m.pinnedAt && !pingsMe && "shadow-[inset_2px_0_0_var(--room-accent,var(--ion))]",
        highlighted && "bg-ion/[0.12]"
      )}
    >
      <div className={cn("flex shrink-0 justify-center", compact ? "w-6" : "w-9")}>
        {grouped ? (
          <time
            dateTime={m.createdAt}
            title={fullDate(m.createdAt)}
            className="mt-[3px] text-[11px] text-muted-foreground/0 tabular group-hover/msg:text-muted-foreground group-focus-within/msg:text-muted-foreground"
          >
            {clock(m.createdAt)}
          </time>
        ) : (
          <ChatAvatar id={m.author?.id ?? m.id} name={name} size={avatar} className="mt-0.5" />
        )}
      </div>

      <div className={cn("min-w-0 flex-1", pending && "opacity-60", m.status === "failed" && "opacity-100")}>
        {m.replyTo && <Quote message={m} onJump={actions.onJump} />}
        {!grouped && m.kind !== "me" && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            {mine && <span className="text-[11px] text-muted-foreground">you</span>}
            <time dateTime={m.createdAt} title={fullDate(m.createdAt)} className="shrink-0 text-xs text-muted-foreground tabular">
              {relative(m.createdAt, now)}
            </time>
            {m.pinnedAt && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-[var(--room-accent,var(--ion))]">
                <PinIcon aria-hidden className="size-3" /> Pinned
              </span>
            )}
          </div>
        )}

        {editing ? (
          <EditBox message={m} onSave={(body) => actions.onEdit(m, body)} onCancel={actions.onEditDone} />
        ) : (
          <>
            {m.hidden && (
              <span className="mb-0.5 inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold" title="Only its author and the moderators can see this">
                <EyeOffIcon aria-hidden className="size-3" /> Hidden by moderators
              </span>
            )}
            {m.kind === "me" ? (
              <p className="text-[15px] leading-relaxed text-foreground/85 italic">
                <span className="font-semibold not-italic">{name}</span> <MessageInline text={m.body} me={me?.name} />
              </p>
            ) : sticker ? (
              <motion.div
                initial={animateIn && !reduce ? { scale: 0.6, rotate: -8, opacity: 0 } : false}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5, bounce: 0.45 }}
                className="mt-0.5 w-fit"
              >
                <Sticker id={sticker} size={compact ? 88 : 112} />
              </motion.div>
            ) : m.kind === "poll" ? (
              <PollCard
                poll={poll}
                meId={me?.id ?? null}
                canVote={canWrite && !pending}
                now={now}
                onVote={(choice, on) => actions.onVote(m, choice, on)}
                onClose={(closed) => actions.onClosePoll(m, closed)}
              />
            ) : (
              <MessageBody text={m.body} me={me?.name} />
            )}
            <Attachments list={m.attachments} />
            {m.editedAt && (
              <span className="text-[11px] text-muted-foreground" title={`Edited ${fullDate(m.editedAt)}`}>
                (edited)
              </span>
            )}
            {translation && <TranslationBox t={translation} />}
          </>
        )}

        {m.status === "sending" && <p className="text-xs text-muted-foreground">Sending…</p>}
        {m.status === "failed" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
            <span>{m.error ?? "Couldn't send."}</span>
            <Button size="xs" variant="secondary" onClick={() => actions.onRetry(m)}>
              <RotateCwIcon aria-hidden data-icon="inline-start" /> Retry
            </Button>
            <Button size="xs" variant="ghost" onClick={() => actions.onDiscard(m)}>
              Discard
            </Button>
          </div>
        )}

        {m.reactions.length > 0 && <Reactions message={m} me={me} canWrite={canWrite} onReact={actions.onReact} />}

        {!inThread && features.threads && m.replyCount > 0 && (
          <button
            type="button"
            onClick={() => actions.onThread(m)}
            className="pressable mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-[var(--room-accent,var(--ion))] hover:bg-white/[0.05]"
          >
            <MessagesSquareIcon aria-hidden className="size-3.5" />
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
            {m.lastReplyAt && <span className="font-normal text-muted-foreground">· last {relative(m.lastReplyAt, now)}</span>}
          </button>
        )}
      </div>

      {!pending && !editing && (
        <Toolbar message={m} mine={mine} canWrite={canWrite} actions={actions} features={features} saved={Boolean(saved)} inThread={inThread} />
      )}
    </motion.li>
  )
})

function Quote({ message: m, onJump }: { message: ChatMessage; onJump: (id: string) => void }) {
  if (!m.parent) {
    return <p className="mb-0.5 text-xs text-muted-foreground italic">Replying to a message that was deleted</p>
  }
  const p = m.parent
  return (
    <button
      type="button"
      onClick={() => onJump(p.id)}
      className="mb-1 flex max-w-full items-center gap-1.5 rounded-md border-l-2 border-ion/50 bg-white/[0.03] py-0.5 pr-2 pl-2 text-left text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      aria-label={`Replying to ${p.author?.name ?? "a member"}: ${p.body.slice(0, 80)}. Jump to message`}
    >
      <CornerUpLeftIcon aria-hidden className="size-3 shrink-0" />
      <span className="shrink-0 font-medium text-foreground/80">{p.author?.name ?? "A member"}</span>
      <span className="truncate">{p.body.replace(/\s+/g, " ")}</span>
    </button>
  )
}

function Reactions({
  message: m,
  me,
  canWrite,
  onReact,
}: {
  message: ChatMessage
  me: Member | null
  canWrite: boolean
  onReact: (m: ChatMessage, e: Emoji) => void
}) {
  const reduce = useReducedMotion()
  const order = [...new Set(m.reactions.map((r) => r.emoji))]
  const groups = order.map((emoji) => {
    const who = m.reactions.filter((r) => r.emoji === emoji)
    return { emoji, count: who.length, mine: Boolean(me && who.some((r) => r.userId === me.id)) }
  })
  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label="Reactions">
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map((g) => (
          <motion.li
            key={g.emoji}
            layout={!reduce}
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.35 }}
          >
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => onReact(m, g.emoji)}
              aria-pressed={g.mine}
              aria-label={`${g.emoji} ${g.count} ${g.count === 1 ? "reaction" : "reactions"}${g.mine ? ", including yours" : ""}`}
              title={canWrite ? undefined : "Sign in to react"}
              className={cn(
                "pressable inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular transition-colors disabled:cursor-default",
                g.mine ? "border-ion/50 bg-ion/15 text-ion" : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
              )}
            >
              <span aria-hidden>{g.emoji}</span>
              <span aria-hidden className="relative inline-flex overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={g.count}
                    initial={reduce ? false : { transform: "translateY(-70%)", opacity: 0 }}
                    animate={{ transform: "translateY(0%)", opacity: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { transform: "translateY(70%)", opacity: 0 }}
                    transition={{ type: "spring", duration: 0.25, bounce: 0 }}
                  >
                    {g.count}
                  </motion.span>
                </AnimatePresence>
              </span>
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
      {canWrite && (
        <li>
          <EmojiPicker
            onPick={(e) => onReact(m, e)}
            side="top"
            align="start"
            label="Add a reaction"
            trigger={
              <button
                type="button"
                aria-label="Add a reaction"
                className="pressable inline-flex h-6 items-center rounded-full border border-dashed border-border px-1.5 text-muted-foreground hover:border-white/25 hover:text-foreground"
              >
                <SmilePlusIcon aria-hidden className="size-3.5" />
              </button>
            }
          />
        </li>
      )}
    </ul>
  )
}

function TranslationBox({ t }: { t: Translation }) {
  return (
    <div className="mt-1.5 max-w-xl rounded-lg border-l-2 border-ion/50 bg-ion/[0.05] px-3 py-1.5" aria-live="polite">
      {t.loading ? (
        <p className="text-sm text-muted-foreground motion-safe:animate-pulse">Translating…</p>
      ) : t.error ? (
        <p className="text-sm text-destructive">{t.error}</p>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.text}</p>
          <AiLabel className="mt-0.5">{`Machine translation${t.from ? ` from ${t.from}` : ""}. It may miss nuance.`}</AiLabel>
        </>
      )}
    </div>
  )
}

/** A /me line's text: links and mentions, no blocks. */
function MessageInline({ text, me }: { text: string; me?: string }) {
  return (
    <span className="[&>div]:inline [&>div]:text-[inherit]">
      <MessageBody text={text} me={me} previews={false} />
    </span>
  )
}

function Toolbar({
  message: m,
  mine,
  canWrite,
  actions,
  features,
  saved,
  inThread,
}: {
  message: ChatMessage
  mine: boolean
  canWrite: boolean
  actions: MessageActions
  features: MessageFeatures
  saved: boolean
  inThread?: boolean
}) {
  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className="glass absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded-full p-0.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-70"
    >
      {canWrite &&
        QUICK.map((e) => (
          <Button key={e} variant="ghost" size="icon-xs" aria-label={`React with ${e}`} className="hidden text-sm sm:inline-flex" onClick={() => actions.onReact(m, e)}>
            {e}
          </Button>
        ))}
      {canWrite && (
        <EmojiPicker
          onPick={(e) => actions.onReact(m, e)}
          label="Add a reaction"
          trigger={
            <Button variant="ghost" size="icon-xs" aria-label="Add reaction">
              <SmilePlusIcon aria-hidden />
            </Button>
          }
        />
      )}
      {canWrite && (
        <Button variant="ghost" size="icon-xs" aria-label="Reply with a quote" title="Reply with a quote" onClick={() => actions.onReply(m)}>
          <CornerUpLeftIcon aria-hidden />
        </Button>
      )}
      {canWrite && features.threads && !inThread && (
        <Button variant="ghost" size="icon-xs" aria-label="Reply in a thread" title="Reply in a thread" onClick={() => actions.onThread(m)}>
          <MessagesSquareIcon aria-hidden />
        </Button>
      )}
      {!mine && <ReportButton targetKind="room_message" targetId={m.id} targetUrl={`/chat/${m.room}`} label="Report message" iconOnly className="size-6" />}
      <ModMenu kind="room_message" id={m.id} hidden={m.hidden} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="More actions" />}>
          <MoreHorizontalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => actions.onCopyLink(m)}>
            <LinkIcon aria-hidden /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.body)}>
            <ClipboardIcon aria-hidden /> Copy text
          </DropdownMenuItem>
          {features.save && (
            <DropdownMenuItem onClick={() => actions.onSave(m, !saved)}>
              <BookmarkIcon aria-hidden className={cn(saved && "fill-current text-gold")} /> {saved ? "Remove from saved" : "Save for later"}
            </DropdownMenuItem>
          )}
          {features.translate && m.kind !== "sticker" && (
            <DropdownMenuItem onClick={() => actions.onTranslate(m)}>
              <LanguagesIcon aria-hidden /> Translate
            </DropdownMenuItem>
          )}
          {features.pins && features.canPin && !inThread && (
            <DropdownMenuItem onClick={() => actions.onPin(m, !m.pinnedAt)}>
              {m.pinnedAt ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />} {m.pinnedAt ? "Unpin" : "Pin to the room"}
            </DropdownMenuItem>
          )}
          {mine && (
            <>
              <DropdownMenuItem disabled={m.kind === "poll" || m.kind === "sticker"} onClick={() => actions.onStartEdit(m)}>
                <PencilIcon aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(m)}>
                <Trash2Icon aria-hidden /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function EditBox({ message, onSave, onCancel }: { message: ChatMessage; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [draft])

  async function save() {
    const text = draft.trim()
    if (!text || text.length > MAX_MESSAGE || busy) return
    if (text === message.body) return onCancel()
    setBusy(true)
    try {
      await onSave(text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onCancel()
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            save()
          }
        }}
        aria-label="Edit message"
        rows={1}
        maxLength={MAX_MESSAGE + 200}
        className="w-full resize-none rounded-lg border border-input bg-background/60 px-3 py-2 text-[15px] leading-relaxed outline-none focus-visible:border-ring"
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button size="xs" onClick={save} disabled={busy || !draft.trim() || draft.trim().length > MAX_MESSAGE}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          <XIcon aria-hidden data-icon="inline-start" /> Cancel
        </Button>
        <span>Enter to save · Esc to cancel</span>
      </div>
    </div>
  )
}
