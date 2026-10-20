"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"
import { EMOJI_GROUPS, findEmoji, type Emoji } from "@/lib/editor/emoji"

/** A small emoji panel under the toolbar: a search box and the grouped set. Escape or a click outside closes it. */
export function EmojiPicker({ onPick, onClose }: { onPick: (e: Emoji) => void; onClose: () => void }) {
  const [q, setQ] = useState("")
  const box = useRef<HTMLDivElement>(null)
  const found = useMemo(() => (q.trim() ? findEmoji(q.trim(), 40) : null), [q])

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    // Next tick, so the click that opened the panel does not close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", down), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener("pointerdown", down)
    }
  }, [onClose])

  const cell = (x: Emoji) => (
    <button
      key={x.name}
      type="button"
      onClick={() => onPick(x)}
      title={`:${x.name}:`}
      aria-label={x.name.replace(/_/g, " ")}
      className="grid size-9 place-items-center rounded-lg text-xl transition-[background-color,transform] hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-90"
    >
      {x.e}
    </button>
  )

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Emoji"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
      className="liquid-glass-strong absolute top-11 right-2 z-40 flex w-[min(20rem,calc(100%-1rem))] flex-col gap-2 rounded-xl border border-border bg-popover/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
    >
      <label className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background/60 px-2.5 focus-within:ring-2 focus-within:ring-ring/50">
        <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Search emoji</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: rocket, thanks, bug…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="max-h-64 overflow-y-auto pr-1">
        {found ? (
          found.length ? (
            <div className="grid grid-cols-8 gap-0.5">{found.map(cell)}</div>
          ) : (
            <p className="px-1 py-3 text-sm text-muted-foreground">No emoji by that name.</p>
          )
        ) : (
          EMOJI_GROUPS.map((g) => (
            <section key={g.label} aria-label={g.label} className="mb-2">
              <h3 className="px-1 pb-1 text-xs text-muted-foreground">{g.label}</h3>
              <div className="grid grid-cols-8 gap-0.5">{g.list.map(cell)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
