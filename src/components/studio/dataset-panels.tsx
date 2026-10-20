"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, DatabaseIcon, LockIcon, SearchIcon, TableIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { formatBytes } from "@/lib/editor/media"
import { cellText, formatOf, parseTable, splitOf, type ColumnStats, type Table } from "@/lib/publish/dataset"
import { readFileText, type HostedFile } from "@/lib/publish/files"
import type { DatasetSpecs, Project } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

/*
 * The dataset page's own parts: the facts column (size, rows, splits, columns, formats) and the viewer, a
 * paginated, searchable table of an uploaded CSV, TSV, JSON or JSON Lines file with each column's type and simple
 * stats. Files are read through the same signed links as downloads, so the viewer needs a signed-in member.
 */

const PAGE = 25
const READ_MAX = 20 * 1024 * 1024

export const dataFiles = (files: HostedFile[]) => files.filter((f) => formatOf(f.name))

/** Splits from the specs (imports) or from file names (train.csv, test.jsonl…). */
export function splitsOf(spec: DatasetSpecs | undefined, files: HostedFile[]) {
  if (spec?.splits?.length) return spec.splits.map((s) => ({ name: s.name, rows: s.rows, bytes: s.bytes, files: files.filter((f) => splitOf(f.name) === s.name).length }))
  const by = new Map<string, { rows?: number; bytes: number; files: number }>()
  for (const f of dataFiles(files)) {
    const s = splitOf(f.name) ?? "default"
    const x = by.get(s) ?? { bytes: 0, files: 0 }
    by.set(s, { bytes: x.bytes + f.size, files: x.files + 1 })
  }
  return [...by.entries()].map(([name, v]) => ({ name, ...v }))
}

