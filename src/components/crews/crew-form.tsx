"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { GlobeIcon, LockIcon } from "lucide-react"
import { CREW_ICON, CrewEmblem } from "@/components/crews/emblem"
import { TagInput } from "@/components/studio/tag-input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useMounted } from "@/components/events/event-time"
import {
  CREW_COLORS,
  CREW_ICONS,
  CREW_LIMITS,
  createCrew,
  crewSlugify,
  updateCrew,
  validateCrew,
  type Crew,
  type CrewColor,
  type CrewIcon,
  type CrewInput,
  type CrewVisibility,
} from "@/lib/crews"
import { Gate } from "@/components/moderation/gate"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** Start a crew. Guests are asked to sign in and paused accounts are told why (with a database). */
export function NewCrew() {
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
    <Gate action="start a crew">
      <CrewForm />
    </Gate>
  )
}

/** The crew's details: used to start one and, with `crew`, to edit it (the address stays fixed). */
export function CrewForm({ crew, onSaved, onCancel }: { crew?: Crew; onSaved?: (c: Crew) => void; onCancel?: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(crew?.name ?? "")
  const [slug, setSlug] = useState(crew?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(Boolean(crew))
  const [blurb, setBlurb] = useState(crew?.blurb ?? "")
  const [icon, setIcon] = useState<CrewIcon>(crew?.icon ?? "orbit")
  const [color, setColor] = useState<CrewColor>(crew?.color ?? "ion")
  const [visibility, setVisibility] = useState<CrewVisibility>(crew?.visibility ?? "public")
  const [tags, setTags] = useState<string[]>(crew?.tags ?? [])
  const [errors, setErrors] = useState<Partial<Record<keyof CrewInput | "form", string>>>({})
  const [busy, setBusy] = useState(false)

  const effectiveSlug = slugTouched ? slug : crewSlugify(name)
  const input: CrewInput = { name, slug: effectiveSlug, blurb, icon, color, visibility, tags }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const found = validateCrew(input)
    setErrors(found)
    const first = (["name", "slug", "blurb", "tags"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`crew-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      if (crew) {
        const saved = await updateCrew(crew, input)
        setBusy(false)
        onSaved?.(saved)
      } else {
        const created = await createCrew(input)
        router.push(`/crews/${created.slug}`)
      }
    } catch (err) {
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  const err = (k: keyof CrewInput) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `crew-${k}-error` } : {})

  return (
    <form onSubmit={submit} noValidate className={cn(!crew && "glass rounded-2xl p-5 md:p-7")}>
      <FieldGroup>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-4">
          <CrewEmblem icon={icon} color={color} size={56} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{name.trim() || "Your crew"}</span>
            <span className="truncate text-sm text-muted-foreground">/crews/{effectiveSlug || "…"}</span>
          </div>
        </div>

        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="crew-name">Name</FieldLabel>
          <Input id="crew-name" value={name} maxLength={CREW_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Lisbon NLP Lab" className="h-11 bg-background/60" {...err("name")} />
          {errors.name && <FieldError id="crew-name-error">{errors.name}</FieldError>}
        </Field>

        <Field data-invalid={errors.slug ? true : undefined}>
          <FieldLabel htmlFor="crew-slug">Address</FieldLabel>
          <div className="flex items-center rounded-lg border border-input bg-background/60 focus-within:ring-2 focus-within:ring-ring">
            <span className="pl-3 text-sm text-muted-foreground select-none">/crews/</span>
            <input
              id="crew-slug"
              value={effectiveSlug}
              disabled={Boolean(crew)}
              maxLength={34}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }}
              className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none disabled:opacity-60"
              {...err("slug")}
            />
          </div>
          <FieldDescription>{crew ? "The address stays the same, so links keep working." : "Lowercase letters, numbers and dashes. It cannot be changed later."}</FieldDescription>
          {errors.slug && <FieldError id="crew-slug-error">{errors.slug}</FieldError>}
        </Field>

        <Field data-invalid={errors.blurb ? true : undefined}>
          <FieldLabel htmlFor="crew-blurb">What is it about?</FieldLabel>
          <Textarea
            id="crew-blurb"
            value={blurb}
            maxLength={CREW_LIMITS.blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="We fine-tune small models for European Portuguese and meet on Thursdays."
            className="min-h-20 bg-background/60"
            {...err("blurb")}
          />
          <FieldDescription className="tabular">{CREW_LIMITS.blurb - blurb.length} characters left</FieldDescription>
          {errors.blurb && <FieldError id="crew-blurb-error">{errors.blurb}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Emblem</FieldLegend>
          <div role="radiogroup" aria-label="Emblem icon" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-12">
            {CREW_ICONS.map((k) => {
              const Icon = CREW_ICON[k]
              const on = icon === k
              return (
                <label
                  key={k}
                  title={k.replace(/-/g, " ")}
                  className={cn(
                    "pressable grid aspect-square cursor-pointer place-items-center rounded-lg border transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10 text-foreground" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <input type="radio" name="crew-icon" value={k} checked={on} onChange={() => setIcon(k)} className="sr-only" aria-label={k.replace(/-/g, " ")} />
                  <Icon aria-hidden className="size-4.5" />
                </label>
              )
            })}
          </div>
          <div role="radiogroup" aria-label="Emblem colour" className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(CREW_COLORS) as CrewColor[]).map((k) => {
              const on = color === k
              return (
                <label
                  key={k}
                  title={CREW_COLORS[k].label}
                  className={cn("pressable grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-ring", on && "ring-2 ring-foreground/70")}
                >
                  <input type="radio" name="crew-color" value={k} checked={on} onChange={() => setColor(k)} className="sr-only" aria-label={CREW_COLORS[k].label} />
                  <span aria-hidden className="size-6 rounded-full" style={{ background: CREW_COLORS[k].value }} />
                </label>
              )
            })}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Who can join</FieldLegend>
          <div role="radiogroup" aria-label="Who can join" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { v: "public", icon: GlobeIcon, label: "Anyone", hint: "Anyone can join. The wall, members and collections are visible to everyone." },
                { v: "invite", icon: LockIcon, label: "Invite only", hint: "People join with an invite link or after asking. Only members see inside." },
              ] as const
            ).map((o) => {
              const on = visibility === o.v
              return (
                <label
                  key={o.v}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <input type="radio" name="crew-visibility" value={o.v} checked={on} onChange={() => setVisibility(o.v)} className="sr-only" />
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <o.icon aria-hidden className={cn("size-4", on ? "text-ion" : "text-muted-foreground")} />
                    {o.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>

        <Field data-invalid={errors.tags ? true : undefined}>
          <FieldLabel htmlFor="crew-tags">Topics</FieldLabel>
          <TagInput id="crew-tags" value={tags} onChange={setTags} invalid={Boolean(errors.tags)} describedBy="crew-tags-hint" />
          <FieldDescription id="crew-tags-hint">Up to 8, like “agents” or “speech”. Press Enter or a comma after each one.</FieldDescription>
          {errors.tags && <FieldError id="crew-tags-error">{errors.tags}</FieldError>}
        </Field>

        {errors.form && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? (crew ? "Saving…" : "Starting…") : crew ? "Save changes" : "Start the crew"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {!live && !crew && <span className="text-xs text-muted-foreground">This copy has no database, so the crew stays in this browser.</span>}
        </div>
      </FieldGroup>
    </form>
  )
}
