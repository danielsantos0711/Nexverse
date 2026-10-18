"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { FolderPlusIcon, LayersIcon } from "lucide-react"
import { CollectionCard } from "@/components/collections/collection-card"
import { CollectionForm } from "@/components/collections/collection-form"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { createCollection, getCollection, listFollowedCollectionIds, listMyCollections, listPublicCollections, SAMPLE_COLLECTIONS, type Collection } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type View = "discover" | "mine" | "following"
const VIEWS: { value: View; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "mine", label: "Yours" },
  { value: "following", label: "Following" },
]
const isView = (v: string | null): v is View => v === "discover" || v === "mine" || v === "following"

type Lists = Record<View, Collection[] | null>

/** Public collections to discover, your own (public and private) and the ones you follow. */
export function CollectionsView() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const raw = params.get("view")
  const view: View = isView(raw) ? raw : "discover"
  const [lists, setLists] = useState<Lists>({ discover: SAMPLE_COLLECTIONS, mine: null, following: null })
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const signedOut = live && ready && !user

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    Promise.all([
      listPublicCollections(),
      listMyCollections(),
      listFollowedCollectionIds().then((ids) => Promise.all(ids.slice(0, 40).map((id) => getCollection(id).catch(() => null)))),
    ])
      .then(([discover, mine, followed]) => {
        if (!stale) setLists({ discover, mine, following: followed.filter((c): c is Collection => Boolean(c)) })
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setLists((l) => ({ discover: l.discover, mine: l.mine ?? [], following: l.following ?? [] }))
      })
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  function setView(v: View) {
    const q = new URLSearchParams(params.toString())
    if (v === "discover") q.delete("view")
    else q.set("view", v)
    const qs = q.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  function startCreate() {
    if (signedOut) {
      router.push(`/sign-in?next=${encodeURIComponent("/collections?view=mine")}`)
      return
    }
    setCreating(true)
  }

  const list = lists[view]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Which collections" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
          {VIEWS.map((v) => {
            const on = v.value === view
            const n = lists[v.value]?.length
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="collections-panel"
                onClick={() => setView(v.value)}
                className={cn(
                  "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && <motion.span layoutId="collections-view" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
                <span className="relative">
                  {v.label}
                  {n !== undefined && <span className={cn("ml-1.5 text-xs tabular", on ? "opacity-80" : "opacity-60")}>{n}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <button type="button" onClick={startCreate} className={primaryButton}>
          <FolderPlusIcon aria-hidden className="size-4" /> New collection
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some collections could not be loaded: {error}
        </p>
      )}

      <div id="collections-panel" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)?.label} aria-busy={list === null}>
        {list === null ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-48 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : list.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c, i) => (
              <li key={c.id} className={rise} style={riseDelay(i)}>
                <CollectionCard c={c} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <LayersIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              {view === "mine"
                ? signedOut
                  ? "Sign in to keep collections of models, datasets, papers and threads."
                  : "You have no collections yet. Start one here, or use “Collect” on any model, dataset, paper or thread."
                : view === "following"
                  ? "You are not following any collections. Follow one to find it here."
                  : "No public collections yet."}
            </p>
            {view === "mine" &&
              (signedOut ? (
                <Link href={`/sign-in?next=${encodeURIComponent("/collections?view=mine")}`} className={primaryButton}>
                  Sign in
                </Link>
              ) : (
                <button type="button" onClick={startCreate} className={primaryButton}>
                  Start a collection
                </button>
              ))}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Gather models, datasets, papers, repos and threads, with a note on why each one matters.</DialogDescription>
          </DialogHeader>
          <CollectionForm
            submitLabel="Create collection"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const c = await createCollection(input)
              setCreating(false)
              router.push(`/collections/${c.id}`)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
