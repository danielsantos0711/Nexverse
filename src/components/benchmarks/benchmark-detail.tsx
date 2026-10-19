"use client"

import { useEffect, useState } from "react"
import { GaugeIcon } from "lucide-react"
import { DotChart } from "@/components/benchmarks/dot-chart"
import { ResultsTable } from "@/components/benchmarks/results-table"
import { SubmitResult } from "@/components/benchmarks/submit-result"
import { Skeleton } from "@/components/ui/skeleton"
import { getBenchmark, listResults, reproSummary, type BenchmarkResult } from "@/lib/benchmarks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/** One benchmark: the dot plot of results by model, then the sortable table with reproductions. */
export function BenchmarkDetail({ slug }: { slug: string }) {
  const bench = getBenchmark(slug)!
  const { ready, user } = useSession()
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listResults({ benchmark: slug })
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
  }, [slug, ready, user?.id, attempt])

  const models = new Set(results.map((r) => r.model.toLowerCase())).size
  const verified = results.filter((r) => reproSummary(r).verified).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular" aria-live="polite">
          {results.length} {results.length === 1 ? "result" : "results"} · {models} {models === 1 ? "model" : "models"} · {verified} verified
          {!loaded && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-ion/60 align-middle" aria-label="Loading results" />}
        </p>
        <SubmitResult benchmark={slug} onSubmitted={(r) => setResults((list) => [r, ...list])} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Results could not be loaded ({error}).{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      {results.length ? (
        <>
          <section aria-label="Results by model" className="glass rounded-2xl p-4 md:p-5">
            <DotChart bench={bench} results={results} />
          </section>
          <section aria-label="All results" className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">All results</h2>
            <ResultsTable
              bench={bench}
              results={results}
              onRepros={(id, repros) => setResults((list) => list.map((r) => (r.id === id ? { ...r, repros } : r)))}
              onDeleted={(id) => setResults((list) => list.filter((r) => r.id !== id))}
            />
          </section>
        </>
      ) : !loaded ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : error ? null : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ion/30 bg-ion/[0.04] px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
            <GaugeIcon aria-hidden className="size-5" />
          </span>
          <p className="max-w-md text-sm text-muted-foreground">No results for {bench.name} yet. Run it on a model you use and submit the first one, with a link to your logs.</p>
          <SubmitResult benchmark={slug} onSubmitted={(r) => setResults((list) => [r, ...list])} />
        </div>
      )}
    </div>
  )
}
