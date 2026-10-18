"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { BookmarkIcon, ExternalLinkIcon, SearchIcon, Undo2Icon } from "lucide-react"
import { ConstellationCard, NewsCard, PersonCard, ResourceCard, ThreadRow } from "@/components/hub/cards"
import { SaveButton } from "@/components/social/save-button"
import { Skeleton } from "@/components/ui/skeleton"
import { ago, getCategory, getConstellation, getNews, getPerson, getResource, getThread, isQuestionId, threadTitle } from "@/lib/data"
import { getMemberThreads, getSharedLinks, toggleBookmark, useBookmarks, type Bookmark } from "@/lib/social"
import { useSession, type Question, type Submission } from "@/lib/store"
import { describeLiveTarget } from "@/lib/live/ids"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

const LIVE_KIND = { ghrepo: "GitHub repository", hfmodel: "Hugging Face model", hfdataset: "Hugging Face dataset", hfspace: "Hugging Face Space", paper: "Paper" } as const

export const SAVED_GROUPS = [
  { id: "model", label: "Models" },
  { id: "dataset", label: "Datasets" },
  { id: "tool", label: "Tools" },
  { id: "repo", label: "Repos" },
  { id: "thread", label: "Threads" },
  { id: "news", label: "News" },
  { id: "constellation", label: "Constellations" },
  { id: "person", label: "People" },
  { id: "live", label: "Repos, models and papers" },
] as const
type GroupId = (typeof SAVED_GROUPS)[number]["id"]

type Entry = { target: string; group: GroupId; label: string; node: React.ReactNode; wide?: boolean }

/** Turns bookmarks into renderable entries. Sample content resolves at once; members' content after a fetch. */
function useEntries(list: Bookmark[]) {
  const [threads, setThreads] = useState<Record<string, Question>>({})
  const [shares, setShares] = useState<Record<string, Submission>>({})
  const [pending, setPending] = useState(true)

  const threadIds = useMemo(() => list.map((b) => b.target).filter((t) => t.startsWith("thread:") && isQuestionId(t.slice(7))).map((t) => t.slice(7)), [list])
  const shareIds = useMemo(() => list.map((b) => b.target).filter((t) => t.startsWith("share:")).map((t) => t.slice(6)), [list])
  const threadKey = threadIds.join()
  const shareKey = shareIds.join()

  useEffect(() => {
    let stale = false
    const ids = threadKey ? threadKey.split(",") : []
    const sids = shareKey ? shareKey.split(",") : []
    Promise.all([getMemberThreads(ids), getSharedLinks(sids).catch(() => [] as Submission[])]).then(([qs, ss]) => {
      if (stale) return
      setThreads(Object.fromEntries(qs.map((q) => [q.id, q])))
      setShares(Object.fromEntries(ss.map((s) => [s.id, s])))
      setPending(false)
    })
    return () => {
      stale = true
    }
  }, [threadKey, shareKey])

  const entries = useMemo(() => {
    const out: Entry[] = []
    for (const { target } of list) {
      const i = target.indexOf(":")
      const type = target.slice(0, i)
      const id = target.slice(i + 1)
      if (type === "model" || type === "dataset" || type === "tool" || type === "repo") {
        const r = getResource(id)
        if (r) out.push({ target, group: type, label: `${r.owner}/${r.name} ${r.summary}`, node: <ResourceCard r={r} /> })
      } else if (type === "thread") {
        const t = getThread(id)
        if (t) out.push({ target, group: "thread", label: `${t.title} ${threadTitle(t)}`, node: <ThreadRow t={t} /> })
        else if (threads[id]) out.push({ target, group: "thread", label: threads[id].title, node: <MemberThreadRow q={threads[id]} /> })
      } else if (type === "news") {
        const n = getNews(id)
        if (n) out.push({ target, group: "news", label: `${n.title} ${n.summary}`, node: <NewsCard n={n} /> })
      } else if (type === "constellation") {
        const c = getConstellation(id)
        if (c) out.push({ target, group: "constellation", label: `${c.name} ${c.goal}`, node: <ConstellationCard c={c} className="h-full" />, wide: true })
      } else if (type === "person") {
        const p = getPerson(id)
        if (p) out.push({ target, group: "person", label: `${p.name} ${p.handle} ${p.role}`, node: <PersonCard handle={p.handle} /> })
      } else if (type === "share" && shares[id]) {
        const s = shares[id]
        const group: GroupId = s.kind === "news" ? "news" : s.kind
        out.push({ target, group, label: `${s.title} ${s.summary}`, node: <SharedLinkRow s={s} /> })
      } else {
        const item = describeLiveTarget(target)
        if (item)
          out.push({
            target,
            group: "live",
            label: item.label,
            node: (
              <Link href={item.href} className="flex flex-col gap-0.5 rounded-xl border border-border bg-card/70 p-4 transition-colors hover:bg-card">
                <span className="text-xs text-muted-foreground">{LIVE_KIND[item.type]}</span>
                <span className="truncate font-medium">{item.label}</span>
              </Link>
            ),
          })
      }
    }
    return out
  }, [list, threads, shares])

  return { entries, pending: pending && (threadIds.length > 0 || shareIds.length > 0) }
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
            const grid = g.id === "constellation" || g.id === "person"
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

function MemberThreadRow({ q }: { q: Question }) {
  return (
    <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card">
      <span lang={q.lang} className="font-medium">
        {q.title}
      </span>
      <span className="text-xs text-muted-foreground">
        {getCategory(q.orbit)?.name ?? q.orbit} · {q.author?.name ?? "A member"} · {ago(q.createdAt)} · {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
      </span>
    </Link>
  )
}

function SharedLinkRow({ s }: { s: Submission }) {
  let host = ""
  try {
    host = new URL(s.url).hostname
  } catch {}
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card"
    >
      <span className="flex items-center gap-1.5 font-medium">
        {s.title} <ExternalLinkIcon aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="sr-only">(opens in a new tab)</span>
      </span>
      {s.summary && <span className="line-clamp-1 text-sm text-muted-foreground">{s.summary}</span>}
      <span className="text-xs text-muted-foreground">
        Shared by {s.author?.name ?? "a member"} · {ago(s.createdAt)} · {host}
      </span>
    </a>
  )
}
