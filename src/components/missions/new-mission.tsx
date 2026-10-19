"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CheckSquareIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { useMounted } from "@/components/events/event-time"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { TagInput } from "@/components/forum/tags"
import { Insignia } from "@/components/missions/mission-bits"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { createMission, DIFFICULTIES, LIMITS, pointsAvailable, REWARD_PRESETS, validateMission, type Difficulty, type MissionErrors, type NewMission } from "@/lib/missions"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** Post a mission. Renders in the browser only, because the deadline defaults depend on your clock. */
export function NewMissionForm() {
  const mounted = useMounted()
  const { ready } = useSession()
  if (!mounted || (live && !ready)) {
    return (
      <div className="glass flex flex-col gap-4 rounded-2xl p-6" aria-busy="true" aria-label="Loading form">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }
  return (
    <Gate cap="mission.create" action="post a mission">
      <Form />
    </Gate>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The end of a local calendar day ("2026-11-01" → 23:59 that day, your time), as an ISO instant. */
function endOfDay(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return ""
  const d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 0)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ""
}

function Form() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [difficulty, setDifficulty] = useState<Difficulty>("pilot")
  const [brief, setBrief] = useState("")
  const [criteria, setCriteria] = useState<string[]>([""])
  const [reward, setReward] = useState("25")
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState(() => localDate(new Date(Date.now() + 14 * 864e5)))
  const [bounds] = useState(() => ({
    min: localDate(new Date(Date.now() + 2 * 864e5)),
    max: localDate(new Date(Date.now() + 179 * 864e5)),
  }))
  const [available, setAvailable] = useState<number | null | undefined>(live ? undefined : null)
  const [errors, setErrors] = useState<MissionErrors>({})
  const [busy, setBusy] = useState(false)
  const criteriaRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusNext = useRef<number | null>(null)

  useEffect(() => {
    if (!live) return
    let stale = false
    pointsAvailable()
      .then((p) => !stale && setAvailable(p))
      .catch(() => !stale && setAvailable(null))
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    if (focusNext.current !== null) {
      criteriaRefs.current[focusNext.current]?.focus()
      focusNext.current = null
    }
  }, [criteria.length])

  const input: NewMission = {
    title,
    brief,
    criteria,
    difficulty,
    reward: reward.trim() === "" ? 0 : Number(reward),
    tags,
    deadline: endOfDay(date),
  }

  function setCriterion(i: number, v: string) {
    setCriteria((c) => c.map((x, j) => (j === i ? v : x)))
  }

  function addCriterion(after = criteria.length - 1) {
    if (criteria.length >= LIMITS.criteria) return
    focusNext.current = after + 1
    setCriteria((c) => [...c.slice(0, after + 1), "", ...c.slice(after + 1)])
  }

  function removeCriterion(i: number) {
    setCriteria((c) => (c.length === 1 ? [""] : c.filter((_, j) => j !== i)))
    requestAnimationFrame(() => criteriaRefs.current[Math.max(0, i - 1)]?.focus())
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const found = validateMission(input, available ?? null)
    setErrors(found)
    const first = (["title", "criteria", "brief", "reward", "tags", "deadline"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(first === "criteria" ? "ms-criteria-0" : `ms-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const created = await createMission(input)
      router.push(`/missions/${created.id}`)
    } catch (err) {
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  const err = (k: keyof NewMission) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `ms-${k}-error` } : {})
  const deadline = input.deadline ? new Date(input.deadline) : null

  return (
    <form onSubmit={submit} noValidate className="glass rounded-2xl p-5 md:p-7">
      <FieldGroup>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="ms-title">What should be built?</FieldLabel>
          <Input
            id="ms-title"
            value={title}
            maxLength={LIMITS.title[1]}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Fine-tune a 3B model for European Portuguese"
            className="h-11 bg-background/60"
            {...err("title")}
          />
          {errors.title ? <FieldError id="ms-title-error">{errors.title}</FieldError> : <FieldDescription>One line that says what done looks like.</FieldDescription>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Difficulty</FieldLegend>
          <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
              const on = difficulty === d
              return (
                <label
                  key={d}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                >
                  <input type="radio" name="difficulty" value={d} checked={on} onChange={() => setDifficulty(d)} className="sr-only" />
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Insignia difficulty={d} className="size-4" />
                    {DIFFICULTIES[d].label}
                  </span>
                  <span className="text-xs text-muted-foreground">{DIFFICULTIES[d].blurb}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>

        <Field data-invalid={errors.brief ? true : undefined}>
          <FieldLabel htmlFor="ms-brief">Brief</FieldLabel>
          <MarkdownComposer
            id="ms-brief"
            value={brief}
            onChange={setBrief}
            maxLength={LIMITS.brief}
            rows={7}
            mentions={false}
            placeholder="Why it matters, what to start from, what data is allowed, where to ask questions."
            invalid={Boolean(errors.brief)}
          />
          {errors.brief && <FieldError id="ms-brief-error">{errors.brief}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Acceptance criteria</FieldLegend>
          <FieldDescription className="-mt-1">The checklist an entry must meet. Pilots see it before they accept.</FieldDescription>
          <ol className="flex flex-col gap-2">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckSquareIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <label htmlFor={`ms-criteria-${i}`} className="sr-only">
                  Criterion {i + 1}
                </label>
                <Input
                  id={`ms-criteria-${i}`}
                  ref={(el) => {
                    criteriaRefs.current[i] = el
                  }}
                  value={c}
                  maxLength={LIMITS.criterion}
                  onChange={(e) => setCriterion(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      if (c.trim()) addCriterion(i)
                    } else if (e.key === "Backspace" && !c && criteria.length > 1) {
                      e.preventDefault()
                      removeCriterion(i)
                    }
                  }}
                  placeholder={i === 0 ? "Open weights under a permissive licence" : "Another thing an entry must do"}
                  className="h-10 bg-background/60"
                  {...(errors.criteria
                    ? {
                        "aria-invalid": true as const,
                        "aria-describedby": "ms-criteria-error",
                      }
                    : {})}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} onClick={() => removeCriterion(i)} disabled={criteria.length === 1 && !c}>
                  <XIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => addCriterion()} disabled={criteria.length >= LIMITS.criteria}>
              <PlusIcon aria-hidden /> Add a criterion
            </Button>
            <span className="text-xs text-muted-foreground">Press Enter to add the next one. Up to {LIMITS.criteria}.</span>
          </div>
          {errors.criteria && <FieldError id="ms-criteria-error">{errors.criteria}</FieldError>}
        </FieldSet>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field data-invalid={errors.reward ? true : undefined}>
            <FieldLabel htmlFor="ms-reward">Reward in reputation points</FieldLabel>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick amounts">
              {REWARD_PRESETS.map((p) => {
                const on = Number(reward || 0) === p
                const tooMuch = typeof available === "number" && p > available
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    disabled={tooMuch}
                    onClick={() => setReward(String(p))}
                    className={cn(
                      "pressable rounded-full border px-2.5 py-1 text-xs tabular transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                      on ? "border-gold/50 bg-gold/15 text-gold" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p === 0 ? "Badge only" : p}
                  </button>
                )
              })}
            </div>
            <div className="relative sm:max-w-48">
              <SparklesIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gold" />
              <Input
                id="ms-reward"
                type="number"
                inputMode="numeric"
                min={0}
                max={LIMITS.reward}
                step={5}
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="h-10 bg-background/60 pl-9 tabular"
                {...err("reward")}
              />
            </div>
            {errors.reward ? (
              <FieldError id="ms-reward-error">{errors.reward}</FieldError>
            ) : (
              <FieldDescription aria-live="polite">
                {available === undefined
                  ? "Checking your points…"
                  : available === null
                    ? "This copy of Nexverse has no database, so no points are held from you."
                    : `You have ${Math.max(0, available).toLocaleString("en")} points free. The reward is held from your reputation now and goes to the winner, or back to you if the mission expires.`}
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.deadline ? true : undefined}>
            <FieldLabel htmlFor="ms-deadline">Deadline</FieldLabel>
            <Input
              id="ms-deadline"
              type="date"
              value={date}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 bg-background/60 sm:max-w-48"
              {...err("deadline")}
            />
            {errors.deadline ? (
              <FieldError id="ms-deadline-error">{errors.deadline}</FieldError>
            ) : (
              <FieldDescription>
                {deadline ? `Entries close ${deadline.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, your time. ` : ""}
                You then have 14 days to pick a winner.
              </FieldDescription>
            )}
          </Field>
        </div>

        <Field data-invalid={errors.tags ? true : undefined}>
          <FieldLabel htmlFor="ms-tags">Tags</FieldLabel>
          <TagInput id="ms-tags" value={tags} onChange={setTags} describedBy={errors.tags ? "ms-tags-error" : undefined} />
          {errors.tags ? <FieldError id="ms-tags-error">{errors.tags}</FieldError> : <FieldDescription>Up to 5, like portuguese or speech, so the right pilots find it.</FieldDescription>}
        </Field>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Posting…" : "Post mission"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground">This copy has no database, so the mission stays in this browser.</span>}
        </div>
      </FieldGroup>
    </form>
  )
}
