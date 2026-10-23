"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { LinkIcon, PlusIcon, RocketIcon, SearchIcon, XIcon } from "lucide-react"
import { KIND_ICONS } from "@/components/hub/bits"
import { HubCard } from "@/components/hub/cards"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { KINDS, LANGUAGES, type LanguageCode, type ResourceKind } from "@/lib/data"
import { listHub, type HubEntry, type HubList } from "@/lib/hub"
import { importedIds, listRising, projectCovers } from "@/lib/live/nexverse"
import { licenseLabel } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const SORTS = [
  ["trending", "Trending"],
  ["new", "Newest"],
  ["liked", "Most liked"],
  ["name", "Name"],
] as const
type Sort = (typeof SORTS)[number][0]
const isSort = (s: string | null): s is Sort => SORTS.some(([v]) => v === s)

const SOURCES = [
  ["project", "Projects"],
  ["share", "Shared links"],
] as const
type Source = (typeof SOURCES)[number][0]

const ORIGINS = [
  ["members", "Made by members"],
  ["imported", "Imported"],
] as const
type Origin = (typeof ORIGINS)[number][0]

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")

/**
 * The hub catalogue: everything members published in the studio or shared as a link, of one kind (or all four on
 * Explore). Filters are built from what is actually there, so there is never a facet with nothing behind it.
 */
