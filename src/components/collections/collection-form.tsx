"use client"

import { useId, useState } from "react"
import { GlobeIcon, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { validateCollection, type CollectionInput } from "@/lib/community"
import { cn } from "@/lib/utils"

/** Title, description and visibility of a collection. Used to create one and to edit it. */
export function CollectionForm({
  initial = { title: "", description: "", isPublic: true },
  submitLabel,
  onSubmit,
  onCancel,
  compact = false,
}: {
  initial?: CollectionInput
  submitLabel: string
  onSubmit: (input: CollectionInput) => Promise<void>
  onCancel?: () => void
  /** Hides the description, for the quick form inside "Add to collection". */
  compact?: boolean
}) {
  const uid = useId()
  const [value, setValue] = useState(initial)
  const [errors, setErrors] = useState<{ title?: string; description?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const found = validateCollection(value)
    setErrors(found)
    if (found.title || found.description) {
      document.getElementById(found.title ? `${uid}-title` : `${uid}-desc`)?.focus()
      return
    }
    setBusy(true)
    try {
      await onSubmit({ ...value, title: value.title.trim(), description: value.description.trim() })
    } catch (err) {
      setErrors({ form: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup className="gap-4">
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-title`}>Title</FieldLabel>
          <Input
            id={`${uid}-title`}
            value={value.title}
            maxLength={80}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
            placeholder="Models that fit in a phone"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${uid}-title-error` : undefined}
            className="h-10 bg-background/60"
          />
          {errors.title && <FieldError id={`${uid}-title-error`}>{errors.title}</FieldError>}
        </Field>
        {!compact && (
          <Field data-invalid={errors.description ? true : undefined}>
            <FieldLabel htmlFor={`${uid}-desc`}>Description</FieldLabel>
            <Textarea
              id={`${uid}-desc`}
              value={value.description}
              maxLength={500}
              rows={3}
              onChange={(e) => setValue({ ...value, description: e.target.value })}
              placeholder="Who is it for, and what will they learn?"
              aria-invalid={errors.description ? true : undefined}
              className="bg-background/60"
            />
            {errors.description ? <FieldError>{errors.description}</FieldError> : <FieldDescription>Optional. Up to 500 characters.</FieldDescription>}
          </Field>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Who can see it</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: "Public", hint: "Anyone can find and follow it", icon: GlobeIcon },
              { v: false, label: "Private", hint: "Only you", icon: LockIcon },
            ].map((o) => {
              const on = value.isPublic === o.v
              return (
                <label
                  key={o.label}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    on ? "border-ion/60 bg-ion/10" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <input type="radio" name={`${uid}-vis`} checked={on} onChange={() => setValue({ ...value, isPublic: o.v })} className="sr-only" />
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <o.icon aria-hidden className="size-3.5" />
                    {o.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