export function DatasetFacts({ p, files }: { p: Project; files: HostedFile[] }) {
  const d = p.specs?.dataset ?? {}
  const splits = splitsOf(d, files)
  const bytes = d.bytes ?? (files.length ? files.reduce((n, f) => n + f.size, 0) : undefined)
  const formats = d.formats?.length ? d.formats : [...new Set(dataFiles(files).map((f) => formatOf(f.name)!))]
  const downloads = files.reduce((n, f) => n + f.downloads, 0)
  const rows: [string, React.ReactNode][] = (
    [
      ["Rows", d.rows !== undefined ? d.rows.toLocaleString("en") : null],
      ["Size", bytes ? formatBytes(bytes) : null],
      ["Size class", d.sizeCategory],
      ["Formats", formats.length ? formats.join(", ") : null],
      ["Modalities", d.modalities?.join(", ")],
      ["Tasks", d.tasks?.map((t) => t.replace(/-/g, " ")).join(", ")],
      ["Downloads", files.length ? downloads.toLocaleString("en") : null],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v !== null && v !== undefined && v !== "")
  return (
    <section aria-label="Dataset facts" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      {rows.length > 0 && (
        <dl className="flex flex-col divide-y divide-border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {splits.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Splits</span>
          <ul className="flex flex-col gap-1.5">
            {splits.map((s) => {
              const total = splits.reduce((n, x) => n + (x.rows ?? x.bytes ?? 0), 0) || 1
              const share = (s.rows ?? s.bytes ?? 0) / total
              return (
                <li key={s.name} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-mono text-xs">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{s.rows !== undefined ? `${compact(s.rows)} rows` : s.bytes ? formatBytes(s.bytes) : ""}</span>
                  </span>
                  <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full origin-left rounded-full bg-[var(--project-accent,#8fb4ff)]" style={{ transform: `scaleX(${Math.max(share, 0.02)})` }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {d.features?.length ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Columns</span>
          <ul className="flex flex-col gap-1">
            {d.features.slice(0, 20).map((f) => (
              <li key={f.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-mono text-xs">{f.name}</span>
                <span className="truncate text-xs text-muted-foreground">{f.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

const TYPE_TONE: Record<string, string> = {
  string: "text-[#8fb4ff]",
  integer: "text-[#f3d58a]",
  float: "text-[#f3d58a]",
  boolean: "text-[#7fe0b0]",
  date: "text-[#b9a7ff]",
  list: "text-[#ff8fa8]",
  object: "text-[#ff8fa8]",
  empty: "text-muted-foreground",
}

function Bars({ bins }: { bins: number[] }) {
  const max = Math.max(1, ...bins)
  return (
    <span aria-hidden className="flex h-5 items-end gap-px">
      {bins.map((b, i) => (
        <span key={i} className="w-1.5 rounded-t-sm bg-[var(--project-accent,#8fb4ff)]/70" style={{ height: `${Math.max(8, (b / max) * 100)}%` }} />
      ))}
    </span>
  )
}

function ColumnHead({ s }: { s: ColumnStats }) {
  const num = s.min !== undefined
  return (
    <th scope="col" className="min-w-40 border-r border-border px-3 py-2 text-left align-top font-normal last:border-r-0">
      <span className="block truncate font-mono text-[13px] font-medium text-foreground">{s.name}</span>
      <span className={cn("text-[11px]", TYPE_TONE[s.type])}>{s.type}</span>
      <span className="mt-1.5 flex items-end justify-between gap-2">
        {s.bins.length ? <Bars bins={s.bins} /> : <span />}
        <span className="text-right text-[10px] leading-tight text-muted-foreground tabular">
          {num ? (
            <>
              {compact(s.min!)}–{compact(s.max!)}
            </>
          ) : s.maxLength !== undefined ? (
            <>
              {s.minLength}–{s.maxLength} chars
            </>
          ) : (
            <>{s.unique.toLocaleString("en")} values</>
          )}
          {s.nulls > 0 && <span className="block">{s.nulls.toLocaleString("en")} empty</span>}
        </span>
      </span>
    </th>
  )
}

export function DatasetViewer({ p, files }: { p: Project; files: HostedFile[] }) {
  const { user, ready } = useSession()
  const path = usePathname()
  const reduce = useReducedMotion()
  const list = useMemo(() => dataFiles(files), [files])
  const [fileId, setFileId] = useState(list[0]?.id ?? null)
  const [table, setTable] = useState<{ id: string; t: Table | null; error: string; truncated: boolean } | null>(null)
  const [q, setQ] = useState("")
  const dq = useDeferredValue(q)
  const [page, setPage] = useState(0)
  const file = list.find((f) => f.id === fileId) ?? list[0]
  const fmt = file ? formatOf(file.name) : null

  useEffect(() => {
    if (!file || !user || fmt === "parquet" || !fmt) return
    let stale = false
    readFileText(file, READ_MAX)
      .then(({ text, truncated }) => {
        if (stale) return
        setTable({ id: file.id, t: parseTable(text, fmt, truncated), error: "", truncated })
        setPage(0)
      })
      .catch((e: Error) => !stale && setTable({ id: file.id, t: null, error: e.message, truncated: false }))
    return () => {
      stale = true
    }
  }, [file, fmt, user])

  const t = table?.id === file?.id ? table?.t : null
  const rows = useMemo(() => {
    if (!t) return []
    const words = dq.trim().toLowerCase()
    if (!words) return t.rows
    return t.rows.filter((r) => r.some((c) => cellText(c).toLowerCase().includes(words)))
  }, [t, dq])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const at = Math.min(page, pages - 1)
  const shown = rows.slice(at * PAGE, at * PAGE + PAGE)

  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <TableIcon aria-hidden className="size-6 text-ion" />
        <p className="font-medium">
          <Copy k="project.viewer.empty.title">No data files to preview yet</Copy>
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          <Copy k="project.viewer.empty.body">Upload a CSV, TSV, JSON or JSON Lines file under Files and versions and it opens here as a table, with column types and stats.</Copy>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="File">
          {list.map((f) => {
            const split = splitOf(f.name)
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === file?.id}
                onClick={() => {
                  setFileId(f.id)
                  setQ("")
                }}
                className={cn(
                  "pressable inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  f.id === file?.id ? "border-[var(--project-accent,#8fb4ff)]/50 bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {split && <span className="rounded bg-white/10 px-1 font-mono text-[10px]">{split}</span>}
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
              </button>
            )
          })}
        </div>
        {t && (
          <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-full border border-border bg-background/50 px-3 text-sm focus-within:ring-2 focus-within:ring-ring sm:w-64">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="sr-only">Search rows</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
              placeholder="Search rows"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        )}
      </div>

      {fmt === "parquet" ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Copy k="project.viewer.parquet">Parquet files cannot be previewed here yet. Download it, or add a CSV or JSON Lines copy to see it as a table.</Copy>
        </p>
      ) : !user && ready ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ion/25 bg-ion/[0.07] p-4 text-sm">
          <LockIcon aria-hidden className="size-4 text-ion" />
          <p className="min-w-0 flex-1">
            <Copy k="project.viewer.signin">Sign in to preview the data. Files open for members, like downloads.</Copy>
          </p>
          <Button size="sm" nativeButton={false} render={<Link href={`/sign-in?next=${encodeURIComponent(path)}` as "/sign-in"} />}>
            Sign in to preview
          </Button>
        </div>
      ) : table?.error && table.id === file?.id ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {table.error}
        </p>
      ) : !t ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          {(t.problems.length > 0 || t.truncated) && (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t.truncated && <li>Showing the first {formatBytes(Math.min(file!.size, READ_MAX))} of this file ({t.rows.length.toLocaleString("en")} rows). Download it for the rest.</li>}
              {t.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="max-h-[36rem] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card">
                  <tr>
                    <th scope="col" className="w-12 border-r border-border px-2 py-2 text-right text-[11px] font-normal text-muted-foreground">
                      #
                    </th>
                    {t.stats.map((s) => (
                      <ColumnHead key={s.name} s={s} />
                    ))}
                  </tr>
                </thead>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.tbody
                    key={`${file?.id}-${at}-${dq}`}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {shown.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                        <td className="border-r border-border px-2 py-1.5 text-right align-top text-[11px] text-muted-foreground tabular">{at * PAGE + i + 1}</td>
                        {r.map((c, j) => (
                          <td key={j} className="max-w-[28rem] border-r border-border px-3 py-1.5 align-top last:border-r-0">
                            <span className={cn("line-clamp-3 break-words", c === null && "text-muted-foreground/60 italic", typeof c === "number" && "tabular")}>{c === null ? "empty" : cellText(c)}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!shown.length && (
                      <tr>
                        <td colSpan={t.columns.length + 1} className="px-4 py-10 text-center text-muted-foreground">
                          No rows match “{dq}”.
                        </td>
                      </tr>
                    )}
                  </motion.tbody>
                </AnimatePresence>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <DatabaseIcon aria-hidden className="size-3.5" />
              <span className="tabular">
                {rows.length.toLocaleString("en")} {dq ? "matching " : ""}rows · {t.columns.length} columns
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
                  <ChevronLeftIcon aria-hidden />
                </Button>
                <span className="tabular">
                  {at + 1} / {pages}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
                  <ChevronRightIcon aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {p.source && <p className="text-xs text-muted-foreground">Imported datasets carry a sample of their first rows; the full data stays where it was published.</p>}
    </div>
  )
}
