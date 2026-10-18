"use client"

import { useDeferredValue, useId, useRef, useState } from "react"
import { BoldIcon, CodeIcon, Heading2Icon, ItalicIcon, LinkIcon, ListIcon } from "lucide-react"
import { Markdown } from "@/components/live/markdown"
import { cn } from "@/lib/utils"

type Mode = "write" | "preview"

const TOOLS = [
  { label: "Bold", icon: BoldIcon, before: "**", after: "**", sample: "bold text", key: "b" },
  { label: "Italic", icon: ItalicIcon, before: "_", after: "_", sample: "italic text", key: "i" },
  { label: "Heading", icon: Heading2Icon, before: "\n## ", after: "\n", sample: "Heading", key: null },
  { label: "Link", icon: LinkIcon, before: "[", after: "](https://)", sample: "link text", key: "k" },
  { label: "Code", icon: CodeIcon, before: "\n```\n", after: "\n```\n", sample: "code", key: null },
  { label: "List", icon: ListIcon, before: "\n- ", after: "", sample: "item", key: null },
] as const

/**
 * A Markdown box with a live preview: side by side on wide screens, Write / Preview tabs on narrow ones.
 * The preview uses the same safe renderer as READMEs from GitHub: no raw HTML ever reaches the page.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  maxLength: number
  invalid?: boolean
  describedBy?: string
  placeholder?: string
}) {
  const [mode, setMode] = useState<Mode>("write")
  const preview = useDeferredValue(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const uid = useId()

  function apply(tool: (typeof TOOLS)[number]) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const picked = value.slice(s, e) || tool.sample
    const next = value.slice(0, s) + tool.before + picked + tool.after + value.slice(e)
    if (next.length > maxLength) return
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const start = s + tool.before.length
      el.setSelectionRange(start, start + picked.length)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    const tool = TOOLS.find((t) => t.key === e.key.toLowerCase())
    if (tool) {
      e.preventDefault()
      apply(tool)
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${uid}-${m}`}
      aria-selected={mode === m}
      aria-controls={`${uid}-${m}-panel`}
      onClick={() => setMode(m)}
      className={cn(
        "rounded-full px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )

  return (
    <div className={cn("overflow-hidden rounded-xl border border-input bg-background/40", invalid && "border-destructive ring-3 ring-destructive/20")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div role="tablist" aria-label="README editor" className="flex gap-1 lg:hidden">
          {tab("write", "Write")}
          {tab("preview", "Preview")}
        </div>
        <span className="hidden px-1 text-xs text-muted-foreground lg:inline">Markdown · preview on the right</span>
        <div role="toolbar" aria-label="Formatting" aria-controls={id} className={cn("flex items-center gap-0.5", mode === "preview" && "max-lg:invisible")}>
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => apply(t)}
              aria-label={t.key ? `${t.label} (Ctrl+${t.key.toUpperCase()})` : t.label}
              title={t.key ? `${t.label} (Ctrl+${t.key.toUpperCase()})` : t.label}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <t.icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-2">
        <div id={`${uid}-write-panel`} role="tabpanel" aria-labelledby={`${uid}-write`} className={cn("lg:border-r lg:border-border", mode !== "write" && "max-lg:hidden")}>
          <textarea
            ref={ref}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={maxLength}
            spellCheck
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            placeholder={placeholder}
            className="block min-h-80 w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground lg:min-h-[28rem]"
          />
        </div>
        <div
          id={`${uid}-preview-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-preview`}
          aria-label="Preview"
          tabIndex={0}
          className={cn("max-h-[40rem] min-h-80 overflow-y-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:min-h-[28rem]", mode !== "preview" && "max-lg:hidden")}
        >
          {preview.trim() ? (
            <Markdown source={preview} ctx={{ source: "none" }} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet. What you write appears here, formatted.</p>
          )}
        </div>
      </div>
    </div>
  )
}
