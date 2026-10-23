"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckIcon, CircleAlertIcon, ExternalLinkIcon, Loader2Icon, PenLineIcon, RadarIcon, SearchIcon, XIcon } from "lucide-react"
import { Notice, StatusLine, when } from "@/components/admin/controls"
import { engineCall } from "@/components/admin/newsroom-control-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { EngineState } from "@/lib/newsroom/engine/state"
import { SCAN_KINDS, SCAN_WINDOWS, type ScanKind, type SourceReport, type StoredFinding } from "@/lib/newsroom/scan-shared"
import { cn } from "@/lib/utils"

/*
 * The newsroom's scan: pick a window (24 hours to 90 days), ask every source what is new in it, and see what
 * came back, best first, with its source and date. Each finding can be researched into a story or set aside.
 * "Write stories" runs the same scan inside the engine and lets the triage keep the best per desk.
 */

type ScanAnswer = { hours: number; since: string; ms: number; stored: number; sources: SourceReport[]; notes: string[]; findings: StoredFinding[] }

const KIND_LABEL = Object.fromEntries(SCAN_KINDS.map((k) => [k.id, k.label])) as Record<ScanKind, string>

function windowLabel(hours: number) {
  return SCAN_WINDOWS.find((w) => w.hours === hours)?.label ?? `${hours} h`
}