export function ResourceIndex({ kind }: { kind?: ResourceKind }) {
  const params = useSearchParams()
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const [data, setData] = useState<HubList | null>(null)
  const [failed, setFailed] = useState("")
  const [q, setQ] = useState(params.get("q") ?? "")
  const [kinds, setKinds] = useState<ResourceKind[]>([])
  const [source, setSource] = useState<Source | null>(null)
  const [tag, setTag] = useState<string | null>(params.get("tag"))
  const [lang, setLang] = useState<LanguageCode | null>(null)
  const [license, setLicense] = useState<string | null>(null)
  const raw = params.get("sort")
  const [sort, setSort] = useState<Sort>(isSort(raw) ? raw : "trending")
  const [origin, setOrigin] = useState<Origin | null>(null)
  // Covers, which entries were imported, and momentum over 30 days: read after the list, never blocking it.
  const [extra, setExtra] = useState<{ covers: Record<string, string>; imported: Set<string>; score: Map<string, number> }>({ covers: {}, imported: new Set(), score: new Map() })

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listHub({ kind, limit: 120 })
      .then((d) => !stale && setData(d))
      .catch((e: Error) => !stale && setFailed(e.message))
    return () => {
      stale = true
    }
  }, [kind, ready, user?.id])

  useEffect(() => {
    if (!data) return
    let stale = false
    const ids = data.entries.filter((e) => e.source === "project" && !e.local).map((e) => e.id)
    void Promise.all([projectCovers(ids), importedIds(ids), listRising({ days: 30, kind, limit: 60 }).catch(() => ({ items: [] }))]).then(([covers, imported, rising]) => {
      if (stale) return
      setExtra({ covers, imported, score: new Map(rising.items.map((i) => [i.target, i.score])) })
    })
    return () => {
      stale = true
    }
  }, [data, kind])

  const pool = useMemo(() => data?.entries ?? [], [data])
  const tags = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of pool) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24).map(([t]) => t)
  }, [pool])
  const langs = (Object.keys(LANGUAGES) as LanguageCode[]).filter((l) => pool.some((e) => e.langs.includes(l)))
  const licenses = [...new Set(pool.map((e) => e.license).filter((l): l is string => Boolean(l)))].sort()
  const sources = SOURCES.filter(([s]) => pool.some((e) => e.source === s))
  const isImported = (id: string) => extra.imported.has(id)
  const hasImports = extra.imported.size > 0

  const list = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    const out = pool.filter((e) => {
      if (kinds.length && !kinds.includes(e.kind)) return false
      if (source && e.source !== source) return false
      if (origin && (origin === "imported") !== extra.imported.has(e.id)) return false
      if (tag && !e.tags.includes(tag)) return false
      if (lang && !e.langs.includes(lang)) return false
      if (license && e.license !== license) return false
      if (!words.length) return true
      const hay = fold([e.name, e.summary, e.owner?.name ?? "", e.tags.join(" "), e.url ?? ""].join(" "))
      return words.every((w) => hay.includes(w))
    })
    if (sort === "name") return [...out].sort((a, b) => a.name.localeCompare(b.name))
    // Nexverse first: what members made here comes before items imported from elsewhere, in every other order.
    const native = (a: HubEntry, b: HubEntry) => Number(extra.imported.has(a.id)) - Number(extra.imported.has(b.id))
    if (sort === "liked") return [...out].sort((a, b) => native(a, b) || (data?.stats[b.id]?.likes ?? 0) - (data?.stats[a.id]?.likes ?? 0) || b.date.localeCompare(a.date))
    if (sort === "trending") return [...out].sort((a, b) => native(a, b) || Number(b.featured) - Number(a.featured) || (extra.score.get(b.key) ?? 0) - (extra.score.get(a.key) ?? 0) || b.date.localeCompare(a.date))
    return [...out].sort((a, b) => native(a, b) || Number(b.featured) - Number(a.featured) || b.date.localeCompare(a.date))
  }, [pool, kinds, source, origin, tag, lang, license, q, sort, data, extra])

  const active = [source && SOURCES.find(([s]) => s === source)?.[1], origin && ORIGINS.find(([o]) => o === origin)?.[1], tag && `#${tag}`, lang && LANGUAGES[lang].name, license && licenseLabel(license), ...kinds.map((k) => KINDS[k].plural)].filter(Boolean) as string[]
  const clear = () => {
    setSource(null)
    setOrigin(null)
    setTag(null)
    setLang(null)
    setLicense(null)
    setKinds([])
    setQ("")
  }
  const noun = kind ? KINDS[kind].plural.toLowerCase() : "projects and links"

  if (failed) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        The hub could not be loaded: {failed}
      </p>
    )
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label={`Loading ${noun}`} className="grid gap-2.5 xl:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3.5 rounded-xl border border-border bg-card/50 p-3.5">
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (pool.length === 0) return <FirstShare kind={kind} errors={data.errors} />

  const showFacets = !kind || sources.length > 1 || hasImports || tags.length > 0 || langs.length > 0 || licenses.length > 0

  return (
    <div className={cn("grid grid-cols-1 gap-8", showFacets && "lg:grid-cols-[15rem_1fr]")}>
      {showFacets && (
        <aside aria-label="Filters" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:gap-6 lg:self-start lg:overflow-y-auto lg:pr-2">
          {!kind && (
            <Facet title="Kind">
              {(Object.keys(KINDS) as ResourceKind[])
                .filter((k) => pool.some((e) => e.kind === k))
                .map((k) => {
                  const Icon = KIND_ICONS[k]
                  return (
                    <Pill key={k} on={kinds.includes(k)} onClick={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))}>
                      <Icon aria-hidden className="size-3.5" /> {KINDS[k].plural}
                    </Pill>
                  )
                })}
            </Facet>
          )}
          {sources.length > 1 && (
            <Facet title="Source">
              {sources.map(([s, label]) => (
                <Pill key={s} on={source === s} onClick={() => setSource(source === s ? null : s)}>
                  {label}
                </Pill>
              ))}
            </Facet>
          )}
          {hasImports && (
            <Facet title="Origin">
              {ORIGINS.map(([o, label]) => (
                <Pill key={o} on={origin === o} onClick={() => setOrigin(origin === o ? null : o)}>
                  {label}
                </Pill>
              ))}
            </Facet>
          )}
          {tags.length > 0 && (
            <Facet title="Tag">
              {tags.map((t) => (
                <Pill key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </Pill>
              ))}
            </Facet>
          )}
          {langs.length > 0 && (
            <Facet title="Language">
              {langs.map((l) => (
                <Pill key={l} on={lang === l} onClick={() => setLang(lang === l ? null : l)}>
                  <span lang={l}>{LANGUAGES[l].native}</span>
                </Pill>
              ))}
            </Facet>
          )}
          {licenses.length > 0 && (
            <Facet title="Licence">
              {licenses.map((l) => (
                <Pill key={l} on={license === l} onClick={() => setLicense(license === l ? null : l)}>
                  {licenseLabel(l)}
                </Pill>
              ))}
            </Facet>
          )}
        </aside>
      )}

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="liquid-glass flex h-11 flex-1 items-center gap-2.5 rounded-full px-4 focus-within:ring-2 focus-within:ring-ring/40">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="sr-only">Filter {noun}</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder={`Filter ${noun} by name, tag or member`}
              className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="liquid-glass-pill h-11 px-3.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {SORTS.map(([v, label]) => (
                <option key={v} value={v} className="bg-popover">
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular" aria-live="polite">
            {list.length} of {pool.length}
          </span>
          {active.map((a) => (
            <span key={a} className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">
              {a}
            </span>
          ))}
          {(active.length > 0 || q) && (
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-sm text-xs hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <XIcon aria-hidden className="size-3" /> Clear
            </button>
          )}
          {/* publishing and sharing are the page header's actions; not repeated here */}
        </div>
        {data.errors.length > 0 && <p className="text-xs text-muted-foreground">Part of the hub could not be loaded just now, so this list may be incomplete.</p>}

        {list.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed border-border py-14">
            <EmptyHeader>
              <EmptyTitle>Nothing matches</EmptyTitle>
              <EmptyDescription>Loosen a filter, or share the thing you were looking for so the next person finds it.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
              <Button nativeButton={false} render={<Link href={kind ? `/share?kind=${kind}` : "/share"} />}>Share a link</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <motion.ol layout={!reduce} className="grid gap-2.5 xl:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {list.map((e) => (
                <motion.li
                  key={e.key}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                >
                  <HubCard e={e} stats={data.stats[e.id]} image={extra.covers[e.id]} imported={isImported(e.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ol>
        )}
      </div>
    </div>
  )
}

