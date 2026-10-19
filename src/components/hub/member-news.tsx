"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { NewspaperIcon, PlusIcon } from "lucide-react"
import { NewsShareCard } from "@/components/hub/cards"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listShares, type Share } from "@/lib/hub"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

const PAGE = 20

/**
 * Stories members shared through /share: featured by the team first, then newest. Hidden stories never appear.
 * The two newest lead in large cards; the rest follow in a grid.
 */
export function MemberNews() {
  const { ready, user } = useSession()
  const [items, setItems] = useState<Share[] | null>(null)
  const [error, setError] = useState("")
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listShares({ kind: "news", limit: limit + 1, featuredFirst: true })
      .then((s) => !stale && setItems(s))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [limit, ready, user?.id])

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Members’ news could not be loaded: {error}
      </p>
    )
  }

  if (!items) {
    return (
      <div aria-busy="true" aria-label="Loading news" className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Empty className="spotlight glass rounded-2xl px-6 py-14">
        <EmptyHeader className="max-w-md">
          <EmptyMedia variant="icon" className="size-12 rounded-full bg-gold/10 text-gold">
            <NewspaperIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-lg">No stories shared yet</EmptyTitle>
          <EmptyDescription>
            Read something that changes how people build: a release, a paper, a policy change, a tutorial? Share the link with a line on why it matters, and it leads this page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/share?kind=news" />}>
            <PlusIcon aria-hidden /> Share a story
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const shown = items.slice(0, limit)
  const [first, second, ...rest] = shown
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <NewsShareCard s={first} big />
        {second && <NewsShareCard s={second} big />}
      </div>
      {rest.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {rest.map((s) => (
            <li key={s.id}>
              <NewsShareCard s={s} className="h-full" />
            </li>
          ))}
        </ul>
      )}
      {items.length > limit && (
        <Button variant="secondary" className="self-start" onClick={() => setLimit((n) => n + PAGE)}>
          Show more stories
        </Button>
      )}
    </div>
  )
}
