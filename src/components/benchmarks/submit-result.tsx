"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { primaryButton } from "@/components/forum/forum-ui"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getBenchmark, submitResult, validateResult, type BenchmarkResult, type NewResult, type ResultErrors } from "@/lib/benchmarks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"
import { useBenchmarks } from "@/lib/lists/hooks"

const select = "h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const empty = (benchmark: string): NewResult => ({
  benchmark,
  model: "",
  modelSlug: null,
  score: "",
  shots: getBenchmark(benchmark)?.usualShots?.toString() ?? "",
  quantisation: "",
  hardware: "",
  harness: "",
  logsUrl: "",
  notes: "",
})

/** "Submit a result" and the dialog behind it. Anyone can open it; the form inside is for members. */
export function SubmitResult({ benchmark, onSubmitted, className }: { benchmark?: string; onSubmitted: (r: BenchmarkResult) => void; className?: string }) {
  // Retired benchmarks keep their results but take no new ones.
  const BENCHMARKS = useBenchmarks().filter((b) => !b.retired)
  const { ready } = useSession()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<NewResult>(() => empty(benchmark ?? BENCHMARKS[0].slug))
  const [errors, setErrors] = useState<ResultErrors>({})
  const [busy, setBusy] = useState(false)
  const bench = getBenchmark(form.benchmark)

  const set = <K extends keyof NewResult>(k: K, v: NewResult[K]) => setForm((f) => ({ ...f, [k]: v }))
  const err = (k: keyof NewResult) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `res-${k}-error` } : {})

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const found = validateResult(form)
    setErrors(found)
    const first = (["benchmark", "model", "score", "shots", "quantisation", "hardware", "harness", "logsUrl", "notes"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`res-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const r = await submitResult(form)
      onSubmitted(r)
      setOpen(false)
      setForm(empty(benchmark ?? form.benchmark))
    } catch (x) {
      setErrors({ form: (x as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className={cn(primaryButton, className)} disabled={live && !ready} />}>
        <PlusIcon aria-hidden className="size-4" /> Submit a result
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit a result</DialogTitle>
          <DialogDescription>Give the settings someone needs to run it again, and link to your logs. Others can then mark it as reproduced.</DialogDescription>
        </DialogHeader>
        <Gate cap="submission.create" action="submit a benchmark result">
          <form onSubmit={submit} noValidate>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={errors.benchmark ? true : undefined}>
                  <FieldLabel htmlFor="res-benchmark"><Copy k="benchmark.submit-result.benchmark">Benchmark</Copy></FieldLabel>
                  <select
                    id="res-benchmark"
                    value={form.benchmark}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        benchmark: e.target.value,
                        shots: f.shots || (getBenchmark(e.target.value)?.usualShots?.toString() ?? ""),
                      }))
                    }
                    className={select}
                    {...err("benchmark")}
                  >
                    {BENCHMARKS.map((b) => (
                      <option key={b.slug} value={b.slug} className="bg-popover">
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {errors.benchmark && <FieldError id="res-benchmark-error">{errors.benchmark}</FieldError>}
                </Field>
                <Field data-invalid={errors.score ? true : undefined}>
                  <FieldLabel htmlFor="res-score">
                    Score
                    {bench ? ` (${bench.metric}${bench.unit ? `, ${bench.unit}` : ""})` : ""}
                  </FieldLabel>
                  <Input
                    id="res-score"
                    inputMode="decimal"
                    value={form.score}
                    onChange={(e) => set("score", e.target.value)}
                    placeholder={bench?.higherIsBetter === false ? "17.2" : "64.2"}
                    className="h-10 bg-background/60"
                    {...err("score")}
                  />
                  {errors.score ? (
                    <FieldError id="res-score-error">{errors.score}</FieldError>
                  ) : (
                    bench && <FieldDescription>{bench.higherIsBetter ? "Higher is better." : "Lower is better."}</FieldDescription>
                  )}
                </Field>
              </div>

              <Field data-invalid={errors.model ? true : undefined}>
                <FieldLabel htmlFor="res-model"><Copy k="benchmark.submit-result.model">Model</Copy></FieldLabel>
                <Input
                  id="res-model"
                  value={form.model}
                  maxLength={80}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="Exact name and size, e.g. Llama 3.1 8B Instruct"
                  className="h-10 bg-background/60"
                  {...err("model")}
                />
                {errors.model ? (
                  <FieldError id="res-model-error">{errors.model}</FieldError>
                ) : (
                  <FieldDescription><Copy k="benchmark.submit-result.use-the-name-its-makers" multiline>Use the name its makers use, with the size and variant, so results for the same model line up.</Copy></FieldDescription>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={errors.shots ? true : undefined}>
                  <FieldLabel htmlFor="res-shots"><Copy k="benchmark.submit-result.shots">Shots</Copy></FieldLabel>
                  <Input id="res-shots" inputMode="numeric" value={form.shots} onChange={(e) => set("shots", e.target.value)} placeholder="5" className="h-10 bg-background/60" {...err("shots")} />
                  {errors.shots && <FieldError id="res-shots-error">{errors.shots}</FieldError>}
                </Field>
                <Field data-invalid={errors.quantisation ? true : undefined}>
                  <FieldLabel htmlFor="res-quantisation"><Copy k="benchmark.submit-result.quantisation">Quantisation</Copy></FieldLabel>
                  <Input
                    id="res-quantisation"
                    value={form.quantisation}
                    maxLength={40}
                    onChange={(e) => set("quantisation", e.target.value)}
                    placeholder="bf16, Q4_K_M"
                    className="h-10 bg-background/60"
                    {...err("quantisation")}
                  />
                </Field>
                <Field data-invalid={errors.hardware ? true : undefined}>
                  <FieldLabel htmlFor="res-hardware"><Copy k="benchmark.submit-result.hardware">Hardware</Copy></FieldLabel>
                  <Input
                    id="res-hardware"
                    value={form.hardware}
                    maxLength={80}
                    onChange={(e) => set("hardware", e.target.value)}
                    placeholder="1× RTX 4090"
                    className="h-10 bg-background/60"
                    {...err("hardware")}
                  />
                </Field>
              </div>

              <Field data-invalid={errors.harness ? true : undefined}>
                <FieldLabel htmlFor="res-harness"><Copy k="benchmark.submit-result.harness-and-version">Harness and version</Copy></FieldLabel>
                <Input
                  id="res-harness"
                  value={form.harness}
                  maxLength={80}
                  onChange={(e) => set("harness", e.target.value)}
                  placeholder="lm-evaluation-harness 0.4.5"
                  className="h-10 bg-background/60"
                  {...err("harness")}
                />
              </Field>

              <Field data-invalid={errors.logsUrl ? true : undefined}>
                <FieldLabel htmlFor="res-logsUrl"><Copy k="benchmark.submit-result.link-to-the-logs">Link to the logs</Copy></FieldLabel>
                <Input
                  id="res-logsUrl"
                  type="url"
                  inputMode="url"
                  value={form.logsUrl}
                  maxLength={500}
                  onChange={(e) => set("logsUrl", e.target.value)}
                  placeholder="https://github.com/you/evals/tree/main/results"
                  className="h-10 bg-background/60"
                  {...err("logsUrl")}
                />
                {errors.logsUrl ? (
                  <FieldError id="res-logsUrl-error">{errors.logsUrl}</FieldError>
                ) : (
                  <FieldDescription><Copy k="benchmark.submit-result.per-sample-outputs-or-the">Per-sample outputs or the harness’s results file, so others can check the run.</Copy></FieldDescription>
                )}
              </Field>

              <Field data-invalid={errors.notes ? true : undefined}>
                <FieldLabel htmlFor="res-notes"><Copy k="benchmark.submit-result.notes-optional">Notes (optional)</Copy></FieldLabel>
                <Textarea
                  id="res-notes"
                  value={form.notes}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Language or split, prompt format, anything unusual."
                  className="bg-background/60"
                  {...err("notes")}
                />
                {errors.notes && <FieldError id="res-notes-error">{errors.notes}</FieldError>}
              </Field>

              {errors.form && <FieldError>{errors.form}</FieldError>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : "Submit result"}
                </Button>
                {!live && <span className="text-xs text-muted-foreground"><Copy k="benchmark.submit-result.this-copy-has-no-database">This copy has no database, so the result stays in this browser.</Copy></span>}
              </div>
            </FieldGroup>
          </form>
        </Gate>
      </DialogContent>
    </Dialog>
  )
}