/** The honest state of an empty hub: nothing here yet, and the two ways to put the first thing here. */
function FirstShare({ kind, errors }: { kind?: ResourceKind; errors: string[] }) {
  const Icon = kind ? KIND_ICONS[kind] : RocketIcon
  const label = kind ? KINDS[kind].label.toLowerCase() : "project"
  return (
    <Empty className="liquid-glass-flat rounded-2xl px-6 py-16">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon" className="size-12 rounded-full bg-ion/10 text-ion">
          <Icon className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="text-lg">{kind ? `No ${KINDS[kind].plural.toLowerCase()} shared yet` : "The hub is waiting for its first project"}</EmptyTitle>
        <EmptyDescription>
          {errors.length
            ? "The hub could not be reached just now. Try again in a moment."
            : kind
              ? `Members publish ${KINDS[kind].plural.toLowerCase()} with a README and a changelog, or share a link to one they use. Be the first: it takes a minute.`
              : "Everything here is published or shared by members. Publish what you built with a README and a changelog, or share a link to something worth knowing."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        <Button nativeButton={false} render={<Link href={kind ? `/new/project?kind=${kind}` : "/new/project"} />}>
          <PlusIcon aria-hidden /> Publish a {label}
        </Button>
        <Button nativeButton={false} variant="secondary" render={<Link href={kind ? `/share?kind=${kind}` : "/share"} />}>
          <LinkIcon aria-hidden /> Share a link
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-sans text-xs font-medium tracking-normal text-muted-foreground">{title}</h2>
      {/* one swipeable row per facet on phones, so the results start on the first screen */}
      <div className="-mx-[var(--gutter)] flex gap-1.5 overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">{children}</div>
    </section>
  )
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "liquid-glass-pill inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}
