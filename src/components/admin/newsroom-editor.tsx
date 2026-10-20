"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { BookOpenTextIcon, EyeIcon, LayersIcon, PencilLineIcon, PlusIcon, QuoteIcon, RefreshCwIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { Notice, StatusLine } from "@/components/admin/controls"
import { CoverGallery } from "@/components/admin/newsroom-covers"
import { ArticleBody } from "@/components/news/article-body"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAiStatus } from "@/lib/ai-client"
import { useCaps } from "@/lib/caps"
import {
  checkDraft,
  countWords,
  createStory,
  DEPTHS,
  draftFromLink,
  getStoryForEdit,
  loadFactCheck,
  NEWS_CATEGORIES,
  refreshPublicNews,
  rewriteStory,
  setStoryStatus,
  updateStory,
  type CoverCandidate,
  type Depth,
  type DraftErrors,
  type DraftResult,
  type FactCheck,
  type Story,
  type StoryDraft,
} from "@/lib/newsroom"
import { cn } from "@/lib/utils"

const EMPTY: StoryDraft = {
  title: "",
  dek: "",
  body: "",
  category: "launch",
  unconfirmed: false,
  cover: "",
  coverKind: "generated",
  coverCredit: null,
  coverAlt: "",
  keyFacts: [],
  pullQuote: null,
  sources: [{ url: "", title: "", publisher: "" }],
}

const toDraft = (s: Story): StoryDraft => ({
  title: s.title,
  dek: s.dek,
  body: s.body,
  category: s.category,
  unconfirmed: s.unconfirmed,
  cover: s.cover ?? "",
  coverKind: s.coverKind ?? (s.cover ? "editor" : "generated"),
  coverCredit: s.coverCredit,
  coverAlt: s.coverAlt,
  keyFacts: s.keyFacts,
  pullQuote: s.pullQuote,
  sources: s.sources.length ? s.sources : [{ url: "", title: "", publisher: "" }],
})

function resultLine(r: DraftResult) {
  const depth = DEPTHS.find((x) => x.id === r.depth)?.label ?? r.depth
  return `${depth} story, ${r.words} words${r.checked ? ", fact-checked" : ""}.${r.note ? ` ${r.note}` : ""}`
}

