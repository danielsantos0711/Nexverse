"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { SIDE_COLOR, TASK_ICON } from "@/components/arena/arena-bits"
import { useMounted } from "@/components/events/event-time"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Gate } from "@/components/moderation/gate"
import { createDuel, DUEL_LIMITS, DUEL_TASKS, validateDuel, type DuelModel, type DuelTask, type NewDuel } from "@/lib/arena"
import { LANGUAGES, type LanguageCode } from "@/lib/data"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Errors = ReturnType<typeof validateDuel> & { form?: string }

/** Post a duel. Members only (see <Gate>); without a database it stays in this browser. */
export function NewDuelForm() {
  const mounted = useMounted()
  if (!mounted) {
    return (
      <div className="glass flex flex-col gap-4 rounded-2xl p-6" aria-busy="true" aria-label="Loading form">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }
  return (
    <Gate action="post a duel">
      <Form />
    </Gate>
  )
}

const field = "bg-background/60"

function Form() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [outputA, setOutputA] = useState("")
  const [outputB, setOutputB] = useState("")
  const [modelA, setModelA] = useState<DuelModel>({ name: "", slug: null })
  const [modelB, setModelB] = useState<DuelModel>({ name: "", slug: null })
  const [task, setTask] = useState<DuelTask>("code")
  const [langs, setLangs] = useState<LanguageCode[]>(["en"])
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const input: NewDuel = { prompt, outputA, outputB, modelA, modelB, task, langs }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const found = validateDuel(input)
    setErrors(found)
    const first = (["prompt", "modelA", "outputA", "modelB", "outputB", "langs"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`duel-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const created = await createDuel(input)
      router.push(`/arena/${created.id}`)
    } catch (err) {
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  const err = (k: keyof Errors) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `duel-${k}-error` } : {})

  function toggleLang(l: LanguageCode) {
    setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : cur.length >= DUEL_LIMITS.langs ? cur : [...cur, l]))
  }

  return (
    <form onSubmit={submit} noValidate className="glass rounded-2xl p-5 md:p-7">
      <FieldGroup>
        <Field data-invalid={errors.prompt ? true : undefined}>
          <FieldLabel htmlFor="duel-prompt">Prompt</FieldLabel>
          <Textarea
            id="duel-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={DUEL_LIMITS.prompt}
            rows={4}
            placeholder="The exact prompt you gave both models."
            className={cn("min-h-24", field)}
            {...err("prompt")}
          />
          {errors.prompt ? <FieldError id="duel-prompt-error">{errors.prompt}</FieldError> : <FieldDescription>Use the same prompt and settings for both models, so the duel is fair.</FieldDescription>}
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <ModelOutput side="A" color={SIDE_COLOR.a} model={modelA} setModel={setModelA} output={outputA} setOutput={setOutputA} errors={errors} err={err} keys={["modelA", "outputA"]} />
          <ModelOutput side="B" color={SIDE_COLOR.b} model={modelB} setModel={setModelB} output={outputB} setOutput={setOutputB} errors={errors} err={err} keys={["modelB", "outputB"]} />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Voters see the two outputs in random order, without the model names. The names appear after they vote.</p>

        <FieldSet>
          <FieldLegend variant="label">Task</FieldLegend>
          <div role="radiogroup" aria-label="Task" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {(Object.keys(DUEL_TASKS) as DuelTask[]).map((t) => {
              const Icon = TASK_ICON[t]
              const on = task === t
              return (
                <label
                  key={t}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <input type="radio" name="task" value={t} checked={on} onChange={() => setTask(t)} className="sr-only" />
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Icon aria-hidden className={cn("size-4", on ? "text-ion" : "text-muted-foreground")} />
                    {DUEL_TASKS[t].label}
                  </span>
                  <span className="text-xs text-muted-foreground">{DUEL_TASKS[t].blurb}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Languages</FieldLegend>
          <div id="duel-langs" tabIndex={-1} role="group" aria-label="Languages of the prompt and outputs" className="flex flex-wrap gap-1.5 outline-none" {...err("langs")}>
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => {
              const on = langs.includes(l)
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLang(l)}
                  disabled={!on && langs.length >= DUEL_LIMITS.langs}
                  className={cn(
                    "pressable h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                    on ? "border-ion/50 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {LANGUAGES[l].name}
                </button>
              )
            })}
          </div>
          {errors.langs ? <FieldError id="duel-langs-error">{errors.langs}</FieldError> : <FieldDescription>The languages of the prompt and the answers, up to four. Ratings can be filtered by language.</FieldDescription>}
        </FieldSet>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Posting…" : "Post duel"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground">This copy has no database, so the duel stays in this browser.</span>}
        </div>
      </FieldGroup>
    </form>
  )
}

function ModelOutput({
  side,
  color,
  model,
  setModel,
  output,
  setOutput,
  errors,
  err,
  keys,
}: {
  side: "A" | "B"
  color: string
  model: DuelModel
  setModel: (m: DuelModel) => void
  output: string
  setOutput: (s: string) => void
  errors: Errors
  err: (k: keyof Errors) => Record<string, unknown>
  keys: ["modelA" | "modelB", "outputA" | "outputB"]
}) {
  const [mk, ok] = keys
  return (
    <FieldSet className="min-w-0 rounded-xl border border-border bg-card/40 p-4">
      <FieldLegend variant="label" className="flex items-center gap-2">
        <span aria-hidden className="grid size-5 place-items-center rounded-full text-[11px] font-semibold text-black" style={{ background: color }}>
          {side}
        </span>
        Model {side}
      </FieldLegend>
      <Field data-invalid={errors[mk] ? true : undefined}>
        <FieldLabel htmlFor={`duel-${mk}`}>Model name</FieldLabel>
        <Input id={`duel-${mk}`} value={model.name} maxLength={DUEL_LIMITS.model} onChange={(e) => setModel({ ...model, name: e.target.value })} placeholder="Model name, size and quantisation" className={cn("h-10", field)} {...err(mk)} />
        {errors[mk] && <FieldError id={`duel-${mk}-error`}>{errors[mk]}</FieldError>}
      </Field>
      <Field data-invalid={errors[ok] ? true : undefined}>
        <FieldLabel htmlFor={`duel-${ok}`}>Output</FieldLabel>
        <Textarea
          id={`duel-${ok}`}
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          maxLength={DUEL_LIMITS.output}
          rows={9}
          placeholder="Paste the answer exactly as the model gave it. ``` fences show as code."
          className={cn("min-h-44 font-mono text-[13px]", field)}
          {...err(ok)}
        />
        {errors[ok] && <FieldError id={`duel-${ok}-error`}>{errors[ok]}</FieldError>}
      </Field>
    </FieldSet>
  )
}
