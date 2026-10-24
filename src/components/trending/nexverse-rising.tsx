"use client"

import Link from "next/link"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, EyeIcon, HeartIcon, MessageSquareIcon, PlusIcon, SparklesIcon, StarIcon } from "lucide-react"
import { Cover, KIND_ICONS, PersonAvatar } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkline } from "@/components/trending/sparkline"
import { Segmented } from "@/components/trending/segmented"
import { compact, KINDS, type ResourceKind } from "@/lib/data"
import { listRising, type RisingItem, type RisingKind, type RisingList } from "@/lib/live/nexverse"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const WINDOWS = [
  { value: "1", label: "24 hours" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
] as const
type Win = (typeof WINDOWS)[number]["value"]

const FILTERS: { value: "all" | RisingKind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "model", label: "Models" },
  { value: "dataset", label: "Datasets" },
  { value: "tool", label: "Tools" },
  { value: "repo", label: "Repos" },
  { value: "thread", label: "Threads" },
  { value: "code", label: "Code" },
]

const TYPE_LABEL: Record<RisingItem["itemType"], string> = { project: "Project", share: "Shared link", thread: "Forum thread", code: "Code repository" }
const TONE: Partial<Record<RisingKind, string>> = { model: "var(--color-model)", dataset: "var(--color-dataset)", tool: "var(--color-tool)", repo: "var(--color-repo)", thread: "var(--color-ion)", code: "var(--color-repo)" }

const isResource = (k: RisingKind): k is ResourceKind => k in KINDS
const EASE = [0.23, 1, 0.32, 1] as const

/** Real numbers only: the ones that are above zero, most telling first. */
function Metrics({ i, className }: { i: RisingItem; className?: string }) {
  const list = [
    { icon: EyeIcon, v: i.views, label: "views" },
    { icon: HeartIcon, v: i.likes, label: "likes" },
    { icon: MessageSquareIcon, v: i.replies, label: "replies" },
    { icon: DownloadIcon, v: i.downloads, label: "downloads" },
    { icon: StarIcon, v: i.stars, label: "stars" },
  ].filter((m) => m.v > 0)
  if (!list.length) return null
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground", className)}>
      {list.map((m) => (
        <span key={m.label} className="inline-flex items-center gap-1 tabular" title={`${m.v} ${m.label}`}>
          <m.icon aria-hidden className="size-3" />
          {compact(m.v)}
          <span className="sr-only"> {m.label}</span>
        </span>
      ))}
    </span>
  )
}

function Delta({ was, now }: { was: number | undefined | null; now: number }) {
  if (was === undefined) return null
  if (was === null) return <span className="rounded-full bg-gold/15 px-1.5 text-[10px] font-medium text-gold">new</span>
  const d = was - now
  if (!d) return null
  const Up = d > 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <motion.span initial={{ opacity: 0, y: d > 0 ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium tabular", d > 0 ? "text-emerald-300" : "text-muted-foreground")}>
      <Up aria-hidden className="size-2.5" />
      {Math.abs(d)}
      <span className="sr-only">{d > 0 ? "places up" : "places down"}</span>
    </motion.span>
  )
}

function Thumb({ i, className }: { i: RisingItem; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden ring-1 ring-white/10", className)}>
      {i.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.cover} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06] motion-reduce:transform-none" />
      ) : (
        <Cover seed={i.id} kind={isResource(i.kind) ? i.kind : "thread"} className="transition-transform duration-500 ease-out group-hover:scale-[1.06] motion-reduce:transform-none" />
      )}
    </div>
  )
}

function KindLine({ i }: { i: RisingItem }) {
  const Icon = isResource(i.kind) ? KIND_ICONS[i.kind] : null
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: TONE[i.kind] }}>
      {Icon && <Icon aria-hidden className="size-3" />}
      {isResource(i.kind) ? KINDS[i.kind].label : TYPE_LABEL[i.itemType]}
    </span>
  )
}

