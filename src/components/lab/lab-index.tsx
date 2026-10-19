"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpRightIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react"
import { GlowCard } from "@/components/hub/glow-card"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { ToolPreview } from "./previews"
import { CATEGORIES, LAB_TOOLS, labPath, type LabCategory, type LabTool } from "./tools"

/** HorizonX "Particle Veil", decorative, browser-only, paused offscreen and under reduced motion. */
const ParticleVeil = dynamic(() => import("./fx/particle-veil"), { ssr: false })

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

export function LabHeroFx() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[46%] [mask-image:radial-gradient(70%_80%_at_60%_50%,black,transparent)] md:block">
      <ParticleVeil className="h-full w-full" />
    </div>
  )
}

export function LabIndex() {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<LabCategory | "all">("all")
  const search = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)

  // "/" focuses the search, like most tool catalogues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return LAB_TOOLS.filter((t) => (cat === "all" || t.group === cat) && words.every((w) => norm(`${t.name} ${t.tagline} ${t.keywords}`).includes(w)))
  }, [q, cat])

  const grouped = !q.trim() && cat === "all"

  /** Arrow keys move between cards in reading order; Home and End jump to the ends. */
  function onGridKey(e: React.KeyboardEvent) {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
    const cards = [...(grid.current?.querySelectorAll<HTMLAnchorElement>("a[data-tool]") ?? [])]
    const i = cards.indexOf(document.activeElement as HTMLAnchorElement)
    if (i < 0) return
    e.preventDefault()
    const cols = Math.max(1, Math.round((grid.current?.clientWidth ?? 1) / (cards[0]?.offsetWidth || 1)))
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : 0
    const next = e.key === "Home" ? 0 : e.key === "End" ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, i + step))
    cards[next]?.focus()
  }

  const newCount = LAB_TOOLS.filter((t) => t.isNew).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="lab-search" className="sr-only">
            Search the Lab
          </label>
          <input
            id="lab-search"
            ref={search}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("")
              if (e.key === "ArrowDown" || e.key === "Enter") {
                const first = grid.current?.querySelector<HTMLAnchorElement>("a[data-tool]")
                if (first) {
                  e.preventDefault()
                  if (e.key === "Enter" && results.length === 1) first.click()
                  else first.focus()
                }
              }
            }}
            placeholder={`Search ${LAB_TOOLS.length} tools`}
            className="h-10 w-full rounded-full border border-input bg-input/30 pr-16 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
              <XIcon aria-hidden className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute top-1/2 right-3 -translate-y-1/2">/</Kbd>
          )}
        </div>
        <div role="group" aria-label="Category" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:pb-0">
          {[{ id: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "pressable h-9 shrink-0 rounded-full border px-3.5 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                cat === c.id ? "border-white/25 bg-white/[0.08] text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        {results.length} tool{results.length === 1 ? "" : "s"} shown
      </p>

      <div ref={grid} onKeyDown={onGridKey} className="flex flex-col gap-10">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-foreground/90">No tool matches &ldquo;{q}&rdquo;.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a broader word, or{" "}
              <Link href="/forum/new" className="text-ion underline-offset-2 hover:underline">
                suggest the tool you need
              </Link>
              .
            </p>
          </div>
        ) : grouped ? (
          CATEGORIES.map((c) => {
            const tools = results.filter((t) => t.group === c.id)
            return (
              <section key={c.id} aria-labelledby={`lab-cat-${c.id}`} className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                  <h2 id={`lab-cat-${c.id}`} className="text-[15px] font-semibold tracking-tight">
                    {c.label}
                  </h2>
                  <p className="hidden text-sm text-muted-foreground sm:block">{c.blurb}</p>
                </div>
                <Cards tools={tools} />
              </section>
            )
          })
        ) : (
          <Cards tools={results} />
        )}
      </div>

      {grouped && newCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SparklesIcon aria-hidden className="size-3.5 text-ion" />
          {newCount} tools are new in this release. Arrow keys move between cards.
        </p>
      )}
    </div>
  )
}

function Cards({ tools }: { tools: LabTool[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t, k) => {
        const Icon = t.icon
        return (
          <li key={t.slug} className="animate-in fill-mode-both fade-in-0 slide-in-from-bottom-1 duration-500 motion-reduce:animate-none" style={{ animationDelay: `${Math.min(k, 8) * 40}ms` }}>
            <GlowCard className="h-full rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card">
              <Link
                href={labPath(t.slug)}
                data-tool={t.slug}
                className="group relative flex h-full flex-col gap-4 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl ring-1 ring-white/10" style={{ background: `rgb(${t.tint} / 0.12)`, color: `rgb(${t.tint})` }}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="flex items-center gap-1.5">
                    {t.isNew && <span className="rounded-full bg-ion/12 px-2 py-0.5 text-[11px] font-medium text-ion ring-1 ring-ion/25 ring-inset">New</span>}
                    {t.usesAi && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok ring-1 ring-ok/25 ring-inset">Free AI</span>}
                    <ArrowUpRightIcon aria-hidden className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground motion-reduce:transition-none" />
                  </span>
                </div>
                <ToolPreview slug={t.slug} tint={t.tint} />
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold tracking-tight">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.tagline}</p>
                </div>
              </Link>
            </GlowCard>
          </li>
        )
      })}
    </ul>
  )
}
