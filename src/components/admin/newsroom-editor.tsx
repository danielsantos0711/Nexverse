"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { EyeIcon, PencilLineIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { Notice, StatusLine } from "@/components/admin/controls"
import { Markdown } from "@/components/live/markdown"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAiStatus } from "@/lib/ai-client"
import { useCaps } from "@/lib/caps"
import {
  checkDraft,
  createStory,
  draftFromLink,
  getStoryForEdit,
  NEWS_CATEGORIES,
  refreshPublicNews,
  setStoryStatus,
  updateStory,
  type DraftErrors,
  type Story,
  type StoryDraft,
} from "@/lib/newsroom"
import { cn } from "@/lib/utils"

const EMPTY: StoryDraft = { title: "", dek: "", body: "", category: "launch", unconfirmed: false, cover: "", sources: [{ url: "", title: "", publisher: "" }] }

const toDraft = (s: Story): StoryDraft => ({
  title: s.title,
  dek: s.dek,
  body: s.body,
  category: s.category,
  unconfirmed: s.unconfirmed,
  cover: s.cover ?? "",
  sources: s.sources.length ? s.sources : [{ url: "", title: "", publisher: "" }],
})

/**
 * Write a story by hand, or edit any draft (the AI's included): headline, summary, Markdown body with a
 * preview, category, the unconfirmed flag (always on for rumours), an optional cover image and the sources.
 * Above it, "Draft from a link" asks the free AI to write a first version from one official page.
 */
