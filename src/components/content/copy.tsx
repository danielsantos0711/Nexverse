"use client"

import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef, useState, type ElementType } from "react"
import { saveContent, useCopyEntry, useEditMode } from "@/lib/content"
import { announce } from "./status"

/**
 * Editable text on the page: <Copy k="home.hero.title" as="h1">The open universe for AI makers</Copy>.
 * The children are the default; an admin can change the text from the site editor or in place.
 *
 * In edit mode (page editors only, see ContentEditor) the text gets a quiet outline and becomes editable in
 * place: click or press Enter to edit, Enter saves, Escape cancels; `multiline` texts take Shift+Enter for a
 * new line. Leaving the field saves too. An empty text goes back to the default.
 */
export function Copy({ k, children, as, className, multiline }: { k: string; children: string; as?: ElementType; className?: string; multiline?: boolean }) {
  const { text, overridden } = useCopyEntry(k, children, multiline)
  const editing = useEditMode()
  const Tag = as ?? "span"
  if (!editing) return <Tag className={className}>{text}</Tag>
  return <EditableCopy k={k} Tag={Tag} className={className} text={text} fallback={children} overridden={overridden} multiline={multiline} />
}

function EditableCopy({
  k,
  Tag,
  className,
  text,
  fallback,
  overridden,
  multiline,
}: {
  k: string
  Tag: ElementType
  className?: string
  text: string
  fallback: string
  overridden: boolean
  multiline?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const path = usePathname()
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  // What the element showed when editing began; React does not touch the children while editing.
  const [start, setStart] = useState(text)

  useLayoutEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [active])

  function begin() {
    setStart(text)
    setActive(true)
  }

  function cancel() {
    setActive(false)
  }

  async function commit() {
    const el = ref.current
    if (!el) return
    const raw = el.innerText.replace(/\u00a0/g, " ")
    const next = (multiline ? raw.replace(/\n{3,}/g, "\n\n") : raw.replace(/\s*\n\s*/g, " ")).trim()
    setActive(false)
    if (next === start.trim()) return
    if (next.length > 5000) {
      announce(false, "That text is too long: up to 5000 characters.")
      return
    }
    setBusy(true)
    try {
      // Writing the default back (or nothing) resets the key; anything else overrides it.
      await saveContent(k, "copy", !next || next === fallback ? null : next, { fallback, path })
      announce(true, !next || next === fallback ? "Back to the default text." : "Saved. Everyone sees the new text now.")
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    // A fresh element for each mode: the browser rewrites the text while editing, so React must not reuse it.
    <Tag
      key={active ? "editing" : "view"}
      ref={ref}
      className={className}
      data-copy-key={k}
      data-copy-state={active ? "editing" : overridden ? "edited" : "default"}
      aria-busy={busy || undefined}
      {...(active
        ? {
            contentEditable: "plaintext-only",
            suppressContentEditableWarning: true,
            role: "textbox",
            "aria-multiline": multiline ? true : undefined,
            "aria-label": `Editing text ${k}`,
            onKeyDown: (e: React.KeyboardEvent) => {
              e.stopPropagation()
              if (e.key === "Escape") {
                e.preventDefault()
                cancel()
              } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
                e.preventDefault()
                void commit()
              }
            },
            onKeyUp: (e: React.KeyboardEvent) => e.stopPropagation(),
            onBlur: () => void commit(),
            onClick: (e: React.MouseEvent) => {
              e.preventDefault()
              e.stopPropagation()
            },
          }
        : {
            tabIndex: 0,
            role: "button",
            "aria-label": `Edit text: ${text.slice(0, 80)}`,
            title: `Click to edit · ${k}`,
            onClick: (e: React.MouseEvent) => {
              // Inside a link or button, editing must not also follow the link.
              e.preventDefault()
              e.stopPropagation()
              begin()
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                begin()
              }
            },
          })}
    >
      {active ? start : text}
    </Tag>
  )
}
