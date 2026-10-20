"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react"
import { CrewCard } from "@/components/crews/crew-card"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { listCrews, myStandings, type Crew, type Standing } from "@/lib/crews"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

type View = "discover" | "yours"
const VIEWS: { value: View; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "yours", label: "Your crews" },
]

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Every crew: discover them (busiest topics first), the ones you are in, and a search over names and topics. */
export function CrewsIndex() {
  const { ready, user } = useSession()
  const reduce = useReducedMotion()
  const [crews, setCrews] = useState<Crew[] | null>(null)
  const [standing, setStanding] = useState<Record<string, Standing>>({})
  const [error, setError] = useState("")
  const [view, setView] = useState<View>("discover")
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | null>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    Promise.all([listCrews(), myStandings().catch(() => ({}))])
      .then(([list, mine]) => {
        if (stale) return
        setCrews(list)
        setStanding(mine)
        setError("")
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setCrews((c) => c ?? [])
      })
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  const topTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const c of crews ?? []) for (const t of c.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([t]) => t)
  }, [crews])

  const shown = useMemo(() => {
    const q = fold(query.trim().replace(/^#/, ""))
    return (crews ?? [])
      .filter((c) => (view === "yours" ? standing[c.id]?.role || standing[c.id]?.requested : true))
      .filter((c) => !tag || c.tags.includes(tag))
      .filter((c) => !q || fold(`${c.name} ${c.blurb} ${c.tags.join(" ")}`).includes(q))
  }, [crews, standing, view, tag, query])

  const yoursCount = (crews ?? []).filter((c) => standing[c.id]?.role || standing[c.id]?.requested).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Which crews" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
          {VIEWS.map((v) => {
            const on = v.value === view
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="crews-panel"
                onClick={() => setView(v.value)}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && <motion.span layoutId="crews-view" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
                <span className="relative">
                  {v.label}
                  {v.value === "yours" && crews && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{yoursCount}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 md:w-64 md:flex-none">
            <span className="sr-only"><Copy k="crews.crews-index.search-crews">Search crews</Copy></span>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crews or #topics"
              maxLength={60}
              className="h-9 w-full rounded-full border border-input bg-background/60 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Link href="/crews/new" className={primaryButton}>
            <PlusIcon aria-hidden className="size-4" /> <Copy k="crews.crews-index.start-a-crew">Start a crew</Copy>
          </Link>
        </div>
      </div>

      {topTags.length > 0 && (
        <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Filter by topic">
          {topTags.map((t) => {
            const on = tag === t
            return (
              <li key={t} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTag(on ? null : t)}
                  className={cn(
                    "pressable inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "border-ion/50 bg-ion/10 text-ion" : "border-border text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  )}
                >
                  #{t}
                  {on && <XIcon aria-hidden className="size-3" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Crews could not be loaded ({error}). Reload the page to try again.
        </p>
      )}

      <div id="crews-panel" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)?.label} aria-busy={crews === null}>
        {crews === null ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i}>
                <Skeleton className="h-44 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : shown.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c, i) => (
              <li key={c.id} className={rise} style={riseDelay(i)}>
                <CrewCard crew={c} standing={standing[c.id]} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <UsersIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              {query || tag
                ? <Copy k="crews.crews-index.no-crew-matches-that-try">No crew matches that. Try another word or topic.</Copy>
                : view === "yours"
                  ? live && !user
                    ? <Copy k="crews.crews-index.sign-in-to-see-the">Sign in to see the crews you are in.</Copy>
                    : <Copy k="crews.crews-index.you-are-not-in-a">You are not in a crew yet. Join one from Discover, or start your own.</Copy>
                  : live
                    ? <Copy k="crews.crews-index.no-crews-yet-start-the" multiline>No crews yet. Start the first one: a lab, a study group or a project team, with a wall, a chat room and shared collections.</Copy>
                    : <Copy k="crews.crews-index.crews-you-start-in-this" multiline>Crews you start in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can join them yet.</Copy>}
            </p>
            {live && !user && view === "yours" ? (
              <Link href="/sign-in?next=%2Fcrews" className={primaryButton}>
                <Copy k="crews.crews-index.sign-in">Sign in</Copy>
              </Link>
            ) : (
              !query &&
              !tag && (
                <Link href="/crews/new" className={primaryButton}>
                  <PlusIcon aria-hidden className="size-4" /> {view === "discover" && crews.length === 0 ? "Start the first crew" : "Start a crew"}
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
