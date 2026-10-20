"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FolderPlusIcon, SparklesIcon } from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { StarMap, type MapStar } from "@/components/hub/constellation-map"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listPublicCollections, type Collection } from "@/lib/community"
import { resolveTargets, type Resolved } from "@/lib/hub"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

type Sky = { c: Collection; stars: MapStar[] }

/**
 * Members' public collections drawn as constellations: every collection with two or more items that still exist
 * becomes a star map in its curator's order. Opening one opens the collection itself.
 */
export function ConstellationsGallery() {
  const { ready, user } = useSession()
  const [skies, setSkies] = useState<Sky[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    ;(async () => {
      const list = (await listPublicCollections(60)).filter((c) => c.items.length >= 2)
      const targets = [...new Set(list.flatMap((c) => c.items.slice(0, 12).map((i) => i.target)))]
      const info: Record<string, Resolved> = targets.length ? await resolveTargets(targets) : {}
      const out = list
        .map((c) => ({ c, stars: c.items.map((i) => info[i.target]).filter((r): r is Resolved => Boolean(r?.found)).map((r) => ({ key: r.target, label: r.label, type: r.type, group: r.group, href: r.href })) }))
        .filter((s) => s.stars.length >= 2)
      if (!stale) setSkies(out)
    })().catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Constellations could not be loaded: {error}
      </p>
    )
  }

  if (!skies) {
    return (
      <div aria-busy="true" aria-label="Loading constellations" className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (skies.length === 0) {
    return (
      <Empty className="liquid-glass-flat rounded-2xl px-6 py-16">
        <EmptyHeader className="max-w-lg">
          <EmptyMedia variant="icon" className="size-12 rounded-full bg-ion/10 text-ion">
            <SparklesIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-lg">The sky is still dark</EmptyTitle>
          <EmptyDescription>
            A constellation is a public collection with two or more things in it: the model, the dataset, the tool and the repo that make one idea work, in the order you would read them. Start a collection, add what belongs together, and it lights up here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button nativeButton={false} render={<Link href="/collections?view=mine" />}>
            <FolderPlusIcon aria-hidden /> Start a collection
          </Button>
          <Button nativeButton={false} variant="secondary" render={<Link href="/explore" />}>
            Find things to collect
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {skies.map(({ c, stars }) => (
        <li key={c.id}>
          <article className="liquid-glass-flat group relative flex h-full flex-col overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none">
            <div className="bg-[#05060a]">
              <StarMap id={c.id} name={c.title} stars={stars} labels={false} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-4">
              <h2 className="text-lg leading-tight font-semibold">
                <Link href={`/collections/${c.id}`} className="rounded-sm hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {c.title}
                </Link>
              </h2>
              {c.description && <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
              <p className="line-clamp-1 text-xs text-muted-foreground">{stars.map((s) => s.label).join(" → ")}</p>
              <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <PosterAvatar poster={c.owner} size={20} />
                <span className="truncate">{c.owner.name}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{stars.length} stars</span>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