export function ScanPanel({ state, onChanged }: { state: EngineState; onChanged: () => void }) {
  const [hours, setHours] = useState<number>(24)
  const [findings, setFindings] = useState<StoredFinding[] | null>(null)
  const [report, setReport] = useState<Omit<ScanAnswer, "findings"> | null>(null)
  const [busy, setBusy] = useState<"scan" | "load" | "write" | null>(null)
  const [rowBusy, setRowBusy] = useState<number | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [kind, setKind] = useState<ScanKind | "all">("all")
  const [q, setQ] = useState("")
  const [perDesk, setPerDesk] = useState(2)
  const desks = useMemo(() => new Map(state.desks.map((d) => [d.id, d.label])), [state.desks])
  const aiReady = state.keys.free.length > 0 || Object.values(state.keys.premium).some(Boolean)

  const load = useCallback(async (h: number) => {
    setBusy("load")
    try {
      const r = await engineCall<{ findings: StoredFinding[] }>({ action: "findings", hours: h })
      setFindings(r.findings)
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not load the findings." })
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void load(hours), 0)
    return () => window.clearTimeout(t)
  }, [hours, load])

  async function runScan() {
    setBusy("scan")
    setStatus(null)
    try {
      const r = await engineCall<ScanAnswer>({ action: "scan", hours })
      const { findings: list, ...rest } = r
      setFindings(list)
      setReport(rest)
      const failed = r.sources.filter((s) => !s.ok).length
      setStatus({ ok: true, text: `Scanned the last ${windowLabel(hours)} in ${Math.round(r.ms / 1000)} s: ${r.stored} new findings${failed ? `, ${failed} source${failed === 1 ? "" : "s"} did not answer` : ""}.` })
      onChanged()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "The scan did not finish." })
    } finally {
      setBusy(null)
    }
  }

  async function writeStories() {
    setBusy("write")
    setStatus(null)
    try {
      await engineCall({ action: "backfill", hours, perDesk })
      setStatus({ ok: true, text: `Started: the engine scans the last ${windowLabel(hours)}, keeps the best findings and writes up to ${perDesk} per desk. Follow it in Activity; drafts land in Review.` })
      onChanged()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not start." })
    } finally {
      setBusy(null)
    }
  }

  async function act(f: StoredFinding, op: "research" | "dismiss") {
    setRowBusy(f.id)
    try {
      const r = await engineCall<{ ok: boolean; lead?: number }>({ action: "finding", id: f.id, op })
      setFindings((list) => (list ?? []).map((x) => (x.id === f.id ? { ...x, used: true, leadId: r.lead ?? x.leadId } : x)).filter((x) => op !== "dismiss" || x.id !== f.id))
      setStatus({ ok: true, text: op === "research" ? (aiReady ? "Queued: the researcher reads the sources and writes it now. It lands in Review." : "Queued. Writing needs AI, which is not set up, so it waits.") : "Set aside." })
      if (op === "research") onChanged()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "That did not work." })
    } finally {
      setRowBusy(null)
    }
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of findings ?? []) m.set(f.kind, (m.get(f.kind) ?? 0) + 1)
    return m
  }, [findings])
  const list = (findings ?? []).filter((f) => (kind === "all" || f.kind === kind) && (!q || `${f.title} ${f.publisher}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="scan-h" className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex flex-col gap-1">
          <h3 id="scan-h" className="flex items-center gap-2 font-medium">
            <RadarIcon aria-hidden className="size-4 text-ion" /> Scan for news
          </h3>
          <p className="text-sm text-muted-foreground">Choose how far back to look. Every source is asked for that window only.</p>
        </div>
        <div role="radiogroup" aria-label="Scan window" className="flex flex-wrap gap-1.5">
          {SCAN_WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              role="radio"
              aria-checked={hours === w.hours}
              onClick={() => setHours(w.hours)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                hours === w.hours ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy !== null || !state.ready} onClick={() => void runScan()}>
            {busy === "scan" ? <Loader2Icon aria-hidden className="animate-spin" /> : <SearchIcon aria-hidden />} {busy === "scan" ? "Scanning…" : `Scan the last ${windowLabel(hours)}`}
          </Button>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Stories per desk
            <select value={perDesk} onChange={(e) => setPerDesk(Number(e.target.value))} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" disabled={busy !== null || !state.ready} onClick={() => void writeStories()}>
            {busy === "write" ? <Loader2Icon aria-hidden className="animate-spin" /> : <PenLineIcon aria-hidden />} Write stories from this window
          </Button>
        </div>
        {busy === "scan" && <p className="text-xs text-muted-foreground">Reading official blogs, releases, repositories, papers, public records and the front page. This takes up to a minute.</p>}
        {!aiReady && (
          <Notice tone="warn" title="AI is not set up">
            Scanning and the list below work without AI. Writing stories needs a free AI key on the server; until then picked findings wait in the queue.
          </Notice>
        )}
      </section>

      <StatusLine status={status} />

      {report && (
        <ul aria-label="Sources in this scan" className="flex flex-wrap gap-2">
          {report.sources.map((s) => (
            <li key={s.label} title={s.error} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", s.ok ? "border-border text-muted-foreground" : "border-destructive/40 text-destructive")}>
              {s.ok ? <CheckIcon aria-hidden className="size-3 text-ok" /> : <CircleAlertIcon aria-hidden className="size-3" />}
              {s.label.replace(/ \(.*\)$/, "")}
              <span className="font-mono tabular-nums">{s.ok ? s.count : "no answer"}</span>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="found-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="found-h" className="mr-auto text-sm font-semibold">
            Found in the last {windowLabel(hours)} {findings ? <span className="font-normal text-muted-foreground">({findings.length})</span> : null}
          </h3>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings" aria-label="Search findings" className="h-8 w-full sm:w-56" />
        </div>
        {findings && findings.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
            {(["all", ...SCAN_KINDS.map((k) => k.id).filter((k) => counts.has(k))] as (ScanKind | "all")[]).map((k) => (
              <Button key={k} size="xs" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                {k === "all" ? "All" : KIND_LABEL[k]} <span className="font-mono opacity-70">{k === "all" ? findings.length : counts.get(k)}</span>
              </Button>
            ))}
          </div>
        )}
        {busy === "load" && !findings ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : list.length ? (
          <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {list.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
                <span className="grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] font-mono text-xs tabular-nums" title="Relevance and recency, out of 100">
                  {f.score}
                </span>
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="group inline font-medium leading-snug hover:text-ion">
                    {f.title}
                    <ExternalLinkIcon aria-hidden className="ml-1 inline size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </a>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{f.publisher}</span>
                    <span>{KIND_LABEL[f.kind]}</span>
                    <span>{f.publishedAt ? when(f.publishedAt) : `found ${when(f.foundAt)}`}</span>
                    {f.desk && <span>{desks.get(f.desk) ?? f.desk}</span>}
                    {f.via && <span>via discovery, not cited</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {f.storyId ? (
                    <Link href={`/admin/newsroom?edit=${f.storyId}`} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ok hover:underline">
                      <CheckIcon aria-hidden className="size-3.5" /> Story
                    </Link>
                  ) : f.leadId ? (
                    <span className="px-2 text-xs text-muted-foreground">In the pipeline</span>
                  ) : (
                    <>
                      <Button size="xs" disabled={rowBusy !== null} onClick={() => void act(f, "research")}>
                        {rowBusy === f.id ? <Loader2Icon aria-hidden className="animate-spin" /> : <PenLineIcon aria-hidden />} Research it
                      </Button>
                      <Button size="xs" variant="ghost" disabled={rowBusy !== null} onClick={() => void act(f, "dismiss")} aria-label={`Set aside ${f.title}`}>
                        <XIcon aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {findings && findings.length ? "Nothing matches this filter." : `Nothing stored for the last ${windowLabel(hours)} yet. Press Scan to look now.`}
          </p>
        )}
      </section>
    </div>
  )
}
