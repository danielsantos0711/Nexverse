"use client"

import Link from "next/link"
import { useId, useRef, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { searchTopics, type Topic } from "@/components/forum/topics"
import { TimeAgo } from "@/components/live/time"
import { getCategory } from "@/lib/data"
import { cn } from "@/lib/utils"

/** Searches the loaded threads by title and tag, as you type. */
export function ForumSearch({ topics, className, placeholder = "Search threads" }: { topics: Topic[]; className?: string; placeholder?: string }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  const results = searchTopics(topics, query)
  const shown = results.slice(0, 8)
  const active = open && query.trim().length >= 2

  return (
    <div
      ref={box}
      role="search"
      className={cn("relative", className)}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false)
          ;(e.target as HTMLElement).blur?.()
        }
      }}
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        Search forum threads
      </label>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={`${id}-q`}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-controls={`${id}-results`}
        className="h-9 w-full rounded-full border border-input bg-background/60 pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ion/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {active ? `${results.length} ${results.length === 1 ? "thread" : "threads"} found` : ""}
      </p>
      {active && (
        <div
          id={`${id}-results`}
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl shadow-black/40 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
        >
          {shown.length ? (
            <ul aria-label="Matching threads" className="max-h-[22rem] overflow-y-auto p-1.5">
              {shown.map((t) => (
                <li key={t.id}>
                  <Link href={t.href} onClick={() => setOpen(false)} className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none">
                    <PosterAvatar poster={t.author} size={22} className="mt-0.5" />
                    <span className="flex min-w-0 flex-col">
                      <span lang={t.lang} className="truncate text-sm font-medium">
                        {t.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {getCategory(t.category)?.name ?? "Forum"} · <TimeAgo date={t.activity} />
                        {t.tags.length > 0 && ` · #${t.tags.slice(0, 3).join(" #")}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No threads match “{query.trim()}”.</p>
          )}
          {results.length > shown.length && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Showing 8 of {results.length}. Add a word to narrow it down.</p>}
        </div>
      )}
    </div>
  )
}
