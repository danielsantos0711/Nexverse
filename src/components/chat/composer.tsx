"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { CornerUpLeftIcon, SendHorizontalIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MAX_MESSAGE, type ChatMessage } from "@/lib/chat"
import { cn } from "@/lib/utils"

export type ComposerHandle = { focus: () => void; insert: (text: string) => void }

const DRAFT_KEY = (room: string) => `nexverse-chat-draft:${room}`

/**
 * The message box. Enter sends, Shift+Enter starts a new line, Esc drops the reply, and ↑ in an empty box
 * edits your last message. Unsent text is kept per room in this browser.
 */
export const Composer = forwardRef<
  ComposerHandle,
  {
    room: string
    roomName: string
    replyTo: ChatMessage | null
    disabled?: boolean
    onCancelReply: () => void
    onSend: (body: string) => void
    onTyping: () => void
    onEditLast: () => void
  }
>(function Composer({ room, roomName, replyTo, disabled, onCancelReply, onSend, onTyping, onEditLast }, handle) {
  // The box only appears in the browser (it waits for the session), so reading storage here is safe.
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(DRAFT_KEY(room)) ?? ""
    } catch {
      return ""
    }
  })
  const ref = useRef<HTMLTextAreaElement>(null)
  const length = draft.trim().length
  const over = length > MAX_MESSAGE
  const near = draft.length > MAX_MESSAGE - 200

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus(),
    insert: (text) => {
      setDraft((d) => (d && !d.endsWith(" ") ? `${d} ${text}` : d + text))
      ref.current?.focus()
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
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft, room])

  function send() {
    if (!length || over || disabled) return
    onSend(draft.trim())
    setDraft("")
  }

  return (
    <div className="flex flex-col gap-1.5">
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
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className={cn(
          "glass flex items-end gap-2 rounded-xl p-1.5 pl-3 transition-[border-color,box-shadow] focus-within:border-ion/40 focus-within:shadow-[0_0_0_3px_rgb(143_180_255/0.12)]",
          replyTo && "rounded-t-none",
          over && "border-destructive/60"
        )}
      >
        <label htmlFor="chat-composer" className="sr-only">
          Message {roomName}
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          value={draft}
          rows={1}
          disabled={disabled}
          placeholder={`Message ${roomName}`}
          enterKeyHint="send"
          aria-invalid={over || undefined}
          aria-describedby={near ? "chat-composer-count" : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value.trim()) onTyping()
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === "Enter" && !e.shiftKey) {
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
          className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {near && (
          <span
            id="chat-composer-count"
            aria-live="polite"
            className={cn("mb-2 shrink-0 text-xs tabular", over ? "font-medium text-destructive" : "text-muted-foreground")}
          >
            {(MAX_MESSAGE - length).toLocaleString("en")}
            <span className="sr-only"> characters left</span>
          </span>
        )}
        <Button type="submit" size="icon" disabled={!length || over || disabled} aria-label="Send message" className="shrink-0">
          <SendHorizontalIcon aria-hidden />
        </Button>
      </form>
      <p className="hidden px-1 text-[11px] text-muted-foreground sm:block">
        <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> for a new line · <code className="font-mono">`code`</code> and{" "}
        <code className="font-mono">```blocks```</code> work
      </p>
    </div>
  )
})