/** One of the top three: a cover, a big rank and the activity line. */
function Podium({ i, rank, was }: { i: RisingItem; rank: number; was?: number | null }) {
  return (
    <Spotlight className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card">
      {/* The scrims belong to the cover itself, so the fade always ends exactly where the picture does, and the
          rank stays legible on a white logo as much as on a dark render. */}
      <div className="relative">
        <Thumb i={i} className="aspect-[16/8] w-full" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/55 to-transparent" />
        {/* --card is translucent, so the fade lands on the page ground first and the card's own tint over it:
            the same two layers the card body below is made of, so there is no seam where the picture ends. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklab,var(--card)_70%,transparent)),linear-gradient(to_bottom,transparent_10%,var(--background))]" />
        <span aria-hidden className="absolute top-3 left-3 font-mono text-4xl leading-none font-semibold text-white/90 drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)] tabular">{rank}</span>
      </div>
      <div className="relative -mt-6 flex flex-1 flex-col gap-1.5 p-4 pt-0">
        <span className="flex items-center gap-2">
          <KindLine i={i} />
          <Delta was={was} now={rank} />
        </span>
        <Link data-nav-link href={i.href as `/p/${string}`} className="line-clamp-2 text-[15px] leading-snug font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
          <span className="sr-only">Number {rank}: </span>
          {i.title}
        </Link>
        {i.summary && <p className="line-clamp-2 text-[13px] text-muted-foreground">{i.summary}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            {i.owner && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <PersonAvatar handle={i.ownerHandle ?? i.owner} name={i.owner} size={16} />
                <span className="truncate">{i.owner}</span>
              </span>
            )}
            <Metrics i={i} />
          </div>
          <Sparkline values={i.spark} tone={TONE[i.kind]} />
        </div>
      </div>
    </Spotlight>
  )
}

function Row({ i, rank, was }: { i: RisingItem; rank: number; was?: number | null }) {
  return (
    <Spotlight className="group relative flex items-center gap-3 rounded-xl border border-border bg-card/50 p-2.5 pr-3 transition-colors hover:bg-card">
      <span className="flex w-7 shrink-0 flex-col items-center gap-0.5">
        <span className="font-mono text-sm text-muted-foreground tabular">{rank}</span>
        <Delta was={was} now={rank} />
      </span>
      <Thumb i={i} className="size-11 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link data-nav-link href={i.href as `/p/${string}`} className="truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {i.title}
        </Link>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <KindLine i={i} />
          <Metrics i={i} />
        </span>
      </div>
      <Sparkline values={i.spark} tone={TONE[i.kind]} className="hidden w-20 min-[420px]:block" />
    </Spotlight>
  )
}

/**
 * Rising in Nexverse: the projects, threads, links and code gaining attention on the site, ranked by real
 * activity over the chosen window. Switching the window or the filter re-ranks in place, with each item gliding
 * to its new place and an arrow for how far it moved.
 */
export function NexverseRising({ initialKind = "all", compactView = false, limit = 12 }: { initialKind?: "all" | RisingKind; compactView?: boolean; limit?: number }) {
  const { ready, user } = useSession()
  const reduce = useReducedMotion()
  const [win, setWin] = useState<Win>("7")
  const [kind, setKind] = useState<"all" | RisingKind>(initialKind)
  const [data, setData] = useState<RisingList | null>(null)
  // What the shown list was loaded for: while it differs from the controls, the list is refreshing.
  const [loadedFor, setLoadedFor] = useState("")
  const want = `${win}|${kind}`
  const busy = data !== null && loadedFor !== want
  const prev = useRef<Map<string, number> | null>(null)
  const [was, setWas] = useState<Map<string, number> | null>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    const key = `${win}|${kind}`
    listRising({ days: Number(win), kind: kind === "all" ? undefined : kind, limit })
      .then((d) => {
        if (stale) return
        setWas(prev.current)
        prev.current = new Map(d.items.map((x, n) => [x.target, n + 1]))
        setData(d)
        setLoadedFor(key)
      })
      .catch(() => {
        if (stale) return
        setData({ items: [], available: true })
        setLoadedFor(key)
      })
    return () => {
      stale = true
    }
  }, [win, kind, limit, ready, user?.id])

  const items = useMemo(() => data?.items ?? [], [data])
  const top = compactView ? [] : items.slice(0, 3)
  const rest = compactView ? items : items.slice(3)
  const before = (t: string) => (was ? (was.get(t) ?? null) : undefined)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Time window" value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
        {initialKind === "all" && (
          <div className="-mx-[var(--gutter)] flex gap-1.5 overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] sm:mx-0 sm:px-0">
            <Segmented label="Show" size="sm" value={kind} onChange={setKind} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
          </div>
        )}
      </div>

      {!data ? (
        <div aria-busy="true" aria-label="Loading" className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : !data.available ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Rising in Nexverse appears once the site’s database has the latest update.</p>
      ) : items.length === 0 ? (
        <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <SparklesIcon aria-hidden className="size-5 text-ion" />
          <p className="max-w-prose">
            Nothing has gathered views, likes or replies {win === "1" ? "in the last 24 hours" : `in the last ${win} days`}
            {kind !== "all" ? " in this part of the hub" : ""} yet. Whatever gets attention next lands here first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} size="sm" render={<Link href="/new/project" />}>
              <PlusIcon aria-hidden /> Publish a project
            </Button>
            <Button nativeButton={false} size="sm" variant="secondary" render={<Link href="/forum/new" />}>
              Start a thread
            </Button>
          </div>
        </div>
      ) : (
        <LayoutGroup>
          <div className={cn("flex flex-col gap-3 transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy}>
            {top.length > 0 && (
              <ol className="grid gap-3 md:grid-cols-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {top.map((i, n) => (
                    <motion.li key={i.target} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease: EASE }}>
                      <Podium i={i} rank={n + 1} was={before(i.target)} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            )}
            {rest.length > 0 && (
              <ol className="grid gap-2 lg:grid-cols-2" start={top.length + 1}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {rest.map((i, n) => (
                    <motion.li key={i.target} layout={!reduce} initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : Math.min(n, 8) * 0.025 }}>
                      <Row i={i} rank={top.length + n + 1} was={before(i.target)} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            )}
          </div>
        </LayoutGroup>
      )}
    </div>
  )
}
