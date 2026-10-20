"use client"

import { usePathname } from "next/navigation"
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  CodeXmlIcon,
  Columns2Icon,
  EyeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  KeyboardIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PencilLineIcon,
  PlusIcon,
  QuoteIcon,
  SmilePlusIcon,
  SquareChevronDownIcon,
  StrikethroughIcon,
  TableIcon,
  TvMinimalPlayIcon,
  AtSignIcon,
  InfoIcon,
  LightbulbIcon,
  TriangleAlertIcon,
  OctagonAlertIcon,
  MessageSquareWarningIcon,
  XIcon,
} from "lucide-react"
import { EmojiPicker } from "@/components/editor/emoji-picker"
import { InsertDialog, type InsertMode, type InsertResult } from "@/components/editor/insert-dialog"
import { caretCoords } from "@/components/editor/caret"
import { Keys, ShortcutsDialog } from "@/components/editor/keys"
import { highlightMentions } from "@/components/forum/post-body"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { Markdown } from "@/components/live/markdown"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { searchMembers, type MentionCandidate } from "@/lib/community"
import { useCopy } from "@/lib/content"
import { draftKey as makeDraftKey, useAutosave } from "@/lib/editor/drafts"
import { findEmoji, type Emoji } from "@/lib/editor/emoji"
import { altFromName, IMAGE_TYPES, uploadImage } from "@/lib/editor/media"
import * as ops from "@/lib/editor/ops"
import { cn } from "@/lib/utils"

/*
 * The Nexverse editor: one writing surface for every place members publish (projects, threads, replies, shares,
 * events, missions, launches, code issues). It stays a plain Markdown textarea underneath, so it is fast,
 * accessible, works with every keyboard and screen reader, and keeps the browser's own undo (every edit goes
 * through execCommand("insertText")). On top: a formatting toolbar, "/" commands, "@" mentions, ":" emoji,
 * Markdown list continuation, pasted and dropped pictures, safe embeds, write / split / preview, focus mode,
 * word count and reading time, and drafts saved as you type.
 */

type Mode = "write" | "split" | "preview"

export type EditorProps = {
  id: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  /** "full" for long documents (README, articles), "compact" for posts and replies. */
  variant?: "full" | "compact"
  /** Accessible name when no visible <label htmlFor={id}> exists. */
  label?: string
  placeholder?: string
  invalid?: boolean
  describedBy?: string
  rows?: number
  mentions?: boolean
  participants?: MentionCandidate[]
  onMention?: (c: MentionCandidate) => void
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void
  /** Where the draft is kept. Omitted: one per page and box. null: no autosave. */
  draftKey?: string | null
  autoFocus?: boolean
  /** Picture uploads (paste, drop, button). */
  images?: boolean
  /** Heading of focus mode, e.g. the project name. */
  title?: string
}

const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 1024px)")
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1024px)").matches, () => false)

type Trigger = { kind: "slash" | "mention" | "emoji"; start: number; query: string }

type Cmd = {
  id: string
  label: string
  hint: string
  icon: typeof BoldIcon
  words: string
  run: (ctx: CmdCtx) => void
}
type CmdCtx = {
  edit: (f: (text: string, s: number, e: number) => ops.Edit) => void
  dialog: (m: InsertMode) => void
  pickImage: () => void
  openEmoji: () => void
  insert: (t: string) => void
}

const CALLOUTS: { kind: ops.CalloutKind; label: string; icon: typeof BoldIcon }[] = [
  { kind: "NOTE", label: "Note", icon: InfoIcon },
  { kind: "TIP", label: "Tip", icon: LightbulbIcon },
  { kind: "IMPORTANT", label: "Important", icon: MessageSquareWarningIcon },
  { kind: "WARNING", label: "Warning", icon: TriangleAlertIcon },
  { kind: "CAUTION", label: "Caution", icon: OctagonAlertIcon },
]

