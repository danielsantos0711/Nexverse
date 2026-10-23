"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { BoxIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon, DatabaseIcon, FileTextIcon, FolderGit2Icon, ImageIcon, Link2Icon, Loader2Icon, NewspaperIcon, PlayIcon, RefreshCwIcon, ScanSearchIcon, SquareIcon, WrenchIcon, XIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine } from "@/components/admin/controls"
import { Segmented } from "@/components/trending/segmented"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { accessToken } from "@/lib/code/api"
import { compact } from "@/lib/data"
import { formatBytes } from "@/lib/editor/media"
import type { Inspection, MassCandidate, MassSource } from "@/lib/import/mass"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Icon = React.ComponentType<{ className?: string }>

const SOURCES: { id: MassSource; title: string; lead: string; from: string; icon: Icon; tone: string }[] = [
  { id: "hf-models", title: "Models", lead: "This week’s trending and most liked open models, with their cards, parameters, files and sizes, numbers and cover picture.", from: "Hugging Face", icon: BoxIcon, tone: "text-model" },
  { id: "or-models", title: "API models", lead: "The newest models served through API providers, with context length, pricing and endpoints.", from: "OpenRouter", icon: BoxIcon, tone: "text-model" },
  { id: "hf-datasets", title: "Datasets", lead: "Trending datasets with their cards, splits, rows, columns, a preview of the first rows, files and a picture from the data.", from: "Hugging Face", icon: DatabaseIcon, tone: "text-dataset" },
  { id: "gh-repos", title: "Repos", lead: "Notable open-source AI repositories (3,000+ stars, pushed to this week) as full pages: README, languages, topics, latest release and files.", from: "GitHub", icon: FolderGit2Icon, tone: "text-repo" },
  { id: "gh-tools", title: "Tools", lead: "AI tools rising in the last 90 days (MCP servers, coding assistants, inference tools) as full pages with README and latest release.", from: "GitHub", icon: WrenchIcon, tone: "text-tool" },
  { id: "papers", title: "Papers", lead: "The research papers upvoted most in recent days, read from arXiv: abstract, every author, categories, dates and a figure.", from: "arXiv", icon: FileTextIcon, tone: "text-gold" },
]

const CAPS = [
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "25", label: "25" },
] as const
type Cap = (typeof CAPS)[number]["value"]

type Result = { status: "created" | "skipped" | "failed"; href?: string; note?: string }
type Run = { source: MassSource; candidates: MassCandidate[]; picked: Set<string>; results: Record<string, Result | "running">; running: boolean; done: boolean }

async function call<T>(path: string, body: unknown): Promise<T> {
  const token = await accessToken()
  if (!token) throw new Error("Sign in again to run imports.")
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `The server answered ${res.status}.`)
  return json.data
}

/**
 * Admin > Import: seed Nexverse with real, current items. Pick a source, preview what would be imported (a dry run
 * that marks what is already here), untick anything you do not want, then import with a live progress bar. Each
 * run is capped; the database caps 300 new items a day. Everything is logged in the moderation log.
 */
