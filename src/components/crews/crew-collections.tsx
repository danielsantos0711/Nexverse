"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { LayersIcon, Loader2Icon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { CollectionCard } from "@/components/collections/collection-card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { listMyCollections, listPublicCollections, type Collection } from "@/lib/community"
import { canManage, listCrewCollections, shareCollection, subscribeCrew, unshareCollection, type Crew, type CrewRole } from "@/lib/crews"

/** Collections the crew shares: anyone in the crew can add one of theirs (or any public one); admins remove. */
export function CrewCollections({ crew, role }: { crew: Crew; role: CrewRole | null }) {
  const [list, setList] = useState<Collection[] | null>(null)
  const [error, setError] = useState("")
  const [picking, setPicking] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let stale = false
    listCrewCollections(crew)
      .then((l) => {
        if (stale) return
        setList(l)
        setError("")
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setList((x) => x ?? [])
      })
    return () => {
      stale = true
    }
  }, [crew, reload])

  useEffect(() => subscribeCrew(crew, { onChange: () => setReload((n) => n + 1) }), [crew])

  async function remove(c: Collection) {
    const before = list
    setList((l) => (l ?? []).filter((x) => x.id !== c.id))
    try {
      await unshareCollection(crew, c.id)
    } catch (e) {
      setList(before)
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Reading lists, model picks and datasets the crew works from.</p>
        {role && (
          <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
            <PlusIcon aria-hidden /> Share a collection
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {list === null ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading collections">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
          <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
            <LayersIcon aria-hidden className="size-5" />
          </span>
          <p>No shared collections yet. {role ? "Share one of yours, or a public one you rely on." : ""}</p>
          {role && (
            <Link href="/collections" className="text-ion hover:underline">
              Browse collections
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id} className="relative">
              <CollectionCard c={c} />
              {canManage(role) && (
                <button
                  type="button"
                  onClick={() => remove(c)}
                  aria-label={`Stop sharing ${c.title}`}
                  title="Stop sharing"
                  className="absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <SharePicker
        open={picking}
        onOpenChange={setPicking}
        shared={new Set((list ?? []).map((c) => c.id))}
        onShare={async (c) => {
          await shareCollection(crew, c.id)
          setList((l) => [c, ...(l ?? []).filter((x) => x.id !== c.id)])
        }}
      />
    </div>
  )
}

function SharePicker({ open, onOpenChange, shared, onShare }: { open: boolean; onOpenChange: (o: boolean) => void; shared: Set<string>; onShare: (c: Collection) => Promise<void> }) {
  const [mine, setMine] = useState<Collection[] | null>(null)
  const [publicList, setPublicList] = useState<Collection[]>([])
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let stale = false
    Promise.all([listMyCollections().catch(() => []), listPublicCollections().catch(() => [])]).then(([m, p]) => {
      if (stale) return
      setMine(m)
      setPublicList(p.filter((c) => !m.some((x) => x.id === c.id)))
    })
    return () => {
      stale = true
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const match = (c: Collection) => !q || `${c.title} ${c.description}`.toLowerCase().includes(q)
  const groups = useMemo(
    () => [
      { label: "Your collections", items: (mine ?? []).filter(match) },
      { label: "Public collections", items: publicList.filter(match).slice(0, 20) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, publicList, q]
  )

  async function pick(c: Collection) {
    setBusy(c.id)
    setError("")
    try {
      await onShare(c)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share a collection</DialogTitle>
          <DialogDescription>Pick a collection for the crew. Private ones stay visible only to you.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collections" aria-label="Search collections" className="pl-9" />
        </div>
        <div className="-mx-2 flex max-h-80 flex-col gap-3 overflow-y-auto">
          {mine === null ? (
            <Skeleton className="mx-2 h-24 rounded-lg" />
          ) : (
            groups.map(
              (g) =>
                g.items.length > 0 && (
                  <section key={g.label} aria-label={g.label}>
                    <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g.label}</h3>
                    <ul>
                      {g.items.map((c) => {
                        const already = shared.has(c.id)
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              disabled={already || busy !== null}
                              onClick={() => pick(c)}
                              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none disabled:opacity-50"
                            >
                              <LayersIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium">{c.title}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {c.items.length} items · by {c.owner.name}
                                  {!c.isPublic && " · private"}
                                </span>
                              </span>
                              {already ? <span className="text-xs text-muted-foreground">Shared</span> : busy === c.id && <Loader2Icon aria-hidden className="size-4 animate-spin" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
            )
          )}
          {mine !== null && groups.every((g) => g.items.length === 0) && <p className="px-2 py-4 text-center text-sm text-muted-foreground">No collection matches.</p>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Link href="/collections" className="text-sm text-ion hover:underline">
          Make a new collection
        </Link>
      </DialogContent>
    </Dialog>
  )
}
