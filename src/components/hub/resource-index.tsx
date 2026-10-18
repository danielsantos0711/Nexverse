"use client"

import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { ExternalLinkIcon, SearchIcon, XIcon } from "lucide-react"
import { KIND_ICONS, KindTag } from "@/components/hub/bits"
import { ResourceCard } from "@/components/hub/cards"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ago, KINDS, LANGUAGES, resources, TASKS, trending, type LanguageCode, type Resource, type ResourceKind } from "@/lib/data"
import { listSubmissions, type Submission } from "@/lib/store"
import { cn } from "@/lib/utils"

const SORTS = [
  ["trending", "Trending"],
  ["likes", "Most liked"],
  ["reach", "Most used"],
  ["updated", "Recently updated"],
] as const
type Sort = (typeof SORTS)[number][0]

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
}

function matches(r: Resource, q: string) {
  if (!q) return true
  const hay = norm([r.owner, r.name, r.summary, r.task, r.tags.join(" "), r.about.join(" ")].join(" "))
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

/**
 * Hugging Face-style browsing: tasks, languages and licences on the left, a dense list on the right.
 * With no kind it browses everything (the Explore page).
 */
export function ResourceIndex({ kind }: { kind?: ResourceKind }) {
  const params = useSearchParams()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [kinds, setKinds] = useState<ResourceKind[]>([])
  const [task, setTask] = useState<string | null>(null)
  const [lang, setLang] = useState<LanguageCode | null>(null)
  const [license, setLicense] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "trending")
  const [shared, setShared] = useState<Submission[]>([])
  const [sharedLimit, setSharedLimit] = useState(24)

  useEffect(() => {
    let stale = false
    listSubmissions({ kind, limit: sharedLimit + 1 })
      .then((s) => !stale && setShared(s.filter((x) => x.kind !== "news")))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [kind, sharedLimit])

  const pool = useMemo(() => resources.filter((r) => !kind || r.kind === kind), [kind])
  const tasks = TASKS.filter((t) => pool.some((r) => r.task === t))
  const langs = (Object.keys(LANGUAGES) as LanguageCode[]).filter((l) => pool.some((r) => r.langs.includes(l)))
  const licenses = [...new Set(pool.map((r) => r.license))].sort()

  const list = useMemo(() => {
    const out = pool.filter(
      (r) =>
        (!kinds.length || kinds.includes(r.kind)) &&
        (!task || r.task === task) &&
        (!lang || r.langs.includes(lang)) &&
        (!license || r.license === license) &&
        matches(r, q)
    )
    if (sort === "trending") return trending(out)
    if (sort === "likes") return out.sort((a, b) => b.likes - a.likes)
    if (sort === "reach") return out.sort((a, b) => b.reach - a.reach)
    return out.sort((a, b) => b.updated.localeCompare(a.updated))
  }, [pool, kinds, task, lang, license, q, sort])

  const active = [task, lang && LANGUAGES[lang].name, license, ...kinds.map((k) => KINDS[k].plural)].filter(Boolean)
  const clear = () => {
    setTask(null)
    setLang(null)
    setLicense(null)
    setKinds([])
    setQ("")
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
      <aside aria-label="Filters" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
        {!kind && (
          <Facet title="Kind">
            {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
              const Icon = KIND_ICONS[k]
              return (
                <Pill key={k} on={kinds.includes(k)} onClick={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))}>
                  <Icon aria-hidden className="size-3.5" /> {KINDS[k].plural}
                </Pill>
              )
            })}
          </Facet>
        )}
        <Facet title="Task">
          {tasks.map((t) => (
            <Pill key={t} on={task === t} onClick={() => setTask(task === t ? null : t)}>
              {t}
            </Pill>
          ))}
        </Facet>
        <Facet title="Language">
          {langs.map((l) => (
            <Pill key={l} on={lang === l} onClick={() => setLang(lang === l ? null : l)}>
              <span lang={l}>{LANGUAGES[l].native}</span>
            </Pill>
          ))}
        </Facet>
        <Facet title="Licence">
          {licenses.map((l) => (
            <Pill key={l} on={license === l} onClick={() => setLicense(license === l ? null : l)}>
              {l}
            </Pill>
          ))}
        </Facet>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="glass flex h-11 flex-1 items-center gap-2.5 rounded-xl px-3.5 focus-within:border-ion/50">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="sr-only">Filter by name</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder={`Filter ${kind ? KINDS[kind].plural.toLowerCase() : "everything"} by name, task or tag`}
              className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="glass h-11 rounded-xl px-3 text-foreground outline-none">
              {SORTS.map(([v, label]) => (
                <option key={v} value={v} className="bg-popover">
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular">
            {list.length} {list.length === 1 ? "result" : "results"}
          </span>
          {active.map((a) => (
            <span key={a} className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">
              {a}
            </span>
          ))}
          {(active.length > 0 || q) && (
            <button onClick={clear} className="inline-flex items-center gap-1 text-xs hover:text-foreground">
              <XIcon aria-hidden className="size-3" /> Clear
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed border-border py-16">
            <EmptyHeader>
              <EmptyTitle>Nothing matches yet</EmptyTitle>
              <EmptyDescription>Loosen a filter, or share the thing you were looking for so the next person finds it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <motion.ol layout className="grid gap-2.5 xl:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {list.map((r) => (
                <motion.li
                  key={r.slug}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                >
                  <ResourceCard r={r} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ol>
        )}

        {shared.length > 0 && (
          <section aria-labelledby="shared-h" className="mt-8 flex flex-col gap-3">
            <h2 id="shared-h" className="text-lg font-semibold">
              {shared.every((s) => s.local) ? "Shared from this browser" : "Just shared by members"}
            </h2>
            <ul className="grid gap-2.5 xl:grid-cols-2">
              {shared.slice(0, sharedLimit).map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex flex-col gap-1 rounded-xl border border-border bg-card/70 p-3.5 hover:bg-card">
                    <span className="flex items-center gap-2 font-medium">
                      {s.title}
                      <ExternalLinkIcon aria-hidden className="size-3.5 text-muted-foreground group-hover:text-foreground" />
                    </span>
                    {s.summary && <span className="line-clamp-1 text-[13px] text-muted-foreground">{s.summary}</span>}
                    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <KindTag kind={s.kind as ResourceKind} />
                      <span>{s.local ? "You, on this device" : (s.author?.name ?? "A member")}</span>
                      <span>{ago(s.createdAt)}</span>
                      <span className="truncate">{new URL(s.url).hostname}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {shared.length > sharedLimit && (
              <button type="button" onClick={() => setSharedLimit((n) => n + 24)} className="pressable self-start rounded-full bg-secondary px-4 py-2 text-sm hover:bg-accent">
                Show more
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-sans text-xs font-medium tracking-normal text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap gap-1.5">{children}</div>
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
        "pressable inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] transition-colors",
        on ? "border-ion/50 bg-ion/15 text-foreground" : "border-border bg-card/60 text-muted-foreground hover:border-white/15 hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}
