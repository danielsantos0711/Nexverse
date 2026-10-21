"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { BoxIcon, CheckIcon, CircleAlertIcon, DatabaseIcon, FileTextIcon, FolderGit2Icon, ImageIcon, Loader2Icon, NewspaperIcon, PlayIcon, ScanSearchIcon, SquareIcon, WrenchIcon, XIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine } from "@/components/admin/controls"
import { Segmented } from "@/components/trending/segmented"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { accessToken } from "@/lib/code/api"
import { compact } from "@/lib/data"
import type { MassCandidate, MassSource } from "@/lib/import/mass"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Icon = React.ComponentType<{ className?: string }>

const SOURCES: { id: MassSource; title: string; lead: string; from: string; icon: Icon; tone: string }[] = [
  { id: "hf-models", title: "Models", lead: "This week’s trending and most liked open models, with their cards, specs, config files and cover picture.", from: "Hugging Face", icon: BoxIcon, tone: "text-model" },
  { id: "or-models", title: "API models", lead: "The newest models served through API providers, with context length, pricing and endpoints.", from: "OpenRouter", icon: BoxIcon, tone: "text-model" },
  { id: "hf-datasets", title: "Datasets", lead: "Trending datasets with their cards, splits, columns, a sample file and a picture from the data.", from: "Hugging Face", icon: DatabaseIcon, tone: "text-dataset" },
  { id: "gh-repos", title: "Repos", lead: "Notable open-source AI repositories (3,000+ stars, pushed to this week), shared as links that open on Nexverse.", from: "GitHub", icon: FolderGit2Icon, tone: "text-repo" },
  { id: "gh-tools", title: "Tools", lead: "AI tools rising in the last 90 days: MCP servers, coding assistants, inference tools.", from: "GitHub", icon: WrenchIcon, tone: "text-tool" },
  { id: "papers", title: "Papers", lead: "The research papers the community upvoted most in recent days, with abstract and authors, linked to arXiv.", from: "arXiv", icon: FileTextIcon, tone: "text-gold" },
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
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
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