export function NewsroomEditor({ storyId }: { storyId: string | null }) {
  const router = useRouter()
  const caps = useCaps()
  const [story, setStory] = useState<Story | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [d, setD] = useState<StoryDraft>(EMPTY)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!storyId) return
    let on = true
    getStoryForEdit(storyId)
      .then((s) => {
        if (!on) return
        if (!s) return setLoadError("That story is not there any more.")
        setStory(s)
        setD(toDraft(s))
      })
      .catch((e: Error) => on && setLoadError(e.message))
    return () => {
      on = false
    }
  }, [storyId])

  const out = story && (story.status === "published" || story.status === "scheduled")
  const canPublish = caps.can("news.publish")

  async function save(publish: boolean) {
    const e = checkDraft({ ...d, sources: d.sources.filter((s) => s.url.trim() || s.title.trim()) })
    setErrors(e)
    if (Object.keys(e).length) {
      setStatus({ ok: false, text: "Check the highlighted fields." })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const clean = { ...d, sources: d.sources.filter((s) => s.url.trim()) }
      let saved = story ? await updateStory(story.id, clean) : await createStory(clean)
      if (publish && saved.status !== "published") saved = await setStoryStatus(saved.id, "published")
      setStory(saved)
      if (saved.status === "published" || publish) refreshPublicNews()
      setStatus({ ok: true, text: publish ? "Published. It is on /news now." : out ? "Saved. The live story is updated." : "Draft saved." })
      if (!storyId) router.replace(`/admin/newsroom?tab=write&story=${saved.id}` as Route, { scroll: false })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (storyId && !story && !loadError) return <Skeleton className="h-[36rem] w-full rounded-2xl" />
  if (loadError) return <Notice tone="warn" title="Could not open the story">{loadError}</Notice>
  if (out && !canPublish) return <Notice title="This story is published">Only editors with publishing rights can change a published story.</Notice>

  const setSource = (i: number, patch: Partial<StoryDraft["sources"][number]>) => setD({ ...d, sources: d.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <div className="flex flex-col gap-6">
      {!storyId && <DraftFromLink />}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-card/40 p-4 md:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 font-semibold">
            <PencilLineIcon aria-hidden className="size-4 text-ion" />
            {story ? (story.aiGenerated ? "Edit the AI draft" : "Edit the story") : "Write a story"}
          </h3>
          {story?.aiGenerated && <p className="text-xs text-muted-foreground">Drafted by {story.model ?? "the free AI"}. Check every fact against the sources before publishing.</p>}
        </div>

        <Field data-invalid={Boolean(errors.title) || undefined}>
          <FieldLabel htmlFor="nr-title-in">Headline</FieldLabel>
          <Input id="nr-title-in" value={d.title} maxLength={140} onChange={(e) => setD({ ...d, title: e.target.value })} aria-invalid={Boolean(errors.title)} className="h-10 bg-background/60" />
          {errors.title && <FieldError>{errors.title}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.dek) || undefined}>
          <FieldLabel htmlFor="nr-dek">Summary</FieldLabel>
          <Textarea id="nr-dek" rows={2} maxLength={320} value={d.dek} onChange={(e) => setD({ ...d, dek: e.target.value })} aria-invalid={Boolean(errors.dek)} className="bg-background/60" />
          <FieldDescription>One or two sentences: what happened and why it matters. {320 - d.dek.length} characters left.</FieldDescription>
          {errors.dek && <FieldError>{errors.dek}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.body) || undefined}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="nr-body">Story</FieldLabel>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
              {preview ? <PencilLineIcon aria-hidden /> : <EyeIcon aria-hidden />}
              {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-64 rounded-lg border border-border bg-background/60 p-4">
              <Markdown source={d.body || "_Nothing written yet._"} ctx={{ source: "none" }} className="text-[16px] leading-[1.7] [&_p]:my-4" />
            </div>
          ) : (
            <Textarea id="nr-body" rows={14} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-invalid={Boolean(errors.body)} className="bg-background/60 font-mono text-sm" />
          )}
          <FieldDescription>Markdown: short paragraphs, **bold**, lists. Report only what the sources say, and attribute claims.</FieldDescription>
          {errors.body && <FieldError>{errors.body}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Category</FieldLegend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {NEWS_CATEGORIES.map((c) => (
              <label
                key={c.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  d.category === c.id ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
                )}
              >
                <input type="radio" name="nr-cat" value={c.id} checked={d.category === c.id} onChange={() => setD({ ...d, category: c.id, unconfirmed: c.id === "rumor" ? true : d.unconfirmed })} className="sr-only" />
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.blurb}</span>
              </label>
            ))}
          </div>
        </FieldSet>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={d.category === "rumor" || d.unconfirmed}
            disabled={d.category === "rumor"}
            onChange={(e) => setD({ ...d, unconfirmed: e.target.checked })}
            className="mt-0.5 size-4 accent-(--ion)"
          />
          <span>
            <span className="font-medium">Unconfirmed</span>
            <span className="block text-muted-foreground">Shows the Unconfirmed badge and note. Always on for rumours and leaks.</span>
          </span>
        </label>

        <Field data-invalid={Boolean(errors.cover) || undefined}>
          <FieldLabel htmlFor="nr-cover">
            Cover image <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="nr-cover" type="url" value={d.cover} onChange={(e) => setD({ ...d, cover: e.target.value })} placeholder="https://… an image you have the right to use" className="h-10 bg-background/60" />
          <FieldDescription>Leave empty for a star field drawn from the story. Use only images the publisher offers for press, or your own.</FieldDescription>
          {errors.cover && <FieldError>{errors.cover}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Sources</FieldLegend>
          <FieldDescription>Every story links to what it is based on: official posts, changelogs, releases or filings.</FieldDescription>
          <ol className="flex flex-col gap-3">
            {d.sources.map((s, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-border bg-background/40 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
                <Field>
                  <FieldLabel htmlFor={`nr-src-url-${i}`} className="text-xs">
                    Link
                  </FieldLabel>
                  <Input id={`nr-src-url-${i}`} type="url" value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} placeholder="https://…" className="h-9" />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`nr-src-title-${i}`} className="text-xs">
                    Title
                  </FieldLabel>
                  <Input id={`nr-src-title-${i}`} value={s.title} maxLength={300} onChange={(e) => setSource(i, { title: e.target.value })} className="h-9" />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`nr-src-pub-${i}`} className="text-xs">
                    Publisher
                  </FieldLabel>
                  <Input id={`nr-src-pub-${i}`} value={s.publisher} maxLength={80} onChange={(e) => setSource(i, { publisher: e.target.value })} className="h-9" />
                </Field>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove source ${i + 1}`} disabled={d.sources.length === 1} onClick={() => setD({ ...d, sources: d.sources.filter((_, j) => j !== i) })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {d.sources.length < 12 && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setD({ ...d, sources: [...d.sources, { url: "", title: "", publisher: "" }] })}>
              <PlusIcon aria-hidden /> Add a source
            </Button>
          )}
          {errors.sources && <FieldError>{errors.sources}</FieldError>}
        </FieldSet>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="submit" variant={canPublish && !out ? "outline" : "default"} disabled={busy}>
            {busy ? "Saving…" : out ? "Save changes" : "Save draft"}
          </Button>
          {canPublish && !out && (
            <Button type="button" disabled={busy} onClick={() => void save(true)}>
              Save and publish
            </Button>
          )}
          <StatusLine status={status} />
        </div>
      </form>
    </div>
  )
}

function DraftFromLink() {
  const ai = useAiStatus()
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  if (!ai.ready) return null
  if (!ai.enabled) {
    return (
      <Notice title="AI drafting is not switched on for this site yet">
        Stories can be written by hand below. Once a free AI provider key is set on the server, editors can draft from a link here and the daily run writes drafts on its own.
      </Notice>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      const { story } = await draftFromLink(url.trim(), note)
      router.push(`/admin/newsroom?tab=write&story=${story.id}` as Route)
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-2xl border border-ion/25 bg-ion/[0.05] p-4 md:p-5">
      <h3 className="inline-flex items-center gap-2 font-semibold">
        <SparklesIcon aria-hidden className="size-4 text-ion" /> Draft from a link
      </h3>
      <p className="text-sm text-muted-foreground">Paste an official page. The free AI writes a first draft from it, cites it, and you edit before anything is published.</p>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor="nr-link">Link</FieldLabel>
          <Input id="nr-link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-10 bg-background/60" />
        </Field>
        <Field>
          <FieldLabel htmlFor="nr-link-note">
            Note for the AI <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="nr-link-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="The angle, or what to leave out" className="h-10 bg-background/60" />
        </Field>
        <Button type="submit" disabled={busy || !url.trim()}>
          {busy ? "Drafting…" : "Draft it"}
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  )
}
