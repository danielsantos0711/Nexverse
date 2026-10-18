"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { SearchIcon } from "lucide-react"
import { ArtifactRow, ThreadRow } from "@/components/app/bits"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ARTIFACT_KINDS, byDateDesc, orbits, type ArtifactKind } from "@/lib/data"
import { searchArtifacts, searchThreads } from "@/lib/search"
import { LinkButton } from "@/components/link-button"

type Filter = "all" | "threads" | "open" | ArtifactKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "threads", label: "Threads" },
  { id: "open", label: "Unanswered" },
  ...(Object.keys(ARTIFACT_KINDS) as ArtifactKind[]).map((k) => ({ id: k, label: ARTIFACT_KINDS[k].plural })),
]

export function ExploreView() {
  const params = useSearchParams()
  const router = useRouter()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [filter, setFilter] = useState<Filter>((params.get("show") as Filter) ?? "all")
  const [orbit, setOrbit] = useState(params.get("orbit") ?? "")

  function sync(next: { q?: string; show?: Filter; orbit?: string }) {
    const u = new URLSearchParams()
    const values = { q, show: filter, orbit, ...next }
    if (values.q) u.set("q", values.q)
    if (values.show && values.show !== "all") u.set("show", values.show)
    if (values.orbit) u.set("orbit", values.orbit)
    router.replace(u.size ? `/explore?${u}` : "/explore", { scroll: false })
  }

  const inOrbit = <T extends { orbit: string }>(x: T) => !orbit || x.orbit === orbit
  const ts = (q ? searchThreads(q) : [...searchThreads("")].sort(byDateDesc))
    .filter(inOrbit)
    .filter((t) => filter === "all" || filter === "threads" || (filter === "open" && t.stage === "asked"))
  const as = searchArtifacts(q)
    .filter(inOrbit)
    .filter((a) => filter === "all" || a.kind === filter)
  const showThreads = filter === "all" || filter === "threads" || filter === "open"
  const showArtifacts = filter === "all" || filter in ARTIFACT_KINDS
  const nothing = (!showThreads || ts.length === 0) && (!showArtifacts || as.length === 0)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <InputGroup className="h-12 rounded-full bg-card">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search threads, models, datasets and tools"
            placeholder="Search in any language"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              sync({ q: e.target.value })
            }}
            className="text-base"
          />
        </InputGroup>
        <div className="overflow-x-auto">
          <ToggleGroup
            aria-label="Show"
            value={[filter]}
            onValueChange={(v) => {
              const next = (v[0] as Filter) ?? "all"
              setFilter(next)
              sync({ show: next })
            }}
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.id} value={f.id} className="rounded-full px-3">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <label className="flex items-center gap-3 text-small text-muted-foreground">
          Orbit
          <select
            value={orbit}
            onChange={(e) => {
              setOrbit(e.target.value)
              sync({ orbit: e.target.value })
            }}
            className="h-9 rounded-full bg-card px-3 text-foreground"
          >
            <option value="">All orbits</option>
            {orbits.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {nothing ? (
        <Empty className="bg-card">
          <EmptyHeader>
            <EmptyTitle>Nobody has asked this yet</EmptyTitle>
            <EmptyDescription>Ask it and you start the loop for everyone who comes after you.</EmptyDescription>
          </EmptyHeader>
          <LinkButton href={q ? `/new?q=${encodeURIComponent(q)}` : "/new"}>Ask this question</LinkButton>
        </Empty>
      ) : (
        <div className="grid gap-14 lg:grid-cols-[3fr_2fr] lg:gap-12">
          {showThreads && ts.length > 0 && (
            <section aria-labelledby="ex-threads" className={showArtifacts ? "" : "lg:col-span-2"}>
              <h2 id="ex-threads" className="mb-2 text-small text-muted-foreground">
                {ts.length} {ts.length === 1 ? "thread" : "threads"}
              </h2>
              <ul>
                {ts.map((t) => (
                  <ThreadRow key={t.id} thread={t} />
                ))}
              </ul>
            </section>
          )}
          {showArtifacts && as.length > 0 && (
            <section aria-labelledby="ex-built" className={showThreads ? "" : "lg:col-span-2"}>
              <h2 id="ex-built" className="mb-2 text-small text-muted-foreground">
                {as.length} built and shared back
              </h2>
              <ul>
                {as.map((a) => (
                  <ArtifactRow key={a.slug} artifact={a} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
