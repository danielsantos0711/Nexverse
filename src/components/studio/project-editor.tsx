"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon, CalendarClockIcon, CheckCircle2Icon, ExternalLinkIcon, EyeOffIcon, HistoryIcon, RocketIcon, SaveIcon, StarIcon, Trash2Icon } from "lucide-react"
import { DownloadsPanel } from "@/components/downloads/downloads-panel"
import { AudiencePicker, CoauthorsInput, CoverPicker, GalleryEditor, LicensePicker, LinksEditor, ScheduleField, Switch } from "@/components/editor/publish-fields"
import { RevisionsDialog } from "@/components/editor/revisions"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Cover, KIND_ICONS, KindTag } from "@/components/hub/bits"
import { MarkdownEditor } from "@/components/studio/markdown-editor"
import { TagInput } from "@/components/studio/tag-input"
import { Gate } from "@/components/moderation/gate"
import { ConfirmDialog, StatusPill, StudioHead } from "@/components/studio/ui"
import { fromRows, toRows, VersionsEditor, type VersionRow } from "@/components/studio/versions-editor"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { KINDS, LANGUAGES, type LanguageCode, type ResourceKind } from "@/lib/data"
import {
  canEditProject,
  createProject,
  deleteProject,
  emptyProject,
  featureProject,
  getProject,
  isScheduled,
  LIMITS,
  projectPath,
  slugify,
  slugTaken,
  toInput,
  updateProject,
  validateProject,
  type Project,
  type ProjectErrors,
  type ProjectInput,
  type ProjectStatus,
} from "@/lib/projects"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Form = Omit<ProjectInput, "versions"> & { versions: VersionRow[] }

const README_TEMPLATE = (name: string, kind: ResourceKind) => `# ${name || "Project name"}

One paragraph on what this ${KINDS[kind].label.toLowerCase()} does and who it is for.

## Quick start

\`\`\`bash
# how to install or run it
\`\`\`

## How it was made

What it was trained or built on, and anything people should know before using it.

## Limitations

Where it falls short, so nobody is surprised.
`

/** Where each field's error sends focus, in the order they appear on the page. */
const FIELD_IDS: [keyof ProjectErrors, string][] = [
  ["name", "p-name"],
  ["slug", "p-slug"],
  ["summary", "p-summary"],
  ["readme", "p-readme"],
  ["tags", "p-tags"],
  ["repo", "p-repo"],
  ["paper", "p-paper"],
  ["demo", "p-demo"],
  ["license", "p-license"],
  ["cover", "p-cover"],
  ["gallery", "p-gallery"],
  ["extraLinks", "p-links"],
  ["versions", "p-versions"],
  ["publishAt", "p-publish-at"],
]

const KIND_LIST = Object.keys(KINDS) as ResourceKind[]

/** Create a project (no id) or edit one of yours. Members only when a database is connected. */
export function ProjectEditor({ id }: { id?: string }) {
  const { ready, user } = useSession()
  const role = useRole()
  const params = useSearchParams()
  const [loaded, setLoaded] = useState<{ project: Project | null; error: string } | null>(null)

  useEffect(() => {
    if (!id || (live && !ready)) return
    let stale = false
    getProject(id)
      .then((project) => !stale && setLoaded({ project, error: "" }))
      .catch((e: Error) => !stale && setLoaded({ project: null, error: e.message }))
    return () => {
      stale = true
    }
  }, [id, ready])

  if (live && !ready) return <PageSkeleton />
  if (live && (!user || role.suspended)) {
    // Guests get the way in; suspended members are told why they cannot publish right now.
    return (
      <div className="shell max-w-3xl pb-16">
        <StudioHead title={id ? "Edit project" : "New project"} lead="Your models, datasets, tools and repos get their own page on Nexverse, with a README, a changelog and a place to talk about them." />
        <Gate action="publish a project">{null}</Gate>
      </div>
    )
  }
  if (id) {
    if (!loaded) return <PageSkeleton />
    if (loaded.error) return <Problem title="This project could not be loaded" detail={loaded.error} />
    const p = loaded.project
    if (!p) return <Problem title="This project is not here" detail="It may have been deleted, or the address is wrong." />
    if (!canEditProject(p, user?.id)) return <Problem title="You can only edit your own projects" detail="This project belongs to someone else." href={projectPath(p.id)} action="View the project" />
    return <Editor key={p.id} project={p} initialNotice={params.get("saved") === "draft" ? "Draft saved. Only you can see it." : ""} />
  }
  const k = params.get("kind")
  const kind = KIND_LIST.includes(k as ResourceKind) ? (k as ResourceKind) : "model"
  // The Lab's card builders hand over a name, a summary and a finished README.
  const prefill = { name: params.get("name") ?? "", summary: params.get("summary") ?? "", readme: params.get("readme") ?? "" }
  return <Editor key={kind} initialKind={kind} prefill={prefill} />
}

