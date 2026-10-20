"use client"

import { Popover } from "@base-ui/react/popover"
import { useMemo, useState, type ReactElement } from "react"
import { SearchIcon } from "lucide-react"
import { EMOJI_GROUPS, findEmoji } from "@/lib/editor/emoji"
import { cn } from "@/lib/utils"

const RECENT_KEY = "nexverse-recent-emoji"

function recent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 16) : []
  } catch {
    return []
  }
}

function remember(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 16)))
  } catch {}
}

/**
 * Any emoji, searchable by name, with the ones you used last on top. Used for reactions and for the message box,
 * in chat rooms and direct messages alike. `trigger` is the button that opens it.
 */
export function EmojiPicker({
  trigger,
  onPick,
  side = "top",
  align = "end",
  label = "Pick an emoji",
}: {
  trigger: ReactElement
  onPick: (emoji: string) => void
  side?: "top" | "bottom"
  align?: "start" | "end" | "center"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [mine, setMine] = useState<string[]>([])
  const groups = useMemo(() => {
    if (query.trim()) return [{ label: "Results", list: findEmoji(query, 48).map((x) => x.e) }]
    const all = EMOJI_GROUPS.map((g) => ({ label: g.label, list: g.list.map((x) => x.e) }))
    return mine.length ? [{ label: "Recent", list: mine }, ...all] : all
  }, [query, mine])

  function pick(e: string) {
    remember(e)
    onPick(e)
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setMine(recent())
          setQuery("")
        }
      }}
    >
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={6} className="isolate z-50">
          <Popover.Popup
            aria-label={label}
            className="liquid-glass-strong flex w-[min(19rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col rounded-xl text-popover-foreground shadow-xl outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-safe:transition-[transform,opacity] motion-safe:duration-150"
          >
            <label className="relative m-2 mb-1 block">
              <span className="sr-only">Search emoji</span>
              <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const first = groups[0]?.list[0]
                    if (first) {
                      e.preventDefault()
                      pick(first)
                    }
                  }
                }}
                placeholder="Search: rocket, party, eyes…"
                className="h-8 w-full rounded-lg border border-input bg-background/60 pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="max-h-64 overflow-y-auto px-2 pb-2">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="sticky top-0 z-[1] bg-popover/90 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label}</h3>
                  <ul className="grid grid-cols-8 gap-0.5">
                    {g.list.map((e) => (
                      <li key={`${g.label}-${e}`}>
                        <button
                          type="button"
                          onClick={() => pick(e)}
                          aria-label={e}
                          className={cn("pressable grid size-8 place-items-center rounded-md text-lg transition-transform hover:scale-110 hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none motion-reduce:hover:scale-100")}
                        >
                          {e}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups[0]?.list.length === 0 && <p className="px-1 py-4 text-center text-sm text-muted-foreground">No emoji by that name.</p>}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