const COMMANDS: Cmd[] = [
  { id: "h1", label: "Heading 1", hint: "Big section title", icon: Heading1Icon, words: "title h1", run: (c) => c.edit((t, s, e) => ops.heading(t, s, e, 1)) },
  { id: "h2", label: "Heading 2", hint: "Section", icon: Heading2Icon, words: "subtitle h2", run: (c) => c.edit((t, s, e) => ops.heading(t, s, e, 2)) },
  { id: "h3", label: "Heading 3", hint: "Subsection", icon: Heading3Icon, words: "h3", run: (c) => c.edit((t, s, e) => ops.heading(t, s, e, 3)) },
  { id: "list", label: "Bulleted list", hint: "- item", icon: ListIcon, words: "bullets ul", run: (c) => c.edit((t, s, e) => ops.toggleLines(t, s, e, "bullet")) },
  { id: "numbers", label: "Numbered list", hint: "1. item", icon: ListOrderedIcon, words: "ordered ol", run: (c) => c.edit((t, s, e) => ops.toggleLines(t, s, e, "number")) },
  { id: "tasks", label: "Task list", hint: "- [ ] to do", icon: ListChecksIcon, words: "todo checklist checkbox", run: (c) => c.edit((t, s, e) => ops.toggleLines(t, s, e, "task")) },
  { id: "quote", label: "Quote", hint: "> quoted text", icon: QuoteIcon, words: "blockquote cite", run: (c) => c.edit((t, s, e) => ops.toggleLines(t, s, e, "quote")) },
  { id: "code", label: "Code block", hint: "With colouring", icon: CodeXmlIcon, words: "snippet fence pre", run: (c) => c.dialog("code") },
  { id: "table", label: "Table", hint: "Rows and columns", icon: TableIcon, words: "grid", run: (c) => c.dialog("table") },
  { id: "image", label: "Picture", hint: "Upload from your device", icon: ImageIcon, words: "image photo screenshot upload", run: (c) => c.pickImage() },
  { id: "embed", label: "Embed", hint: "Video, repo, paper, post", icon: TvMinimalPlayIcon, words: "youtube vimeo github gist arxiv x twitter video", run: (c) => c.dialog("embed") },
  { id: "link", label: "Link", hint: "To a page", icon: LinkIcon, words: "url href", run: (c) => c.dialog("link") },
  { id: "divider", label: "Divider", hint: "A line across", icon: MinusIcon, words: "hr rule separator", run: (c) => c.edit(ops.divider) },
  ...CALLOUTS.map((k) => ({
    id: k.kind.toLowerCase(),
    label: `${k.label} callout`,
    hint: `> [!${k.kind}]`,
    icon: k.icon,
    words: "callout alert admonition box",
    run: (c: CmdCtx) => c.edit((t, s, e) => ops.callout(t, s, e, k.kind)),
  })),
  { id: "details", label: "Collapsible", hint: "Show more / less", icon: SquareChevronDownIcon, words: "details spoiler toggle fold", run: (c) => c.edit(ops.details) },
  { id: "mention", label: "Mention", hint: "Tell someone", icon: AtSignIcon, words: "person member at", run: (c) => c.insert("@") },
  { id: "emoji", label: "Emoji", hint: "Pick one", icon: SmilePlusIcon, words: "smiley icon", run: (c) => c.openEmoji() },
]

function matchCommands(q: string) {
  if (!q) return COMMANDS
  return COMMANDS.filter((c) => c.id.startsWith(q) || c.label.toLowerCase().includes(q) || c.words.split(" ").some((w) => w.startsWith(q)))
}

type Suggestion = {
  key: string
  label: string
  hint?: string
  icon?: React.ReactNode
  item: { t: "cmd"; c: Cmd } | { t: "emoji"; x: Emoji } | { t: "member"; c: MentionCandidate }
}

