"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { Route } from "next"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { CheckIcon, ColumnsIcon, PlusIcon, SearchIcon, TrophyIcon, XIcon } from "lucide-react"
import { Cover, KindTag, LangTag } from "@/components/hub/bits"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { compact, formatDate, KINDS, type ResourceKind } from "@/lib/data"
import { fromProject, getProjects, isHubId, listHub, type HubEntry } from "@/lib/hub"
import { getProjectStats, type Project, type ProjectStats } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * Up to four member projects side by side. The picks (id, name and kind, so the tray can draw without a request)
 * live in this browser so the tray follows you around the site.
 */
const KEY = "nexverse-compare-projects"
const MAX = 4
type Pick = { id: string; name: string; kind: ResourceKind }
const listeners = new Set<() => void>()
let cache: { raw: string | null; value: Pick[] } = { raw: null, value: [] }

function read(): Pick[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {}
  if (raw === cache.raw) return cache.value
  let value: Pick[] = []
  try {
    value = (JSON.parse(raw ?? "[]") as unknown[])
      .filter((p): p is Pick => {
        const x = p as Partial<Pick> | null
        return Boolean(x && typeof x.id === "string" && isHubId(x.id) && typeof x.name === "string" && typeof x.kind === "string" && x.kind in KINDS)
      })
      .slice(0, MAX)
  } catch {}
  cache = { raw, value }
  return value
}

function write(next: Pick[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)))
  } catch {}
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

const EMPTY: Pick[] = []
export function useCompare() {
  const picks = useSyncExternalStore(subscribe, read, () => EMPTY)
  return {
    picks,
    has: (id: string) => picks.some((p) => p.id === id),
    toggle: (p: Pick) => write(picks.some((x) => x.id === p.id) ? picks.filter((x) => x.id !== p.id) : [...picks, p].slice(-MAX)),
    set: write,
    clear: () => write([]),
  }
}

/** "Compare" on a project page: adds it to the tray, or takes it out again. */
export function CompareButton({ project }: { project: Pick }) {
  const { has, toggle } = useCompare()
  const on = has(project.id)
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle({ id: project.id, name: project.name, kind: project.kind })}
      className={cn(
        "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        on ? "border-ion/50 bg-ion/15 text-foreground" : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={on ? "on" : "off"}
          initial={{ opacity: 0, transform: "scale(0.6) rotate(-30deg)" }}
          animate={{ opacity: 1, transform: "scale(1) rotate(0deg)" }}
          exit={{ opacity: 0, transform: "scale(0.6)" }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.4 }}
          className="inline-flex"
        >
          {on ? <CheckIcon aria-hidden className="size-4 text-ion" /> : <ColumnsIcon aria-hidden className="size-4" />}
        </motion.span>
      </AnimatePresence>
      {on ? "In compare" : "Compare"}
    </button>
  )
}

