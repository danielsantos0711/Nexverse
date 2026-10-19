"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckIcon, ExternalLinkIcon, Trash2Icon, XIcon } from "lucide-react"
import { ReproBadge } from "@/components/benchmarks/bench-bits"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteResult, formatScore, getBenchmark, reproStaysLocal, reproSummary, setRepro, type BenchmarkResult, type Repro, type ReproOutcome } from "@/lib/benchmarks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** A result's settings, its reproductions, and your own verdict: reproduced (within tolerance) or not. */
export function ReproPanel({ result, onRepros, onDeleted }: { result: BenchmarkResult; onRepros: (r: Repro[]) => void; onDeleted: () => void }) {
  const bench = getBenchmark(result.benchmark)!
  const { ready, user, member } = useSession()
  const summary = reproSummary(result, member?.id)
  const mine = summary.mine
  const own = result.local || Boolean(member && result.authorId === member.id)
  const [outcome, setOutcome] = useState<ReproOutcome>(mine?.outcome ?? "reproduced")
  const [measured, setMeasured] = useState(mine?.measured != null ? String(mine.measured) : "")
  const [note, setNote] = useState(mine?.note ?? "")
  const [editing, setEditing] = useState(!mine)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const needsSignIn = live && !reproStaysLocal(result) && ready && !user

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      onRepros(await setRepro(result, { outcome, measured, note }))
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function takeBack() {
    setBusy(true)
    setError("")
    try {
      onRepros(await setRepro(result, null))
      setEditing(true)
      setMeasured("")
      setNote("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm("Withdraw this result? Its reproductions go with it.")) return
    setBusy(true)
    try {
      await deleteResult(result)
      onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const settings: [string, string][] = [
    ["Shots", result.shots === null ? "—" : String(result.shots)],
    ["Quantisation", result.quantisation || "—"],
    ["Hardware", result.hardware || "—"],
    ["Harness", result.harness || "—"],
  ]

  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {settings.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {result.notes && <p className="max-w-[70ch] whitespace-pre-wrap text-muted-foreground">{result.notes}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {result.logsUrl ? (
          <a href={result.logsUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-ion underline-offset-4 hover:underline">
            Logs <ExternalLinkIcon aria-hidden className="size-3.5" />
          </a>
        ) : (
          <span className="text-muted-foreground">Sample result: no logs to check.</span>
        )}
        <span className="text-xs text-muted-foreground">
          Submitted by {result.author.name} · <TimeAgo date={result.createdAt} />
        </span>
        {own && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="pressable ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Trash2Icon aria-hidden className="size-3.5" /> Withdraw
          </button>
        )}
      </div>

      <section aria-label="Reproductions" className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-sans text-sm font-medium tracking-normal">Reproductions</h3>
          <ReproBadge result={result} />
          <span className="text-xs text-muted-foreground">
            Counts when within ±{bench.tolerance}
            {bench.unit === "%" ? " points" : ""} of {formatScore(bench, result.score)}.
          </span>
        </div>
        {result.repros.length ? (
          <ul className="flex flex-col gap-1.5">
            {result.repros.map((p, i) => (
              <li key={`${p.userId ?? p.who.name}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <PosterAvatar poster={p.who} size={18} />
                <span>{p.who.name}</span>
                <span className={cn("inline-flex items-center gap-1 text-xs", p.outcome === "reproduced" ? "text-ok" : "text-destructive")}>
                  {p.outcome === "reproduced" ? <CheckIcon aria-hidden className="size-3" /> : <XIcon aria-hidden className="size-3" />}
                  {p.outcome === "reproduced" ? "Reproduced" : "Could not reproduce"}
                  {p.measured !== null && ` · got ${formatScore(bench, p.measured)}`}
                </span>
                {p.note && <span className="w-full pl-6 text-xs text-muted-foreground">{p.note}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nobody has checked this result yet. Run it with the same settings and say what you got.</p>
        )}

        {own ? (
          <p className="text-xs text-muted-foreground">This is your result. Someone else has to reproduce it.</p>
        ) : needsSignIn ? (
          <p className="text-xs text-muted-foreground">
            <Link href={`/sign-in?next=${encodeURIComponent(`/benchmarks/${result.benchmark}`)}`} className="text-ion underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to report whether you could reproduce it.
          </p>
        ) : !editing && mine ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              Change my report
            </Button>
            <Button size="sm" variant="ghost" onClick={takeBack} disabled={busy}>
              Take it back
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-2.5 border-t border-border pt-3">
            <div role="radiogroup" aria-label="Your result" className="flex flex-wrap gap-2">
              {(["reproduced", "failed"] as const).map((o) => (
                <label
                  key={o}
                  className={cn(
                    "pressable inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    outcome === o ? (o === "reproduced" ? "border-ok/50 bg-ok/10" : "border-destructive/50 bg-destructive/10") : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <input type="radio" name={`outcome-${result.id}`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="sr-only" />
                  {o === "reproduced" ? <CheckIcon aria-hidden className="size-3.5" /> : <XIcon aria-hidden className="size-3.5" />}
                  {o === "reproduced" ? `I reproduced this (±${bench.tolerance})` : "Could not reproduce"}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Your score{outcome === "failed" ? " (optional)" : ""}</span>
                <Input inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} placeholder={String(result.score)} className="h-9 w-28 bg-background/60" />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">Note (optional)</span>
                <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Same harness, different GPU" className="h-9 bg-background/60" />
              </label>
              <Button type="submit" size="sm" className="h-9" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
            {reproStaysLocal(result) && <p className="text-xs text-muted-foreground">{result.sample ? "Sample result: your report stays in this browser." : "This copy has no database, so your report stays in this browser."}</p>}
          </form>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