/**
 * Write a story by hand, or edit any draft (the AI's included): headline, summary, Markdown body with a
 * preview that shows the citations as readers see them, the key facts box, the pull quote, category, the
 * unconfirmed flag (always on for rumours), the cover (from the candidates gallery) and the sources.
 * Above it, "Research a story" asks the free AI to research and write one from an official page; on an
 * existing draft, "Research again" rewrites it from its sources at another depth, and the fact-check report
 * shows what the second pass verified and removed.
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
  const [candidates, setCandidates] = useState<CoverCandidate[]>([])
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (!storyId) return
    let on = true
    getStoryForEdit(storyId)
      .then((s) => {
        if (!on) return
        if (!s) return setLoadError("That story is not there any more.")
        setStory(s)
        setD(toDraft(s))
        setCandidates(s.coverCandidates)
      })
      .catch((e: Error) => on && setLoadError(e.message))
    return () => {
      on = false
    }
  }, [storyId, reloads])

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
  const sourceOptions = d.sources.map((s, i) => ({ n: i + 1, label: `[${i + 1}] ${s.publisher || s.title || s.url || "Source"}`.slice(0, 60) }))
  const words = countWords(d.body)

  return (
    <div className="flex flex-col gap-6">
      {!storyId && <DraftFromLink />}
      {story && !out && story.sources.length > 0 && <ResearchAgain story={story} onDone={() => setReloads((n) => n + 1)} />}
      {story?.aiGenerated && <FactCheckPanel storyId={story.id} depth={story.depth} />}

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
            <div className="min-h-64 rounded-lg border border-border bg-background/60 p-4 md:p-6">
              <ArticleBody body={d.body || "_Nothing written yet._"} sources={d.sources.filter((s) => s.url)} pullQuote={d.pullQuote} className="text-[16px] leading-[1.75]" />
            </div>
          ) : (
            <Textarea id="nr-body" rows={14} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-invalid={Boolean(errors.body)} className="bg-background/60 font-mono text-sm" />
          )}
          <FieldDescription>
            Markdown: ## for sections (they make the table of contents), short paragraphs, **bold**, lists. Cite a source with its number, like [1]. Report only what the sources say. {words} words, about{" "}
            {Math.max(1, Math.round(words / 230))} min to read.
          </FieldDescription>
          {errors.body && <FieldError>{errors.body}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">
            <LayersIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px] text-ion" />
            Key facts
          </FieldLegend>
          <FieldDescription>The box at the top of the story: the most useful specifics, each tied to its source. Leave empty for short stories.</FieldDescription>
          <ol className="flex flex-col gap-2">
            {d.keyFacts.map((f, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
                <Input
                  aria-label={`Key fact ${i + 1}`}
                  value={f.text}
                  maxLength={220}
                  onChange={(e) => setD({ ...d, keyFacts: d.keyFacts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  className="h-9"
                />
                <select
                  aria-label={`Source of key fact ${i + 1}`}
                  value={f.source ?? ""}
                  onChange={(e) => setD({ ...d, keyFacts: d.keyFacts.map((x, j) => (j === i ? { ...x, source: e.target.value ? Number(e.target.value) : null } : x)) })}
                  className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm"
                >
                  <option value="">No source</option>
                  {sourceOptions.map((o) => (
                    <option key={o.n} value={o.n}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove key fact ${i + 1}`} onClick={() => setD({ ...d, keyFacts: d.keyFacts.filter((_, j) => j !== i) })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {d.keyFacts.length < 8 && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setD({ ...d, keyFacts: [...d.keyFacts, { text: "", source: d.sources[0]?.url ? 1 : null }] })}>
              <PlusIcon aria-hidden /> Add a key fact
            </Button>
          )}
          {errors.keyFacts && <FieldError>{errors.keyFacts}</FieldError>}
        </FieldSet>

        <Field data-invalid={Boolean(errors.pullQuote) || undefined}>
          <FieldLabel htmlFor="nr-pq">
            <QuoteIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px] text-ion" />
            Pull quote <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Textarea
              id="nr-pq"
              rows={2}
              maxLength={400}
              value={d.pullQuote?.text ?? ""}
              onChange={(e) => setD({ ...d, pullQuote: e.target.value ? { text: e.target.value, source: d.pullQuote?.source ?? (d.sources[0]?.url ? 1 : null) } : null })}
              className="bg-background/60"
            />
            <select
              aria-label="Source of the pull quote"
              value={d.pullQuote?.source ?? ""}
              disabled={!d.pullQuote}
              onChange={(e) => d.pullQuote && setD({ ...d, pullQuote: { ...d.pullQuote, source: e.target.value ? Number(e.target.value) : null } })}
              className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm"
            >
              <option value="">No source</option>
              {sourceOptions.map((o) => (
                <option key={o.n} value={o.n}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <FieldDescription>Words that appear in the source, word for word. Set apart after the first section.</FieldDescription>
          {errors.pullQuote && <FieldError>{errors.pullQuote}</FieldError>}
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

        <FieldSet>
          <FieldLegend variant="label">Cover</FieldLegend>
          <FieldDescription>The finder&apos;s choice is marked. Source images are the publisher&apos;s own; free photos keep their creator and licence, shown under the image.</FieldDescription>
          <CoverGallery
            storyId={story?.id ?? null}
            title={d.title}
            category={d.category}
            value={{ url: d.cover, kind: d.coverKind, credit: d.coverCredit, alt: d.coverAlt }}
            candidates={candidates}
            onCandidates={setCandidates}
            onChange={(c) => setD({ ...d, cover: c.url, coverKind: c.kind, coverCredit: c.credit, coverAlt: c.alt })}
            error={errors.cover}
          />
        </FieldSet>

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

function DepthPicker({ value, onChange, name }: { value: Depth; onChange: (d: Depth) => void; name: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Depth</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {DEPTHS.map((o) => (
          <label
            key={o.id}
            className={cn(
              "pressable flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
              value === o.id ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
            )}
          >
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            <span className="font-medium">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** On a draft with sources: research it again from them and rewrite it in place, at the chosen depth. */
function ResearchAgain({ story, onDone }: { story: Story; onDone: () => void }) {
  const ai = useAiStatus()
  const [depth, setDepth] = useState<Depth>(story.depth === "short" ? "deep" : story.depth)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  if (!ai.ready || !ai.enabled) return null

  async function run() {
    setBusy(true)
    setStatus({ ok: true, text: "Reading the sources and the official pages they link to, then briefing, writing and checking… this takes two or three minutes." })
    try {
      const r = await rewriteStory(story.id, depth, note)
      setStatus({ ok: true, text: `Rewritten: ${resultLine(r)} Review it below.` })
      onDone()
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="liquid-glass rounded-2xl p-4 md:p-5" open={story.depth === "short" && story.aiGenerated}>
      <summary className="cursor-pointer font-semibold">
        <RefreshCwIcon aria-hidden className="mr-2 inline size-4 align-[-3px] text-ion" />
        Research again and rewrite
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          Now: {DEPTHS.find((x) => x.id === story.depth)?.label ?? "Short"}
          {story.wordCount ? `, ${story.wordCount} words` : ""}
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          The free AI reads this story&apos;s {story.sources.length} source{story.sources.length === 1 ? "" : "s"} again (and the official pages they link to), lists the facts it can quote, writes the story in sections with citations, and checks every claim. Your current text is replaced; the
          story stays a draft.
        </p>
        <DepthPicker value={depth} onChange={setDepth} name="nr-again-depth" />
        <Field>
          <FieldLabel htmlFor="nr-again-note">
            Note for the AI <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="nr-again-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="The angle, what to explain, what to leave out" className="h-10 bg-background/60" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={run} disabled={busy}>
            <BookOpenTextIcon aria-hidden /> {busy ? "Researching…" : "Research and rewrite"}
          </Button>
          <StatusLine status={status} />
        </div>
      </div>
    </details>
  )
}

/** What the second pass verified, dropped and removed: the editor's checklist before publishing. */
function FactCheckPanel({ storyId, depth }: { storyId: string; depth: Depth }) {
  const [data, setData] = useState<{ report: FactCheck; model: string | null } | null | undefined>(undefined)
  useEffect(() => {
    let on = true
    void loadFactCheck(storyId).then((r) => on && setData(r))
    return () => {
      on = false
    }
  }, [storyId])
  if (!data) return null
  const r = data.report
  return (
    <section aria-labelledby="nr-check-h" className={cn("rounded-2xl border p-4 md:p-5", r.checked ? "border-ok/30 bg-ok/[0.04]" : "border-gold/30 bg-gold/[0.04]")}>
      <h3 id="nr-check-h" className="flex flex-wrap items-center gap-2 font-semibold">
        <ShieldCheckIcon aria-hidden className={cn("size-4", r.checked ? "text-ok" : "text-gold")} />
        {r.checked ? "Fact-checked by the second pass" : depth === "short" ? "Short story: no separate fact check" : "Not fact-checked by the second pass"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.sources} page{r.sources === 1 ? "" : "s"} read · {r.verified} facts verified against the pages{r.dropped.length ? ` · ${r.dropped.length} dropped before writing` : ""}
        {r.removed.length ? ` · ${r.removed.length} sentence${r.removed.length === 1 ? "" : "s"} removed by the check` : ""}
        {data.model ? ` · ${data.model}` : ""}
      </p>
      {r.note && <p className="mt-2 text-sm">{r.note}</p>}
      {(r.removed.length > 0 || r.dropped.length > 0 || r.unconfirmed.length > 0 || r.steps.length > 0) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Details</summary>
          <div className="mt-3 flex flex-col gap-3">
            {r.unconfirmed.length > 0 && (
              <div>
                <p className="font-medium">Labelled unconfirmed</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {r.unconfirmed.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.removed.length > 0 && (
              <div>
                <p className="font-medium">Removed by the check</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {r.removed.map((x, i) => (
                    <li key={i}>
                      “{x.text}” <span className="text-xs">({x.why})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.dropped.length > 0 && (
              <div>
                <p className="font-medium">Facts dropped before writing</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {r.dropped.map((x, i) => (
                    <li key={i}>
                      {x.claim} <span className="text-xs">({x.why})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.steps.length > 0 && <p className="text-xs text-muted-foreground">Steps: {r.steps.join(" → ")}</p>}
          </div>
        </details>
      )}
    </section>
  )
}

function DraftFromLink() {
  const ai = useAiStatus()
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [note, setNote] = useState("")
  const [depth, setDepth] = useState<Depth>("deep")
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
    setStatus({ ok: true, text: depth === "short" ? "Reading the page and writing… about half a minute." : "Reading the page and the official pages it links to, then briefing, writing and checking… this takes two or three minutes." })
    try {
      const { story } = await draftFromLink(url.trim(), note, { depth })
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
        <SparklesIcon aria-hidden className="size-4 text-ion" /> Research a story from a link
      </h3>
      <p className="text-sm text-muted-foreground">
        Paste an official page. The free AI reads it and the official pages it links to, keeps only the facts it can quote, writes the story with citations, checks it and picks a cover. You edit before anything is published.
      </p>
      <DepthPicker value={depth} onChange={setDepth} name="nr-link-depth" />
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
          {busy ? "Researching…" : "Research it"}
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  )
}
