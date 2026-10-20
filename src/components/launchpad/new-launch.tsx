"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ImagePlusIcon, RocketIcon, XIcon } from "lucide-react"
import { useMounted } from "@/components/events/event-time"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { LaunchCover } from "@/components/launchpad/launch-bits"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { canUploadGallery, createLaunch, LIMITS, uploadGalleryImage, validateLaunch, type LaunchErrors, type NewLaunch } from "@/lib/launchpad"
import { listMyProjects, type Project } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { Copy } from "@/components/content/copy"

/** Schedule a launch. Renders in the browser only, because the default time depends on your clock. */
export function NewLaunchForm() {
  const mounted = useMounted()
  const { ready } = useSession()
  if (!mounted || (live && !ready)) {
    return (
      <div className="border border-border bg-card flex flex-col gap-4 rounded-2xl p-6" aria-busy="true" aria-label="Loading form">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }
  return (
    <Gate cap="launch.create" action="schedule a launch">
      <Form />
    </Gate>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function Form() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectId, setProjectId] = useState("")
  const [tagline, setTagline] = useState("")
  const [description, setDescription] = useState("")
  // Tomorrow at 15:00 your time is a sensible default: people across time zones are awake.
  const [date, setDate] = useState(() => localDate(new Date(Date.now() + 864e5)))
  const [time, setTime] = useState("15:00")
  const [bounds] = useState(() => ({
    min: localDate(new Date()),
    max: localDate(new Date(Date.now() + 89 * 864e5)),
  }))
  const [gallery, setGallery] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<LaunchErrors>({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let stale = false
    listMyProjects()
      .then((list) => {
        if (stale) return
        setProjects(list.filter((p) => p.status === "published"))
      })
      .catch(() => !stale && setProjects([]))
    return () => {
      stale = true
    }
  }, [])

  const project = projects?.find((p) => p.id === projectId)

  // Prefill the tagline from the project's summary the first time one is picked, if it is still empty.
  function pickProject(id: string) {
    setProjectId(id)
    const p = projects?.find((x) => x.id === id)
    if (p && !tagline.trim()) setTagline(p.summary.slice(0, LIMITS.tagline[1]))
  }

  const at = (() => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    const t = /^(\d{2}):(\d{2})$/.exec(time)
    if (!d || !t) return ""
    const v = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
    return Number.isFinite(v.getTime()) ? v.toISOString() : ""
  })()

  const subject: NewLaunch["subject"] = { type: "project", id: projectId, name: project?.name ?? "" }
  const input: NewLaunch = {
    subject,
    tagline,
    description,
    launchAt: at,
    gallery,
  }

  async function addPictures(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setErrors((e) => ({ ...e, gallery: undefined }))
    try {
      for (const file of [...files].slice(0, LIMITS.gallery - gallery.length)) {
        const url = await uploadGalleryImage(file)
        setGallery((g) => [...g, url].slice(0, LIMITS.gallery))
      }
    } catch (e) {
      setErrors((x) => ({ ...x, gallery: (e as Error).message }))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || uploading) return
    const found = validateLaunch(input)
    setErrors(found)
    const first = (["subject", "tagline", "launchAt", "description", "gallery"] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`ln-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const created = await createLaunch(input)
      router.push(`/launchpad/${created.id}`)
    } catch (err) {
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  const err = (k: keyof LaunchErrors) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `ln-${k}-error` } : {})
  const selectCls = "h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <form onSubmit={submit} noValidate className="border border-border bg-card rounded-2xl p-5 md:p-7">
      <FieldGroup>
        <Field data-invalid={errors.subject ? true : undefined}>
          <FieldLabel htmlFor="ln-subject"><Copy k="launchpad-new.new-launch.project-to-launch">Project to launch</Copy></FieldLabel>
          {projects === null ? (
            <Skeleton className="h-10 w-full" />
          ) : projects.length ? (
            <select id="ln-subject" value={projectId} onChange={(e) => pickProject(e.target.value)} className={selectCls} {...err("subject")}>
              <option value="" className="bg-popover">
                Pick one of your published projects
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-popover">
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <div id="ln-subject" tabIndex={-1} className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              <p><Copy k="launchpad-new.new-launch.you-have-no-published-projects" multiline>You have no published projects yet. A launch is for a model, dataset, tool or repo you published on Nexverse.</Copy></p>
              <Link href="/new/project" className="text-ion hover:underline">
                <Copy k="launchpad-new.new-launch.create-a-project">Create a project</Copy>
              </Link>
            </div>
          )}
          {errors.subject ? (
            <FieldError id="ln-subject-error">{errors.subject}</FieldError>
          ) : (
            <FieldDescription><Copy k="launchpad-new.new-launch.one-scheduled-or-live-launch">One scheduled or live launch per project at a time, up to 3 new launches a day.</Copy></FieldDescription>
          )}
        </Field>

        <Field data-invalid={errors.tagline ? true : undefined}>
          <FieldLabel htmlFor="ln-tagline"><Copy k="launchpad-new.new-launch.tagline">Tagline</Copy></FieldLabel>
          <Input
            id="ln-tagline"
            value={tagline}
            maxLength={LIMITS.tagline[1]}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="See what every tokenizer charges for your language"
            className="h-11 bg-background/60"
            {...err("tagline")}
          />
          {errors.tagline ? (
            <FieldError id="ln-tagline-error">{errors.tagline}</FieldError>
          ) : (
            <FieldDescription>
              One line: what it does and for whom. <span className="tabular">{tagline.length}/140</span>
            </FieldDescription>
          )}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Launch time</FieldLegend>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Field data-invalid={errors.launchAt ? true : undefined}>
              <FieldLabel htmlFor="ln-launchAt"><Copy k="launchpad-new.new-launch.date">Date</Copy></FieldLabel>
              <Input id="ln-launchAt" type="date" value={date} min={bounds.min} max={bounds.max} onChange={(e) => setDate(e.target.value)} className="h-10 bg-background/60" {...err("launchAt")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ln-time"><Copy k="launchpad-new.new-launch.time-yours">Time (yours)</Copy></FieldLabel>
              <Input id="ln-time" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} className="h-10 bg-background/60" />
            </Field>
          </div>
          {errors.launchAt ? (
            <FieldError id="ln-launchAt-error">{errors.launchAt}</FieldError>
          ) : (
            at && (
              <FieldDescription aria-live="polite">
                Countdown until{" "}
                {new Date(at).toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                , then 24 hours of boosting. It competes for Launch of the day on{" "}
                {new Date(at).toLocaleDateString("en", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}{" "}
                (UTC).
              </FieldDescription>
            )
          )}
        </FieldSet>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="ln-description"><Copy k="launchpad-new.new-launch.whats-new-optional">What’s new (optional)</Copy></FieldLabel>
          <MarkdownComposer
            id="ln-description"
            value={description}
            onChange={setDescription}
            maxLength={LIMITS.description}
            rows={5}
            mentions={false}
            placeholder="What it does, what changed, what you want feedback on."
            invalid={Boolean(errors.description)}
          />
          {errors.description && <FieldError id="ln-description-error">{errors.description}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Gallery (optional)</FieldLegend>
          <div className="flex flex-wrap gap-3">
            {gallery.map((src, i) => (
              <div key={src} className="relative">
                <LaunchCover launch={{ id: src, name: "", gallery: [src] }} className="h-20 w-32" rounded="rounded-lg" />
                <button
                  type="button"
                  onClick={() => setGallery((g) => g.filter((x) => x !== src))}
                  aria-label={`Remove picture ${i + 1}`}
                  className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              </div>
            ))}
            {canUploadGallery() && gallery.length < LIMITS.gallery && (
              <label className="pressable flex h-20 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring">
                <ImagePlusIcon aria-hidden className="size-5" />
                {uploading ? "Uploading…" : "Add pictures"}
                <input
                  id="ln-gallery"
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => void addPictures(e.target.files)}
                />
              </label>
            )}
          </div>
          {errors.gallery ? (
            <FieldError id="ln-gallery-error">{errors.gallery}</FieldError>
          ) : (
            <FieldDescription>
              {canUploadGallery()
                ? "Up to 6 screenshots, PNG, JPEG, WebP or GIF, 2 MB each. Without pictures the launch gets its own night-sky cover."
                : "Pictures can be added once this site is connected to its database. The launch gets its own night-sky cover."}
            </FieldDescription>
          )}
        </FieldSet>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy || uploading}>
            <RocketIcon aria-hidden className="-rotate-45" /> {busy ? "Scheduling…" : "Schedule launch"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground"><Copy k="launchpad-new.new-launch.this-copy-has-no-database">This copy has no database, so the launch stays in this browser.</Copy></span>}
        </div>
      </FieldGroup>
    </form>
  )
}
