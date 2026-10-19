"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MessageSquareIcon, PlusIcon } from "lucide-react"
import { HubCard } from "@/components/hub/cards"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getCategory } from "@/lib/data"
import { listHub, type HubEntry, type HubList } from "@/lib/hub"
import { listQuestions, useSession, type Question } from "@/lib/store"
import { live } from "@/lib/supabase"

const WEEK = 7 * 864e5

/** Members' likes count double, replies once; anything from the last week and anything featured is lifted. */
function rank(hub: HubList): HubEntry[] {
  const now = Date.now()
  return hub.entries
    .map((e) => ({ e, score: (hub.stats[e.id]?.likes ?? 0) * 2 + (hub.stats[e.id]?.replies ?? 0) + (now - Date.parse(e.date) < WEEK ? 3 : 0) + (e.featured ? 5 : 0) }))
    .sort((a, b) => b.score - a.score || b.e.date.localeCompare(a.e.date))
    .slice(0, 6)
    .map((x) => x.e)
}

/**
 * The hub's own favourites, from real activity only: projects and links ranked by members' likes, with anything
 * from the last week lifted, and the newest forum threads. Shows an invitation when nothing is there yet.
 */
export function HubTrending() {
  const { ready, user } = useSession()
  const [hub, setHub] = useState<HubList | null>(null)
  const [ranked, setRanked] = useState<HubEntry[] | null>(null)
  const [threads, setThreads] = useState<Question[] | null>(null)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listHub({ limit: 60 })
      .then((h) => {
        if (stale) return
        setHub(h)
        setRanked(rank(h))
      })
      .catch(() => !stale && setRanked([]))
    listQuestions({ limit: 5 })
      .then((q) => !stale && setThreads(q))
      .catch(() => !stale && setThreads([]))
    return () => {
      stale = true
    }
  }, [ready, user?.id])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <h3 className="font-sans text-sm font-medium tracking-normal text-muted-foreground">Projects and links</h3>
        {!ranked ? (
          <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : ranked.length ? (
          <ol className="flex flex-col gap-2.5">
            {ranked.map((e, i) => (
              <li key={e.key}>
                <HubCard e={e} stats={hub?.stats[e.id]} rank={i + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            <p>Nothing has been published or shared on the hub yet. The first project here gets everyone’s attention.</p>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} size="sm" render={<Link href="/new/project" />}>
                <PlusIcon aria-hidden /> Publish a project
              </Button>
              <Button nativeButton={false} size="sm" variant="secondary" render={<Link href="/share" />}>
                Share a link
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="font-sans text-sm font-medium tracking-normal text-muted-foreground">New in the forum</h3>
        {!threads ? (
          <Skeleton className="h-64 rounded-2xl" aria-busy="true" aria-label="Loading" />
        ) : threads.length ? (
          <ol className="glass flex flex-col divide-y divide-border overflow-hidden rounded-2xl">
            {threads.map((q) => (
              <li key={q.id} className="relative flex flex-col gap-1 p-4 transition-colors hover:bg-white/[0.03]">
                <Link href={`/forum/${q.id}`} lang={q.lang} className="text-[15px] leading-snug font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                  {q.title}
                </Link>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="text-ion">{getCategory(q.orbit)?.name ?? q.orbit}</span>
                  <span>{q.author?.name ?? (q.local ? "You" : "A member")}</span>
                  <TimeAgo date={q.createdAt} />
                  <span className="inline-flex items-center gap-1">
                    <MessageSquareIcon aria-hidden className="size-3" /> {q.answerCount}
                    <span className="sr-only">replies</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            <p>No threads yet. Ask the question you could not find answered anywhere else.</p>
            <Button nativeButton={false} size="sm" render={<Link href="/forum/new" />}>
              Start a thread
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
