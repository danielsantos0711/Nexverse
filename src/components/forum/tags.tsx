"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { HashIcon, XIcon } from "lucide-react"
import { MAX_TAGS, normalizeTag } from "@/lib/community"
import { useKnownTags } from "@/lib/lists/hooks"
import { cn } from "@/lib/utils"

/** Up to five tags: type and press Enter or comma, Backspace removes the last one; known tags are suggested. */
export function TagInput({ id, value, onChange, describedBy }: { id: string; value: string[]; onChange: (tags: string[]) => void; describedBy?: string }) {
  const KNOWN_TAGS = useKnownTags()
  const uid = useId()
  const [draft, setDraft] = useState("")
  const [active, setActive] = useState(0)
  const full = value.length >= MAX_TAGS
  const q = normalizeTag(draft)
  const suggestions = q ? KNOWN_TAGS.filter((t) => t.startsWith(q) && !value.includes(t)).slice(0, 6) : []
  const open = suggestions.length > 0
  const listId = `${uid}-tags`

  function add(raw: string) {
    const t = normalizeTag(raw)
    setDraft("")
    setActive(0)
    if (!t || value.includes(t) || full) return
    onChange([...value, t])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length)
    } else if (e.key === "Enter" || e.key === ",") {
      if (!draft.trim()) return
      e.preventDefault()
      add(open && e.key === "Enter" ? suggestions[Math.min(active, suggestions.length - 1)] : draft)
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === "Escape" && draft) {
      e.preventDefault()
      setDraft("")
    }
  }

  return (
    <div className="relative">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background/60 px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        <ul className="contents" aria-label="Tags">
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-ion/10 py-0.5 pr-1 pl-2 text-xs text-ion">
              #{t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                aria-label={`Remove tag ${t}`}
                className="grid size-4 place-items-center rounded-full hover:bg-ion/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={draft}
          disabled={full}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(",")) add(v.slice(0, -1))
            else {
              setDraft(v.slice(0, 30))
              setActive(0)
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={full ? `${MAX_TAGS} tags is the limit` : value.length ? "Add another" : "lora, quantisation, evals"}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${Math.min(active, suggestions.length - 1)}` : undefined}
          aria-describedby={describedBy}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Suggested tags" className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-popover/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl sm:right-auto sm:w-64">
          {suggestions.map((t, i) => (
            <li
              key={t}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                add(t)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-lg px-2.5 py-1.5 text-sm", i === active && "bg-white/[0.08]")}
            >
              #{t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A thread's tags as small chips; with `hrefBase` (a category page) each one links to that list filtered by the tag. */
export function TagList({ tags, hrefBase, className }: { tags: string[]; hrefBase?: string; className?: string }) {
  if (!tags.length) return null
  return (
    <ul aria-label="Tags" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((t) =>
        hrefBase ? (
          <li key={t}>
            <Link
              href={`${hrefBase}?tag=${encodeURIComponent(t)}`}
              className="relative z-10 inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-ion/10 hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HashIcon aria-hidden className="size-3" />
              {t}
            </Link>
          </li>
        ) : (
          <li key={t} className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            <HashIcon aria-hidden className="size-3" />
            {t}
          </li>
        )
      )}
    </ul>
  )
}
