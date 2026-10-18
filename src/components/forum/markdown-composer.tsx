"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { BoldIcon, CodeIcon, LinkIcon, ListIcon, QuoteIcon } from "lucide-react"
import { PostBody } from "@/components/forum/post-body"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { matchPeople, searchMembers, type MentionCandidate } from "@/lib/community"
import { cn } from "@/lib/utils"

type Format = "bold" | "code" | "link" | "list" | "quote"

const TOOLS: { id: Format; label: string; keys?: string; icon: typeof BoldIcon }[] = [
  { id: "bold", label: "Bold", keys: "Ctrl+B", icon: BoldIcon },
  { id: "code", label: "Code", keys: "Ctrl+E", icon: CodeIcon },
  { id: "link", label: "Link", keys: "Ctrl+K", icon: LinkIcon },
  { id: "list", label: "Bulleted list", icon: ListIcon },
  { id: "quote", label: "Quote", icon: QuoteIcon },
]

/** Applies a Markdown format to the selection. Returns the new text and the selection to restore. */
function applyFormat(text: string, start: number, end: number, format: Format): { text: string; start: number; end: number } {
  const sel = text.slice(start, end)
  const wrap = (before: string, after: string, placeholder: string) => {
    const inner = sel || placeholder
    const next = text.slice(0, start) + before + inner + after + text.slice(end)
    return { text: next, start: start + before.length, end: start + before.length + inner.length }
  }
  switch (format) {
    case "bold":
      return wrap("**", "**", "bold text")
    case "code":
      return sel.includes("\n") ? wrap("\n```\n", "\n```\n", "") : wrap("`", "`", "code")
    case "link": {
      const label = sel || "link text"
      const next = `${text.slice(0, start)}[${label}](https://)${text.slice(end)}`
      // Select the URL so it can be typed over straight away.
      const urlStart = start + label.length + 3
      return { text: next, start: urlStart, end: urlStart + 8 }
    }
    case "list":
    case "quote": {
      const prefix = format === "list" ? "- " : "> "
      const lineStart = text.lastIndexOf("\n", start - 1) + 1
      const block = text.slice(lineStart, end) || ""
      const lines = block.split("\n")
      const allPrefixed = lines.every((l) => l.startsWith(prefix))
      const changed = lines.map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join("\n")
      const next = text.slice(0, lineStart) + changed + text.slice(end)
      return { text: next, start: lineStart, end: lineStart + changed.length }
    }
  }
}

/** The "@query" right before the caret, if the caret is in one. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s(])@([\p{L}\p{N}_.-]{0,30})$/u.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null
}

/**
 * A Markdown editor with Write and Preview tabs, a small toolbar and @mention suggestions. Mentions of sample
 * people insert "@handle"; mentions of members insert "@Name" and are reported through `onMention`, so the
 * post can carry their ids (the database only notifies members whose name is still in the text).
 */
