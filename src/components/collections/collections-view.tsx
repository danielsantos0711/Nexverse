"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { FolderPlusIcon, LayersIcon, ListIcon, SparklesIcon } from "lucide-react"
import { CollectionCard } from "@/components/collections/collection-card"
import { CollectionForm } from "@/components/collections/collection-form"
import { ConstellationsGallery } from "@/components/collections/constellations-gallery"
import { OrbitCards, type OrbitItem } from "@/components/collections/orbit-cards"
import { LinkTabs } from "@/components/site/link-tabs"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { GlassTabs } from "@/components/glass/glass-tabs"
import { Gate } from "@/components/moderation/gate"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { createCollection, getCollection, listFollowedCollectionIds, listMyCollections, listPublicCollections, type Collection } from "@/lib/community"
import { Copy } from "@/components/content/copy"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

type View = "discover" | "mine" | "following"
const VIEWS: { value: View; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "mine", label: "Yours" },
  { value: "following", label: "Following" },
]
/*
 * Parts of the site to collect from, for the orbit while there are still few public collections: real pages,
 * each a world in the galaxy, never invented collections (restored in round 12b with the merged addresses).
 */
const WORLDS: OrbitItem[] = [
  { id: "w-models", title: "Models", href: "/models", meta: "Planet of weights", kind: "model" },
  { id: "w-datasets", title: "Datasets", href: "/datasets", meta: "Planet of data", kind: "dataset" },
  { id: "w-tools", title: "Tools", href: "/tools", meta: "Planet of tools", kind: "tool" },
  { id: "w-code", title: "Code", href: "/code", meta: "Open-source moons", kind: "repo" },
  { id: "w-forum", title: "Forum threads", href: "/forum", meta: "Signals from members", kind: "thread" },
  { id: "w-news", title: "News", href: "/news", meta: "Today's transmissions", kind: "news" },
  { id: "w-bench", title: "Benchmarks", href: "/benchmarks", meta: "Star charts", kind: "model" },
  { id: "w-trending", title: "Trending", href: "/trending", meta: "Bright right now", kind: "thread" },
  { id: "w-launch", title: "Launchpad", href: "/launchpad", meta: "New launches", kind: "tool" },
  { id: "w-map", title: "Star map", href: "/collections?show=map", meta: "Collections as star maps", kind: "repo" },
]

const isView = (v: string | null): v is View => v === "discover" || v === "mine" || v === "following"

type Lists = Record<View, Collection[] | null>

/** Public collections to discover, your own (public and private) and the ones you follow. */
export function CollectionsView() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { ready, user } = useSession()
  const raw = params.get("view")
  const view: View = isView(raw) ? raw : "discover"
  const map = params.get("show") === "map"
  const [lists, setLists] = useState<Lists>({ discover: null, mine: null, following: null })
  const [error, setError] = useState("")
  // ?new=1 (from the Create sheet) opens the form straight away for members.
  const [creating, setCreating] = useState(() => params.get("new") === "1")
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
        {map ? (
          <p className="text-sm text-muted-foreground">Public collections with two or more things in them, drawn in their curator&rsquo;s order.</p>
        ) : (
          <GlassTabs
            tabs={VIEWS.map((v) => ({ value: v.value, label: v.label, count: lists[v.value]?.length }))}
            value={view}
            onChange={setView}
            label="Which collections"
            controls="collections-panel"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <LinkTabs
            label="View"
            size="sm"
            current={map ? "/collections?show=map" : "/collections"}
            tabs={[
              { href: "/collections", label: "List", icon: ListIcon },
              { href: "/collections?show=map", label: "Star map", icon: SparklesIcon },
            ]}
          />
          <button type="button" onClick={startCreate} className={primaryButton}>
            <FolderPlusIcon aria-hidden className="size-4" /> New collection
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some collections could not be loaded: {error}
        </p>
      )}

      {/* The star map view (what /constellations was): every public collection drawn as a constellation. */}
      {map && <ConstellationsGallery />}

      {/* the orbit: real collections once there are enough of them, until then the real parts of the site to collect from */}
      {!map && view === "discover" && lists.discover && (
        <section aria-labelledby="collections-orbit" className="liquid-glass-flat relative overflow-hidden rounded-3xl px-4 pt-4">
          <h2 id="collections-orbit" className="text-xs font-medium text-muted-foreground">
            {lists.discover.length >= 6 ? <Copy k="collections.orbit.title">In orbit now</Copy> : <Copy k="collections.orbit.worlds">Worlds to collect from</Copy>}
          </h2>
          <OrbitCards
            label={lists.discover.length >= 6 ? "Public collections" : "Parts of Nexverse to collect from"}
            items={
              lists.discover.length >= 6
                ? lists.discover.slice(0, 14).map((c) => ({ id: c.id, title: c.title, href: `/collections/${c.id}` as const, meta: `${c.items.length} ${c.items.length === 1 ? "star" : "stars"}` }))
                : WORLDS
            }
          />
        </section>
      )}

      <div hidden={map} id="collections-panel" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)?.label} aria-busy={list === null}>
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
          <div className="nx-empty nx-empty-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="nx-empty-icon nx-medallion mb-1">
              <LayersIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              {view === "mine"
                ? signedOut
                  ? "Sign in to keep collections of models, datasets, repos and threads."
                  : "You have no collections yet. Start one here, or use “Collect” on any model, dataset, repo or thread."
                : view === "following"
                  ? "You are not following any collections. Follow one to find it here."
                  : "This part of the sky is still unexplored. Start the first collection: gather the models, datasets, repos and threads you keep sending people, with a note on why each one matters."}
            </p>
            {(view === "mine" || view === "discover") &&
              (signedOut ? (
                <Link href={`/sign-in?next=${encodeURIComponent("/collections?view=mine")}`} className={primaryButton}>
                  Sign in
                </Link>
              ) : (
                <button type="button" onClick={startCreate} className={primaryButton}>
                  Start a collection
                </button>
              ))}
            {view === "following" && (
              <button type="button" onClick={() => setView("discover")} className="text-sm text-ion hover:underline">
                Discover collections
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Gather models, datasets, tools, repos and threads, with a note on why each one matters.</DialogDescription>
          </DialogHeader>
          <Gate cap="collection.create" action="start a collection">
          <CollectionForm
            submitLabel="Create collection"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const c = await createCollection(input)
              setCreating(false)
              router.push(`/collections/${c.id}`)
            }}
          />
          </Gate>
        </DialogContent>
      </Dialog>
    </div>
  )
}
