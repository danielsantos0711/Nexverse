"use client"

import { Popover } from "@base-ui/react/popover"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { BracesIcon, CornerUpLeftIcon, ImagePlusIcon, SendHorizontalIcon, SmileIcon, SparklesIcon, StickerIcon, VoteIcon, XIcon } from "lucide-react"
import { PendingStrip, uploadPictures, type Pending } from "@/components/chat/attachments"
import { EmojiPicker } from "@/components/chat/emoji-picker"
import { handleOf } from "@/components/chat/format"
import { ChatAvatar } from "@/components/chat/glyphs"
import { Sticker, STICKERS, stickerBody, type StickerId } from "@/components/chat/stickers"
import { Button } from "@/components/ui/button"
import type { Attachment } from "@/lib/chat"
import { matchCommands, runCommand, type CommandAction } from "@/lib/chat-commands"
import { findMembers, type Mentionable } from "@/lib/chat-features"
import { cn } from "@/lib/utils"

export type ComposerHandle = { focus: () => void; insert: (text: string) => void; set: (text: string) => void }

export type ComposerSend = { body: string; kind: "text" | "me" | "sticker"; attachments: Attachment[]; mentions: string[] }

const DRAFT_KEY = (room: string) => `nexverse-chat-draft:${room}`

type Menu = { kind: "command"; items: ReturnType<typeof matchCommands> } | { kind: "mention"; query: string; start: number; items: Mentionable[] } | null

/**
 * The message box, for chat rooms, threads and direct messages. Enter sends, Shift+Enter starts a new line, Esc
 * drops the reply, ↑ in an empty box edits your last message. "/" opens the commands (polls, code, stickers,
 * /me, catch me up…), "@" finds people to mention, pictures can be picked, pasted or dropped. Unsent text is
 * kept per room in this tab.
 */
export const Composer = forwardRef<
  ComposerHandle,
  {
    room: string
    roomName: string
    replyTo: { author?: { name: string } | null; body: string } | null
    disabled?: boolean
    /** Slow mode: you can type, but sending waits until this is back to zero. */
    hold?: boolean
    where?: "room" | "dm"
    /** Pictures, stickers and polls need the latest database; mentions need members. */
    features?: { pictures: boolean; stickers: boolean; polls: boolean; mentions: boolean; ai: boolean }
    placeholder?: string
    maxLength?: number
    onCancelReply: () => void
    onSend: (msg: ComposerSend) => void
    onTyping: () => void
    onEditLast: () => void
    onAction?: (action: CommandAction, arg: string) => void
  }