export function ImportAdmin() {
  const role = useRole()
  const reduce = useReducedMotion()
  const [source, setSource] = useState<MassSource>("hf-models")
  const [cap, setCap] = useState<Cap>("10")
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const stop = useRef(false)
  const [images, setImages] = useState<{ busy: boolean; text: string } | null>(null)
  const [refresh, setRefresh] = useState<{ busy: boolean; text: string } | null>(null)
  const [shares, setShares] = useState<{ busy: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, Inspection | { error: string } | "loading">>({})

  if (!live) return <Notice tone="warn" title="Imports need the database">This copy of the site has no database connected.</Notice>
  if (role.ready && !role.isAdmin) return <Notice tone="warn" title="Admins only">Mass imports write many items at once, so only admins can run them.</Notice>

  async function preview(id = source) {
    setSource(id)
    setLoading(true)
    setStatus(null)
    setRun(null)
    try {
      const data = await call<{ candidates: MassCandidate[] }>("/api/import/mass", { action: "preview", source: id, limit: Number(cap) })
      setRun({ source: id, candidates: data.candidates, picked: new Set(data.candidates.filter((c) => !c.exists).map((c) => c.ref)), results: {}, running: false, done: false })
      if (!data.candidates.length) setStatus({ ok: false, text: "The source returned nothing to import right now." })
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  async function start() {
    if (!run) return
    const todo = run.candidates.filter((c) => run.picked.has(c.ref) && !c.exists)
    if (!todo.length) return
    const runId = crypto.randomUUID()
    stop.current = false
    setRun({ ...run, running: true, results: {} })
    setStatus(null)
    await call("/api/import/mass", { action: "start", source: run.source, runId, count: todo.length }).catch(() => null)
    const tally = { created: 0, skipped: 0, failed: 0 }
    let halted = ""
    for (const c of todo) {
      if (stop.current) {
        halted = "Stopped by you."
        break
      }
      setRun((r) => (r ? { ...r, results: { ...r.results, [c.ref]: "running" } } : r))
      try {
        const res = await call<Result>("/api/import/mass", { action: "item", source: run.source, runId, ref: c.ref })
        tally[res.status]++
        setRun((r) => (r ? { ...r, results: { ...r.results, [c.ref]: res } } : r))
      } catch (e) {
        const note = (e as Error).message
        setRun((r) => (r ? { ...r, results: { ...r.results, [c.ref]: { status: "failed", note } } } : r))
        tally.failed++
        if (/capped|a day|admins/i.test(note)) {
          halted = note
          break
        }
      }
    }
    const summary = `${tally.created} imported, ${tally.skipped} already here, ${tally.failed} failed${halted ? `. ${halted}` : ""}`
    await call("/api/import/mass", { action: "finish", source: run.source, runId, note: summary }).catch(() => null)
    setRun((r) => (r ? { ...r, running: false, done: true } : r))
    setStatus({ ok: tally.failed === 0 && !halted, text: summary })
  }

  async function fetchImages() {
    setImages({ busy: true, text: "Looking for imported projects without a cover…" })
    let fixed = 0
    try {
      for (let round = 0; round < 20; round++) {
        const r = await call<{ done: { ok: boolean }[]; remaining: number }>("/api/import/images", { all: true })
        fixed += r.done.filter((d) => d.ok).length
        setImages({ busy: true, text: `${fixed} covers added, ${r.remaining} imported projects still without one…` })
        if (!r.remaining || !r.done.some((d) => d.ok)) {
          setImages({ busy: false, text: `${fixed} covers added. ${r.remaining ? `${r.remaining} imports have no picture at their source that Nexverse can use.` : "Every imported project has a cover."}` })
          return
        }
      }
      setImages({ busy: false, text: `${fixed} covers added. Run again for the rest.` })
    } catch (e) {
      setImages({ busy: false, text: (e as Error).message })
    }
  }

  async function inspect(c: MassCandidate) {
    if (open === c.ref) return setOpen(null)
    setOpen(c.ref)
    if (!run || details[c.ref]) return
    setDetails((d) => ({ ...d, [c.ref]: "loading" }))
    try {
      const data = await call<Inspection>("/api/import/mass", { action: "inspect", source: run.source, ref: c.ref })
      setDetails((d) => ({ ...d, [c.ref]: data }))
    } catch (e) {
      setDetails((d) => ({ ...d, [c.ref]: { error: (e as Error).message } }))
    }
  }

  async function refreshAll() {
    setRefresh({ busy: true, text: "Reading imported projects from their source again…" })
    let ok = 0
    let failed = 0
    let last = ""
    try {
      for (let round = 0; round < 40; round++) {
        const r = await call<{ done: { ok: boolean; note?: string }[]; remaining: number }>("/api/import/refresh", { all: true })
        ok += r.done.filter((d) => d.ok).length
        failed += r.done.filter((d) => !d.ok).length
        last = r.done.find((d) => !d.ok)?.note ?? last
        setRefresh({ busy: true, text: `${ok} refreshed${failed ? `, ${failed} failed` : ""}, ${r.remaining} still to read…` })
        if (!r.remaining || !r.done.some((d) => d.ok)) {
          setRefresh({ busy: false, text: `${ok} refreshed${failed ? `, ${failed} failed (${last})` : ""}. ${r.remaining ? `${r.remaining} left: run again later.` : "Every imported project is up to date."}` })
          return
        }
      }
      setRefresh({ busy: false, text: `${ok} refreshed. Run again for the rest.` })
    } catch (e) {
      setRefresh({ busy: false, text: (e as Error).message })
    }
  }

  async function convert() {
    setShares({ busy: true, text: "Turning shared links into pages…" })
    let ok = 0
    try {
      for (let round = 0; round < 20; round++) {
        const r = await call<{ done: { ok: boolean; note?: string }[]; remaining: number }>("/api/import/refresh", { shares: true })
        ok += r.done.filter((d) => d.ok).length
        if (!r.remaining || !r.done.some((d) => d.ok)) {
          const note = r.done.find((d) => !d.ok)?.note
          setShares({ busy: false, text: `${ok} links turned into pages.${r.remaining ? ` ${r.remaining} left${note ? ` (${note})` : ""}.` : " None left."}` })
          return
        }
        setShares({ busy: true, text: `${ok} turned into pages, ${r.remaining} left…` })
      }
      setShares({ busy: false, text: `${ok} turned into pages. Run again for the rest.` })
    } catch (e) {
      setShares({ busy: false, text: (e as Error).message })
    }
  }

  const meta = SOURCES.find((s) => s.id === source)!
  const todo = run ? run.candidates.filter((c) => run.picked.has(c.ref) && !c.exists) : []
  const finished = run ? Object.values(run.results).filter((r) => r !== "running").length : 0
  const progress = todo.length ? finished / todo.length : 0

  return (
    <div className="flex flex-col gap-8">
      <AdminHeading title="Import" lead="Give Nexverse a solid base of real, current content. Every item is a normal Nexverse page owned by you, with an “imported from” credit and its cover picture copied into Nexverse storage. Nothing is invented: numbers on the site come only from activity here.">
        <Segmented label="Items per run" size="sm" value={cap} onChange={setCap} options={CAPS.map((c) => ({ value: c.value, label: `${c.label} a run` }))} />
      </AdminHeading>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOURCES.map((s) => {
          const on = run?.source === s.id || (loading && source === s.id)
          return (
            <li key={s.id}>
              <motion.div whileHover={reduce ? undefined : { y: -2 }} transition={{ duration: 0.2 }} className={cn("flex h-full flex-col gap-3 rounded-2xl border bg-card/70 p-4 transition-colors", on ? "border-ion/40 bg-ion/[0.05]" : "border-border")}>
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/[0.05] ring-1 ring-white/10">
                    <s.icon className={cn("size-4", s.tone)} />
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground">from {s.from}</span>
                  </div>
                </div>
                <p className="text-[13px] text-muted-foreground">{s.lead}</p>
                <Button size="sm" variant={on ? "default" : "secondary"} className="mt-auto self-start" disabled={loading || run?.running} onClick={() => void preview(s.id)}>
                  {loading && source === s.id ? <Loader2Icon aria-hidden className="animate-spin" /> : <ScanSearchIcon aria-hidden />} Preview {cap}
                </Button>
              </motion.div>
            </li>
          )
        })}
        <li>
          <div className="flex h-full flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-white/[0.05] ring-1 ring-white/10">
                <NewspaperIcon className="size-4 text-gold" />
              </span>
              <span className="font-medium">News</span>
            </div>
            <p className="text-[13px] text-muted-foreground">The newsroom fills the news itself, from sourced, checked stories. Its backfill lives with the newsroom.</p>
            <Button nativeButton={false} size="sm" variant="secondary" className="mt-auto self-start" render={<Link href="/admin/newsroom" />}>
              Open the newsroom
            </Button>
          </div>
        </li>
      </ul>

      <StatusLine status={status} />

      {loading && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading the preview">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14 rounded-xl" />
          ))}
        </div>
      )}

      {run && run.candidates.length > 0 && (
        <section aria-labelledby="run-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 id="run-h" className="font-medium">
                {meta.title} from {meta.from}: {todo.length} to import
              </h3>
              <p className="text-xs text-muted-foreground">Dry run: nothing has been written. Items already on Nexverse are skipped. Untick what you do not want.</p>
            </div>
            <div className="flex gap-2">
              {run.running ? (
                <Button size="sm" variant="secondary" onClick={() => (stop.current = true)}>
                  <SquareIcon aria-hidden /> Stop
                </Button>
              ) : (
                <Button size="sm" disabled={!todo.length || run.done} onClick={() => void start()}>
                  <PlayIcon aria-hidden /> Import {todo.length}
                </Button>
              )}
            </div>
          </div>

          {(run.running || run.done) && (
            <div className="flex items-center gap-3" aria-label="Progress">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={todo.length} aria-valuenow={finished}>
                <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-ion via-repo to-gold" animate={{ scaleX: progress }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} />
              </div>
              <span className="text-xs text-muted-foreground tabular">
                {finished} / {todo.length}
              </span>
            </div>
          )}

          <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60">
            <AnimatePresence initial={false}>
              {run.candidates.map((c, n) => {
                const r = run.results[c.ref]
                const picked = run.picked.has(c.ref)
                return (
                  <motion.li
                    key={c.ref}
                    initial={reduce ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: c.exists ? 0.55 : 1, x: 0 }}
                    transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(n, 12) * 0.02 }}
                    className="flex flex-col"
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Import ${c.name}`}
                      checked={picked && !c.exists}
                      disabled={c.exists || run.running || run.done}
                      onChange={() =>
                        setRun((x) => {
                          if (!x) return x
                          const next = new Set(x.picked)
                          if (next.has(c.ref)) next.delete(c.ref)
                          else next.add(c.ref)
                          return { ...x, picked: next }
                        })
                      }
                      className="size-4 shrink-0 accent-[var(--color-ion)]"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">{c.ref}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{c.summary || "No description at the source."}</span>
                    </div>
                    <span className="hidden shrink-0 gap-2.5 text-xs text-muted-foreground tabular md:flex">
                      {c.metrics.slice(0, 2).map((m) => (
                        <span key={m.label}>
                          {compact(m.value)} {m.label}
                        </span>
                      ))}
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs">
                      {c.exists ? (
                        <span className="text-muted-foreground">Already here</span>
                      ) : r === "running" ? (
                        <Loader2Icon aria-label="Importing" className="ml-auto size-4 animate-spin text-ion" />
                      ) : r?.status === "created" ? (
                        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1 text-ok">
                          <CheckIcon aria-hidden className="size-3.5" />
                          {r.href ? (
                            <Link href={r.href as `/p/${string}`} className="hover:underline">
                              Open
                            </Link>
                          ) : (
                            "Done"
                          )}
                        </motion.span>
                      ) : r?.status === "skipped" ? (
                        <span className="text-muted-foreground" title={r.note}>
                          Skipped
                        </span>
                      ) : r?.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 text-destructive" title={r.note}>
                          <CircleAlertIcon aria-hidden className="size-3.5" /> Failed
                        </span>
                      ) : picked ? (
                        <span className="text-muted-foreground">Ready</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <XIcon aria-hidden className="size-3" /> Left out
                        </span>
                      )}
                    </span>
                    <button type="button" aria-expanded={open === c.ref} aria-label={`Details of ${c.name}`} onClick={() => void inspect(c)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
                      <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", open === c.ref && "rotate-180")} />
                    </button>
                    </div>
                    {open === c.ref && <InspectPanel value={details[c.ref]} />}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
          {Object.values(run.results).some((r) => r !== "running" && r.status === "failed") && (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {run.candidates.map((c) => {
                const r = run.results[c.ref]
                return r && r !== "running" && r.status === "failed" ? (
                  <li key={c.ref}>
                    <span className="font-mono">{c.ref}</span>: {r.note}
                  </li>
                ) : null
              })}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <AdminHeading title="Refresh details" lead="Reads every imported project from its source again and fills what is thin: the full README, numbers, dates, files and sizes, latest release, languages, dataset preview, tags and licence. Text you edited by hand is kept.">
          <Button size="sm" variant="secondary" disabled={refresh?.busy} onClick={() => void refreshAll()}>
            {refresh?.busy ? <Loader2Icon aria-hidden className="animate-spin" /> : <RefreshCwIcon aria-hidden />} Refresh details
          </Button>
        </AdminHeading>
        {refresh && (
          <p role="status" className="text-sm text-muted-foreground">
            {refresh.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <AdminHeading title="Shared links into pages" lead="Earlier imports shared GitHub repositories and tools as bare links. This turns each one into a full project page and removes the old link.">
          <Button size="sm" variant="secondary" disabled={shares?.busy} onClick={() => void convert()}>
            {shares?.busy ? <Loader2Icon aria-hidden className="animate-spin" /> : <Link2Icon aria-hidden />} Turn links into pages
          </Button>
        </AdminHeading>
        {shares && (
          <p role="status" className="text-sm text-muted-foreground">
            {shares.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <AdminHeading title="Covers for earlier imports" lead="Projects imported before covers were copied, or whose picture failed, get one now: the card’s thumbnail, the first real picture in its README, a sample from the data or the organisation’s avatar, copied into Nexverse storage with a credit.">
          <Button size="sm" variant="secondary" disabled={images?.busy} onClick={() => void fetchImages()}>
            {images?.busy ? <Loader2Icon aria-hidden className="animate-spin" /> : <ImageIcon aria-hidden />} Fetch missing covers
          </Button>
        </AdminHeading>
        {images && (
          <p role="status" className="text-sm text-muted-foreground">
            {images.text}
          </p>
        )}
      </section>
    </div>
  )
}

/** What one candidate's page would hold, read from the source without writing anything. */
function InspectPanel({ value }: { value: Inspection | { error: string } | "loading" | undefined }) {
  if (!value || value === "loading")
    return (
      <p className="flex items-center gap-2 px-10 pb-3 text-xs text-muted-foreground">
        <Loader2Icon aria-hidden className="size-3.5 animate-spin" /> Reading the source…
      </p>
    )
  if ("error" in value) return <p className="px-10 pb-3 text-xs text-destructive">{value.error}</p>
  const f = value.imported
  const rows: [string, string][] = [
    ["Licence", value.license],
    ["Tags", value.tags.join(", ") || "none"],
    ["README", value.readmeChars ? `${value.readmeChars.toLocaleString("en")} characters` : "none at the source"],
    ["Cover pictures found", String(value.covers)],
    ...value.facts.map((x): [string, string] => [x.label, x.value]),
  ]
  if (f) {
    const nums = [f.stars !== undefined && `${compact(f.stars)} stars`, f.downloads !== undefined && `${compact(f.downloads)} downloads`, f.likes !== undefined && `${compact(f.likes)} likes`].filter(Boolean)
    if (nums.length) rows.push(["Numbers at the source", nums.join(", ")])
    if (f.fileCount) rows.push(["Files", `${f.fileCount.toLocaleString("en")}${f.totalBytes ? `, ${formatBytes(f.totalBytes)}` : ""}`])
    if (f.languages?.length) rows.push(["Languages", f.languages.slice(0, 4).map((l) => `${l.name} ${l.share}%`).join(", ")])
    if (f.release) rows.push(["Latest release", f.release.tag])
    if (f.sample) rows.push(["Preview", `${f.sample.rows.length} rows of ${f.sample.columns.join(", ")}`])
    if (f.createdAt) rows.push(["Created", f.createdAt.slice(0, 10)])
    if (f.updatedAt) rows.push(["Updated", f.updatedAt.slice(0, 10)])
  }
  return (
    <div className="flex flex-col gap-2 px-3 pb-3 sm:px-10">
      <p className="text-xs text-muted-foreground">{value.summary}</p>
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
