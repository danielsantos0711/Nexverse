"use client"

import { ChevronDownIcon } from "lucide-react"
import { useId, useState } from "react"
import { cn } from "@/lib/utils"

/** An abstract clamped to three lines, with a toggle to read the rest. Plain text only. */
export function Abstract({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!text) return null
  const long = text.length > 260
  return (
    <div className={cn("relative z-10 flex flex-col items-start gap-1", className)}>
      <p id={id} className={cn("text-sm leading-relaxed text-muted-foreground", long && !open && "line-clamp-3")}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs text-ion hover:underline"
        >
          {open ? "Show less" : "Read the abstract"}
          <ChevronDownIcon aria-hidden className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      )}
    </div>
  )
}
