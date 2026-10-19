"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { BookmarkIcon, SearchIcon, Undo2Icon } from "lucide-react"
import { useItemInfo, type ItemInfo } from "@/components/collections/describe-item"
import { KIND_ICONS, kindText } from "@/components/hub/bits"
import { SaveButton } from "@/components/social/save-button"
import { Skeleton } from "@/components/ui/skeleton"
import { toggleBookmark, useBookmarks, type Bookmark } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

export const SAVED_GROUPS = [
  { id: "model", label: "Models" },
  { id: "dataset", label: "Datasets" },
  { id: "tool", label: "Tools" },
  { id: "repo", label: "Repos" },
  { id: "thread", label: "Threads" },
  { id: "news", label: "News" },
  { id: "collection", label: "Collections" },
  { id: "live", label: "GitHub and Lab tools" },
  { id: "gone", label: "No longer available" },
] as const
type GroupId = (typeof SAVED_GROUPS)[number]["id"]

type Entry = { target: string; group: GroupId; label: string; node: React.ReactNode; wide?: boolean }

function groupOf(info: ItemInfo): GroupId {
  if (!info.found) return "gone"
  switch (info.group) {
    case "model":
    case "dataset":
    case "tool":
    case "repo":
    case "thread":
    case "news":
    case "collection":
      return info.group
    default:
      return "live"
  }
}

/** Turns bookmarks into renderable entries, with every member item named by one round of queries. */
function useEntries(list: Bookmark[]) {
  const targets = useMemo(() => list.map((b) => b.target), [list])
  const { get, ready } = useItemInfo(targets)
  const entries = useMemo(() => {
    if (!ready) return []
    return list.map(({ target }): Entry => {
      const info = get(target)
      return { target, group: groupOf(info), label: `${info.label} ${info.summary ?? ""} ${info.by ?? ""}`, node: <SavedRow info={info} /> }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, ready])
  return { entries, pending: !ready }
}

export function SavedView() {
  const { ready: sessionReady, user } = useSession()
  const { ready, list } = useBookmarks()
  const { entries, pending } = useEntries(list)
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<"all" | GroupId>("all")
  const [query, setQuery] = useState("")
  const [removed, setRemoved] = useState<string | null>(null)

  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 6000)
    return () => clearTimeout(t)
  }, [removed])

  const counts = useMemo(() => {
    const c: Partial<Record<GroupId, number>> = {}
    for (const e of entries) c[e.group] = (c[e.group] ?? 0) + 1
    return c
  }, [entries])

  const q = query.trim().toLowerCase()
  const visible = entries.filter((e) => (filter === "all" || e.group === filter) && (!q || e.label.toLowerCase().includes(q)))
  const groups = SAVED_GROUPS.filter((g) => (filter === "all" || g.id === filter) && visible.some((e) => e.group === g.id))
  const loading = !ready || (pending && entries.length === 0)

  async function undo() {
    if (!removed) return
    const target = removed
    setRemoved(null)
    await toggleBookmark(target, true).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-6">
      {live && sessionReady && !user && (
        <p className="glass rounded-xl px-4 py-3 text-sm text-muted-foreground">
          These are saved in this browser only.{" "}
          <Link href="/sign-in?next=/saved" className="text-ion hover:underline">
            Sign in
          </Link>{" "}
          to keep them on every device.
        </p>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="toolbar" aria-label="Filter saved items" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {[{ id: "all" as const, label: "All" }, ...SAVED_GROUPS].map((g) => {
            const n = g.id === "all" ? entries.length : (counts[g.id] ?? 0)
            if (g.id !== "all" && n === 0 && filter !== g.id) return null
            const on = filter === g.id
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(g.id)}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "text-ion-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId="saved-filter-pill"
                    aria-hidden
                    className="absolute inset-0 -z-0 rounded-full bg-ion"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">
                  {g.label} <span className="tabular opacity-70">{n}</span>
                </span>
              </button>
            )
          })}
        </div>
        <label className="glass flex h-10 w-full items-center gap-2 rounded-full px-3.5 md:w-64">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only">Search saved items</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading saved items">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptySaved />
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          {q ? `Nothing saved matches "${query.trim()}".` : "Nothing saved here yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((g) => {
            const items = visible.filter((e) => e.group === g.id)
            const grid = false
            return (
              <section key={g.id} aria-labelledby={`saved-${g.id}`} className="flex flex-col gap-3">
                {filter === "all" && (
                  <h2 id={`saved-${g.id}`} className="flex items-baseline gap-2 text-lg font-semibold">
                    {g.label} <span className="text-sm font-normal text-muted-foreground tabular">{items.length}</span>
                  </h2>
                )}
                {filter !== "all" && (
                  <h2 id={`saved-${g.id}`} className="sr-only">
                    {g.label}
                  </h2>
                )}
                <ul className={cn(grid ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2")}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {items.map((e) => (
                      <motion.li
                        key={e.target}
                        layout={reduce ? false : "position"}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className={cn("relative", e.wide ? "" : "flex items-center gap-2")}
                      >
                        <div className={cn("min-w-0", e.wide ? "h-full" : "flex-1")}>{e.node}</div>
                        <SaveButton
                          target={e.target}
                          variant="icon"
                          label="Save"
                          onChange={(on) => setRemoved(on ? null : e.target)}
                          className={cn("shrink-0", e.wide && "absolute top-3 right-3 bg-black/50 backdrop-blur")}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {removed && (
          <motion.div
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="glass fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full py-2 pr-2 pl-4 text-sm shadow-xl"
          >
            Removed from saved
            <button
              type="button"
              onClick={undo}
              className="inline-flex items-center gap-1.5 rounded-full bg-ion/15 px-3 py-1.5 text-ion transition-colors hover:bg-ion/25 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Undo2Icon aria-hidden className="size-3.5" /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptySaved() {
  return (
    <div className="spotlight glass flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-ion/10 text-ion shadow-[0_0_40px_-6px_rgb(143_180_255/0.6)]">
        <BookmarkIcon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold">Nothing saved yet</h2>
        <p className="text-muted-foreground">Tap the bookmark on any model, dataset, tool, repo, thread or story and it lands here, ready when you are.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/explore" className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Explore the hub
        </Link>
        <Link href="/forum" className="pressable inline-flex h-10 items-center rounded-full border border-border bg-secondary/60 px-5 text-sm hover:bg-secondary">
          Browse the forum
        </Link>
      </div>
    </div>
  )
}

/** One saved item: what it is, its name and a line about it, linking to its page. */
function SavedRow({ info }: { info: ItemInfo }) {
  const Icon = info.kind ? KIND_ICONS[info.kind] : BookmarkIcon
  const body = (
    <>
      <span className={cn("inline-flex items-center gap-1 text-xs font-medium", info.kind ? kindText(info.kind) : "text-muted-foreground")}>
        <Icon aria-hidden className="size-3.5" />
        {info.type}
      </span>
      <span className="truncate font-medium">{info.label}</span>
      {(info.summary || info.by) && <span className="line-clamp-1 text-sm text-muted-foreground">{[info.summary, info.by && `by ${info.by}`].filter(Boolean).join(" · ")}</span>}
    </>
  )
  return info.href ? (
    <Link href={info.href as "/"} className="flex flex-col gap-0.5 rounded-xl border border-border bg-card/70 p-4 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-0.5 rounded-xl border border-dashed border-border bg-card/40 p-4 text-muted-foreground">
      {body}
      <span className="text-xs">Remove it with the bookmark button.</span>
    </div>
  )
}
