"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { CheckIcon, ColumnsIcon, PlusIcon, SearchIcon, TrophyIcon, XIcon } from "lucide-react"
import { Cover, KindTag, LangTag } from "@/components/hub/bits"
import { ago, compact, getResource, KINDS, resourcePath, resources, type Resource } from "@/lib/data"
import { cn } from "@/lib/utils"

/** Up to four things side by side. The picks live in this browser so the tray follows you around the site. */
const KEY = "nexverse-compare"
const MAX = 4
const listeners = new Set<() => void>()
let cache: { raw: string | null; value: string[] } = { raw: null, value: [] }

function read(): string[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {}
  if (raw === cache.raw) return cache.value
  let value: string[] = []
  try {
    value = (JSON.parse(raw ?? "[]") as unknown[]).filter((s): s is string => typeof s === "string" && Boolean(getResource(s))).slice(0, MAX)
  } catch {}
  cache = { raw, value }
  return value
}

function write(next: string[]) {
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

const EMPTY: string[] = []
export function useCompare() {
  const picks = useSyncExternalStore(subscribe, read, () => EMPTY)
  return {
    picks,
    has: (slug: string) => picks.includes(slug),
    toggle: (slug: string) => write(picks.includes(slug) ? picks.filter((s) => s !== slug) : [...picks, slug].slice(-MAX)),
    clear: () => write([]),
  }
}

export function CompareButton({ slug }: { slug: string }) {
  const { has, toggle } = useCompare()
  const on = has(slug)
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(slug)}
      className={cn(
        "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
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
          className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-white/10 bg-popover/90 p-1.5 pl-3 shadow-[0_20px_60px_-15px_rgb(0_0_0/0.8)] backdrop-blur-xl"
        >
          <ul className="flex items-center -space-x-2">
            <AnimatePresence initial={false}>
              {picks.map((slug) => {
                const r = getResource(slug)!
                return (
                  <motion.li
                    key={slug}
                    layout
                    initial={{ opacity: 0, transform: "scale(0.5)" }}
                    animate={{ opacity: 1, transform: "scale(1)" }}
                    exit={{ opacity: 0, transform: "scale(0.5)" }}
                    className="relative"
                  >
                    <button type="button" onClick={() => toggle(slug)} title={`Remove ${r.name}`} className="group block size-8 overflow-hidden rounded-full ring-2 ring-popover">
                      <Cover seed={r.slug} kind={r.kind} />
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
          <button type="button" onClick={clear} className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
          <Link href={`/compare?i=${picks.join(",")}`} className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            <ColumnsIcon aria-hidden className="size-4" /> Compare
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type Metric = { label: string; get: (r: Resource) => number; fmt: (n: number) => string; best: "max" }
const METRICS: Metric[] = [
  { label: "Likes", get: (r) => r.likes, fmt: compact, best: "max" },
  { label: "Reach", get: (r) => r.reach, fmt: compact, best: "max" },
  { label: "Freshness", get: (r) => Date.parse(r.updated), fmt: (n) => ago(new Date(n).toISOString()), best: "max" },
]

/** The comparison page itself: pick from the URL (shareable) or the tray, then read across. */
export function CompareView() {
  const params = useSearchParams()
  const router = useRouter()
  const tray = useCompare()
  const fromUrl = (params.get("i") ?? "").split(",").filter((s) => getResource(s))
  const picks = (fromUrl.length ? fromUrl : tray.picks).slice(0, MAX)
  const items = picks.map((s) => getResource(s)!)
  const reduce = useReducedMotion()
  const [q, setQ] = useState("")

  const set = (next: string[]) => {
    router.replace(next.length ? `/compare?i=${next.join(",")}` : "/compare", { scroll: false })
    // keep the tray in step with what is on screen
    tray.clear()
    next.forEach((s) => tray.toggle(s))
  }

  const suggestions = useMemo(() => {
    const kind = items[0]?.kind
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return resources
      .filter((r) => !picks.includes(r.slug) && (!kind || r.kind === kind || q))
      .filter((r) => words.every((w) => `${r.owner} ${r.name} ${r.task}`.toLowerCase().includes(w)))
      .slice(0, 6)
  }, [q, picks, items])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <label className="glass flex h-11 max-w-xl items-center gap-2.5 rounded-xl px-3.5 focus-within:border-ion/50">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only">Add something to compare</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={picks.length >= MAX ? "Four is the limit, remove one to add another" : "Add a model, dataset, tool or repo…"}
            disabled={picks.length >= MAX}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
          />
        </label>
        {picks.length < MAX && (
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => {
                    set([...picks, r.slug])
                    setQ("")
                  }}
                  className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 py-1 pr-3 pl-1 text-sm text-muted-foreground hover:border-white/20 hover:text-foreground"
                >
                  <span className="size-6 overflow-hidden rounded-full">
                    <Cover seed={r.slug} kind={r.kind} />
                  </span>
                  <PlusIcon aria-hidden className="size-3.5" />
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Nothing picked yet. Add two or more above, or press Compare on any model, dataset, tool or repo.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-40 bg-card/40 p-4 text-left font-normal text-muted-foreground">
                  <span className="sr-only">Attribute</span>
                </th>
                <AnimatePresence initial={false}>
                  {items.map((r) => (
                    <motion.th
                      key={r.slug}
                      scope="col"
                      layout
                      initial={reduce ? false : { opacity: 0, transform: "translateY(-10px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      exit={{ opacity: 0 }}
                      className="border-l border-border bg-card/40 p-4 text-left align-top font-normal"
                    >
                      <div className="flex items-start gap-3">
                        <span className="size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                          <Cover seed={r.slug} kind={r.kind} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <Link href={resourcePath(r)} className="truncate font-medium hover:underline">
                            {r.name}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">{r.owner}</span>
                          <KindTag kind={r.kind} />
                        </span>
                        <button type="button" onClick={() => set(picks.filter((s) => s !== r.slug))} className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground">
                          <XIcon aria-hidden className="size-4" />
                          <span className="sr-only">Remove {r.name}</span>
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
                      const win = items.length > 1 && v === top
                      const share = m.label === "Freshness" ? 1 : top ? v / top : 0
                      return (
                        <td key={r.slug} className="border-l border-border p-4 align-top">
                          <div className="flex items-center gap-1.5 tabular">
                            {m.fmt(v)}
                            {win && <TrophyIcon aria-label="Highest" className="size-3.5 text-gold" />}
                          </div>
                          {m.label !== "Freshness" && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <motion.div
                                className={cn("h-full origin-left rounded-full", win ? "bg-gradient-to-r from-ion to-gold" : "bg-white/25")}
                                initial={reduce ? false : { transform: "scaleX(0)" }}
                                animate={{ transform: `scaleX(${share})` }}
                                transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: i * 0.08 }}
                              />
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {(
                [
                  ["Task", (r: Resource) => r.task],
                  ["Spec", (r: Resource) => <span className="font-mono">{r.spec}</span>],
                  ["Licence", (r: Resource) => r.license],
                  [
                    "Languages",
                    (r: Resource) => (
                      <span className="flex flex-wrap gap-1">
                        {r.langs.map((l) => (
                          <LangTag key={l} lang={l} />
                        ))}
                      </span>
                    ),
                  ],
                  ["Tags", (r: Resource) => r.tags.map((t) => `#${t}`).join("  ")],
                  ["Summary", (r: Resource) => <span className="text-muted-foreground">{r.summary}</span>],
                ] as const
              ).map(([label, get]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="p-4 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  {items.map((r) => (
                    <td key={r.slug} className="border-l border-border p-4 align-top">
                      {get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > 0 && <p className="text-xs text-muted-foreground">Kinds can be mixed. {KINDS[items[0].kind].plural} compare best with each other. The link to this page keeps your picks.</p>}
    </div>
  )
}
