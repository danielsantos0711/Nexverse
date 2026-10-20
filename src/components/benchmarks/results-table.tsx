"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Fragment, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from "lucide-react"
import { ReproBadge } from "@/components/benchmarks/bench-bits"
import { ReproPanel } from "@/components/benchmarks/repro-panel"
import { TimeAgo } from "@/components/live/time"
import { better, formatScore, reproSummary, type Benchmark, type BenchmarkResult, type Repro } from "@/lib/benchmarks"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

type SortKey = "score" | "model" | "date" | "repro"
const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "model", label: "Model" },
  { key: "repro", label: "Reproductions" },
  { key: "date", label: "Submitted" },
]

/**
 * Every result for one benchmark, sortable. Each row opens to its settings, logs and reproductions.
 * A table from tablet width up; a list of cards on a phone, with the same sort.
 */
export function ResultsTable({
  bench,
  results,
  onRepros,
  onDeleted,
}: {
  bench: Benchmark
  results: BenchmarkResult[]
  onRepros: (id: string, repros: Repro[]) => void
  onDeleted: (id: string) => void
}) {
  const reduce = useReducedMotion()
  const [sort, setSort] = useState<SortKey>("score")
  // "Best first" means highest or lowest, depending on the benchmark; flipping reverses whatever is chosen.
  const [flip, setFlip] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    const cmp: Record<SortKey, (a: BenchmarkResult, b: BenchmarkResult) => number> = {
      score: (a, b) => (better(bench, a.score, b.score) ? -1 : better(bench, b.score, a.score) ? 1 : 0),
      model: (a, b) => a.model.localeCompare(b.model) || (better(bench, a.score, b.score) ? -1 : 1),
      date: (a, b) => b.createdAt.localeCompare(a.createdAt),
      repro: (a, b) => {
        const sa = reproSummary(a)
        const sb = reproSummary(b)
        return Number(sb.verified) - Number(sa.verified) || sb.reproduced - sa.reproduced || sa.failed - sb.failed
      },
    }
    const sorted = [...results].sort(cmp[sort])
    return flip ? sorted.reverse() : sorted
  }, [results, sort, flip, bench])

  function choose(k: SortKey) {
    if (k === sort) setFlip((f) => !f)
    else {
      setSort(k)
      setFlip(false)
    }
  }

  const ariaSort = (k: SortKey) => (sort !== k ? undefined : flip ? "ascending" : "descending")
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id))

  const panel = (r: BenchmarkResult, where: "m" | "d") => (
    <AnimatePresence initial={false}>
      {open === r.id && (
        <motion.div
          key="panel"
          id={`result-${where}-${r.id}`}
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{
            duration: reduce ? 0.12 : 0.28,
            ease: [0.23, 1, 0.32, 1],
          }}
          className="overflow-hidden"
        >
          <div className="px-4 pt-1 pb-4">
            <ReproPanel
              result={r}
              onRepros={(p) => onRepros(r.id, p)}
              onDeleted={() => {
                setOpen(null)
                onDeleted(r.id)
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  const settings = (r: BenchmarkResult) => [r.shots !== null ? `${r.shots}-shot` : null, r.quantisation].filter(Boolean).join(" · ") || "—"

  return (
    <div className="flex flex-col gap-3">
      {/* Phone: a sort menu above the cards. */}
      <div className="flex items-center gap-2 md:hidden">
        <label htmlFor="result-sort" className="text-sm text-muted-foreground">
          <Copy k="benchmarks.results-table.sort-by">Sort by</Copy>
        </label>
        <select
          id="result-sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortKey)
            setFlip(false)
          }}
          className="h-9 rounded-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key} className="bg-popover">
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFlip((f) => !f)}
          aria-label={flip ? "Reverse order: on" : "Reverse order: off"}
          aria-pressed={flip}
          className="pressable grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {flip ? <ArrowUpIcon aria-hidden className="size-4" /> : <ArrowDownIcon aria-hidden className="size-4" />}
        </button>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card/40">
            <button
              type="button"
              onClick={() => toggle(r.id)}
              aria-expanded={open === r.id}
              aria-controls={`result-m-${r.id}`}
              className="flex w-full items-start gap-3 rounded-xl p-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{r.model}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {settings(r)} · {r.hardware || "hardware not given"}
                </span>
                <ReproBadge result={r} className="self-start" />
              </div>
              <span className="text-lg font-semibold tabular">{formatScore(bench, r.score)}</span>
              <ChevronDownIcon aria-hidden className={cn("mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform", open === r.id && "rotate-180")} />
            </button>
            {panel(r, "m")}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card/40 md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{bench.name} results. Column headers sort the table.</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortHeader k="model" label="Model" sort={sort} flip={flip} onSort={choose} ariaSort={ariaSort("model")} className="pl-4" />
              <SortHeader k="score" label={bench.metric[0].toUpperCase() + bench.metric.slice(1)} sort={sort} flip={flip} onSort={choose} ariaSort={ariaSort("score")} align="right" />
              <th scope="col" className="py-2.5 pr-3 font-medium">
                <Copy k="benchmarks.results-table.settings">Settings</Copy>
              </th>
              <th scope="col" className="hidden py-2.5 pr-3 font-medium lg:table-cell">
                <Copy k="benchmarks.results-table.hardware">Hardware</Copy>
              </th>
              <SortHeader k="repro" label="Reproduced" sort={sort} flip={flip} onSort={choose} ariaSort={ariaSort("repro")} />
              <SortHeader k="date" label="Submitted" sort={sort} flip={flip} onSort={choose} ariaSort={ariaSort("date")} />
              <th scope="col" className="w-10 py-2.5 pr-3">
                <span className="sr-only"><Copy k="benchmarks.results-table.details">Details</Copy></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className={cn("border-b border-border transition-colors hover:bg-white/[0.02]", open === r.id && "bg-white/[0.02]")}>
                  <td className="w-[30%] py-3 pr-3 pl-4">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="max-w-60 truncate font-medium">{r.model}</span>
                      {r.local && <span className="text-xs text-muted-foreground"><Copy k="benchmarks.results-table.this-browser">this browser</Copy></span>}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right text-base font-semibold tabular">{formatScore(bench, r.score)}</td>
                  <td className="max-w-40 truncate py-3 pr-3 text-muted-foreground" title={settings(r)}>
                    {settings(r)}
                  </td>
                  <td className="hidden max-w-44 truncate py-3 pr-3 text-muted-foreground lg:table-cell" title={r.hardware}>
                    {r.hardware || "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <ReproBadge result={r} compact />
                  </td>
                  <td className="py-3 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                    <TimeAgo date={r.createdAt} />
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      aria-expanded={open === r.id}
                      aria-controls={`result-d-${r.id}`}
                      aria-label={`${open === r.id ? "Hide" : "Show"} details and reproductions for ${r.model}`}
                      className="pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", open === r.id && "rotate-180")} />
                    </button>
                  </td>
                </tr>
                <tr className={cn(open === r.id ? "border-b border-border" : "")}>
                  <td colSpan={7} className="p-0">
                    {panel(r, "d")}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortHeader({
  k,
  label,
  sort,
  flip,
  onSort,
  ariaSort,
  align,
  className,
}: {
  k: SortKey
  label: string
  sort: SortKey
  flip: boolean
  onSort: (k: SortKey) => void
  ariaSort: "ascending" | "descending" | undefined
  align?: "right"
  className?: string
}) {
  const on = sort === k
  return (
    <th scope="col" aria-sort={ariaSort} className={cn("py-1.5 pr-3 font-medium", align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1 py-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          align === "right" && "flex-row-reverse",
          on && "text-foreground",
        )}
      >
        {label}
        <span aria-hidden className={cn("transition-opacity", on ? "opacity-100" : "opacity-0")}>
          {flip ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
        </span>
      </button>
    </th>
  )
}
