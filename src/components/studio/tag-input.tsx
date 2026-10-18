"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { XIcon } from "lucide-react"
import { LIMITS, normalizeTag } from "@/lib/projects"
import { cn } from "@/lib/utils"

/** Tags as chips: type and press Enter or comma to add, Backspace on an empty box to remove the last one. */
export function TagInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
  invalid?: boolean
  describedBy?: string
}) {
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState("")
  const reduce = useReducedMotion()
  const full = value.length >= LIMITS.tags

  function add(raw: string) {
    const parts = raw.split(",").map(normalizeTag).filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const t of parts) if (!next.includes(t) && next.length < LIMITS.tags) next.push(t)
    if (next.length !== value.length) {
      onChange(next)
      setStatus(`Added ${next.slice(value.length).join(", ")}`)
    }
    setDraft("")
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag))
    setStatus(`Removed ${tag}`)
  }

  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background/60 px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20"
      )}
    >
      <ul className="contents" aria-label="Tags">
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.li
              key={t}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pr-1 pl-2.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove tag ${t}`}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <input
        id={id}
        value={draft}
        disabled={full}
        onChange={(e) => {
          if (e.target.value.includes(",")) add(e.target.value)
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add(draft)
          } else if (e.key === "Backspace" && !draft && value.length) {
            remove(value[value.length - 1])
          }
        }}
        onBlur={() => add(draft)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={full ? "That is 8 tags" : value.length ? "Add another" : "rag, portuguese, on-device"}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
      />
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}
