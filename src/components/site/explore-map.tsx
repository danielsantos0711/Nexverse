"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useMemo, useState } from "react"
import { ArrowRightIcon, CommandIcon, PlusIcon, SearchIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { GlassKeys } from "@/components/glass/glass-keys"
import { GlowCard } from "@/components/hub/glow-card"
import { useOpenCommandMenu } from "@/components/site/command-menu"
import { openCreate } from "@/components/site/create-sheet"
import { iconFor } from "@/components/site/icons"
import { GO_KEYS } from "@/components/site/shortcuts"
import { useCopy } from "@/lib/content"
import { useMenus, type MenuGroup } from "@/lib/menus"
import { db } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * /explore?show=places: the map of the universe (restored in round 12b as Explore's third view, under the
 * compact page header). Each header group is a galaxy: a small orbit drawing (its places circle a
 * core, CSS transform only, still under reduced motion) next to every place in it with one line on what it is
 * for and a live count of what members made there (real counts, read under the visitor's own row rules; a
 * count that cannot be read is left out). A filter box narrows the whole map as you type; Enter opens ⌘K with
 * the same words. Below it a ticker of the newest real things (HorizonX Motion Ticker, as a CSS marquee), and
 * the shortcuts that move around the site. Same drawing, same counts and same filter on phones and desktop.
 */

const TINT: Record<string, string> = { ion: "text-ion", gold: "text-gold", model: "text-model", dataset: "text-dataset", tool: "text-tool", repo: "text-repo" }

type Counter = { table: string; filter?: [string, string][] }
// What a place's number counts. Rows the visitor may not read are not counted (row level security). Members and
// duels are left out: guests may not count those tables, and a number that changes with who looks is confusing.
const COUNTS: Record<string, Counter> = {
  "/code": { table: "code_repos" },
  "/models": { table: "projects", filter: [["kind", "model"], ["status", "published"]] },
  "/datasets": { table: "projects", filter: [["kind", "dataset"], ["status", "published"]] },
  "/tools": { table: "projects", filter: [["kind", "tool"], ["status", "published"]] },
  "/forum": { table: "questions" },
  "/news": { table: "news_stories", filter: [["status", "published"]] },
  "/collections": { table: "collections" },
  "/events": { table: "events" },
  "/missions": { table: "missions" },
  "/crews": { table: "crews" },
  "/launchpad": { table: "launches" },
  "/benchmarks": { table: "benchmark_results" },
  "/chat": { table: "rooms" },
  "/lab": { table: "lab_prompts" },
}
const NOUN: Record<string, [string, string]> = {
  "/code": ["project", "projects"],
  "/models": ["model", "models"],
  "/datasets": ["dataset", "datasets"],
  "/tools": ["tool", "tools"],
  "/forum": ["thread", "threads"],
  "/news": ["story", "stories"],
  "/collections": ["collection", "collections"],
  "/events": ["event", "events"],
  "/missions": ["mission", "missions"],
  "/crews": ["crew", "crews"],
  "/launchpad": ["launch", "launches"],
  "/people": ["member", "members"],
  "/arena": ["duel", "duels"],
  "/benchmarks": ["result", "results"],
  "/chat": ["room", "rooms"],
  "/lab": ["shared prompt", "shared prompts"],
}

let countsOnce: Promise<Record<string, number>> | null = null
function loadCounts(): Promise<Record<string, number>> {
  const c = db()
  if (!c) return Promise.resolve({})
  countsOnce ??= (async () => {
    const out: Record<string, number> = {}
    await Promise.all(
      Object.entries(COUNTS).map(async ([href, q]) => {
        let query = c.from(q.table).select("*", { count: "exact", head: true })
        for (const [col, val] of q.filter ?? []) query = query.eq(col, val)
        const { count, error } = await query
        if (!error && typeof count === "number") out[href] = count
      })
    )
    return out
  })()
  return countsOnce
}

type Fresh = { key: string; label: string; href: string; kind: string }
async function loadFresh(): Promise<Fresh[]> {
  const c = db()
  if (!c) return []
  const [threads, stories, projects, events] = await Promise.all([
    c.from("questions").select("id, title").order("created_at", { ascending: false }).limit(5),
    c.from("news_stories").select("slug, title").eq("status", "published").order("published_at", { ascending: false }).limit(5),
    c.from("projects").select("id, name, kind").eq("status", "published").eq("visibility", "public").order("created_at", { ascending: false }).limit(5),
    c.from("events").select("id, title").order("created_at", { ascending: false }).limit(3),
  ])
  const out: Fresh[] = []
  for (const t of threads.data ?? []) out.push({ key: `q${t.id}`, label: t.title, href: `/forum/${t.id}`, kind: "Thread" })
  for (const s of stories.data ?? []) out.push({ key: `n${s.slug}`, label: s.title, href: `/news/${s.slug}`, kind: "News" })
  for (const p of projects.data ?? []) out.push({ key: `p${p.id}`, label: p.name, href: `/p/${p.id}`, kind: p.kind })
  for (const e of events.data ?? []) out.push({ key: `e${e.id}`, label: e.title, href: `/events/${e.id}`, kind: "Event" })
  return out
}

export function ExplorePlaces() {
  const { header } = useMenus()
  const openSearch = useOpenCommandMenu()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [countsReady, setCountsReady] = useState(false)
  const [fresh, setFresh] = useState<Fresh[] | null>(null)
  const [q, setQ] = useState("")
  const [hot, setHot] = useState<string | null>(null)
  const placeholder = useCopy("explore.map.filter", "Filter the map: forum, datasets, events…")

  useEffect(() => {
    let on = true
    void loadCounts().then((c) => {
      if (!on) return
      setCounts(c)
      setCountsReady(true)
    })
    void loadFresh()
      .then((f) => on && setFresh(f))
      .catch(() => on && setFresh([]))
    return () => {
      on = false
    }
  }, [])

  const needle = q.trim().toLowerCase()
  const groups = useMemo(
    () =>
      header
        .map((g) => ({ ...g, links: needle ? g.links.filter((l) => `${l.label} ${l.description} ${g.label}`.toLowerCase().includes(needle)) : g.links }))
        .filter((g) => g.links.length > 0),
    [header, needle]
  )

  return (
    <div className="flex flex-col pb-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          openSearch()
        }}
        className="mb-6 flex w-full max-w-xl items-center gap-2"
      >
        <label className="liquid-glass-pill flex h-11 flex-1 items-center gap-2 px-4 focus-within:outline-2 focus-within:outline-ring">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only">Filter the map</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <GlassKeys keys={["mod", "K"]} className="hidden sm:inline-flex" />
        </label>
        <button type="button" onClick={openCreate} className="liquid-glass-pill inline-flex h-11 items-center gap-1.5 px-4 text-sm font-medium">
          <PlusIcon aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Create</span>
        </button>
      </form>

      {groups.length === 0 ? (
        <div className="nx-fade flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">No place on the map matches “{q}”. Search the whole site instead: threads, projects, people and news.</p>
          <button type="button" onClick={openSearch} className="liquid-glass-pill inline-flex h-9 items-center gap-1.5 px-4 text-sm">
            <CommandIcon aria-hidden className="size-4" /> Search everything
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g, gi) => (
            <Galaxy key={g.id} group={g} index={gi} counts={counts} loading={!countsReady} hot={hot} setHot={setHot} />
          ))}
        </div>
      )}

      <FreshTicker items={fresh} />

      <section aria-labelledby="keys-h" className="mt-12 flex flex-col gap-4">
        <h2 id="keys-h" className="text-lg font-semibold">
          <Copy k="explore.keys.title">Move with the keyboard</Copy>
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <KeyTile keys={["mod", "K"]} label="Search everything" />
          <KeyTile keys={["/"]} label="Search" />
          <KeyTile keys={["C"]} label="Create something" />
          {GO_KEYS.slice(0, 7).map((k) => (
            <KeyTile key={k.key} keys={["G", k.key.toUpperCase()]} label={k.label} href={k.href} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function KeyTile({ keys, label, href }: { keys: string[]; label: string; href?: string }) {
  const body = (
    <>
      <GlassKeys keys={keys} />
      <span className="text-sm text-muted-foreground group-hover:text-foreground">{label}</span>
    </>
  )
  return (
    <li>
      {href ? (
        <Link href={href as Route} className="group nx-lift flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
          {body}
        </Link>
      ) : (
        <div className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">{body}</div>
      )}
    </li>
  )
}

/** One galaxy: the orbit drawing beside its places. Pointing at a place lights its planet, and the reverse. */
function Galaxy({ group, index, counts, loading, hot, setHot }: { group: MenuGroup; index: number; counts: Record<string, number>; loading: boolean; hot: string | null; setHot: (h: string | null) => void }) {
  const total = group.links.reduce((n, l) => n + (counts[l.href.split(/[?#]/)[0]] ?? 0), 0)
  return (
    <section id={group.id} aria-labelledby={`g-${group.id}`} className="nx-enter scroll-mt-24" style={{ "--i": index * 2 } as React.CSSProperties}>
      {/* HorizonX Border Glow: a lamp in the card's rim follows the pointer */}
      <GlowCard className="rounded-3xl" reach={220}>
      <div className="grid gap-0 overflow-hidden rounded-3xl border border-border bg-card md:grid-cols-[17rem_1fr]">
        <div className="relative flex flex-col items-center gap-4 border-b border-border bg-white/[0.015] p-5 md:border-r md:border-b-0">
          <Orbit group={group} hot={hot} setHot={setHot} spin={index % 2 ? -1 : 1} />
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 id={`g-${group.id}`} className="text-xl font-semibold">
              {group.label}
            </h2>
            {group.blurb && <p className="text-sm text-muted-foreground">{group.blurb}</p>}
            {loading ? (
              <span role="status" className="hx-orbit text-muted-foreground" style={{ "--size": "1rem" } as React.CSSProperties}>
                <span className="sr-only">Counting…</span>
              </span>
            ) : (
              total > 0 && <p className="nx-fade text-xs text-muted-foreground tabular-nums">{total.toLocaleString("en")} {total === 1 ? "thing" : "things"} made here so far</p>
            )}
          </div>
        </div>
        <ul className="grid content-start gap-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
          {group.links.map((l, i) => {
            const Icon = iconFor(l.icon)
            const key = l.href.split(/[?#]/)[0]
            const n = counts[key]
            const noun = NOUN[key]
            return (
              <li key={`${l.href}-${i}`} className="nx-enter" style={{ "--i": i + index * 2 } as React.CSSProperties}>
                <Link
                  data-nav-item
                  href={l.href as Route}
                  onPointerEnter={() => setHot(l.href)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(l.href)}
                  onBlur={() => setHot(null)}
                  data-hot={hot === l.href ? "" : undefined}
                  className="group flex h-full items-start gap-3 rounded-2xl p-3 transition-colors duration-(--dur-fast) hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.99] data-[hot]:bg-white/[0.04]"
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] ring-1 ring-white/10 transition-transform duration-(--dur-base) ease-(--ease-out) group-hover:scale-110 group-hover:-rotate-6", TINT[l.accent] ?? "text-ion")}>
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{l.label}</span>
                      <ArrowRightIcon aria-hidden className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,transform] duration-(--dur-base) group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">{l.description}</span>
                    {n !== undefined && noun && (
                      <span className="nx-fade mt-1 text-[11px] text-muted-foreground/80 tabular-nums">
                        {n === 0 ? `No ${noun[1]} yet: be the first` : `${n.toLocaleString("en")} ${n === 1 ? noun[0] : noun[1]}`}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
      </GlowCard>
    </section>
  )
}

/**
 * The orbit drawing: a glowing core and the group's places as planets on two rings. Each ring turns slowly (a
 * CSS rotation); the planets turn the other way so their icons stay upright. Paused under reduced motion and
 * when the admins switch motion off.
 */
function Orbit({ group, hot, setHot, spin }: { group: MenuGroup; hot: string | null; setHot: (h: string | null) => void; spin: 1 | -1 }) {
  const inner = group.links.slice(0, 4)
  const outer = group.links.slice(4, 12)
  const ring = (links: typeof inner, radius: number, secs: number, dir: number) => (
    <div
      aria-hidden
      className="explore-ring absolute inset-0"
      style={{ "--secs": `${secs}s`, "--ring-dir": dir > 0 ? "normal" : "reverse", "--planet-dir": dir > 0 ? "reverse" : "normal" } as React.CSSProperties}
    >
      <span className="absolute top-1/2 left-1/2 rounded-full border border-white/[0.07]" style={{ width: radius * 2, height: radius * 2, marginLeft: -radius, marginTop: -radius }} />
      {links.map((l, i) => {
        const a = (i / links.length) * Math.PI * 2 + (dir > 0 ? 0 : 0.6)
        const Icon = iconFor(l.icon)
        const lit = hot === l.href
        return (
          <Link
            key={l.href}
            href={l.href as Route}
            tabIndex={-1}
            onPointerEnter={() => setHot(l.href)}
            onPointerLeave={() => setHot(null)}
            className="absolute top-1/2 left-1/2"
            style={{ transform: `translate(${Math.cos(a) * radius}px, ${Math.sin(a) * radius}px)` }}
          >
            <span
              className={cn(
                "explore-planet -mt-4 -ml-4 grid size-8 place-items-center rounded-full bg-raised ring-1 ring-white/10 transition-[transform,box-shadow] duration-(--dur-base) ease-(--ease-out)",
                TINT[l.accent] ?? "text-ion",
                lit && "scale-125 shadow-[0_0_16px_rgb(255_255_255/0.28)] ring-white/40"
              )}
            >
              <Icon className="size-3.5" />
            </span>
          </Link>
        )
      })}
    </div>
  )
  return (
    <div className="relative size-52 shrink-0">
      <span aria-hidden className="absolute top-1/2 left-1/2 -mt-6 -ml-6 size-12 rounded-full bg-[radial-gradient(circle,rgb(236_237_240/0.9),rgb(190_193_200/0.32)_45%,transparent_70%)] shadow-[0_0_36px_rgb(220_222_228/0.18)]" />
      {ring(inner, 52, 60, spin)}
      {outer.length > 0 && ring(outer, 92, 110, -spin)}
    </div>
  )
}

/** The newest real things on the site, sliding past (HorizonX Motion Ticker). Pauses on hover and focus. */
function FreshTicker({ items }: { items: Fresh[] | null }) {
  if (items === null) return <div className="nx-skeleton mt-10 h-12" aria-hidden />
  if (items.length === 0) return null
  const row = (dup: boolean) =>
    items.map((f) => (
      <Link
        key={`${dup ? "d" : ""}${f.key}`}
        href={f.href as Route}
        tabIndex={dup ? -1 : undefined}
        aria-hidden={dup || undefined}
        className="mx-1.5 inline-flex max-w-[22rem] shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-white/20"
      >
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{f.kind}</span>
        <span className="truncate">{f.label}</span>
      </Link>
    ))
  return (
    <section aria-labelledby="fresh-h" className="mt-12 flex flex-col gap-4">
      <h2 id="fresh-h" className="text-lg font-semibold">
        <Copy k="explore.fresh.title">Just arrived</Copy>
      </h2>
      <div className="fade-band-x overflow-hidden focus-within:[&>div]:[animation-play-state:paused]">
        <div className="marquee">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  )
}
