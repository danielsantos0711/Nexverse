"use client"

import { useEffect, useState } from "react"
import { AdminHeading, Notice, StatusLine, SwitchRow, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import { listRuns, loadNewsroomSettings, NEWS_CATEGORIES, readNewsroomSettings, saveNewsroomSettings, type NewsroomSettings, type Run } from "@/lib/newsroom"
import { cn } from "@/lib/utils"

const RUN_TONE: Record<Run["status"], string> = { ok: "text-ok", partial: "text-gold", failed: "text-destructive", running: "text-ion" }
const RUN_LABEL: Record<Run["status"], string> = { ok: "Done", partial: "Done, with errors", failed: "Failed", running: "Running or stopped" }

/** Auto-publish per category, the daily cap, the pause switch, and what the last runs did. */
export function NewsroomSettingsPanel() {
  const caps = useCaps()
  const canPublish = caps.can("news.publish")
  const [s, setS] = useState<NewsroomSettings | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<{ runs: Run[]; error: string | null } | null>(null)

  useEffect(() => {
    let on = true
    void loadNewsroomSettings().then((v) => on && setS(v))
    void listRuns().then((r) => on && setRuns(r))
    return () => {
      on = false
    }
  }, [])

  async function save() {
    if (!s) return
    setBusy(true)
    setStatus(null)
    try {
      await saveNewsroomSettings(readNewsroomSettings(s))
      setStatus({ ok: true, text: "Saved. The next run uses these settings." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="nr-set" className="flex flex-col gap-4">
        <div id="nr-set">
          <AdminHeading title="Publishing" lead="Every AI story is a draft until an editor publishes it, unless you switch auto-publish on for its category. Rumours and leaks are always reviewed." />
        </div>
        {!canPublish && <Notice title="Only editors with publishing rights change these">You can read them.</Notice>}
        {!s ? (
          <Skeleton className="h-72 w-full rounded-2xl" />
        ) : (
          <div className="flex flex-col gap-3">
            {NEWS_CATEGORIES.map((c) =>
              c.id === "rumor" ? (
                <SwitchRow key={c.id} id="ap-rumor" label={`Auto-publish ${c.label.toLowerCase()}`} description="Always off: an editor checks every rumour and leak before it goes out." checked={false} onChange={() => {}} disabled />
              ) : (
                <SwitchRow
                  key={c.id}
                  id={`ap-${c.id}`}
                  label={`Auto-publish ${c.label.toLowerCase()}`}
                  description={c.blurb}
                  checked={s.autoPublish[c.id]}
                  disabled={!canPublish}
                  onChange={(on) => setS({ ...s, autoPublish: { ...s.autoPublish, [c.id]: on } })}
                />
              )
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nr-cap">AI stories per day</FieldLabel>
                <Input id="nr-cap" type="number" min={0} max={30} value={s.dailyCap} disabled={!canPublish} onChange={(e) => setS({ ...s, dailyCap: Number(e.target.value) })} className="h-10 w-32" />
                <FieldDescription>Drafts included, counted per UTC day. 0 collects signals but writes nothing.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="nr-run">Stories per run</FieldLabel>
                <Input id="nr-run" type="number" min={1} max={6} value={s.perRun} disabled={!canPublish} onChange={(e) => setS({ ...s, perRun: Number(e.target.value) })} className="h-10 w-32" />
                <FieldDescription>Keeps one run inside the server&apos;s time limit.</FieldDescription>
              </Field>
            </div>
            <SwitchRow id="nr-paused" label="Pause the daily run" description="The cron skips its run. Collect now still works." checked={s.paused} disabled={!canPublish} onChange={(paused) => setS({ ...s, paused })} />
            {canPublish && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save settings"}
                </Button>
                <StatusLine status={status} />
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="nr-runs" className="flex flex-col gap-4">
        <div id="nr-runs">
          <AdminHeading title="Recent runs" lead="The daily run at 07:00 UTC and every Collect now: what was checked, collected and written, and what went wrong." />
        </div>
        {!runs ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : runs.error ? (
          <Notice tone="warn" title="The run log could not load">
            {runs.error}
          </Notice>
        ) : !runs.runs.length ? (
          <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">No runs yet. Press Collect now, or wait for the daily run.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {runs.runs.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("font-medium", RUN_TONE[r.status])}>{RUN_LABEL[r.status]}</span>
                  <Badge variant="outline">{r.trigger === "cron" ? "Daily run" : `Collect now${r.actor ? ` by ${r.actor.name}` : ""}`}</Badge>
                  <span className="text-muted-foreground">{when(r.startedAt)}</span>
                </div>
                <p className="text-muted-foreground">
                  {r.sourcesChecked} sources checked · {r.signalsNew} new signals · {r.drafts} drafts · {r.published} published{r.rejected ? ` · ${r.rejected} not saved` : ""}
                </p>
                {r.note && <p>{r.note}</p>}
                {r.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {r.errors.length} problem{r.errors.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {r.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.where}:</span> <span className="text-muted-foreground">{e.error}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