>(function Composer(
  { room, roomName, replyTo, disabled, hold, where = "room", features = { pictures: true, stickers: true, polls: true, mentions: true, ai: false }, placeholder, maxLength = 2000, onCancelReply, onSend, onTyping, onEditLast, onAction },
  handle
) {
  const reduce = useReducedMotion()
  // The box only appears in the browser (it waits for the session), so reading storage here is safe.
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(DRAFT_KEY(room)) ?? ""
    } catch {
      return ""
    }
  })
  const [pending, setPending] = useState<Pending[]>([])
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState<Mentionable[]>([])
  const [problem, setProblem] = useState("")
  const [dragging, setDragging] = useState(false)
  const [stickersOpen, setStickersOpen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const length = draft.trim().length
  const over = length > maxLength
  const near = draft.length > maxLength - 200
  const uploading = pending.some((p) => p.status === "uploading")
  const ready = pending.filter((p) => p.status === "ready" && p.attachment)

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus(),
    insert: (text) => {
      setDraft((d) => (d && !d.endsWith(" ") && !d.endsWith("\n") ? `${d} ${text}` : d + text))
      ref.current?.focus()
    },
    set: (text) => {
      setDraft(text)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(text.length, text.length)
      })
    },
  }))

  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(DRAFT_KEY(room), draft)
      else sessionStorage.removeItem(DRAFT_KEY(room))
    } catch {}
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft, room])

  // What the menu above the box shows: commands after "/", people after "@" (looked up as you type).
  const [caret, setCaret] = useState<number | null>(null)
  const [found, setFound] = useState<{ query: string; start: number; items: Mentionable[] } | null>(null)
  const [dismissed, setDismissed] = useState("")
  const commands = matchCommands(draft, where, features.ai)
  const at = features.mentions ? /(?:^|\s)@([\p{L}\p{N}_.-]{1,30})$/u.exec(draft.slice(0, caret ?? draft.length)) : null
  const query = at?.[1] ?? ""
  useEffect(() => {
    if (!query) return
    let stale = false
    const start = (caret ?? draft.length) - query.length - 1
    const t = setTimeout(() => {
      findMembers(query, 6).then((items) => !stale && setFound({ query, start, items }))
    }, 150)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps
  const menu: Menu =
    dismissed === draft
      ? null
      : commands.length
        ? { kind: "command", items: commands }
        : query && found?.query === query && found.items.length
          ? { kind: "mention", ...found }
          : null
  const setMenu = (m: null) => {
    if (m === null) setDismissed(draft)
  }

  function addFiles(files: File[]) {
    if (!features.pictures || !files.length) return
    setProblem("")
    uploadPictures(files, pending.length, setPending)
  }

  function pickMention(m: Mentionable) {
    if (menu?.kind !== "mention") return
    const handleText = `@${handleOf(m.name)} `
    const next = draft.slice(0, menu.start) + handleText + draft.slice(menu.start + menu.query.length + 1)
    setDraft(next)
    setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))
    setMenu(null)
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      const pos = menu.start + handleText.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function pickCommand(name: string) {
    setMenu(null)
    const needsArg = ["me", "shrug", "spoiler", "roll", "search", "jump", "code", "poll"].includes(name)
    if (needsArg) {
      setDraft(`/${name} `)
      requestAnimationFrame(() => ref.current?.focus())
      return
    }
    setDraft(`/${name}`)
    requestAnimationFrame(() => send(`/${name}`))
  }

  function reset() {
    setDraft("")
    setPending([])
    setPicked([])
    setProblem("")
  }

  function send(text = draft) {
    if (disabled || hold || uploading) return
    const trimmed = text.trim()
    if (trimmed.startsWith("/")) {
      const r = runCommand(trimmed)
      if (r?.type === "error") return setProblem(r.message)
      if (r?.type === "action") {
        if (r.action === "code") {
          const lang = r.arg.split(/\s+/)[0] ?? ""
          const tpl = "```" + lang + "\n\n```"
          setDraft(tpl)
          requestAnimationFrame(() => {
            const el = ref.current
            if (!el) return
            el.focus()
            el.setSelectionRange(4 + lang.length, 4 + lang.length)
          })
          return
        }
        if (r.action === "sticker") {
          setDraft("")
          setStickersOpen(true)
          return
        }
        setDraft("")
        onAction?.(r.action, r.arg)
        return
      }
      if (r?.type === "send") {
        onSend({ body: r.body, kind: r.kind, attachments: ready.map((p) => p.attachment!), mentions: mentionIds(r.body) })
        reset()
        return
      }
    }
    if (!trimmed && !ready.length) return
    if (over) return
    const body = trimmed || ready.map((p) => p.attachment!.alt).join(", ") || "Picture"
    onSend({ body, kind: "text", attachments: ready.map((p) => p.attachment!), mentions: mentionIds(body) })
    reset()
  }

  const mentionIds = (body: string) => {
    const low = body.toLowerCase()
    return picked.filter((m) => low.includes(`@${handleOf(m.name)}`.toLowerCase())).map((m) => m.id)
  }

  function sendSticker(id: StickerId) {
    setStickersOpen(false)
    onSend({ body: stickerBody(id), kind: "sticker", attachments: [], mentions: [] })
  }

  const menuItems = menu?.items.length ?? 0
  const current = Math.min(active, Math.max(0, menuItems - 1))

  return (
    <div className="relative flex flex-col gap-1.5">
      <AnimatePresence>
        {menu && menuItems > 0 && (
          <motion.ul
            role="listbox"
            aria-label={menu.kind === "command" ? "Commands" : "People to mention"}
            initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: "translateY(6px)" }}
            transition={{ type: "spring", duration: 0.22, bounce: 0 }}
            className="liquid-glass-strong absolute right-0 bottom-full left-0 z-30 mb-2 max-h-72 overflow-y-auto rounded-xl p-1 shadow-xl"
          >
            {menu.kind === "command"
              ? menu.items.map((c, i) => (
                  <li key={c.name} role="option" aria-selected={i === current}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCommand(c.name)}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm", i === current ? "bg-white/[0.07]" : "")}
                    >
                      <span className="font-mono text-ion">/{c.name}</span>
                      {c.args && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{c.args}</span>}
                      <span className="ml-auto flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {c.ai && <SparklesIcon aria-hidden className="size-3 text-ion" />}
                        {c.hint}
                      </span>
                    </button>
                  </li>
                ))
              : menu.items.map((m, i) => (
                  <li key={m.id} role="option" aria-selected={i === current}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickMention(m)}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm", i === current ? "bg-white/[0.07]" : "")}
                    >
                      <ChatAvatar id={m.id} name={m.name} size={22} />
                      <span className="truncate font-medium">{m.name}</span>
                      {m.handle && <span className="truncate text-xs text-muted-foreground">@{m.handle}</span>}
                    </button>
                  </li>
                ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {replyTo && (
        <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-border bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground">
          <CornerUpLeftIcon aria-hidden className="size-3.5 shrink-0 text-ion" />
          <span className="shrink-0">
            Replying to <span className="font-medium text-foreground">{replyTo.author?.name ?? "a member"}</span>
          </span>
          <span className="truncate">{replyTo.body.replace(/\s+/g, " ")}</span>
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Cancel reply" onClick={onCancelReply}>
            <XIcon aria-hidden />
          </Button>
        </div>
      )}
      <PendingStrip list={pending} onRemove={(key) => setPending((l) => l.filter((p) => p.key !== key))} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        onDragOver={(e) => {
          if (!features.pictures || !e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!features.pictures) return
          e.preventDefault()
          setDragging(false)
          addFiles([...e.dataTransfer.files])
        }}
        className={cn(
          "glass flex items-end gap-1 rounded-xl p-1.5 pl-2 transition-[border-color,box-shadow] focus-within:border-ion/40 focus-within:shadow-[0_0_0_3px_rgb(143_180_255/0.12)]",
          replyTo && "rounded-t-none",
          over && "border-destructive/60",
          dragging && "border-ion/60 shadow-[0_0_0_3px_rgb(143_180_255/0.2)]"
        )}
      >
        <div className="flex shrink-0 items-center pb-0.5">
          {features.pictures && (
            <>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Add pictures" title="Add pictures" disabled={disabled || pending.length >= 4} onClick={() => fileRef.current?.click()}>
                <ImagePlusIcon aria-hidden />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple
                hidden
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])])
                  e.target.value = ""
                }}
              />
            </>
          )}
          {features.polls && where === "room" && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="New poll" title="New poll" className="hidden sm:inline-flex" disabled={disabled} onClick={() => onAction?.("poll", "")}>
              <VoteIcon aria-hidden />
            </Button>
          )}
        </div>
        <label htmlFor={`composer-${room}`} className="sr-only">
          Message {roomName}
        </label>
        <textarea
          id={`composer-${room}`}
          ref={ref}
          value={draft}
          rows={1}
          disabled={disabled}
          placeholder={placeholder ?? `Message ${roomName} · / for commands`}
          enterKeyHint="send"
          aria-invalid={over || undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            setDraft(e.target.value)
            setCaret(e.target.selectionStart)
            setActive(0)
            setProblem("")
            if (e.target.value.trim()) onTyping()
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"))
            if (files.length && features.pictures) {
              e.preventDefault()
              addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (menu && menuItems) {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                return setActive((a) => (a + 1) % menuItems)
              }
              if (e.key === "ArrowUp") {
                e.preventDefault()
                return setActive((a) => (a - 1 + menuItems) % menuItems)
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                e.preventDefault()
                if (menu.kind === "command") return pickCommand(menu.items[current].name)
                return pickMention(menu.items[current])
              }
              if (e.key === "Escape") {
                e.preventDefault()
                return setMenu(null)
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              // Inside an open ``` block, Enter is a new line.
              const fences = (draft.slice(0, e.currentTarget.selectionStart).match(/```/g) ?? []).length
              if (fences % 2 === 1) return
              e.preventDefault()
              send()
            } else if (e.key === "Escape" && replyTo) {
              e.preventDefault()
              onCancelReply()
            } else if (e.key === "ArrowUp" && !draft) {
              e.preventDefault()
              onEditLast()
            }
          }}
          className="max-h-[220px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {near && (
          <span aria-live="polite" className={cn("mb-2 shrink-0 text-xs tabular", over ? "font-medium text-destructive" : "text-muted-foreground")}>
            {(maxLength - length).toLocaleString("en")}
            <span className="sr-only"> characters left</span>
          </span>
        )}
        <div className="flex shrink-0 items-center pb-0.5">
          <EmojiPicker
            onPick={(e) => {
              setDraft((d) => d + e)
              ref.current?.focus()
            }}
            label="Insert an emoji"
            trigger={
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Insert an emoji" disabled={disabled}>
                <SmileIcon aria-hidden />
              </Button>
            }
          />
          {features.stickers && (
            <StickerPicker open={stickersOpen} onOpenChange={setStickersOpen} onPick={sendSticker} disabled={disabled || hold} />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Code block"
            title="Code block"
            className="hidden sm:inline-flex"
            disabled={disabled}
            onClick={() => {
              setDraft((d) => `${d}${d && !d.endsWith("\n") ? "\n" : ""}\`\`\`\n\n\`\`\``)
              requestAnimationFrame(() => {
                const el = ref.current
                if (!el) return
                el.focus()
                const pos = el.value.length - 4
                el.setSelectionRange(pos, pos)
              })
            }}
          >
            <BracesIcon aria-hidden />
          </Button>
          <Button type="submit" size="icon" disabled={(!length && !ready.length) || over || disabled || hold || uploading} aria-label="Send message" className="ml-0.5 shrink-0">
            <SendHorizontalIcon aria-hidden />
          </Button>
        </div>
      </form>
      <p className={cn("hidden px-1 text-[11px] text-muted-foreground sm:block", problem && "block text-destructive")} role={problem ? "alert" : undefined}>
        {problem || (
          <>
            <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> new line · <code className="font-mono">/</code> commands ·{" "}
            <code className="font-mono">@</code> mention · <code className="font-mono">||spoiler||</code> · <kbd className="font-sans">?</kbd> shortcuts
          </>
        )}
      </p>
    </div>
  )
})

function StickerPicker({ open, onOpenChange, onPick, disabled }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: StickerId) => void; disabled?: boolean }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Send a sticker" title="Send a sticker" disabled={disabled}>
            <StickerIcon aria-hidden />
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} className="isolate z-50">
          <Popover.Popup
            aria-label="Stickers"
            className="liquid-glass-strong w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-xl p-2 shadow-xl outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-safe:transition-[transform,opacity] motion-safe:duration-150"
          >
            <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Space stickers</p>
            <ul className="grid grid-cols-4 gap-1">
              {STICKERS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s.id)}
                    title={s.label}
                    aria-label={s.label}
                    className="pressable grid w-full place-items-center rounded-lg p-1 transition-transform hover:scale-105 hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none motion-reduce:hover:scale-100"
                  >
                    <Sticker id={s.id} size={60} />
                  </button>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
