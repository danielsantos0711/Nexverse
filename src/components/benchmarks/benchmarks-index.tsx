"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, GaugeIcon } from "lucide-react"
import { ReproBadge } from "@/components/benchmarks/bench-bits"
import { SubmitResult } from "@/components/benchmarks/submit-result"
import { rise, riseDelay } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { better, formatScore, getBenchmark, listResults, reproSummary, type BenchmarkResult } from "@/lib/benchmarks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { Copy } from "@/components/content/copy"
import { useBenchmarks } from "@/lib/lists/hooks"

/** Every curated benchmark with its leader and how many results it has, then the latest submissions. */
export function BenchmarksIndex() {
  const BENCHMARKS = useBenchmarks()
  const { ready, user } = useSession()
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listResults()
      .then((r) => {
        if (stale) return
        setResults(r)
        setError("")
      })
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoaded(true))
    return () => {
      stale = true
    }
  }, [ready, user?.id, attempt])

  const stats = useMemo(() => {
    const out: Record<string, { n: number; verified: number; best: BenchmarkResult | null }> = {}
    for (const b of BENCHMARKS) out[b.slug] = { n: 0, verified: 0, best: null }
    for (const r of results) {
      const s = out[r.benchmark]
      const b = getBenchmark(r.benchmark)
      if (!s || !b) continue
      s.n++
      if (reproSummary(r).verified) s.verified++
      if (!s.best || better(b, r.score, s.best.score)) s.best = r
    }
    return out
  }, [results, BENCHMARKS])

  const recent = useMemo(() => [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [results])

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Results could not be loaded ({error}).{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline underline-offset-2">
            <Copy k="benchmarks.benchmarks-index.try-again">Try again</Copy>
          </button>
        </p>
      )}

      <section aria-labelledby="bench-list" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="bench-list" className="text-base font-semibold">
            <Copy k="benchmarks.benchmarks-index.benchmarks">Benchmarks</Copy>
          </h2>
          <SubmitResult onSubmitted={(r) => setResults((list) => [r, ...list])} />
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENCHMARKS.map((b, i) => {
            const s = stats[b.slug]
            return (
              <li key={b.slug} className={rise} style={riseDelay(i)}>
                <article className="group relative flex h-full flex-col gap-2 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{b.area}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {b.higherIsBetter ? <ArrowUpIcon aria-hidden className="size-3" /> : <ArrowDownIcon aria-hidden className="size-3" />}
                      {b.metric}
                      <span className="sr-only">, {b.higherIsBetter ? "higher" : "lower"} is better</span>
                    </span>
                  </div>
                  <h3 className="font-sans text-[15px] font-semibold tracking-normal">
                    <Link
                      href={`/benchmarks/${b.slug}`}
                      className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
                    >
                      {b.name}
                    </Link>
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-2.5">
                    {s.best ? (
                      <span className="min-w-0 text-xs">
                        <span className="block text-muted-foreground"><Copy k="benchmarks.benchmarks-index.best-so-far">Best so far</Copy></span>
                        <span className="block truncate">
                          {s.best.model} <span className="font-semibold tabular">{formatScore(b, s.best.score)}</span>
                        </span>
                      </span>
                    ) : !loaded ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <span className="text-xs text-muted-foreground"><Copy k="benchmarks.benchmarks-index.no-results-yet">No results yet</Copy></span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground tabular">
                      {s.n} {s.n === 1 ? "result" : "results"}
                      {s.verified > 0 && ` · ${s.verified} verified`}
                    </span>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="bench-recent" className="flex flex-col gap-3">
        <h2 id="bench-recent" className="text-base font-semibold">
          <Copy k="benchmarks.benchmarks-index.latest-results">Latest results</Copy>
        </h2>
        {!loaded ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ion/30 bg-ion/[0.04] px-6 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <GaugeIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              {live
                ? <Copy k="benchmarks.benchmarks-index.no-results-submitted-yet-run" multiline>No results submitted yet. Run one of these benchmarks on a model you use, then submit the score with your settings and a link to the logs.</Copy>
                : <Copy k="benchmarks.benchmarks-index.results-you-submit-in-this" multiline>Results you submit in this browser show up here. This copy of Nexverse is not connected to its database, so nobody else can see or reproduce them.</Copy>}
            </p>
            <SubmitResult onSubmitted={(r) => setResults((list) => [r, ...list])} />
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/40">
            {recent.map((r) => {
              const b = getBenchmark(r.benchmark)!
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <Link href={`/benchmarks/${b.slug}`} className="min-w-0 flex-1 truncate hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="font-medium">{r.model}</span> <span className="text-muted-foreground">on {b.name}</span>
                  </Link>
                  <span className="font-semibold tabular">{formatScore(b, r.score)}</span>
                  <ReproBadge result={r} compact />
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">
                    {r.author.name} · <TimeAgo date={r.createdAt} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