export function NexverseEditor({
  id,
  value,
  onChange,
  maxLength,
  variant = "compact",
  label,
  placeholder,
  invalid,
  describedBy,
  rows = 6,
  mentions = true,
  participants = [],
  onMention,
  onSubmit,
  draftKey,
  autoFocus,
  images = true,
  title,
}: EditorProps) {
  const uid = useId()
  const pathname = usePathname()
  const wide = useWide()
  const full = variant === "full"
  const area = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const pendingSel = useRef<[number, number] | null>(null)
  const savedSel = useRef<[number, number]>([0, 0])
  const inserted = useRef(false)
  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])

  const [modePick, setMode] = useState<Mode | null>(null)
  const mode: Mode = modePick === "split" && !wide ? "write" : (modePick ?? (full && wide ? "split" : "write"))
  const [focusMode, setFocusMode] = useState(false)
  const [help, setHelp] = useState(false)
  const [dialog, setDialog] = useState<{ mode: InsertMode; text: string } | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [active, setActive] = useState(0)
  const [members, setMembers] = useState<{ q: string; list: MentionCandidate[] }>({ q: "", list: [] })
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [uploading, setUploading] = useState(0)
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  const key = draftKey === null ? null : (draftKey ?? makeDraftKey("auto", pathname || "page", id))
  const autosave = useAutosave(key, value, { delay: 2000 })

  const preview = useDeferredValue(value)
  const names = useMemo(() => [...participants, ...picked].map((c) => c.name), [participants, picked])
  const stats = useMemo(() => ops.textStats(preview), [preview])

  const copy = {
    write: useCopy("editor.mode.write", "Write"),
    split: useCopy("editor.mode.split", "Split"),
    preview: useCopy("editor.mode.preview", "Preview"),
    empty: useCopy("editor.preview.empty", "Nothing to preview yet. What you write appears here, formatted."),
    hint: useCopy("editor.footer.hint", "Markdown works. Type / for commands"),
    drop: useCopy("editor.drop", "Drop pictures to add them"),
  }

  // Restores the selection after an edit that went through React state instead of execCommand.
  useEffect(() => {
    const sel = pendingSel.current
    if (!sel || !area.current) return
    pendingSel.current = null
    area.current.focus()
    area.current.setSelectionRange(sel[0], sel[1])
  }, [value])

  // Focus mode: lock page scroll, Escape leaves (handled in onKeyDown and here for the preview).
  useEffect(() => {
    if (!focusMode) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && setFocusMode(false)
    window.addEventListener("keydown", esc)
    requestAnimationFrame(() => area.current?.focus())
    return () => {
      document.documentElement.style.overflow = prev
      window.removeEventListener("keydown", esc)
    }
  }, [focusMode])

  // Members are looked up in the database a moment after typing stops.
  const mq = trigger?.kind === "mention" ? trigger.query : null
  useEffect(() => {
    if (!mentions || mq === null || mq.length < 1) return
    let stale = false
    const t = setTimeout(() => {
      searchMembers(mq)
        .then((list) => !stale && setMembers({ q: mq, list }))
        .catch(() => {})
    }, 200)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [mq, mentions])

  // ─── Applying edits ──────────────────────────────────────────────────────────────────────────────────────

  function apply(edit: ops.Edit) {
    {
      const el = area.current
      const text = valueRef.current
      const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
      if (next.length > maxLength) {
        setNotice({ tone: "error", text: `That would go over the ${maxLength.toLocaleString("en")} character limit.` })
        return
      }
      if (!el) {
        onChange(next)
        return
      }
      el.focus()
      el.setSelectionRange(edit.from, edit.to)
      let ok = false
      try {
        // Keeps the browser's undo history (Ctrl+Z) working across toolbar edits.
        ok = edit.insert ? document.execCommand("insertText", false, edit.insert) : edit.from === edit.to || document.execCommand("delete")
      } catch {}
      if (ok && el.value === next) {
        if (next !== valueRef.current) onChange(next)
        el.setSelectionRange(edit.selStart, edit.selEnd)
      } else {
        pendingSel.current = [edit.selStart, edit.selEnd]
        onChange(next)
      }
    }
  }

  const sel = (): [number, number] => {
    const el = area.current
    return el ? [el.selectionStart, el.selectionEnd] : savedSel.current
  }

  const run = (f: (text: string, s: number, e: number) => ops.Edit) => {
    const [s, e] = sel()
    apply(f(valueRef.current, s, e))
  }

  const openDialog = (m: InsertMode) => {
    const [s, e] = sel()
    savedSel.current = [s, e]
    setDialog({ mode: m, text: valueRef.current.slice(s, e) })
  }

  function onInsert(r: InsertResult) {
    inserted.current = true
    const [s, e] = savedSel.current
    const text = valueRef.current
    requestAnimationFrame(() => {
      if (r.mode === "link") apply(ops.link(text, s, e, r.url, r.text || undefined))
      else if (r.mode === "embed") apply(ops.block(text, s, e, r.url))
      else if (r.mode === "table") apply(ops.table(text, s, e, r.cols, r.rows))
      else apply(ops.codeBlock(text, s, e, r.lang))
    })
  }

  const insertAtCaret = (t: string) => {
    const [s, e] = sel()
    apply(ops.insertText(s, e, t))
  }

  const ctx: CmdCtx = {
    edit: run,
    dialog: openDialog,
    pickImage: () => {
      savedSel.current = sel()
      fileInput.current?.click()
    },
    openEmoji: () => {
      savedSel.current = sel()
      setEmojiOpen(true)
    },
    insert: insertAtCaret,
  }

  // ─── Pictures ────────────────────────────────────────────────────────────────────────────────────────────

  async function addImages(files: File[], at?: [number, number]) {
    if (!images) return
    const list = files.filter((f) => (IMAGE_TYPES as readonly string[]).includes(f.type)).slice(0, 10)
    if (!list.length) {
      if (files.length) setNotice({ tone: "error", text: "Only PNG, JPEG, WebP, GIF and AVIF pictures can be added." })
      return
    }
    const [s, e] = at ?? sel()
    // A placeholder line per picture, replaced by the real address when the upload finishes.
    const tokens = list.map((f) => ({ f, token: `uploading-${Math.random().toString(36).slice(2, 10)}` }))
    const lines = tokens.map(({ f, token }) => `![Uploading ${altFromName(f.name)}…](${token})`).join("\n")
    apply(ops.block(valueRef.current, s, e, lines))
    setUploading((n) => n + list.length)
    setNotice(null)
    await Promise.all(
      tokens.map(async ({ f, token }) => {
        const find = new RegExp(`!\\[Uploading [^\\]]*…\\]\\(${token}\\)`)
        try {
          const url = await uploadImage(f)
          onChange(valueRef.current.replace(find, `![${altFromName(f.name)}](${url})`))
        } catch (err) {
          onChange(valueRef.current.replace(find, "").replace(/\n{3,}/g, "\n\n"))
          setNotice({ tone: "error", text: (err as Error).message })
        } finally {
          setUploading((n) => n - 1)
        }
      })
    )
  }

  // ─── Triggers: "/", "@", ":" ─────────────────────────────────────────────────────────────────────────────

  function sync(el: HTMLTextAreaElement) {
    if (el.selectionStart !== el.selectionEnd) return setTrigger(null)
    const t = ops.triggerAt(el.value, el.selectionStart)
    const next = t && (t.kind !== "mention" || mentions) ? t : null
    if (next?.kind !== trigger?.kind || next?.query !== trigger?.query) setActive(0)
    setTrigger(next)
    if (next) {
      const c = caretCoords(el, next.start)
      setMenuPos({ top: el.offsetTop + c.top + c.height + 4, left: Math.max(0, el.offsetLeft + c.left - 8) })
    }
  }

  function replaceTrigger(insert: string) {
    if (!trigger || !area.current) return
    const caret = area.current.selectionStart
    apply({ from: trigger.start, to: caret, insert, selStart: trigger.start + insert.length, selEnd: trigger.start + insert.length })
    setTrigger(null)
  }

  const suggestions: Suggestion[] = (() => {
    if (!trigger) return []
    if (trigger.kind === "slash") {
      return matchCommands(trigger.query).map((c) => ({ key: c.id, label: c.label, hint: c.hint, icon: <c.icon aria-hidden className="size-4" />, item: { t: "cmd" as const, c } }))
    }
    if (trigger.kind === "emoji") {
      return findEmoji(trigger.query, 8).map((x: Emoji) => ({ key: x.name, label: `:${x.name}:`, icon: <span className="text-base leading-none">{x.e}</span>, item: { t: "emoji" as const, x } }))
    }
    const f = trigger.query.toLowerCase()
    const fromThread = participants.filter((c) => !f || c.name.toLowerCase().includes(f) || c.handle?.startsWith(f))
    const fromDb = members.q === trigger.query ? members.list : []
    const all = [...fromThread, ...fromDb].filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i).slice(0, 7)
    return all.map((c) => ({ key: c.key, label: c.name, hint: c.hint, icon: <PosterAvatar poster={{ name: c.name, handle: c.handle }} size={22} />, item: { t: "member" as const, c } }))
  })()

  function pick(s: Suggestion) {
    const it = s.item
    if (it.t === "emoji") return replaceTrigger(it.x.e)
    if (it.t === "member") {
      replaceTrigger(`${it.c.insert} `)
      setPicked((p) => (p.some((x) => x.key === it.c.key) ? p : [...p, it.c]))
      onMention?.(it.c)
      return
    }
    const el = area.current
    if (!el || !trigger) return
    // Take "/query" out first, then run the command where it was.
    apply({ from: trigger.start, to: el.selectionStart, insert: "", selStart: trigger.start, selEnd: trigger.start })
    setTrigger(null)
    requestAnimationFrame(() => it.c.run(ctx))
  }

  const menuOpen = mode !== "preview" && trigger !== null && suggestions.length > 0
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1))
  const listId = `${uid}-suggest`

  // ─── Keys ────────────────────────────────────────────────────────────────────────────────────────────────

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (suggestions[activeIndex]) pick(suggestions[activeIndex])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setTrigger(null)
        return
      }
    }
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (mod && e.key === "Enter") {
      if (onSubmit) {
        e.preventDefault()
        onSubmit()
      }
      return
    }
    if (mod) {
      const code = e.code
      let handled = true
      if (!e.shiftKey && !e.altKey && k === "b") run((t, s, en) => ops.wrap(t, s, en, "**", "**", "bold text"))
      else if (!e.shiftKey && !e.altKey && k === "i") run((t, s, en) => ops.wrap(t, s, en, "_", "_", "italic text"))
      else if (!e.shiftKey && !e.altKey && k === "e") run((t, s, en) => ops.wrap(t, s, en, "`", "`", "code"))
      else if (!e.shiftKey && !e.altKey && k === "k") openDialog("link")
      else if (e.shiftKey && !e.altKey && k === "x") run((t, s, en) => ops.wrap(t, s, en, "~~", "~~", "struck text"))
      else if (e.shiftKey && code === "Digit8") run((t, s, en) => ops.toggleLines(t, s, en, "bullet"))
      else if (e.shiftKey && code === "Digit7") run((t, s, en) => ops.toggleLines(t, s, en, "number"))
      else if (e.shiftKey && code === "Digit9") run((t, s, en) => ops.toggleLines(t, s, en, "task"))
      else if (e.shiftKey && code === "Period") run((t, s, en) => ops.toggleLines(t, s, en, "quote"))
      else if (e.altKey && /^Digit[1-3]$/.test(code)) run((t, s, en) => ops.heading(t, s, en, Number(code.slice(5))))
      else if (e.altKey && code === "KeyC") openDialog("code")
      else if (e.shiftKey && k === "p") setMode(mode === "preview" ? "write" : "preview")
      else if (e.shiftKey && k === "f") setFocusMode((f) => !f)
      else if (!e.shiftKey && (k === "/" || code === "Slash")) setHelp(true)
      else handled = false
      if (handled) e.preventDefault()
      return
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      const edit = ops.continueList(value, e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
      if (edit) {
        e.preventDefault()
        apply(edit)
      }
      return
    }
    if (e.key === "Tab" && !e.altKey) {
      const edit = ops.indentList(value, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, e.shiftKey)
      if (edit) {
        e.preventDefault()
        apply(edit)
      }
      return
    }
    if (e.key === "Escape" && focusMode) {
      e.preventDefault()
      setFocusMode(false)
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files)
    if (files.length && images) {
      e.preventDefault()
      void addImages(files)
      return
    }
    const text = e.clipboardData.getData("text/plain")
    const edit = ops.pasteLink(value, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, text)
    if (edit) {
      e.preventDefault()
      apply(edit)
    }
  }

  function onScroll() {
    const a = area.current
    const p = previewRef.current
    if (!a || !p || mode !== "split") return
    const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight)
    p.scrollTop = ratio * (p.scrollHeight - p.clientHeight)
    if (trigger) setTrigger(null)
  }

  // ─── Toolbar ─────────────────────────────────────────────────────────────────────────────────────────────

  type Tool = { label: string; combo?: string; icon: typeof BoldIcon; act: () => void }
  const TOOLS: Record<string, Tool> = {
    bold: { label: "Bold", combo: "Mod+B", icon: BoldIcon, act: () => run((t, s, e) => ops.wrap(t, s, e, "**", "**", "bold text")) },
    italic: { label: "Italic", combo: "Mod+I", icon: ItalicIcon, act: () => run((t, s, e) => ops.wrap(t, s, e, "_", "_", "italic text")) },
    strike: { label: "Strikethrough", combo: "Mod+Shift+X", icon: StrikethroughIcon, act: () => run((t, s, e) => ops.wrap(t, s, e, "~~", "~~", "struck text")) },
    code: { label: "Inline code", combo: "Mod+E", icon: CodeIcon, act: () => run((t, s, e) => ops.wrap(t, s, e, "`", "`", "code")) },
    link: { label: "Link", combo: "Mod+K", icon: LinkIcon, act: () => openDialog("link") },
    bullet: { label: "Bulleted list", combo: "Mod+Shift+8", icon: ListIcon, act: () => run((t, s, e) => ops.toggleLines(t, s, e, "bullet")) },
    number: { label: "Numbered list", combo: "Mod+Shift+7", icon: ListOrderedIcon, act: () => run((t, s, e) => ops.toggleLines(t, s, e, "number")) },
    task: { label: "Task list", combo: "Mod+Shift+9", icon: ListChecksIcon, act: () => run((t, s, e) => ops.toggleLines(t, s, e, "task")) },
    quote: { label: "Quote", combo: "Mod+Shift+.", icon: QuoteIcon, act: () => run((t, s, e) => ops.toggleLines(t, s, e, "quote")) },
    image: { label: "Add pictures", icon: ImageIcon, act: () => ctx.pickImage() },
  }
  const inline = full ? ["bold", "italic", "strike", "code", "link", "|", "bullet", "number", "task", "quote"] : ["bold", "italic", "code", "link", "|", "bullet", "quote"]

  const btn =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"

  const toolButton = (name: string, i: number) => {
    if (name === "|") return <span key={`sep-${i}`} aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
    const t = TOOLS[name]
    return (
      <button key={name} type="button" onClick={t.act} aria-label={t.label} title={t.label} className={cn(btn, "group/tool relative")} disabled={mode === "preview"}>
        <t.icon aria-hidden className="size-4" />
      </button>
    )
  }

  const tabs: { m: Mode; label: string; icon: typeof BoldIcon }[] = [
    { m: "write", label: copy.write, icon: PencilLineIcon },
    ...(wide ? [{ m: "split" as Mode, label: copy.split, icon: Columns2Icon }] : []),
    { m: "preview", label: copy.preview, icon: EyeIcon },
  ]

  const near = value.length > maxLength * 0.85
  const saveText =
    autosave.state.status === "pending"
      ? "Saving draft…"
      : autosave.state.status === "saved" && autosave.state.at
        ? `Draft saved ${autosave.state.where === "account" ? "to your account" : "on this device"} ${new Date(autosave.state.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : autosave.state.status === "error"
          ? "Draft not saved"
          : ""

  const heightWrite = focusMode ? "flex-1 min-h-0" : full ? "min-h-[24rem] lg:min-h-[30rem]" : ""
  const splitHeight = focusMode ? "flex-1 min-h-0" : full ? "h-[min(72vh,40rem)]" : "h-80"

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-background/50 transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-ring/40",
        invalid ? "border-destructive/60 ring-2 ring-destructive/20" : "border-input",
        focusMode && "fixed inset-0 z-[48] rounded-none border-0 bg-background ring-0 focus-within:ring-0"
      )}
      role={focusMode ? "dialog" : undefined}
      aria-modal={focusMode || undefined}
      aria-label={focusMode ? `Focus mode${title ? `: ${title}` : ""}` : undefined}
      onDragOver={(e) => {
        if (!images || !Array.from(e.dataTransfer.types).includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!images || !e.dataTransfer.files.length) return
        e.preventDefault()
        setDragging(false)
        void addImages(Array.from(e.dataTransfer.files))
      }}
    >
      {/* Top bar */}
      <div className={cn("flex items-center gap-1 border-b border-border px-1.5 py-1", focusMode && "mx-auto w-full max-w-6xl px-3 pt-3")}>
        <div role="tablist" aria-label="Editor view" className="flex shrink-0 gap-0.5 rounded-lg bg-white/[0.03] p-0.5">
          {tabs.map((t) => (
            <button
              key={t.m}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.m}`}
              aria-selected={mode === t.m}
              aria-controls={`${uid}-panel`}
              onClick={() => setMode(t.m)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                mode === t.m ? "bg-white/[0.09] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon aria-hidden className="size-3.5" />
              <span className={cn(!full && "max-sm:sr-only")}>{t.label}</span>
            </button>
          ))}
        </div>

        <div role="toolbar" aria-label="Formatting" aria-controls={id} className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {full && (
            <DropdownMenu>
              <DropdownMenuTrigger disabled={mode === "preview"} className={cn(btn, "w-auto gap-0.5 px-1.5")} aria-label="Heading">
                <Heading2Icon aria-hidden className="size-4" />
                <ChevronDownIcon aria-hidden className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52" finalFocus={area}>
                <DropdownMenuGroup>
                  {[1, 2, 3].map((n) => {
                    const Icon = [Heading1Icon, Heading2Icon, Heading3Icon][n - 1]
                    return (
                      <DropdownMenuItem key={n} onClick={() => requestAnimationFrame(() => run((t, s, e) => ops.heading(t, s, e, n)))}>
                        <Icon aria-hidden /> Heading {n}
                        <Keys combo={`Mod+Alt+${n}`} className="ml-auto" />
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {inline.map(toolButton)}
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger disabled={mode === "preview"} className={cn(btn, "w-auto gap-1 px-2 text-[13px]")} aria-label="Insert">
              <PlusIcon aria-hidden className="size-4" />
              <span className="max-sm:sr-only">Insert</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[60vh] w-60 overflow-y-auto" finalFocus={area}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Insert</DropdownMenuLabel>
                {COMMANDS.filter((c) => !["h1", "h2", "h3", "mention", ...(full ? ["list", "numbers", "tasks", "quote", "link"] : ["list", "quote", "link"])].includes(c.id)).map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => {
                      savedSel.current = sel()
                      requestAnimationFrame(() => c.run(ctx))
                    }}
                  >
                    <c.icon aria-hidden /> {c.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {!full && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Format</DropdownMenuLabel>
                    {COMMANDS.filter((c) => ["h2", "h3", "numbers", "tasks"].includes(c.id)).map((c) => (
                      <DropdownMenuItem key={c.id} onClick={() => requestAnimationFrame(() => c.run(ctx))}>
                        <c.icon aria-hidden /> {c.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => requestAnimationFrame(() => TOOLS.strike.act())}>
                      <StrikethroughIcon aria-hidden /> Strikethrough
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {images && toolButton("image", 99)}
          <button
            type="button"
            className={btn}
            aria-label="Emoji"
            title="Emoji"
            aria-haspopup="dialog"
            aria-expanded={emojiOpen}
            disabled={mode === "preview"}
            onClick={() => {
              savedSel.current = sel()
              setEmojiOpen((o) => !o)
            }}
          >
            <SmilePlusIcon aria-hidden className="size-4" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={cn(btn, "max-sm:hidden")} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setHelp(true)}>
            <KeyboardIcon aria-hidden className="size-4" />
          </button>
          <button type="button" className={btn} aria-label={focusMode ? "Leave focus mode" : "Focus mode"} title={focusMode ? "Leave focus mode (Esc)" : "Focus mode"} aria-pressed={focusMode} onClick={() => setFocusMode((f) => !f)}>
            {focusMode ? <Minimize2Icon aria-hidden className="size-4" /> : <Maximize2Icon aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      {emojiOpen && (
        <EmojiPicker
          onClose={() => {
            setEmojiOpen(false)
            area.current?.focus()
          }}
          onPick={(x) => {
            setEmojiOpen(false)
            const [s, e] = savedSel.current
            requestAnimationFrame(() => apply(ops.insertText(s, e, x.e)))
          }}
        />
      )}

      {autosave.restore && (
        <div className={cn("flex flex-wrap items-center gap-2 border-b border-ion/20 bg-ion/[0.07] px-3 py-2 text-sm", focusMode && "mx-auto w-full max-w-6xl")}>
          <span className="min-w-0 flex-1 text-foreground/90">
            You have an unsaved draft here from {new Date(autosave.restore.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {autosave.restore.where === "account" ? ", saved to your account" : ""}.
          </span>
          <button
            type="button"
            onClick={() => {
              const body = autosave.restore!.body.slice(0, maxLength)
              autosave.dismiss()
              onChange(body)
            }}
            className="rounded-md bg-ion/15 px-2.5 py-1 text-sm font-medium text-ion hover:bg-ion/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Restore it
          </button>
          <button type="button" onClick={autosave.dismiss} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Keep what is here
          </button>
        </div>
      )}

      {/* Panels */}
      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${mode}`} className={cn("relative flex min-h-0", focusMode && "mx-auto w-full max-w-6xl flex-1 px-3", mode === "split" ? "flex-row" : "flex-col")}>
        <div className={cn("relative min-w-0", mode === "split" && "w-1/2 border-r border-border", mode === "preview" && "hidden", focusMode && "flex flex-1 flex-col")}>
          <textarea
            ref={area}
            id={id}
            value={value}
            rows={full ? 16 : rows}
            maxLength={maxLength}
            placeholder={placeholder}
            autoFocus={autoFocus}
            spellCheck
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={[describedBy, `${uid}-foot`].filter(Boolean).join(" ")}
            aria-autocomplete={mentions ? "list" : undefined}
            aria-controls={menuOpen ? listId : undefined}
            aria-activedescendant={menuOpen ? `${listId}-${activeIndex}` : undefined}
            onChange={(e) => {
              onChange(e.target.value)
              sync(e.target)
              if (notice?.tone === "error") setNotice(null)
            }}
            onSelect={(e) => sync(e.currentTarget)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onScroll={onScroll}
            onBlur={() => {
              savedSel.current = sel()
              setTimeout(() => setTrigger(null), 150)
            }}
            className={cn(
              "block w-full bg-transparent px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70",
              full && "font-mono text-[13.5px] leading-[1.7]",
              mode === "split" ? cn(splitHeight, "resize-none") : cn("resize-y", heightWrite, focusMode && "resize-none"),
              !full && !focusMode && "min-h-28",
              focusMode && "mx-auto max-w-[76ch] text-base leading-[1.8]"
            )}
          />
          {menuOpen && menuPos && (
            <ul
              id={listId}
              role="listbox"
              aria-label={trigger?.kind === "slash" ? "Commands" : trigger?.kind === "emoji" ? "Emoji" : "People to mention"}
              style={{ top: menuPos.top, left: Math.min(menuPos.left, 9999) }}
              className="liquid-glass-strong absolute z-40 max-h-72 w-[min(18rem,calc(100%-1rem))] overflow-y-auto rounded-xl border border-border bg-popover/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === activeIndex ? "bg-white/[0.09] text-foreground" : "text-foreground/85")}
                >
                  <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">{s.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.hint && <span className="shrink-0 truncate text-xs text-muted-foreground">{s.hint}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {mode !== "write" && (
          <div
            ref={previewRef}
            aria-label="Preview"
            aria-live={mode === "preview" ? "polite" : undefined}
            tabIndex={0}
            className={cn(
              "min-w-0 overflow-y-auto px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              mode === "split" ? cn("w-1/2", splitHeight) : focusMode ? "flex-1" : full ? "min-h-[24rem] lg:min-h-[30rem]" : "min-h-28"
            )}
          >
            {preview.trim() ? (
              <Markdown source={highlightMentions(preview, names)} ctx={{ source: "none" }} embeds className={cn(focusMode && "mx-auto max-w-[72ch]")} />
            ) : (
              <p className="py-1 text-sm text-muted-foreground">{copy.empty}</p>
            )}
          </div>
        )}

        {dragging && (
          <div aria-hidden className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-lg border-2 border-dashed border-ion/60 bg-ion/10 text-sm font-medium text-ion backdrop-blur-[2px]">
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="size-4" /> {copy.drop}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        id={`${uid}-foot`}
        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-xs text-muted-foreground", focusMode && "mx-auto w-full max-w-6xl")}
      >
        <span className="tabular">
          {stats.words.toLocaleString("en")} {stats.words === 1 ? "word" : "words"}
          {stats.minutes > 0 && ` · ${stats.minutes} min read`}
        </span>
        {near && (
          <span className={cn("tabular", value.length >= maxLength && "text-destructive")}>
            {value.length.toLocaleString("en")} / {maxLength.toLocaleString("en")}
          </span>
        )}
        {uploading > 0 && (
          <span className="inline-flex items-center gap-1 text-ion" role="status">
            <Loader2Icon aria-hidden className="size-3 motion-safe:animate-spin" /> Uploading {uploading} {uploading === 1 ? "picture" : "pictures"}…
          </span>
        )}
        {notice && (
          <span role={notice.tone === "error" ? "alert" : "status"} className={cn("inline-flex items-center gap-1", notice.tone === "error" ? "text-destructive" : "text-foreground/80")}>
            {notice.text}
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="rounded p-0.5 hover:text-foreground">
              <XIcon aria-hidden className="size-3" />
            </button>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-3">
          {saveText && <span aria-live="polite">{saveText}</span>}
          <span className="max-sm:hidden">
            {copy.hint}
            {mentions ? ", @ to mention" : ""}
            {images ? ", paste or drop pictures" : ""}.
          </span>
        </span>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          void addImages(files, savedSel.current)
        }}
      />

      <InsertDialog
        mode={dialog?.mode ?? null}
        initialText={dialog?.text ?? ""}
        onClose={() => {
          setDialog(null)
          if (inserted.current) {
            inserted.current = false
            return
          }
          requestAnimationFrame(() => {
            area.current?.focus()
            area.current?.setSelectionRange(...savedSel.current)
          })
        }}
        onInsert={onInsert}
      />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  )
}