export function MarkdownComposer({
  id,
  value,
  onChange,
  label,
  placeholder,
  rows = 6,
  maxLength = 20000,
  invalid,
  describedBy,
  participants = [],
  onMention,
  onSubmit,
  mentions = true,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  /** Accessible name for the text area when no visible <label htmlFor={id}> is used. */
  label?: string
  placeholder?: string
  rows?: number
  maxLength?: number
  invalid?: boolean
  describedBy?: string
  /** People already in the conversation, suggested first. */
  participants?: MentionCandidate[]
  onMention?: (c: MentionCandidate) => void
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void
  mentions?: boolean
  autoFocus?: boolean
}) {
  const uid = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<[number, number] | null>(null)
  const [tab, setTab] = useState<"write" | "preview">("write")
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const [members, setMembers] = useState<{ q: string; list: MentionCandidate[] }>({ q: "", list: [] })

  // Restores the selection after a toolbar action or a mention changes the text.
  useEffect(() => {
    const sel = pendingSelection.current
    if (!sel || !area.current) return
    pendingSelection.current = null
    area.current.focus()
    area.current.setSelectionRange(sel[0], sel[1])
  }, [value])

  // Members are looked up in the database, a moment after typing stops.
  const q = query?.query ?? null
  useEffect(() => {
    if (!mentions || q === null || q.length < 1) return
    let stale = false
    const t = setTimeout(() => {
      searchMembers(q)
        .then((list) => !stale && setMembers({ q, list }))
        .catch(() => {})
    }, 200)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, mentions])

  const suggestions = useMemo(() => {
    if (q === null) return []
    const f = q.toLowerCase()
    const fromThread = participants.filter((c) => !f || c.name.toLowerCase().includes(f) || c.handle?.startsWith(f))
    const fromDb = members.q === q ? members.list : []
    const all = [...fromThread, ...fromDb, ...matchPeople(q)]
    return all.filter((c, i) => all.findIndex((x) => x.key === c.key) === i).slice(0, 7)
  }, [q, participants, members])

  const open = mentions && tab === "write" && query !== null && suggestions.length > 0
  const listId = `${uid}-mentions`
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1))

  function sync(text: string, caret: number) {
    if (!mentions) return
    const next = mentionAt(text, caret)
    setQuery(next)
    if (next?.query !== query?.query) setActive(0)
  }

  function format(f: Format) {
    const el = area.current
    if (!el) return
    const r = applyFormat(value, el.selectionStart, el.selectionEnd, f)
    if (r.text.length > maxLength) return
    pendingSelection.current = [r.start, r.end]
    onChange(r.text)
  }

  function pick(c: MentionCandidate) {
    if (!query) return
    const caret = area.current?.selectionStart ?? value.length
    const insert = `${c.insert} `
    const next = value.slice(0, query.start) + insert + value.slice(caret)
    if (next.length > maxLength) return
    pendingSelection.current = [query.start + insert.length, query.start + insert.length]
    setQuery(null)
    onChange(next)
    onMention?.(c)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        pick(suggestions[activeIndex])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setQuery(null)
        return
      }
    }
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === "Enter" && onSubmit) {
      e.preventDefault()
      onSubmit()
      return
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const f = e.key === "b" ? "bold" : e.key === "e" ? "code" : e.key === "k" ? "link" : null
      if (f) {
        e.preventDefault()
        format(f)
      }
    }
  }

  const near = value.length > maxLength * 0.9

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background/60 transition-colors focus-within:ring-2 focus-within:ring-ring/40", invalid ? "border-destructive/60" : "border-input")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-1.5 py-1">
        <div role="tablist" aria-label="Editor mode" className="flex gap-0.5">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`${uid}-${t}`}
              aria-selected={tab === t}
              aria-controls={`${uid}-panel`}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                tab === t ? "bg-white/[0.08] font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" && (
          <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex items-center gap-0.5">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => format(t.id)}
                aria-label={t.keys ? `${t.label} (${t.keys})` : t.label}
                title={t.keys ? `${t.label} · ${t.keys}` : t.label}
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <t.icon aria-hidden className="size-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`} className="relative">
        {tab === "write" ? (
          <>
            <textarea
              ref={area}
              id={id}
              value={value}
              rows={rows}
              maxLength={maxLength}
              placeholder={placeholder}
              autoFocus={autoFocus}
              aria-label={label}
              aria-invalid={invalid || undefined}
              aria-describedby={[describedBy, `${uid}-hint`].filter(Boolean).join(" ")}
              role={mentions ? "combobox" : undefined}
              aria-autocomplete={mentions ? "list" : undefined}
              aria-expanded={mentions ? open : undefined}
              aria-controls={mentions && open ? listId : undefined}
              aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
              onChange={(e) => {
                onChange(e.target.value)
                sync(e.target.value, e.target.selectionStart)
              }}
              onSelect={(e) => sync(e.currentTarget.value, e.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setQuery(null), 120)}
              className="block min-h-28 w-full resize-y bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            {open && (
              <ul
                id={listId}
                role="listbox"
                aria-label="People to mention"
                className="absolute inset-x-2 top-full z-30 -mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150 sm:right-auto sm:w-80"
              >
                {suggestions.map((c, i) => (
                  <li
                    key={c.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(c)
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === activeIndex ? "bg-white/[0.08]" : "")}
                  >
                    <PosterAvatar poster={{ name: c.name, handle: c.handle }} size={24} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.hint}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="min-h-28 px-3 py-1" aria-live="polite">
            {value.trim() ? <PostBody source={value} /> : <p className="py-2.5 text-sm text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        )}
      </div>

      <div id={`${uid}-hint`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          Markdown works: **bold**, `code`, lists, &gt; quotes{mentions ? ", and @ to mention someone" : ""}.
        </span>
        {near && (
          <span className={cn("tabular", value.length >= maxLength && "text-destructive")}>
            {value.length.toLocaleString("en")} / {maxLength.toLocaleString("en")}
          </span>
        )}
      </div>
    </div>
  )
}