function Problem({ title, detail, href = "/studio", action = "Back to your studio" }: { title: string; detail: string; href?: string; action?: string }) {
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href={href} className="text-ion hover:underline">
          {action}
        </Link>
      </EmptyContent>
    </Empty>
  )
}

function Editor({
  project,
  initialKind = "model",
  initialNotice = "",
  prefill,
}: {
  project?: Project
  initialKind?: ResourceKind
  initialNotice?: string
  prefill?: { name: string; summary: string; readme: string }
}) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const initial = useMemo<Form>(() => {
    const base = project ? toInput(project) : emptyProject(initialKind)
    if (!project && prefill) {
      if (prefill.name) Object.assign(base, { name: prefill.name.slice(0, 80), slug: slugify(prefill.name) })
      if (prefill.summary) base.summary = prefill.summary
      if (prefill.readme) base.readme = prefill.readme
    }
    return { ...base, versions: toRows(base.versions) }
  }, [project, initialKind, prefill])
  const [form, setForm] = useState<Form>(initial)
  const [saved, setSaved] = useState<{ form: Form; project: Project | null }>({ form: initial, project: project ?? null })
  const [slugTouched, setSlugTouched] = useState(Boolean(project))
  const [errors, setErrors] = useState<ProjectErrors>({})
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState<ProjectStatus | null>(null)
  const [notice, setNotice] = useState(initialNotice)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState(false)
  const [featured, setFeatured] = useState<{ at: string | null; busy: boolean; error: string }>({ at: project?.featuredAt ?? null, busy: false, error: "" })
  const { user } = useSession()
  const { isStaff } = useRole()
  const summaryRef = useRef<HTMLDivElement>(null)

  const current = saved.project
  const dirty = JSON.stringify(form) !== JSON.stringify(saved.form)

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setNotice("")
    if (errors[key as keyof ProjectErrors]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function setName(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
    setNotice("")
    if (errors.name || errors.slug) setErrors((e) => ({ ...e, name: undefined, slug: slugTouched ? e.slug : undefined }))
  }

  function setLink(key: keyof Form["links"], value: string) {
    setForm((f) => ({ ...f, links: { ...f.links, [key]: value } }))
    setNotice("")
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function checkSlug() {
    if (!form.slug || errors.slug) return
    try {
      if (await slugTaken(form.slug, current?.id)) setErrors((e) => ({ ...e, slug: "You already have a project at that address. Pick another one." }))
    } catch {}
  }

  function focusFirst(e: ProjectErrors) {
    const target = FIELD_IDS.find(([k]) => e[k])
    if (!target) return
    requestAnimationFrame(() => {
      const el = document.getElementById(target[1])
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    })
  }

  async function save(status: ProjectStatus) {
    if (busy) return
    const input: ProjectInput = { ...form, status, versions: fromRows(form.versions) }
    const found = validateProject(input)
    setErrors(found)
    setFormError("")
    if (Object.values(found).some(Boolean)) {
      focusFirst(found)
      return
    }
    setBusy(status)
    try {
      if (current) {
        const next = await updateProject(current.id, input, current)
        const nextForm: Form = { ...toInput(next), versions: toRows(next.versions) }
        setForm(nextForm)
        setSaved({ form: nextForm, project: next })
        setNotice(
          status === "published" && isScheduled(next)
            ? `Scheduled. It goes live on ${new Date(next.publishAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
            : status === "published"
              ? current.status === "published"
                ? "Changes are live."
                : next.visibility === "public"
                  ? "Published. Everyone can see it now."
                  : next.visibility === "members"
                    ? "Published for signed-in members."
                    : "Published. Anyone with the link can open it."
              : current.status === "published"
                ? "Unpublished. Only you and co-authors can see it now."
                : "Draft saved."
        )
      } else {
        const next = await createProject(input)
        const nextForm: Form = { ...toInput(next), versions: toRows(next.versions) }
        // Marks the form clean before leaving, so the unsaved-changes guard stays quiet.
        setSaved({ form: nextForm, project: next })
        setForm(nextForm)
        router.push(status === "published" ? projectPath(next.id) : `${projectPath(next.id)}/edit?saved=draft`)
      }
    } catch (e) {
      const message = (e as Error).message
      if (/address/i.test(message)) {
        setErrors((x) => ({ ...x, slug: message }))
        focusFirst({ slug: message })
      } else {
        setFormError(message)
        requestAnimationFrame(() => summaryRef.current?.focus())
      }
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!current) return
    await deleteProject(current.id)
    setSaved({ form, project: null })
    router.push("/studio")
  }

  const errorList = FIELD_IDS.filter(([k]) => errors[k])
  const published = current?.status === "published"
  const coverSeed = form.slug || "new-project"

  return (
    <div className="shell pb-24">
      <StudioHead
        eyebrow={
          <Link href="/studio" className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <ArrowLeftIcon aria-hidden className="size-3.5" /> Your studio
          </Link>
        }
        title={current ? `Edit ${current.name}` : "New project"}
        lead={current ? undefined : "Give your model, dataset, tool or repo a home: a README, links, a changelog and a place to talk about it."}
      >
        {current && (
          <>
            {current.local ? <StatusPill tone="local">On this device</StatusPill> : published ? <StatusPill tone="live">Published</StatusPill> : <StatusPill tone="draft">Draft</StatusPill>}
            {(published || current.local) && (
              <Link href={projectPath(current.id)} className="inline-flex items-center gap-1.5 text-sm text-ion hover:underline">
                View page <ExternalLinkIcon aria-hidden className="size-3.5" />
              </Link>
            )}
          </>
        )}
      </StudioHead>

      {!live && (
        <p className="mb-6 rounded-xl border border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          This copy of Nexverse has no database, so projects are saved in this browser only and nobody else can see them.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save(published ? "published" : "draft")
        }}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <AnimatePresence initial={false}>
            {(errorList.length > 0 || formError) && (
              <motion.div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm outline-none"
              >
                {formError ? (
                  <p>{formError}</p>
                ) : (
                  <>
                    <p className="font-medium">Fix {errorList.length === 1 ? "this" : `these ${errorList.length} things`} to save:</p>
                    <ul className="mt-2 list-disc pl-5">
                      {errorList.map(([k, fieldId]) => (
                        <li key={k}>
                          <a href={`#${fieldId}`} className="underline underline-offset-2">
                            {errors[k]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <Section title="Basics">
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">What is it?</FieldLegend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {KIND_LIST.map((k) => {
                    const Icon = KIND_ICONS[k]
                    const on = form.kind === k
                    return (
                      <label
                        key={k}
                        className={cn(
                          "pressable relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                          on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
                        )}
                      >
                        <input type="radio" name="kind" value={k} checked={on} onChange={() => set("kind", k)} className="sr-only" />
                        <Icon aria-hidden className={cn("size-5", on ? "text-ion" : "text-muted-foreground")} />
                        <span className="font-medium">{KINDS[k].label}</span>
                      </label>
                    )
                  })}
                </div>
                <FieldDescription>{KINDS[form.kind].blurb}</FieldDescription>
              </FieldSet>

              <div className="grid gap-6 md:grid-cols-2">
                <Field data-invalid={errors.name ? true : undefined}>
                  <FieldLabel htmlFor="p-name">Name</FieldLabel>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={LIMITS.name[1]}
                    autoComplete="off"
                    placeholder="e.g. tiny-rag"
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? "p-name-error" : undefined}
                    className="h-11 bg-background/60"
                  />
                  {errors.name && <FieldError id="p-name-error">{errors.name}</FieldError>}
                </Field>
                <Field data-invalid={errors.slug ? true : undefined}>
                  <FieldLabel htmlFor="p-slug">Address</FieldLabel>
                  <div className="flex h-11 items-center rounded-lg border border-input bg-background/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20">
                    <span aria-hidden className="pl-2.5 font-mono text-sm text-muted-foreground">
                      {form.kind}/
                    </span>
                    <input
                      id="p-slug"
                      value={form.slug}
                      onChange={(e) => {
                        setSlugTouched(true)
                        set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60))
                      }}
                      onBlur={checkSlug}
                      maxLength={60}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={errors.slug ? true : undefined}
                      aria-describedby={errors.slug ? "p-slug-error" : "p-slug-hint"}
                      className="h-full min-w-0 flex-1 bg-transparent pr-2.5 font-mono text-base outline-none md:text-sm"
                    />
                  </div>
                  {errors.slug ? (
                    <FieldError id="p-slug-error">{errors.slug}</FieldError>
                  ) : (
                    <FieldDescription id="p-slug-hint">Lowercase letters, numbers and dashes. It also draws the cover.</FieldDescription>
                  )}
                </Field>
              </div>

              <Field data-invalid={errors.summary ? true : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <FieldLabel htmlFor="p-summary">One-line summary</FieldLabel>
                  <Counter value={form.summary.trim().length} max={LIMITS.summary[1]} />
                </div>
                <Textarea
                  id="p-summary"
                  value={form.summary}
                  onChange={(e) => set("summary", e.target.value.replace(/\n/g, " "))}
                  maxLength={LIMITS.summary[1] + 20}
                  rows={2}
                  placeholder="What it does and who it is for, in one sentence."
                  aria-invalid={errors.summary ? true : undefined}
                  aria-describedby={errors.summary ? "p-summary-error" : undefined}
                  className="bg-background/60"
                />
                {errors.summary && <FieldError id="p-summary-error">{errors.summary}</FieldError>}
              </Field>
            </FieldGroup>
          </Section>

          <Section title="Cover and gallery">
            <FieldGroup>
              <Field data-invalid={errors.cover ? true : undefined}>
                <FieldLabel htmlFor="p-cover">Cover</FieldLabel>
                <CoverPicker id="p-cover" value={form.coverUrl} onChange={(v) => set("coverUrl", v)} fallback={<Cover seed={`${coverSeed}banner`} kind={form.kind} />} />
                {errors.cover && <FieldError>{errors.cover}</FieldError>}
              </Field>
              <div id="p-gallery" tabIndex={-1} className="flex flex-col gap-2 outline-none">
                <p className="text-sm font-medium">Gallery</p>
                <GalleryEditor value={form.gallery} onChange={(v) => set("gallery", v)} max={LIMITS.gallery} />
                {errors.gallery && <FieldError>{errors.gallery}</FieldError>}
              </div>
            </FieldGroup>
          </Section>

          <Section
            title="README"
            action={
              !form.readme.trim() && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set("readme", README_TEMPLATE(form.name, form.kind))}>
                  Start from a template
                </Button>
              )
            }
          >
            <Field data-invalid={errors.readme ? true : undefined}>
              <FieldLabel htmlFor="p-readme" className="sr-only">
                README
              </FieldLabel>
              <MarkdownEditor
                id="p-readme"
                draftKey={`project:${current?.id ?? `new-${form.kind}`}:readme`}
                title={form.name || "README"}
                value={form.readme}
                onChange={(v) => set("readme", v)}
                maxLength={LIMITS.readme}
                invalid={Boolean(errors.readme)}
                describedBy="p-readme-hint"
                placeholder={"# What it is\n\nHow to use it, how it was made, and where it falls short."}
              />
              {errors.readme ? (
                <FieldError>{errors.readme}</FieldError>
              ) : (
                <FieldDescription id="p-readme-hint">
                  Markdown, the way GitHub reads it: headings, lists, tables, code blocks and links. {form.readme.length.toLocaleString("en")} / 50,000 characters.
                </FieldDescription>
              )}
            </Field>
          </Section>

          <Section title="Details">
            <FieldGroup>
              <Field data-invalid={errors.tags ? true : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <FieldLabel htmlFor="p-tags">Tags</FieldLabel>
                  <Counter value={form.tags.length} max={LIMITS.tags} />
                </div>
                <TagInput id="p-tags" value={form.tags} onChange={(t) => set("tags", t)} invalid={Boolean(errors.tags)} describedBy="p-tags-hint" />
                {errors.tags ? <FieldError>{errors.tags}</FieldError> : <FieldDescription id="p-tags-hint">Press Enter or type a comma after each one.</FieldDescription>}
              </Field>

              <Field data-invalid={errors.license ? true : undefined}>
                <FieldLabel htmlFor="p-license">Licence</FieldLabel>
                <LicensePicker id="p-license" value={form.license} onChange={(v) => set("license", v)} invalid={Boolean(errors.license)} describedBy="p-license-hint" />
                {errors.license ? (
                  <FieldError id="p-license-hint">{errors.license}</FieldError>
                ) : (
                  <FieldDescription id="p-license-hint">What others may do with it, by SPDX id. Not sure? Apache 2.0 and MIT are common for code and weights, CC-BY for data.</FieldDescription>
                )}
              </Field>

              <FieldSet>
                <FieldLegend variant="label">Languages it works in</FieldLegend>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => {
                    const on = form.langs.includes(l)
                    return (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set("langs", on ? form.langs.filter((x) => x !== l) : [...form.langs, l])}
                        className={cn(
                          "pressable inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          on ? "border-ion/50 bg-ion/15 text-foreground" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span lang={l}>{LANGUAGES[l].native}</span>
                        {LANGUAGES[l].native !== LANGUAGES[l].name && <span className="sr-only">({LANGUAGES[l].name})</span>}
                      </button>
                    )
                  })}
                </div>
                <FieldDescription>Leave empty if language does not apply.</FieldDescription>
              </FieldSet>
            </FieldGroup>
          </Section>

          <Section title="Links">
            <FieldGroup>
              <LinkField id="p-repo" label="GitHub repository" placeholder="https://github.com/owner/repo" value={form.links.repo} error={errors.repo} onChange={(v) => setLink("repo", v)} />
              <div className="grid gap-6 md:grid-cols-2">
                <LinkField id="p-paper" label="Paper or write-up" placeholder="https://… your paper, report or blog post" value={form.links.paper} error={errors.paper} onChange={(v) => setLink("paper", v)} />
                <LinkField id="p-demo" label="Demo" placeholder="https://" value={form.links.demo} error={errors.demo} onChange={(v) => setLink("demo", v)} />
              </div>
              <div id="p-links" tabIndex={-1} className="flex flex-col gap-2 outline-none">
                <p className="text-sm font-medium">
                  More links <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <LinksEditor value={form.extraLinks} onChange={(v) => set("extraLinks", v)} max={LIMITS.links} invalid={Boolean(errors.extraLinks)} />
                {errors.extraLinks ? <FieldError>{errors.extraLinks}</FieldError> : <FieldDescription>Docs, a model card, a weights mirror, a write-up. Shown on the page with their names.</FieldDescription>}
              </div>
            </FieldGroup>
          </Section>

          <Section title="Versions and changelog">
            <div id="p-versions" tabIndex={-1} className="outline-none">
              <VersionsEditor value={form.versions} onChange={(rows) => set("versions", rows)} describedBy={errors.versions ? "p-versions-error" : undefined} />
              {errors.versions && (
                <FieldError id="p-versions-error" className="mt-3">
                  {errors.versions}
                </FieldError>
              )}
            </div>
          </Section>

          <Section title="Co-authors">
            <Field>
              <FieldLabel htmlFor="p-coauthors" className="sr-only">
                Co-authors
              </FieldLabel>
              <CoauthorsInput
                id="p-coauthors"
                value={form.coauthors}
                onChange={(v) => set("coauthors", v)}
                ownerId={current?.ownerId ?? user?.id}
                disabled={Boolean(current && !current.local && current.ownerId !== user?.id)}
                max={LIMITS.coauthors}
              />
              <FieldDescription>
                {current && !current.local && current.ownerId !== user?.id
                  ? "Only the owner changes who the co-authors are."
                  : "Co-authors are credited on the page and can edit it, its changelog and its files with you. They get a notification."}
              </FieldDescription>
            </Field>
          </Section>

          {current && (!current.ownerId || current.ownerId === user?.id || current.local) && (
            <Section title="Danger zone">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Deleting removes the page, its changelog and its discussion for everyone. It cannot be undone.</p>
                <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon aria-hidden /> Delete project
                </Button>
              </div>
            </Section>
          )}
        </div>

        <aside aria-label="Preview and publishing" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative aspect-[16/9]">
              {form.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- member picture
                <img src={form.coverUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
              ) : (
                <Cover seed={coverSeed} kind={form.kind} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
              <KindTag kind={form.kind} className="absolute top-3 left-3 rounded-full bg-black/50 px-2 py-1 backdrop-blur" />
            </div>
            <div className="flex flex-col gap-1 p-4 pt-0">
              <p className="truncate font-medium">{form.name.trim() || "Your project"}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{form.summary.trim() || "Your one-line summary shows here."}</p>
              {form.tags.length > 0 && (
                <p className="mt-1 truncate text-xs text-muted-foreground">{form.tags.map((t) => `#${t}`).join(" ")}</p>
              )}
            </div>
          </div>

          <div className="glass flex flex-col gap-4 rounded-2xl p-4">
            <AudiencePicker
              name="p-visibility"
              withDraft={false}
              legend="Who can see it once published"
              value={form.visibility}
              onChange={(v) => v !== "draft" && set("visibility", v)}
            />
            <div id="p-publish-at" tabIndex={-1} className="outline-none">
              <ScheduleField id="p-publish-at-input" value={form.publishAt} onChange={(v) => set("publishAt", v)} error={errors.publishAt} />
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="flex flex-col">
                <span className="font-medium">Discussion</span>
                <span className="text-xs text-muted-foreground">{form.commentsEnabled ? "Members can comment on the page." : "Comments are closed. Earlier ones stay."}</span>
              </span>
              <Switch checked={form.commentsEnabled} onChange={(v) => set("commentsEnabled", v)} label="Allow comments" />
            </label>
          </div>

          <div className="glass flex flex-col gap-3 rounded-2xl p-4">
            <p className="text-sm text-muted-foreground">
              {current && isScheduled(current)
                ? `Scheduled for ${new Date(current.publishAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Saving keeps the schedule.`
                : published
                ? "This project is public. Saving updates the live page."
                : live
                  ? "Drafts are only visible to you. Publish when it is ready for everyone."
                  : "Saved in this browser only."}
            </p>
            {published ? (
              <>
                <Button type="button" size="lg" onClick={() => save("published")} disabled={busy !== null || !dirty}>
                  <SaveIcon aria-hidden /> {busy === "published" ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={busy !== null}>
                  <EyeOffIcon aria-hidden /> {busy === "draft" ? "Unpublishing…" : "Unpublish"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="lg" onClick={() => save("published")} disabled={busy !== null}>
                  {form.publishAt ? <CalendarClockIcon aria-hidden /> : <RocketIcon aria-hidden />}
                  {busy === "published" ? (form.publishAt ? "Scheduling…" : "Publishing…") : form.publishAt ? "Schedule" : "Publish"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={busy !== null || (Boolean(current) && !dirty)}>
                  <SaveIcon aria-hidden /> {busy === "draft" ? "Saving…" : "Save draft"}
                </Button>
              </>
            )}
            <p role="status" aria-live="polite" className="min-h-5 text-sm">
              {notice ? (
                <span className="inline-flex items-center gap-1.5 text-ok">
                  <CheckCircle2Icon aria-hidden className="size-4" /> {notice}
                </span>
              ) : dirty && current ? (
                <span className="text-muted-foreground">Unsaved changes</span>
              ) : null}
            </p>
            {current && !current.local && (
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setHistory(true)}>
                <HistoryIcon aria-hidden /> Version history
              </Button>
            )}
          </div>

          {isStaff && current && !current.local && (
            <div className="glass flex flex-col gap-2 rounded-2xl p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="flex flex-col">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <StarIcon aria-hidden className="size-4 text-gold" /> Featured
                  </span>
                  <span className="text-xs text-muted-foreground">Staff only. Shows it in featured lists; written to the moderation log.</span>
                </span>
                <Switch
                  checked={Boolean(featured.at)}
                  disabled={featured.busy || !published}
                  label="Feature this project"
                  onChange={async (on) => {
                    setFeatured((f) => ({ ...f, busy: true, error: "" }))
                    try {
                      const at = await featureProject(current.id, on)
                      setFeatured({ at, busy: false, error: "" })
                    } catch (e) {
                      setFeatured((f) => ({ ...f, busy: false, error: (e as Error).message }))
                    }
                  }}
                />
              </label>
              {!published && <p className="text-xs text-muted-foreground">Publish it first.</p>}
              {featured.error && (
                <p role="alert" className="text-xs text-destructive">
                  {featured.error}
                </p>
              )}
            </div>
          )}
        </aside>
      </form>

      {/* Outside the form: the uploader has its own fields and buttons. */}
      {current && !current.local && (
        <div className="mt-8 lg:mr-[22rem]">
          <DownloadsPanel kind="project" targetId={current.id} canEdit zipName={`${current.slug}${current.versions[0] ? `-${current.versions[0].version}` : ""}`} versions={current.versions.map((v) => v.version)} />
        </div>
      )}

      {current && !current.local && (
        <RevisionsDialog
          projectId={current.id}
          open={history}
          onOpenChange={setHistory}
          onRestore={(r) => {
            setForm((f) => ({ ...f, name: r.name, summary: r.summary, readme: r.readme }))
            setNotice("Earlier version restored in the editor. Save to keep it.")
          }}
        />
      )}

      {current && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${current.name}?`}
          description="The page, its changelog and its discussion go for everyone. This cannot be undone."
          confirm="Delete project"
          onConfirm={remove}
        />
      )}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`
  return (
    <section aria-labelledby={id} className="glass flex flex-col gap-5 rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={cn("text-xs tabular", value > max ? "text-destructive" : "text-muted-foreground")} aria-label={`${value} of ${max}`}>
      {value}/{max}
    </span>
  )
}

function LinkField({ id, label, placeholder, value, error, onChange }: { id: string; label: string; placeholder: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      <Input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        placeholder={placeholder}
        autoComplete="url"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 bg-background/60"
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