/** The floating tray: appears once something is picked, on every page except the comparison itself. */
export function CompareTray() {
  const { picks, toggle, clear } = useCompare()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const show = picks.length > 0 && pathname !== "/compare"
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="region"
          aria-label="Compare tray"
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translate(-50%, 120%)" }}
          animate={{ opacity: 1, transform: "translate(-50%, 0%)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translate(-50%, 120%)" }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-9rem)] items-center gap-2 liquid-glass-strong lg:bottom-4 lg:max-w-[calc(100vw-2rem)] rounded-full p-1.5 pl-3"
        >
          <ul className="flex items-center -space-x-2">
            <AnimatePresence initial={false}>
              {picks.map((r) => {
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, transform: "scale(0.5)" }}
                    animate={{ opacity: 1, transform: "scale(1)" }}
                    exit={{ opacity: 0, transform: "scale(0.5)" }}
                    className="relative"
                  >
                    <button type="button" onClick={() => toggle(r)} title={`Remove ${r.name}`} className="group block size-8 overflow-hidden rounded-full ring-2 ring-popover focus-visible:ring-ring focus-visible:outline-none">
                      <Cover seed={r.id} kind={r.kind} />
                      <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                        <XIcon aria-hidden className="size-3.5" />
                      </span>
                      <span className="sr-only">Remove {r.name}</span>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {picks.length} of {MAX}
          </span>
          <button type="button" onClick={clear} className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Clear
          </button>
          <Link href={`/compare?i=${picks.map((p) => p.id).join(",")}` as Route} className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            <ColumnsIcon aria-hidden className="size-4" /> Compare
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

type Row = { e: HubEntry; p: Project; s: ProjectStats }
type Metric = { label: string; get: (r: Row) => number; fmt: (n: number) => string }
const METRICS: Metric[] = [
  { label: "Likes", get: (r) => r.s.likes, fmt: (n) => compact(n) },
  { label: "Saves", get: (r) => r.s.saves, fmt: (n) => compact(n) },
  { label: "Replies", get: (r) => r.s.replies, fmt: (n) => compact(n) },
  { label: "Versions", get: (r) => r.p.versions.length, fmt: (n) => String(n) },
]

/** The comparison page itself: picks come from the URL (shareable) or the tray, then read across. */
export function CompareView() {
  const params = useSearchParams()
  const router = useRouter()
  const tray = useCompare()
  const fromUrl = (params.get("i") ?? "").split(",").filter(isHubId)
  const ids = (fromUrl.length ? fromUrl : tray.picks.map((p) => p.id)).slice(0, MAX)
  const idsKey = ids.join(",")
  const reduce = useReducedMotion()
  const [q, setQ] = useState("")
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[]; error: string } | null>(null)
  const [pool, setPool] = useState<HubEntry[] | null>(null)

  useEffect(() => {
    let stale = false
    const list = idsKey ? idsKey.split(",") : []
    if (!list.length) return
    getProjects(list)
      .then(async (projects) => {
        const stats = await getProjectStats(projects.map((p) => p.id)).catch(() => ({}) as Record<string, ProjectStats>)
        const byId = new Map(projects.map((p) => [p.id, p]))
        const rows = list.flatMap((id) => {
          const p = byId.get(id)
          return p ? [{ e: fromProject(p), p, s: stats[id] ?? { likes: 0, saves: 0, replies: 0 } }] : []
        })
        if (!stale) setLoaded({ key: list.join(","), rows, error: "" })
      })
      .catch((e: Error) => !stale && setLoaded({ key: list.join(","), rows: [], error: e.message }))
    return () => {
      stale = true
    }
  }, [idsKey])

  useEffect(() => {
    let stale = false
    listHub({ limit: 200 })
      .then((h) => !stale && setPool(h.entries.filter((e) => e.source === "project")))
      .catch(() => !stale && setPool([]))
    return () => {
      stale = true
    }
  }, [])

  const ready = !idsKey || loaded?.key === idsKey
  const items = useMemo(() => (idsKey && loaded?.key === idsKey ? loaded.rows : []), [idsKey, loaded])
  const missing = ready && idsKey ? ids.length - items.length : 0

  const set = (next: Pick[]) => {
    router.replace((next.length ? `/compare?i=${next.map((p) => p.id).join(",")}` : "/compare") as Route, { scroll: false })
    // Keep the tray in step with what is on screen.
    tray.set(next)
  }
  const current = (): Pick[] => items.map((r) => ({ id: r.e.id, name: r.e.name, kind: r.e.kind }))

  const suggestions = useMemo(() => {
    if (!pool) return []
    const kind = items[0]?.e.kind
    const words = fold(q).split(/\s+/).filter(Boolean)
    return pool
      .filter((e) => !ids.includes(e.id) && (!kind || e.kind === kind || q))
      .filter((e) => words.every((w) => fold(`${e.owner?.name ?? ""} ${e.name} ${e.tags.join(" ")}`).includes(w)))
      .slice(0, 6)
  }, [q, pool, ids, items])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <label className="glass flex h-11 max-w-xl items-center gap-2.5 rounded-xl px-3.5 focus-within:border-ion/50 focus-within:ring-2 focus-within:ring-ring/40">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only">Find a project to compare</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder={ids.length >= MAX ? "Four is the limit. Remove one to add another." : "Find a member project by name, maker or tag"}
            disabled={ids.length >= MAX || pool?.length === 0}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
          />
        </label>
        {ids.length < MAX && suggestions.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Suggestions">
            {suggestions.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    set([...current(), { id: e.id, name: e.name, kind: e.kind }])
                    setQ("")
                  }}
                  className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 py-1 pr-3 pl-1 text-sm text-muted-foreground hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="size-6 overflow-hidden rounded-full">
                    <Cover seed={e.id} kind={e.kind} />
                  </span>
                  <PlusIcon aria-hidden className="size-3.5" />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && pool && suggestions.length === 0 && <p className="text-sm text-muted-foreground">No project matches “{q}”.</p>}
      </div>

      {loaded?.error && idsKey === loaded.key ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          These projects could not be loaded: {loaded.error}
        </p>
      ) : !ready ? (
        <div aria-busy="true" aria-label="Loading projects" className="h-64 animate-pulse rounded-2xl bg-white/[0.03]" />
      ) : items.length === 0 ? (
        <Empty className="rounded-2xl border border-dashed border-border py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ColumnsIcon />
            </EmptyMedia>
            <EmptyTitle>{missing ? "Those projects are not available" : "Nothing picked yet"}</EmptyTitle>
            <EmptyDescription>
              {pool?.length === 0
                ? "Nobody has published a project yet, so there is nothing to compare. Publish the first one."
                : missing
                  ? "They may have been unpublished or deleted. Pick others above."
                  : "Find two or more projects above, or press Compare on any project page."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} variant="secondary" render={<Link href={pool?.length === 0 ? "/new/project" : "/models"} />}>
              {pool?.length === 0 ? "Publish a project" : "Browse the hub"}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Projects side by side</caption>
            <thead>
              <tr>
                <th scope="col" className="w-40 bg-card/40 p-4 text-left font-normal text-muted-foreground">
                  <span className="sr-only">Attribute</span>
                </th>
                <AnimatePresence initial={false}>
                  {items.map(({ e }) => (
                    <motion.th
                      key={e.id}
                      scope="col"
                      layout
                      initial={reduce ? false : { opacity: 0, transform: "translateY(-10px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      exit={{ opacity: 0 }}
                      className="border-l border-border bg-card/40 p-4 text-left align-top font-normal"
                    >
                      <div className="flex items-start gap-3">
                        <span className="size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                          <Cover seed={e.id} kind={e.kind} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <Link href={e.href as Route} className="truncate font-medium hover:underline">
                            {e.name}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">{e.owner?.name ?? "A member"}</span>
                          <KindTag kind={e.kind} />
                        </span>
                        <button
                          type="button"
                          onClick={() => set(current().filter((x) => x.id !== e.id))}
                          className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <XIcon aria-hidden className="size-4" />
                          <span className="sr-only">Remove {e.name}</span>
                        </button>
                      </div>
                    </motion.th>
                  ))}
                </AnimatePresence>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const values = items.map(m.get)
                const top = Math.max(...values)
                return (
                  <tr key={m.label} className="border-t border-border">
                    <th scope="row" className="p-4 text-left font-normal text-muted-foreground">
                      {m.label}
                    </th>
                    {items.map((r, i) => {
                      const v = values[i]
                      const win = items.length > 1 && top > 0 && v === top
                      const share = top ? v / top : 0
                      return (
                        <td key={r.e.id} className="border-l border-border p-4 align-top">
                          <div className="flex items-center gap-1.5 tabular">
                            {m.fmt(v)}
                            {win && <TrophyIcon aria-label="Highest" className="size-3.5 text-gold" />}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <motion.div
                              className={cn("h-full origin-left rounded-full", win ? "bg-gradient-to-r from-ion to-gold" : "bg-white/25")}
                              initial={reduce ? false : { transform: "scaleX(0)" }}
                              animate={{ transform: `scaleX(${share})` }}
                              transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: i * 0.08 }}
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {(
                [
                  ["Published", (r: Row) => (r.p.publishedAt ? formatDate(r.p.publishedAt) : "Not published")],
                  ["Latest version", (r: Row) => (r.p.versions[0] ? <span className="font-mono">{r.p.versions[0].version}</span> : "None yet")],
                  ["Licence", (r: Row) => r.e.license ?? "Not stated"],
                  [
                    "Languages",
                    (r: Row) =>
                      r.e.langs.length ? (
                        <span className="flex flex-wrap gap-1">
                          {r.e.langs.map((l) => (
                            <LangTag key={l} lang={l} />
                          ))}
                        </span>
                      ) : (
                        "Not stated"
                      ),
                  ],
                  ["Tags", (r: Row) => (r.e.tags.length ? r.e.tags.map((t) => `#${t}`).join("  ") : "None")],
                  ["Summary", (r: Row) => <span className="text-muted-foreground">{r.e.summary}</span>],
                ] as const
              ).map(([label, get]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="p-4 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  {items.map((r) => (
                    <td key={r.e.id} className="border-l border-border p-4 align-top">
                      {get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing > 0 ? `${missing} of your picks is no longer published. ` : ""}Kinds can be mixed, but {KINDS[items[0].e.kind].plural.toLowerCase()} compare best with each other. The link to this page keeps your picks.
        </p>
      )}
    </div>
  )
}
