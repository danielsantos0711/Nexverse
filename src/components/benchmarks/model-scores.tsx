"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { GaugeIcon, SwordsIcon } from "lucide-react"
import { Sparkline } from "@/components/arena/arena-bits"
import { ReproBadge } from "@/components/benchmarks/bench-bits"
import { Skeleton } from "@/components/ui/skeleton"
import { confidence, getModelRating, type Rating, type RatingSource } from "@/lib/arena"
import { BENCHMARKS, better, formatScore, getBenchmark, listResults, type BenchmarkResult } from "@/lib/benchmarks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

type Arena = {
  rating: Rating | null
  rank: number
  of: number
  source: RatingSource
}

/**
 * A model's community scores, for its hub page: its arena rating (rank, votes, trend) and its best result on
 * each benchmark, with whether members reproduced it. Matched by the model's hub slug.
 */
export function ModelScores({ slug, className }: { slug: string; className?: string }) {
  const { ready, user } = useSession()
  const [arena, setArena] = useState<Arena | null>(null)
  const [results, setResults] = useState<BenchmarkResult[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getModelRating(slug)
      .then((a) => !stale && setArena(a))
      .catch((e: Error) => !stale && setError(e.message))
    listResults({ modelSlug: slug })
      .then((r) => !stale && setResults(r))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [slug, ready, user?.id])

  // The best result per benchmark, in the curated order.
  const best = useMemo(() => {
    const out: { slug: string; result: BenchmarkResult; count: number }[] = []
    for (const b of BENCHMARKS) {
      const list = (results ?? []).filter((r) => r.benchmark === b.slug)
      if (!list.length) continue
      out.push({
        slug: b.slug,
        count: list.length,
        result: list.reduce((x, y) => (better(b, y.score, x.score) ? y : x)),
      })
    }
    return out
  }, [results])

  const loading = !arena || !results
  const r = arena?.rating

  return (
    <section aria-labelledby={`scores-${slug}`} className={cn("glass flex flex-col gap-4 rounded-2xl p-4 md:p-5", className)}>
      <h2 id={`scores-${slug}`} className="text-base font-semibold">
        Community scores
      </h2>
      {error && <p className="text-sm text-destructive">Scores could not be loaded ({error}).</p>}
      {loading && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading scores">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card/40 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ion/10 text-ion">
              <SwordsIcon aria-hidden className="size-4" />
            </span>
            {r ? (
              <>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    <Copy k="benchmark.model-scores.arena-rating">Arena rating</Copy>
                  </span>
                  <span className="text-xl font-semibold">{r.rating}</span>
                </div>
                <div className="flex flex-col text-xs text-muted-foreground">
                  <span>
                    #{arena!.rank} of {arena!.of} models
                  </span>
                  <span className="tabular">
                    {r.votes} votes · {confidence(r.votes).label.toLowerCase()} confidence
                  </span>
                </div>
                <Sparkline values={r.history} width={96} height={28} />
                <Link href="/arena/ratings" className="ml-auto text-sm text-ion underline-offset-4 hover:underline">
                  <Copy k="benchmark.model-scores.all-ratings">All ratings</Copy>
                </Link>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm text-muted-foreground"><Copy k="benchmark.model-scores.not-in-the-arena-yet">Not in the arena yet. Put it in a blind duel against another model.</Copy></p>
                <Link href="/arena/new" className="text-sm text-ion underline-offset-4 hover:underline">
                  <Copy k="benchmark.model-scores.post-a-duel">Post a duel</Copy>
                </Link>
              </>
            )}
          </div>

          {best.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {best.map(({ slug: bs, result, count }) => {
                const b = getBenchmark(bs)!
                return (
                  <li key={bs}>
                    <Link
                      href={`/benchmarks/${bs}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-3.5 py-3 transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1.5 text-sm font-medium">{b.name} </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {b.metric}
                          {result.quantisation && ` · ${result.quantisation}`}
                          {count > 1 && ` · best of ${count}`}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="font-semibold tabular">{formatScore(b, result.score)}</span>
                        <ReproBadge result={result} compact />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3.5 text-sm">
              <GaugeIcon aria-hidden className="size-4 text-muted-foreground" />
              <span className="flex-1 text-muted-foreground"><Copy k="benchmark.model-scores.no-benchmark-results-for-this">No benchmark results for this model yet.</Copy></span>
              <Link href="/benchmarks" className="text-ion underline-offset-4 hover:underline">
                <Copy k="benchmark.model-scores.submit-one">Submit one</Copy>
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}
