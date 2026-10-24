"use client"

import { useRouter, useSearchParams } from "next/navigation"
import type { Route } from "next"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ListIcon, LocateFixedIcon, MapIcon, MinusIcon, OrbitIcon, PlusIcon, SearchIcon, ShrinkIcon, XIcon } from "lucide-react"
import { CosmosList } from "@/components/cosmos/cosmos-list"
import { CosmosEngine } from "@/components/cosmos/engine"
import { buildCosmos, FILTER_KINDS, FOCUS, searchStars, STAR_KINDS, type Star, type StarKind } from "@/components/cosmos/model"
import Nebula from "@/components/cosmos/nebula"
import { StarCard } from "@/components/cosmos/star-card"
import { listPublicCollections, type Collection } from "@/lib/community"
import { listHub, type HubEntry } from "@/lib/hub"
import type { GhRepo } from "@/lib/live"
import { listMembers, type PublicMember } from "@/lib/people"
import type { ProjectStats } from "@/lib/projects"
import { useBookmarks } from "@/lib/social"
import { useSession } from "@/lib/store"
import { db, live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const ALL_KINDS = new Set<StarKind>(FILTER_KINDS)

/** Targets you liked: from the database when signed in, from this browser otherwise. */
async function myLikes(userId: string | null): Promise<string[]> {
  const client = db()
  if (!client) {
    try {
      const v = JSON.parse(localStorage.getItem("nexverse-likes") ?? "[]")
      return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []
    } catch {
      return []
    }
  }
  if (!userId) return []
  const { data, error } = await client.from("likes").select("target").eq("user_id", userId).limit(500)
  if (error) throw new Error(error.message)
  return (data as { target: string }[]).map((l) => l.target)
}

const iconButton =
  "pressable grid size-10 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"

type Loaded = { entries: HubEntry[]; stats: Record<string, ProjectStats>; members: PublicMember[]; collections: Collection[]; failed: string[] }

/**
 * The Cosmos page: the star map, its controls and the list fallback. The canvas work lives in CosmosEngine; this
 * component owns the state (filters, selection, search, "Where am I") and the overlays that follow the camera.
 */
export function CosmosView({ github = [], embedded = false }: { github?: GhRepo[]; /** Inside Explore (round 12): Explore's header names the page and its List tab is the list. */ embedded?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [initialFocus] = useState(() => {
    const f = params.get("focus")
    return f && FOCUS.test(f) ? f : null
  })
  const { ready, user, member } = useSession()
  const bookmarks = useBookmarks()

  const [projects, setProjects] = useState<Loaded | null>(null)
  const [likes, setLikes] = useState<string[]>([])
  const [kinds, setKinds] = useState<Set<StarKind>>(ALL_KINDS)
  const [selected, setSelected] = useState<string | null>(initialFocus)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [youMode, setYouMode] = useState(false)
  const [view, setView] = useState<"map" | "list">("map")
  const [query, setQuery] = useState("")
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [missingDismissed, setMissingDismissed] = useState(false)
  const [announce, setAnnounce] = useState("")

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backdropRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nebulaRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<CosmosEngine | null>(null)
  const activeRef = useRef<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const overCard = useRef(false)
  const applied = useRef(false)
  const listboxId = useId()
  const helpId = useId()

  // Members' work, profiles and public collections are public, so they load for everyone; the map draws first and
  // they join when ready. Each source can fail on its own without blanking the others.
  useEffect(() => {
    let stale = false
    Promise.allSettled([listHub({ limit: 300 }), listMembers({ limit: 200 }), listPublicCollections(60)]).then(([hub, members, collections]) => {
      if (stale) return
      const failed: string[] = []
      if (hub.status === "rejected" || (hub.status === "fulfilled" && hub.value.errors.length)) failed.push("members' projects and links")
      if (members.status === "rejected") failed.push("members")
      if (collections.status === "rejected") failed.push("collections")
      setProjects({
        entries: hub.status === "fulfilled" ? hub.value.entries : [],
        stats: hub.status === "fulfilled" ? hub.value.stats : {},
        members: members.status === "fulfilled" ? members.value : [],
        collections: collections.status === "fulfilled" ? collections.value : [],
        failed,
      })
    })
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    myLikes(user?.id ?? null)
      .then((l) => !stale && setLikes(l))
      .catch(() => !stale && setLikes([]))
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  const likedSet = useMemo(() => new Set(likes), [likes])
  const savedSet = bookmarks.targets
  const highlightKey = useMemo(() => [...new Set([...likes, ...bookmarks.list.map((b) => b.target)])].sort().join(","), [likes, bookmarks.list])
  const youName = member?.name ?? "You"
  const signedIn = Boolean(user)

  const cosmos = useMemo(
    () =>
      buildCosmos({
        entries: projects?.entries,
        stats: projects?.stats,
        members: projects?.members,
        collections: projects?.collections,
        github,
        you: { name: youName, signedIn, canSignIn: live, highlights: highlightKey ? highlightKey.split(",") : [] },
      }),
    [projects, github, youName, signedIn, highlightKey]
  )
  const highlights = useMemo(() => new Set(cosmos.links.filter((l) => l.kind === "you").map((l) => l.b)), [cosmos])

  /** Tab order: you first, then each galaxy from its brightest star outwards. */
  const order = useMemo(() => {
    const rank = new Map(cosmos.galaxies.map((g, i) => [g.id, i]))
    return cosmos.stars
      .filter((s) => s.kind === "you" || kinds.has(s.kind))
      .sort((a, b) => (a.galaxy ? (rank.get(a.galaxy) ?? 0) + 1 : 0) - (b.galaxy ? (rank.get(b.galaxy) ?? 0) + 1 : 0) || b.weight - a.weight)
  }, [cosmos, kinds])

  const activeId = hover ?? focus ?? selected
  const active = activeId ? (cosmos.byId.get(activeId) ?? null) : null
  const suggestions = useMemo(() => searchStars(cosmos.stars, query), [cosmos, query])

  // ─── Engine ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** Keeps the card beside its star on wide screens. Runs after every frame, outside React. */
  const placeCard = useCallback(() => {
    const el = cardRef.current
    const engine = engineRef.current
    // The nebula drifts a little behind the stars as you move: depth for the price of one composited transform.
    const neb = nebulaRef.current
    if (neb && engine) {
      const c = engine.camera
      const t = `translate3d(${(-c.x * 0.035).toFixed(1)}px, ${(-c.y * 0.035).toFixed(1)}px, 0) scale(${(1.12 + Math.min(c.z, 3) * 0.03).toFixed(3)})`
      if (neb.style.transform !== t) neb.style.transform = t
    }
    const id = activeRef.current
    if (!el || !engine || !id) return
    const p = engine.screenOf(id)
    if (!p || p.w < 640) {
      el.style.transform = ""
      el.style.opacity = "1"
      return
    }
    const cw = el.offsetWidth
    const ch = el.offsetHeight
    let x = p.x + p.r + 22
    if (x + cw > p.w - 16) x = p.x - p.r - 22 - cw
    const y = Math.min(Math.max(p.y - ch / 2, 88), p.h - ch - 16)
    const off = p.x < -40 || p.x > p.w + 40 || p.y < -40 || p.y > p.h + 40
    el.style.transform = `translate3d(${Math.round(Math.max(16, x))}px, ${Math.round(y)}px, 0)`
    el.style.opacity = off ? "0" : "1"
  }, [])

  /** Remembers the picked star in the address bar, so the view can be shared. */
  const remember = useCallback((id: string | null) => {
    const url = id ? `/explore?show=map&focus=${id}` : "/explore?show=map"
    window.history.replaceState(null, "", url)
  }, [])

  const select = useCallback(
    (id: string | null, fly = true) => {
      setSelected(id)
      remember(id)
      if (id && fly) engineRef.current?.flyToStar(id)
      const s = id ? cosmos.byId.get(id) : null
      if (s) setAnnounce(`${s.name}, ${STAR_KINDS[s.kind].label}. ${s.meta}.`)
    },
    [cosmos, remember]
  )

  const pickRef = useRef(select)
  useEffect(() => {
    pickRef.current = (id) => {
      if (!id) {
        setSelected(null)
        setYouMode(false)
        remember(null)
        return
      }
      select(id)
    }
  }, [select, remember])

  useEffect(() => {
    const el = canvasRef.current
    const back = backdropRef.current
    if (!el || !back) return
    const engine = new CosmosEngine(el, back, {
      onHover: (id) => {
        clearTimeout(hoverTimer.current)
        if (id) setHover(id)
        // A short grace period lets the pointer travel from the star to the card's Open button.
        else hoverTimer.current = setTimeout(() => !overCard.current && setHover(null), 320)
      },
      onPick: (id) => pickRef.current(id),
      onFrame: placeCard,
    })
    engineRef.current = engine
    engine.attachMinimap(miniRef.current)
    return () => {
      clearTimeout(hoverTimer.current)
      // A new engine (remount, or React's development double run) starts from the deep link again.
      applied.current = false
      engine.destroy()
      engineRef.current = null
    }
  }, [placeCard])

  useEffect(() => {
    engineRef.current?.setData(cosmos)
  }, [cosmos])

  useEffect(() => {
    engineRef.current?.setVisibleKinds(kinds)
  }, [kinds])

  useEffect(() => {
    engineRef.current?.setHighlights(highlights, youMode)
  }, [highlights, youMode])

  useEffect(() => {
    engineRef.current?.setSelected(selected)
  }, [selected])

  useEffect(() => {
    engineRef.current?.setFocus(focus)
  }, [focus])

  useEffect(() => {
    engineRef.current?.setPaused(view === "list")
  }, [view])

  useEffect(() => {
    activeRef.current = activeId
    placeCard()
  }, [activeId, placeCard])

  // A deep link (?focus=project:<id>) opens already flown to its star. Projects arrive later, so wait for them.
  useEffect(() => {
    if (applied.current || !initialFocus) return
    const engine = engineRef.current
    if (cosmos.byId.has(initialFocus) && engine) {
      applied.current = true
      engine.flyToStar(initialFocus, { instant: true })
    }
  }, [cosmos, initialFocus])
  const missing = initialFocus && projects && !cosmos.byId.has(initialFocus) && !missingDismissed

  // ─── Actions ─────────────────────────────────────────────────────────────────────────────────────────────────

  const showOnMap = (s: Star) => {
    if (s.kind !== "you" && !kinds.has(s.kind)) setKinds((k) => new Set([...k, s.kind]))
    setView("map")
    setQuery("")
    setSearchOpen(false)
    // The canvas may have been paused behind the list; let it resize before flying.
    requestAnimationFrame(() => select(s.id))
  }

  const whereAmI = () => {
    const next = !youMode
    setYouMode(next)
    if (!next) return
    setView("map")
    setSelected("you")
    remember("you")
    requestAnimationFrame(() => {
      const engine = engineRef.current
      if (!engine) return
      if (highlights.size) engine.frameStars(["you", ...highlights])
      else engine.flyToStar("you", { zoom: 0.8 })
    })
    setAnnounce(highlights.size ? `Showing you and ${highlights.size} things you liked or saved.` : "Showing your star. Like or save things and they will join it.")
  }

  const toggleKind = (k: StarKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next.size ? next : new Set(ALL_KINDS)
    })

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current
    if (!engine) return
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const move = (s: Star | null | undefined) => {
      if (!s) return
      setFocus(s.id)
      engine.reveal(s.id)
      setAnnounce(`${s.name}, ${STAR_KINDS[s.kind].label}. ${s.meta}. Press Enter to open.`)
    }
    if (dirs[e.key]) {
      e.preventDefault()
      const [dx, dy] = dirs[e.key]
      move(engine.neighbourInDirection(focus, dx, dy, order))
    } else if (e.key === "Tab") {
      // Tab walks the stars, then leaves the map at either end like any other control.
      const i = focus ? order.findIndex((s) => s.id === focus) : -1
      const next = e.shiftKey ? (i === -1 ? -1 : i - 1) : i + 1
      if (next >= 0 && next < order.length) {
        e.preventDefault()
        move(order[next])
      }
    } else if (e.key === "Enter" && focus) {
      const s = cosmos.byId.get(focus)
      if (s?.href) router.push(s.href as Route)
    } else if (e.key === " " && focus) {
      e.preventDefault()
      select(focus)
    } else if (e.key === "Escape") {
      setFocus(null)
      select(null, false)
      setYouMode(false)
    } else if (e.key === "+" || e.key === "=") {
      engine.zoomBy(1.4)
    } else if (e.key === "-" || e.key === "_") {
      engine.zoomBy(1 / 1.4)
    } else if (e.key === "0") {
      engine.fit()
    }
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSearchOpen(true)
      setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSuggestIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const s = suggestions[suggestIndex] ?? suggestions[0]
      if (s) showOnMap(s)
    } else if (e.key === "Escape") {
      if (query) setQuery("")
      else setSearchOpen(false)
    }
  }

  const counts = useMemo(() => {
    const c = {} as Record<StarKind, number>
    for (const s of cosmos.stars) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [cosmos])

  const allOn = kinds.size === ALL_KINDS.size
  const cardDocked = Boolean(active)

  // ─── Controls ────────────────────────────────────────────────────────────────────────────────────────────────

  const search = (
    <div className="relative">
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        role="combobox"
        aria-expanded={searchOpen && suggestions.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={searchOpen && suggestions[suggestIndex] ? `${listboxId}-${suggestIndex}` : undefined}
        aria-label="Find a star"
        placeholder="Find a model, person, category…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSuggestIndex(0)
          setSearchOpen(true)
        }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
        onKeyDown={onSearchKey}
        className="h-10 w-full rounded-full border border-white/10 bg-black/35 pr-9 pl-9 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-ion/50 focus-visible:ring-2 focus-visible:ring-ion/30 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground">
          <XIcon aria-hidden className="size-3.5" />
        </button>
      )}
      {searchOpen && query.trim() && view === "map" && (
        <ul id={listboxId} role="listbox" aria-label="Matching stars" className="absolute inset-x-0 top-12 z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e16]/95 p-1 shadow-2xl">
          {suggestions.length ? (
            suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === suggestIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  showOnMap(s)
                }}
                onMouseEnter={() => setSuggestIndex(i)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm", i === suggestIndex && "bg-white/7")}
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STAR_KINDS[s.kind].color, boxShadow: `0 0 8px ${STAR_KINDS[s.kind].color}` }} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{STAR_KINDS[s.kind].label}</span>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-muted-foreground"><Copy k="cosmos.cosmos-view.no-star-by-that-name">No star by that name.</Copy></li>
          )}
        </ul>
      )}
    </div>
  )

  const chips = (
    <div role="group" aria-label="Show kinds of stars" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
      <button
        type="button"
        aria-pressed={allOn}
        onClick={() => setKinds(new Set(ALL_KINDS))}
        className={cn(
          "pressable h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          allOn ? "border-white/20 bg-[#1a1f2c]/85 text-foreground" : "border-white/10 bg-[#0b0e16]/60 text-muted-foreground hover:text-foreground"
        )}
      >
        <Copy k="cosmos.cosmos-view.all">All</Copy>
      </button>
      {FILTER_KINDS.map((k) => {
        const on = kinds.has(k)
        const color = STAR_KINDS[k].color
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => (allOn ? setKinds(new Set([k])) : toggleKind(k))}
            className={cn(
              "pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "border-white/15 bg-[#121622]/80 text-foreground" : "border-white/8 bg-[#0b0e16]/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full transition-opacity" style={{ background: color, boxShadow: on ? `0 0 8px ${color}` : "none", opacity: on ? 1 : 0.35 }} />
            {STAR_KINDS[k].plural}
            <span className="tabular text-muted-foreground">{counts[k] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )

  const toggles = (compact: boolean) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={youMode}
        onClick={whereAmI}
        className={cn(
          "pressable inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          youMode ? "border-ion/50 bg-ion/15 text-ion" : "border-white/10 bg-black/35 text-foreground/90 hover:bg-white/8"
        )}
      >
        <LocateFixedIcon aria-hidden className="size-4" />
        <span className={cn(compact && "max-sm:sr-only")}><Copy k="cosmos.cosmos-view.where-am-i">Where am I</Copy></span>
      </button>
      {!embedded && <button
        type="button"
        aria-pressed={view === "list"}
        onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
        className="pressable inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {view === "map" ? <ListIcon aria-hidden className="size-4" /> : <MapIcon aria-hidden className="size-4" />}
        <span className={cn(compact && "max-sm:sr-only")}>{view === "map" ? "List view" : "Map view"}</span>
      </button>}
    </div>
  )

  const notices = (
    <>
      {missing && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs text-gold">
          That star is not on the map. It may be a draft or no longer published.
          <button type="button" onClick={() => setMissingDismissed(true)} aria-label="Dismiss" className="grid size-6 place-items-center rounded-full hover:bg-white/10">
            <XIcon aria-hidden className="size-3.5" />
          </button>
        </p>
      )}
      {projects && projects.failed.length > 0 && <p className="text-xs text-muted-foreground">Some stars could not load ({projects.failed.join(", ")}), so those galaxies may look emptier than they are.</p>}
    </>
  )

  return (
    <div className="relative">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {/* The map stays mounted behind the list so switching back is instant; it simply stops drawing. */}
      <section
        aria-label="Cosmos star map"
        className={cn(
          "relative isolate w-full overflow-hidden bg-background select-none",
          embedded ? "h-[min(76dvh,820px)] min-h-[480px] rounded-2xl ring-1 ring-white/[0.06]" : "h-[calc(100dvh-4rem)] min-h-[560px]",
          view === "list" && "hidden"
        )}
      >
        {/* Top: title, search, the two view switches, then the filter chips. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn("glass pointer-events-auto order-1 flex h-10 items-center gap-2 rounded-full bg-[#0b0e16]/60 pr-4 pl-1.5", embedded && "hidden")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-ion/25 bg-ion/10 text-ion">
                <OrbitIcon aria-hidden className="size-3.5" />
              </span>
              <h1 className="text-sm font-semibold tracking-[-0.01em]"><Copy k="cosmos.cosmos-view.cosmos">Cosmos</Copy></h1>
              <p className="hidden text-xs text-muted-foreground md:block"><Copy k="cosmos.cosmos-view.the-whole-hub-as-a">· The whole hub as a star map</Copy></p>
            </div>
            <div className="pointer-events-auto order-3 basis-full sm:order-2 sm:w-[320px] sm:basis-auto">{search}</div>
            <div className="pointer-events-auto order-2 ml-auto sm:order-3">{toggles(true)}</div>
          </div>
          <div className="pointer-events-auto max-w-full self-start">{chips}</div>
          <div className="pointer-events-auto flex max-w-md flex-col gap-2">{notices}</div>
        </div>

        <div ref={nebulaRef} aria-hidden className="absolute inset-0 -z-10 opacity-70 will-change-transform">
          <Nebula paused={view === "list"} />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(5_6_10/0.75)_100%)]" />

        <canvas ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Star map of Nexverse"
          aria-describedby={helpId}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            if (!focus && e.currentTarget.matches(":focus-visible")) {
              const first = (selected && cosmos.byId.get(selected)) || order[0]
              if (first) {
                setFocus(first.id)
                setAnnounce(`${first.name}, ${STAR_KINDS[first.kind].label}. Arrow keys or Tab to move, Enter to open.`)
              }
            }
          }}
          onBlur={() => setFocus(null)}
          className="absolute inset-0 size-full cursor-grab touch-none outline-none focus-visible:shadow-[inset_0_0_0_2px_rgb(143_180_255/0.6)]"
        />
        <p id={helpId} className="sr-only">
          <Copy k="cosmos.cosmos-view.use-arrow-keys-or-tab" multiline>Use arrow keys or Tab to move between stars, Enter to open a star&apos;s page, Space to fly to it, plus and minus to zoom and 0 to see the whole map. The list view shows every star as a list.</Copy>
        </p>

        {/* Hover, focus or pick: the card follows its star on wide screens and docks to the bottom on phones. */}
        {active && (
          <div
            ref={cardRef}
            className="absolute inset-x-3 bottom-3 z-30 sm:inset-x-auto sm:bottom-auto sm:top-0 sm:left-0 sm:w-[300px] sm:transition-opacity motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
            onMouseEnter={() => {
              overCard.current = true
              clearTimeout(hoverTimer.current)
            }}
            onMouseLeave={() => {
              overCard.current = false
              if (hover) hoverTimer.current = setTimeout(() => setHover(null), 200)
            }}
          >
            <StarCard
              star={active}
              liked={likedSet.has(active.id)}
              saved={savedSet.has(active.id)}
              onClose={
                selected === active.id
                  ? () => {
                      select(null, false)
                      setYouMode(false)
                    }
                  : undefined
              }
            />
          </div>
        )}

        {/* Bottom: how to move (wide screens), zoom buttons and the minimap. */}
        <p className="pointer-events-none absolute bottom-5 left-20 z-10 hidden text-xs text-muted-foreground/80 lg:block">
          <Copy k="cosmos.cosmos-view.drag-to-move-scroll-or" multiline>Drag to move · Scroll or pinch to zoom · Click a star to fly there · Arrow keys and Tab hop between stars</Copy>
        </p>
        <div className={cn("absolute right-3 bottom-3 z-20 flex items-end gap-2 sm:right-4 sm:bottom-4", cardDocked && "max-sm:hidden")}>
          <div className="glass flex flex-col rounded-full bg-[#0b0e16]/55 p-1">
            <button type="button" className={iconButton} aria-label="Zoom in" onClick={() => engineRef.current?.zoomBy(1.4)}>
              <PlusIcon aria-hidden className="size-4" />
            </button>
            <button type="button" className={iconButton} aria-label="Zoom out" onClick={() => engineRef.current?.zoomBy(1 / 1.4)}>
              <MinusIcon aria-hidden className="size-4" />
            </button>
            <button type="button" className={iconButton} aria-label="Show the whole map" onClick={() => engineRef.current?.fit()}>
              <ShrinkIcon aria-hidden className="size-4" />
            </button>
          </div>
          <div className="glass overflow-hidden rounded-2xl bg-[#0b0e16]/55 p-1.5">
            <canvas ref={miniRef} aria-hidden className="block h-[72px] w-[116px] cursor-crosshair touch-none sm:h-[112px] sm:w-[180px]" />
          </div>
        </div>
      </section>

      {view === "list" && (
        <div className="shell flex flex-col gap-6 pt-6 pb-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
                <OrbitIcon aria-hidden className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]"><Copy k="cosmos.cosmos-view.cosmos">Cosmos</Copy></h1>
                <p className="text-sm text-muted-foreground"><Copy k="cosmos.cosmos-view.every-star-on-the-map">Every star on the map, grouped by galaxy.</Copy></p>
              </div>
            </div>
            {toggles(false)}
          </div>
          <div className="flex max-w-3xl flex-col gap-3">
            {search}
            {chips}
            {notices}
          </div>
          <CosmosList cosmos={cosmos} kinds={kinds} query={query} liked={likedSet} saved={savedSet} onShow={(id) => cosmos.byId.get(id) && showOnMap(cosmos.byId.get(id)!)} />
        </div>
      )}
    </div>
  )
}
